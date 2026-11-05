# Architecture Patterns

**Domain:** Private, location-driven multi-source geo-aggregation HUD (single user, ~15 public feeds, iOS PWA client)
**Researched:** 2026-11-05
**Overall confidence:** MEDIUM. The patterns are standard and well understood (HIGH). Upstream-specific details (PTV and Transport Victoria feed auth, aisstream and OpenSky limits, iOS storage eviction) come from training knowledge and were not re-verified against live docs in this pass. They are flagged below.

## Recommended Architecture

**Modular monolith, one FastAPI process, one worker. Three data-acquisition tiers behind one `Provider` contract. One normalized `Item` schema. A profile endpoint that only reads caches, plus an SSE stream that fills in the rest.**

The core idea is that the request path never touches an upstream API. Request handlers only read local state (an in-memory snapshot, SQLite, or a persisted cache row). Everything slow happens in background tasks, which then push deltas over SSE.

```
                               TAILSCALE (tailscale serve -> HTTPS, MagicDNS cert)
 iOS PWA  <------------------------------------------------------------------>  Proxmox CT/VM "shinigami"
 ┌──────────────────────┐                                      ┌───────────────────────────────────────────┐
 │ Service worker       │  GET /api/profile?lat&lon            │ FastAPI (uvicorn, 1 worker)                │
 │  - app shell precache│ -----------------------------------> │  API layer: /profile /stream /prewarm      │
 │  - PMTiles range     │ <-- cached profile (<1s, w/ status)  │             /health /ingest (later)        │
 │ IndexedDB            │                                      │            │ reads only                    │
 │  - last profile      │  GET /api/stream (SSE)               │            v                               │
 │ MapLibre + HUD       │ <---- layer deltas, signals -------- │  Profile Assembler                         │
 │  - countdown ticker  │                                      │   ├─ StaticStore  (SQLite + R*Tree)        │
 │    (absolute ts)     │  POST /api/location (heartbeat)      │   ├─ SnapshotStore (in-memory, global)     │
 └──────────────────────┘ -----------------------------------> │   └─ CellCache   (H3 cell -> layer items)  │
                                                               │            ^ writes                        │
                                                               │  Provider Runtime (asyncio supervisor)     │
                                                               │   ├─ PolledProvider  (timers, backoff)     │
                                                               │   ├─ StreamProvider  (aisstream WS)        │
                                                               │   └─ OnDemandProvider (cell miss -> fetch) │
                                                               │            │ publish                       │
                                                               │            v                               │
                                                               │  Event Bus (in-proc pub/sub, interface)    │
                                                               │   ├─ SSE Hub  -> phone                     │
                                                               │   ├─ Signal Detectors -> Signal Sinks      │
                                                               │   └─ Outbox (SQLite) -> SPENCER / LifeOS   │
                                                               └───────────────────────────────────────────┘
        Importers (CLI jobs, cron/systemd timer)  ----writes---->  static.db (SQLite + R*Tree), GTFS tables
        Existing containers: SPENCER, LifeOS  <---- webhooks / REST adapters (milestone 2+) ---->
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **API layer** (FastAPI routers) | Thin HTTP/SSE surface. Validates input, never calls upstreams. | Profile Assembler, SSE Hub, Session registry |
| **Profile Assembler** | Given (lat, lon, radius), merges items from the three stores into one `Profile`. Attaches per-layer `status` (`fresh`, `stale`, `pending`, `error`, `out_of_coverage`) and `as_of`. Triggers background fetches for missing or stale cells. | StaticStore, SnapshotStore, CellCache, Provider Runtime (enqueue only) |
| **Provider registry** | Auto-discovers provider modules in `providers/`. Each declares id, kind, TTLs, coverage bbox and attribution. | Provider Runtime, Assembler |
| **Provider Runtime** | Asyncio supervisor. Runs pollers on timers with jitter, per-provider backoff and circuit breaker, singleflight de-duplication for on-demand fetches, and an "only poll while a client is active" gate. | Providers, stores, Event Bus, shared `httpx.AsyncClient` |
| **StaticStore** | SQLite file with R*Tree virtual tables for imported datasets. Bbox query, then exact haversine filter. | Assembler (read), Importers (write) |
| **SnapshotStore** | In-memory latest-state tables for Melbourne-wide polled feeds (planes, ships, grid mix, GTFS-RT, air quality). Persisted to SQLite on each refresh so a restart is not cold. | Assembler (read), pollers (write) |
| **CellCache** | Key `(provider_id, h3_cell)` -> items, `fetched_at`, `ttl`, `max_stale`. Backed by SQLite, with an in-memory LRU on top. | Assembler, OnDemandProviders |
| **Importers** | Separate CLI jobs (not in the web process) that download, normalize and bulk-load static datasets, then atomically swap tables. | StaticStore only |
| **Event Bus** | In-process async pub/sub behind a small interface (`publish(topic, event)`, `subscribe`). Topics: `layer.updated`, `signal.raised`, `session.moved`. | Runtime, SSE Hub, Detectors, Outbox |
| **SSE Hub** | Fan-out of `layer.updated` and `signal.raised` to connected phones. Supports `Last-Event-ID` replay from a small ring buffer. | Event Bus, API layer |
| **Signal Detectors** (v1: stub plus 1-2 rules) | Turn state into `Signal(dedupe_key, name, severity, target_ts, geo)`, for example "storm cell ETA 12 min". | Event Bus, Sinks |
| **Sinks / Connectors** (ports now, adapters milestone 2+) | `SignalSink` (SPENCER webhook), `PersonalContextProvider` (LifeOS read), `EventWriter` (LifeOS write). All go through the SQLite outbox with retry. | Event Bus, external containers |
| **PWA shell** | Service worker, IndexedDB last profile, MapLibre, HUD renderer driven by layer style registry, countdown ticker. | API (HTTPS over Tailscale), PMTiles |
| **Tile host** | Static PMTiles file for Melbourne/Victoria, served with HTTP range requests (nginx or Starlette static). | PWA |

### The Three Acquisition Tiers (plus one)

The tier follows from how the upstream data behaves, not from the layer's theme.

| Tier | Trigger | Where it lives | Layers (v1) | Staleness rule |
|------|---------|----------------|-------------|----------------|
| **A. Polled global snapshot** | Timer. One fetch of the Melbourne-wide region serves every client. | SnapshotStore (memory, persisted) | Grid mix and price, rooftop solar, GTFS-RT vehicle positions and trip updates, planes (bbox poll), ISS and satellites (compute from CelesTrak TLE with `skyfield` or `sgp4`), EPA air quality, ARPANSA UV, pollen, BOM weather and radar, CFA fire danger, VicEmergency incidents, CoM pedestrian counts and parking sensors, water storage | TTL per feed (e.g. planes 10-15 s, GTFS-RT 15-30 s, grid 5 min, weather 10-30 min). Past `max_stale` the layer is shown struck-through or hidden. |
| **A'. Streamed** | Long-lived connection | SnapshotStore (latest-per-entity with expiry) | Ships via aisstream.io WebSocket, subscribed with a Port Phillip bounding box | Entity TTL (e.g. drop vessels unseen for 10 min) |
| **B. Per-location on-demand** | Cell cache miss or stale for the requested location | CellCache (H3-keyed) | Wikipedia geosearch, any Overpass query you decide not to import | Long TTL (hours to days), because these change slowly. Always stale-while-revalidate. |
| **C. Static, imported once** | Importer CLI on a schedule (weekly or monthly), or manual | StaticStore | Road-safety cameras, OSM CCTV (osmium extract), ACMA RRL sites, Victorian Heritage Database, CoM street trees, CoM development activity, GTFS static (stops, routes, stop_times), Broadcastify and KiwiSDR link lists (a small curated table) | Dataset `imported_at` shown in the card. Never fetched at request time. |

**Opinionated calls:**

1. **Do not call Overpass at runtime for CCTV.** Camera positions barely change. Import a Geofabrik Victoria extract and filter with `osmium tags-filter ... man_made=surveillance` into StaticStore weekly. This removes a flaky public dependency from the hot path, and Overpass rate limits stop mattering. Keep an Overpass `OnDemandProvider` only for things you did not import.
2. **Poll the region, not the client.** For planes, use one Melbourne bbox poll (adsb.lol or OpenSky) rather than a per-client point query. A single poll serves every device and the HUD can filter by distance in memory. The same applies to everything in tier A.
3. **Gate polling on presence.** Pollers run at full rate only when a session heartbeat was seen in the last N minutes (10 or so). Otherwise they drop to a slow keep-warm interval or pause. This respects upstream rate limits (OpenSky anonymous is tight) and the shared 32 GB box.
4. **GTFS is the only genuinely big piece.** Static GTFS is a large zip that needs an importer with its own tables (stops with R*Tree, `stop_times` indexed by stop id). Realtime is a tier-A poll that is joined to static by `trip_id` and `stop_id` at query time. Treat it as its own phase. Check current Transport Victoria open-data auth and rate limits before planning (LOW confidence on specifics). Use the `gtfs-realtime-bindings` protobuf package.
5. **Out-of-coverage is a first-class status.** CoM layers cover the CBD only. Return `status: "out_of_coverage"` instead of an empty list, so the HUD can show "no sensors here" and not look broken. Each provider declares a `coverage` bbox, and the Assembler skips providers outside it.

## Provider / Layer Plugin Pattern

Each provider is one Python module exporting a class. The registry discovers modules in `providers/` (a plain `pkgutil` scan is enough; entry points are overkill for a solo project). Adding a layer should mean adding one file and, optionally, one style entry in the frontend.

```python
# core/provider.py  (contract; names illustrative)
from dataclasses import dataclass
from typing import Protocol, Literal, Sequence

Kind = Literal["polled", "stream", "on_demand", "static", "personal"]

@dataclass(frozen=True)
class Item:
    id: str                      # stable across refreshes (map markers must not flicker)
    layer: str                   # provider/layer id, e.g. "ptv.departures"
    name: str                    # the Shinigami "name"
    geom: dict                   # GeoJSON geometry (Point/LineString/Polygon)
    label: str | None = None     # "arrives" / "ends" / "dies" verb for the countdown
    target_ts: float | None = None   # ABSOLUTE epoch seconds. Never "seconds remaining".
    severity: int = 0            # 0 info .. 3 critical (drives red highlight, signals)
    detail: dict | None = None   # card payload
    # source/fetched_at/attribution are layer-level, carried on the Layer envelope

@dataclass
class ProviderMeta:
    id: str
    kind: Kind
    ttl_s: int                   # fresh window
    max_stale_s: int             # beyond this: hide / mark dead
    coverage: tuple[float, float, float, float] | None  # lon/lat bbox, None = Victoria-wide
    radius_m: int                # default query radius for this layer
    attribution: str
    requires_presence: bool = True   # poll only while a client is active

class Provider(Protocol):
    meta: ProviderMeta
    async def refresh(self, ctx) -> None: ...                       # polled/stream: update SnapshotStore
    async def query(self, ctx, lat, lon, radius_m) -> Sequence[Item]: ...  # on_demand: network; static/polled: store read
```

Rules that keep the system plug-in friendly:

- **One normalized `Item` and one `Layer` envelope** (`{id, status, as_of, ttl_s, attribution, items[]}`). The frontend renders any layer by looking up `layer.id` in a style registry (icon, colour, volume extrusion, label format). The frontend contains no per-source parsing.
- **Providers never touch the HTTP request, SSE, or other providers.** They get a `ctx` (http client, stores, clock, logger, secrets) and return Items.
- **Personal layers (milestone 2) are the same contract** with `kind="personal"`. They read from a connector (LifeOS) instead of a public feed and are usually location-independent (streak, gym countdown). Self-profile card = a layer. No new architecture.
- **Hardware layers (milestone 3+) are producers, not providers.** SDR, ADS-B and house-mode services run as separate processes and push normalized Items or events to `POST /ingest/{layer}` (token-guarded, Tailscale-only) or MQTT. The ingest endpoint writes into SnapshotStore exactly as a poller would. Home Assistant and ESPresense already speak MQTT, so introduce Mosquitto at the house-mode milestone, not before. The Event Bus interface is what lets you swap the transport later.

## Data Flow

### 1. Cold open (the < 1 s promise)

```
t=0     PWA launches; service worker serves shell from cache (cache-first)
t<100ms HUD renders LAST PROFILE from IndexedDB, dimmed, tagged "as of 14:02 @ Monash".
        Countdowns tick from absolute target_ts; items already past are dropped.
t~0     In parallel: navigator.geolocation -> GET /api/profile?lat&lon&rev=<last_rev>
t<500ms Server assembles from local stores only (SQLite R*Tree + memory + cell cache):
        returns Profile { server_time, rev, location_cell, layers{...status, as_of} }
        UI diffs into the HUD, undims, replaces IndexedDB copy.
t>0     For layers marked pending/stale the server has queued background refresh.
        As each lands -> SSE `layer` event (whole-layer replacement) -> UI patches in.
```

- **Order of trust on the client:** IndexedDB (instant) -> server cached profile -> SSE deltas.
- **Whole-layer replacement, not JSON-patch.** Layers are small (tens to low hundreds of items). Replacement is simpler, idempotent, and tolerant of missed events. Each layer event carries `rev`, and the client ignores older ones.
- **Moved far since last profile?** If the user is more than about 500 m from the cached profile, the IndexedDB render is shown clearly marked as a previous location. Never present it as "here".

### 2. Stale-while-revalidate (server side)

```
Assembler for layer L at cell C:
  row = CellCache.get(L, C)            # or SnapshotStore for global layers
  if row and age <= ttl:            -> status "fresh"
  elif row and age <= max_stale:    -> status "stale"; enqueue refresh (singleflight)
  else:                             -> status "pending", items []; enqueue refresh
  (refresh completion -> write cache -> publish layer.updated -> SSE hub)
```

- **Singleflight:** one in-flight fetch per `(provider, cell)`. A burst of profile calls can't hammer Overpass or Wikipedia.
- **Cell keys:** H3 resolution 9 (about 175 m edge) for CCTV-scale layers, resolution 8 (about 460 m) for Wikipedia. Query with the cell plus `grid_disk(k)` so a user standing on a cell edge still gets full-radius results. (H3 figures are from training knowledge, MEDIUM.) A plain rounded-lat/lon grid is an acceptable dependency-free alternative.
- **Persist caches to SQLite.** After a container restart the first profile must still be instant. An empty memory cache is the most likely cause of a failed "< 1 s" check.
- **Errors keep the last good data.** A failed refresh sets `status: "error"` plus `as_of` of the last success. It never blanks the layer. Circuit-break the provider with exponential backoff, and expose per-provider health at `/health` (and as a small HUD indicator).

### 3. Push and live fill-in (SSE, not WebSocket)

**Use SSE.** Traffic is server -> phone only. The phone's inputs (location, heartbeat) are infrequent POSTs. SSE is plain HTTP, works through `tailscale serve`, auto-reconnects in the browser, and supports `Last-Event-ID` resume. Use WebSocket only if a later milestone needs low-latency bidirectional control (SDR tuning), and add it then.

- Endpoint: `GET /api/stream?session=<id>` with event types `layer`, `signal`, `ping` (15-20 s keepalive so proxies and Safari don't drop it).
- The client sends `POST /api/location {lat, lon, accuracy}` on meaningful movement (and as a presence heartbeat). The server updates the session cell, may prewarm on-demand layers for the new cell, and pushes the affected layers.
- **iOS caveat:** Safari suspends the PWA in the background and drops the SSE connection. On `visibilitychange` -> visible, reconnect and refetch the profile with `rev` (cheap, cached). Don't build around background delivery. That is SPENCER's job later.
- `POST /api/prewarm?lat&lon` is the hook for **iOS Shortcuts automations** (arrive at Monash, leave home). It triggers cell prewarm so the first open is already warm. It needs no background location in the PWA.
- **Web Push is deliberately not in v1.** iOS Web Push works for home-screen PWAs, but payloads transit Apple's push service, which cuts against the "nothing leaves Proxmox" posture. Alert delivery belongs to SPENCER.

### 4. Countdowns

- The server sends **absolute `target_ts` (epoch seconds, UTC)** on every Item and `server_time` in every response. The client stores `offset = server_time - Date.now()` and renders `target_ts - (Date.now() + offset)` once per second (or via a single shared `requestAnimationFrame`/1 s ticker, not one timer per tag).
- This makes countdowns correct from an IndexedDB copy, correct after SSE reconnects, and independent of phone clock error. No countdown ever requires a server round-trip to keep ticking.
- **Expiry is a client state.** When `target_ts` passes, the tag shows a brief "now / departed" state and then drops or waits for the next layer update. Time-derived items (golden hour, sunset, ISS pass, UV peak, "gym streak dies at midnight") are computed server-side from astronomy libraries or schedules into `target_ts`. Live ones (departures) come from GTFS-RT, with a scheduled fallback from static GTFS marked `scheduled: true`.

### 5. PWA offline

- **Service worker:** precache the app shell and fonts (cache-first). `/api/profile` uses network-first with a short timeout falling back to IndexedDB. Do not rely on the service-worker HTTP cache for profile JSON. Store it explicitly in IndexedDB, which the UI reads directly.
- **Last profile = IndexedDB**, keyed by `last` plus a small history of recent profiles (a handful, for "last time I was at Monash").
- **Map tiles:** self-host a Melbourne/Victoria **PMTiles** extract (Protomaps) on the Proxmox box, served with range requests. This (a) keeps the phone's location from leaking to a third-party tile CDN, which fits the privacy rule, (b) makes the map work offline for cached areas, and (c) avoids a commercial tile key. 3D building heights come from the OSM data in the extract. Verify the chosen basemap schema supports extruded buildings (MEDIUM).
- **HTTPS is mandatory.** Service workers, geolocation and PWA install all need a secure context. Use `tailscale serve` (MagicDNS HTTPS cert) on the backend host so the PWA origin is `https://<host>.<tailnet>.ts.net`. Decide this in phase 1. Switching origin later orphans the installed PWA and its IndexedDB. (HIGH on the requirement; confirm the exact `tailscale serve` flags at implementation.)
- **Eviction:** home-screen-installed PWAs are not subject to Safari's 7-day script-writable-storage purge, but quota is finite. Keep PMTiles to a metro extract (tens to low hundreds of MB), and cache tiles opportunistically, not as a bulk download. (MEDIUM; test on the actual device.)

## Spatial Indexing

| Data | Structure | Why |
|------|-----------|-----|
| Static datasets (cameras, ACMA, heritage, trees, GTFS stops, CoM dev activity) | **SQLite R*Tree virtual table** per dataset (`id, minLon, maxLon, minLat, maxLat`) joined to a plain attribute table. Query by bbox from radius, then exact haversine filter. | Sub-millisecond for 100k-class point sets, zero extra service, ships in stdlib `sqlite3`. Lines and polygons (heritage overlays, fire areas) are indexed by their bbox. |
| Global snapshots (planes, ships, parking bays, pedestrian sensors) | Plain Python list or numpy arrays with vectorized haversine, or a `shapely` STRtree rebuilt per refresh | A few thousand points at most. Brute force is faster than maintaining an index. |
| On-demand cache keys | **H3 cell** (or rounded grid) | Cache hit rate comes from many nearby coordinates mapping to one key. This is a keying problem, not a query index. |
| Time/astronomy layers | None (computed) | Not spatial lookups. |

**Opinionated: no PostGIS and no Redis in v1.** With ~100k static features and one user, SQLite + in-memory covers it. It also removes two services from a box shared with SPENCER and LifeOS, and the whole state is a few files to back up. Revisit PostGIS only if you need polygon-intersection queries over large datasets (for example, "which heritage overlay polygon am I inside") and bbox-plus-shapely proves too slow. That is unlikely at this scale. The single-worker constraint below is what makes the in-memory approach safe.

**Single uvicorn worker, always.** In-process snapshots, the Event Bus and the SSE Hub assume one process. Multiple workers would split state and silently break SSE fan-out. One worker comfortably serves one user. If CPU-bound work appears (GTFS import, TLE propagation), run it in the importer CLI or `run_in_executor`, not more workers.

## Integration Seams for Later Milestones

Design the ports in v1, implement the adapters later. Cost now is small and it makes milestone 2+ plug-in.

### SPENCER (voice / alert delivery, "Shinigami detects, SPENCER decides")

- Shinigami emits **Signals**, not notifications: `{dedupe_key, name, severity, layer, geo, target_ts, expires_at, payload}`. Detectors turn layer state into Signals (storm ETA, disruption on your usual line, pollen thunderstorm-asthma alert, fire within X km, camera ahead).
- `SignalSink` adapter posts Signals to SPENCER by **webhook** (`POST` to SPENCER's endpoint over the Proxmox LAN or Tailscale) via the **SQLite outbox** (at-least-once, retry with backoff, idempotent by `dedupe_key`). SPENCER owns interruption policy (quiet hours, context). Shinigami only reports.
- Optionally let SPENCER pull: `GET /api/signals?since=` for a polling fallback.
- SPENCER internals are unknown, so keep the contract this small: JSON over HTTP plus a shared bearer token. Do not design around SPENCER's internals until you read its API (milestone 2 research).
- Phone path: the same Signals also go to the SSE Hub, so the HUD shows red-highlighted alerts without SPENCER.

### LifeOS (bidirectional, internals unknown)

- **Read:** a `PersonalContextProvider` (a normal Provider, `kind="personal"`) polls LifeOS REST (or reads a shared DB view) for gym, sleep, streaks, then emits Items with `target_ts` (streak dies at midnight). Cache it in SnapshotStore like any tier-A feed.
- **Write:** an `EventWriter` consumes bus events (`session.arrived{place=gym}`, logbook drive start and stop) and writes to LifeOS via the outbox. Arrival detection needs geofences, which are config data: a StaticStore table of "my places" (gym, uni, home), checked on `session.moved`. Triggers come from the PWA's foreground location or iOS Shortcuts hitting `/api/prewarm`-style endpoints, because there is no background location.
- **Boundary rule:** personal data lives only in Proxmox-side stores. If Item `detail` for personal layers lands in the phone's IndexedDB, that is acceptable (it is the user's device) but mark personal layers `private: true` so any future export or logging path can exclude them.
- **Unknown to resolve before building:** LifeOS API shape, auth and write semantics. Flag for phase-specific research at milestone 2.

### Hardware and house mode

SDR, ESP32 and Home Assistant services publish into `/ingest` or MQTT. The existing Event Bus and SnapshotStore take them with no change to Assembler or frontend, which only see new layer ids.

## Patterns to Follow

### Pattern 1: Read-only request path
**What:** Request handlers read local state only. Fetching is a side effect triggered by cache state and delivered asynchronously.
**When:** Always. This is the project's core value.
**Example:**
```python
@router.get("/profile")
async def profile(lat: float, lon: float, rev: int | None = None):
    p = assembler.build(lat, lon)          # memory + SQLite only, no awaits on network
    runtime.ensure_fresh(p.stale_or_pending)   # enqueue, returns immediately
    return p
```

### Pattern 2: Cache-entry state machine
**What:** Every cached value carries `fetched_at, ttl, max_stale, status`. Serve stale up to `max_stale`, always label it.
**When:** Every provider.

### Pattern 3: Swap-on-import for static data
**What:** Importers build `dataset_new`, validate row counts (reject if more than 50% shrink), then rename/swap in one transaction. The web process keeps reading the old table until the swap.
**When:** All tier C datasets. Prevents a half-imported camera list or a broken download from wiping a layer.

### Pattern 4: Provider health as a product feature
**What:** Per-provider `last_success`, `last_error`, `consecutive_failures` exposed in `/health` and as a HUD indicator.
**When:** From the first provider on. With ~15 flaky public feeds, silent breakage is the default.

### Pattern 5: Server-computed time semantics
**What:** The server converts every "event in the future" (schedule, astronomy, expiry) into `target_ts` plus a verb label. The client only subtracts.
**When:** Anything shown with a countdown, which is everything.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Upstream calls in the request path
**Why bad:** Breaks the < 1 s guarantee the first time Overpass is slow or BOM times out.
**Instead:** Read-only request path plus background refresh and SSE fill-in.

### Anti-Pattern 2: Per-client or per-request polling of global feeds
**Why bad:** Exhausts upstream rate limits (OpenSky) and wastes resources on a shared box.
**Instead:** One regional poll per feed, filtered in memory, presence-gated.

### Anti-Pattern 3: Countdowns as "seconds remaining"
**Why bad:** Goes wrong on cache replay, IndexedDB restore and SSE reconnect. Needs constant refetching.
**Instead:** Absolute `target_ts` plus a `server_time` offset.

### Anti-Pattern 4: Frontend calling upstream APIs or holding keys
**Why bad:** Leaks the phone's location to third parties, exposes keys (PTV, aisstream), hits CORS limits, bypasses the cache.
**Instead:** The backend is the only thing that talks to upstreams. The phone talks to the backend and the self-hosted tile file only.

### Anti-Pattern 5: Multiple workers with in-process state
**Why bad:** Splits snapshots and breaks SSE fan-out in a way that looks like flaky data.
**Instead:** One worker, and move heavy work to importer jobs.

### Anti-Pattern 6: Per-source parsing in the HUD
**Why bad:** Each new layer touches the frontend, and milestone 2+ plug-ins stop being plug-in.
**Instead:** Normalized Item schema plus a layer style registry.

### Anti-Pattern 7: Premature infrastructure (Redis, Kafka, PostGIS, microservices)
**Why bad:** Operational load on a shared 32 GB host for a single-user workload.
**Instead:** SQLite + memory + in-process bus behind interfaces, so each can be swapped when a real need appears (MQTT at house mode).

### Anti-Pattern 8: Fire-and-forget outbound integrations
**Why bad:** SPENCER or LifeOS being down loses events and Signals.
**Instead:** SQLite outbox, retry, idempotency keys.

## Scalability Considerations

Single user and two or three devices, so the real axes are feed count, data volume and resource share, not users.

| Concern | Now (~15 feeds, 1 user) | ~40 feeds + personal layers | With SDR/house streams |
|---------|-------------------------|-----------------------------|------------------------|
| Concurrency model | One asyncio process | Same; heavy compute to executor | Separate producer processes push via `/ingest` or MQTT |
| Spatial store | SQLite R*Tree + memory | Same | Consider PostGIS only if polygon queries get heavy |
| Cache | SQLite-backed + in-memory | Same | Same; add per-layer retention |
| Event bus | In-process | In-process | MQTT/NATS behind the same interface |
| Upstream rate limits | Presence-gated polling | Per-provider budgets in the runtime | Same |
| Memory | Low hundreds of MB | Under 1 GB | Watch GTFS and PMTiles; keep tiles on disk and range-served |

## Suggested Build Order (dependencies drive the roadmap)

1. **Walking skeleton (foundation).** Item/Layer schema, Provider contract and registry, SnapshotStore + CellCache + SQLite persistence, Profile Assembler, `/profile`, `/health`, in-process Event Bus, SSE Hub, `tailscale serve` HTTPS, PWA shell with service worker and IndexedDB last-profile, countdown ticker, and a bare MapLibre canvas. Prove it end-to-end with **one polled provider (e.g. grid mix) and one tier-C stub**. Everything else depends on this. Fixing the HTTPS origin here is critical (see Pitfalls).
2. **Static import framework + spatial index.** Importer CLI skeleton, swap-on-import, R*Tree helpers. First layers: road-safety cameras, OSM CCTV (osmium), heritage. These are the first "named things on a map" and validate the radius-query path and the HUD cards.
3. **Polled and streamed global feeds.** Runtime hardening (backoff, circuit breaker, presence gate, health), then environment, grid and water, sky (planes, ISS), bay (aisstream), hazards, CoM sensors. Mostly copy-paste once the runtime exists, so these can be parallelized or reordered freely.
4. **On-demand tier.** CellCache keying (H3), singleflight, SWR with SSE fill-in. Wikipedia geosearch first, and Overpass only if something remains un-imported.
5. **Transit (GTFS static import + GTFS-RT).** Largest single item and the headline use case (tram arrives in 3:12). It needs the static import framework (step 2) and the polled runtime (step 3). Build after those so it reuses proven machinery. Add the PTV Timetable API as a second provider behind the same layer id when the key arrives.
6. **Signals + outbound ports.** Detector framework, `SignalSink` interface, outbox table, `/ingest` endpoint, `/api/prewarm`. Ship with a log-only sink. This is cheap now and is what makes milestone 2 (SPENCER, LifeOS) plug-in. It can start in parallel with step 3 once the bus exists.
7. **HUD polish track (parallel with 2-5).** Hero activation screen, glitch effects, layer style registry, self-hosted PMTiles, tilted 3D view. It depends only on the Item schema (step 1), so a second track can run against mock or real layers as they appear.

**Ordering rationale:** the profile path and its contracts come first because every later layer reuses them. Static before polled because it is simpler and validates the schema. Transit last of the data layers because it needs both prior frameworks and has the most upstream uncertainty. The signals seam is built before milestone 2 so that adding SPENCER and LifeOS means writing adapters, not refactoring.

## Sources

- Training-knowledge synthesis of common patterns (cache-aside / stale-while-revalidate, provider/adapter plugin registries, outbox pattern, SSE for server push). MEDIUM.
- SQLite R*Tree module (sqlite.org/rtree.html), H3 resolution tables (h3geo.org), Protomaps/PMTiles (docs.protomaps.com), Tailscale Serve (tailscale.com/kb/1242/tailscale-serve), GTFS-realtime reference (gtfs.org/realtime). Cited as known authoritative references. **Not re-fetched in this pass**, so specifics (flags, resolution edge lengths, auth requirements for Transport Victoria feeds, aisstream and OpenSky rate limits, iOS storage eviction behavior) need verification at implementation. LOW-MEDIUM.
- `.planning/PROJECT.md` for scope, constraints and the milestone roadmap.
