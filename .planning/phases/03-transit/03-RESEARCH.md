# Phase 3: Transit - Research

**Researched:** 2026-11-13
**Domain:** PTV Timetable API v3 client, static stop store, per-client live transit layers over the existing provider/SSE runtime, moving map markers and edge pointers on the existing tag layer
**Confidence:** MEDIUM overall. Static stop store, signing, API shapes (swagger) and the existing-code integration are HIGH. Everything that needs a live PTV key (real-time behaviour, vehicle-position coverage, disruption type strings, rate limits) is unverified and flagged.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Which stops count as nearby (TRAN-01)**
- **D-01:** Show the **nearest stop per mode**: train, tram, bus. Not every stop in a radius.
- **D-02:** For tram and bus, cover **both directions of travel**: the nearest stop for each direction (stops come in pairs across the road). A train station counts once and covers all its platforms. So at most about 5 to 6 stops.
- **D-03:** Walk limits **by mode**: train up to about 1.5 km, tram up to about 800 m, bus up to about 500 m. Beyond its limit a mode shows as "none nearby" (never silently missing).
- **D-04:** **Saved places: all except Home.** Monash, the CBD and the gym show their real nearest stops, departures, vehicles and disruptions. **Home viewed as a saved place shows no transit at all** (same fail-closed rule as cameras: `Place.home` / `cameras=false` style gate, no stops, no distances, nothing that hints at Home's location). Live GPS while standing at home works as normal.
- **D-05:** Each stop shows its name, mode, distance and walk time.

**How departures are shown (TRAN-02)**
- **D-06:** **Drawer rows + stop card.** The drawer gets one countdown row per stop and direction for the next service (e.g. `Tram 96 to St Kilda · 3:12`). Tapping a stop's tag on the map opens a card with more departures.
- **D-07:** The stop card lists the **next 2 departures per route and direction**, capped at about 8 lines for busy stops.
- **D-08:** **Catchable logic.** The drawer row shows the next service David can actually reach on foot. A departure sooner than his walk time is **dimmed** in the stop card and skipped for the drawer row.
- **D-09:** The row's main countdown is the **departure time**, with a smaller **"leave in M:SS"** beside it (departure minus walk time). The row turns **blood red when it is time to leave now**.
- **D-10:** Every departure is labelled **live or scheduled** (requirement). Exact marking is Claude's discretion (see below).

**Vehicles on the map (TRAN-03)**
- **D-11:** Show **only vehicles heading to David's nearby stops**: on routes that serve those stops, not yet past the stop, within a couple of km. Not every vehicle nearby.
- **D-12:** A vehicle is a **small mode icon with the route number** that moves as positions update. Tapping it opens a card: route and destination, which of David's stops it is heading to, and its countdown to that stop. No always-on countdown label on the vehicle.
- **D-13:** **Tag label priority when crowded: stops, then vehicles, then cameras.** Nearby stops always get a label. Cameras keep their red-within-30 m labels; other cameras shrink to icons first. The overall budget stays about 20 labelled tags (Phase 2 D-11); no separate transit budget.
- **D-14:** **Edge pointers for off-screen stops.** The follow zoom stays as it is. A small arrow at the screen edge points to each off-screen nearby stop with its name and distance (`Flinders St · 900 m`); tapping it moves the map to the stop.

**Disruptions (TRAN-04)**
- **D-15:** Only alerts for **routes that serve the nearby stops shown**, plus alerts on those stops themselves (stop closed, lift out). No network-wide or radius-based alerts.
- **D-16:** Placement: a **warning mark on each affected departure row and stop card** with the alert text in the card, plus a **corner readout with the count** (`2 disruptions · your routes`) that lists them on tap. No separate drawer row per disruption, unless the alert has a known end time (then a countdown row is allowed).
- **D-17:** **Red only when it stops the service**: cancelled departure, suspended route, closed stop, buses replacing trains on David's routes. Delays, detours and planned-works notices stay white/blue with a warning mark.

**Data sources and keys**
- **D-18:** David has the **PTV Timetable API key only**. The GTFS Realtime key (Transport Victoria open data portal) has not arrived. **Build PTV-first**: departures, disruptions and whatever vehicle positions the PTV API offers. Design the provider so the GTFS Realtime feeds can be added later behind the same screens. Use recorded fixtures for anything not yet reachable.
- **D-19:** The key lives only in `/etc/shinigami/.env` on the CT as `PTV_DEVID` and `PTV_KEY`. David adds it himself. Never in chat, git, logs or on the phone.

**Carried forward (still binding)**
- Everything shown has a name and a countdown; countdown format, expiry pulse and stale dimming as in Phase 1 (D-04..D-07).
- Blood red is scarce; world is desaturated blue and white (Phase 1 D-01..D-03, Phase 2 D-13).
- The phone never calls a third party; all PTV calls go through the server (HUD-10).
- No upstream call in the `/api/profile` request path; cached data on screen in under 1 s, live fills in after (PLAT-04).
- Saved-place coordinates never reach the phone; pin profiles return null lat/lon. Home never gets location-revealing layers.
- Nothing that identifies or tracks people: vehicles are shown by route, never by driver or passenger data.
- CSP `style-src 'self'`, no innerHTML, no CDN assets.

### Claude's Discretion
- Walk-time maths: about 5 km/h over straight-line distance with a small detour allowance.
- Live/scheduled marking: suggested small `LIVE` / `SCHED` label per row and card line, scheduled-only times slightly dimmed, "delayed N min" when live differs from the timetable.
- Vehicle styling: blue, never red; a vehicle whose position is older than about 2 minutes fades out.
- Stop tag icons per mode (original, self-hosted sprites).
- Polling cadence, cache TTLs and how stops are stored (GTFS Schedule static stops in SQLite/STRtree vs PTV stops-near-location), within the rate limits in CLAUDE.md.
- How "direction" is derived for stop pairs.
- Late-night / no-more-services wording, and the loading state before transit data arrives.

### Deferred Ideas (OUT OF SCOPE)
- GTFS Realtime feeds as the main live source once the key arrives (designed for in D-18, switched on later).
- Network-wide major disruption awareness.
- A "show transit" zoom-to-fit button.
- Voice memo capture (unrelated backlog item).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRAN-01 | Nearest PTV stops (train, tram, bus) with distance and walk time | GTFS Schedule stop store (key-free, verified downloadable today, PTV stop id derivable from `stop_url`); nearest-per-mode plus direction-pair algorithm prototyped on real data; `transit_stops` computed layer; walk-time formula. Works with no PTV key. |
| TRAN-02 | Next departures with live countdowns, labelled live vs scheduled | PTV `GET /v3/departures/route_type/{rt}/stop/{id}` (swagger-verified): `estimated_departure_utc` null = scheduled only; demand-driven poll loop; client-side catchable selection. Needs key to verify real-time behaviour. |
| TRAN-03 | Vehicles approaching nearest stops on the map | PTV `expand=Run&expand=VehiclePosition` (lat/lon "only for some bus runs"; trams none; trains CIS easting/northing). Position seam + timetable-interpolated estimate for trams (labelled estimated); GTFS-R slots in later behind the same `VehicleSource`. |
| TRAN-04 | Current disruptions affecting nearby routes | PTV `GET /v3/disruptions?route_types=..` polled per mode every 5 min, filtered locally by route and stop ids of shown stops; D-17 severity mapping. |
</phase_requirements>

## Summary

The most important finding: **TRAN-01 can be built and verified for real, today, without any PTV key**, because the Victorian GTFS Schedule zip (`https://data.ptv.vic.gov.au/downloads/gtfs.zip`, 310,635,000 bytes, Last-Modified 2026-11-12, no auth) holds every stop with coordinates, and each stop's `stop_url` embeds the **PTV API `stop_id`** (e.g. `.../stop/2587/`). I downloaded it and prototyped the whole selection on real data (CBD, Clayton/Monash, Brunswick, Doncaster). The same data shows that for trams **one PTV stop id covers both physical poles (both directions)**: PTV stop 2204 has two GTFS stops 46 m apart serving opposite `direction_id` values. So D-02's "both directions" is largely satisfied by one PTV stop for trams; buses and some others have separate PTV ids per side, handled by a direction-pair rule computed offline from `stop_times`. A train station is one PTV stop id (parent station, platforms collapse). Recommend the **static GTFS-derived stop store**, built by a weekly offline job (same pattern as `cameras.json`), not PTV stops-near-location.

The PTV Timetable API v3 swagger is public and I extracted the exact endpoints, parameters and response shapes (below). HMAC-SHA1 signing is documented in PTV's RTF and I reproduced it two independent ways (Python hmac and openssl) for a worked example with a FAKE key. Caveat: PTV's own sample signature in that document (`D5474F34...`) does **not** reproduce with its own sample key; do not use it as a test vector.

For PLAT-04: the live layers must be **per-client and exact-location**, but the existing `Runtime` polled tier publishes a location-free `(0,0)` query to everyone, which would publish an empty transit layer over real data. The recommended design: transit providers are `exact_location_only=True` (this alone gives the Home gate through the existing `exact_ok`/`camera_ok` path), `query()` stays sync and only reads caches while recording a "watch set" of stop ids, one polled driver fetches departures for watched stops every 30 s (idle = zero calls), and after each refresh the runtime publishes a **touch event** which `stream.py` turns into a per-subscriber `provider.query()` at that client's exact location. Two small, necessary changes to `runtime.py` and `stream.py` are required.

**Primary recommendation:** Build the static GTFS stop store + `transit_stops` layer first (TRAN-01 shippable with no key), then the PTV client/departures/vehicles/disruptions behind a normalised `DepartureSource`/`VehicleSource` seam, all fixture-first, with a no-key state that never breaks the profile.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stop dataset (GTFS -> `transit_stops.json`) | Offline data job (systemd timer, like `refresh_cameras`) | API / Backend (loads into memory) | 310 MB download never in the request path or app process |
| Nearest stop per mode, direction pairs, walk time | API / Backend (`query()`, sync, in-memory buckets) | Browser (displays) | PLAT-04: local stores only |
| PTV HTTP client + HMAC signing | API / Backend | none | Key must never reach the phone (D-19, HUD-10) |
| Departure/vehicle/disruption polling and cache | API / Backend (polled driver, SQLite layer_cache write-through) | none | Demand-driven, single worker |
| Live push to phone | API / Backend (SSE `touch` -> per-subscriber query) | Browser (`applyLayer`) | Existing SSE path |
| Home gate (no transit for Home pin) | API / Backend (`exact_location_only` + `exact_ok`) | Browser backstop (strip transit layers for camera-off places) | Defence in depth like WR-W5 |
| Catchable selection, leave-in, live/sched, ticking | Browser (`model.ts` / `next-list.ts`) | none | Clock moves between server pushes; server sends absolute `target_ts` |
| Moving vehicle markers, edge pointers, label priority | Browser (`tags.ts` + new `edge-pointers.ts`) | none | Pure map-view geometry |
| Disruption severity classification | API / Backend (single pure function) | Browser (renders `severity`) | One place to fix when real strings are seen |

## Standard Stack

### Core
No new runtime dependencies are required. Everything below is already in `pyproject.toml` or the Python stdlib.

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| httpx (existing `ctx.http`) | 0.28.1 | PTV calls | Already the shared AsyncClient; tests use respx |
| stdlib `hmac`, `hashlib` | stdlib | HMAC-SHA1 signature | No library needed [VERIFIED: reproduced with openssl] |
| stdlib `csv`, `zipfile`, `json` | stdlib | GTFS stop build job | Streaming, ~25 s for all three modes in my run [VERIFIED: run locally] |
| pydantic v2 (existing) | 2.14.x | Tolerant parsing models for PTV JSON (`extra="ignore"`, all optional) | Already the schema layer |
| sse-starlette (existing) | 3.6.0 | Stream `touch` handling | Existing |
| pytest, pytest-asyncio, respx (existing dev group) | - | Contract tests | Existing pattern |

Web: no new packages (vanilla TS, MapLibre `Marker`, existing `idb-keyval`).

### Supporting (needs David's approval, NOT recommended for this phase)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pyproj | 3.8.0 per CLAUDE.md | Convert PTV metro-train CIS `easting`/`northing` (MGA zone 55) to lat/lon | Only if train vehicle positions are wanted. Needs David's approval to add. Recommend: skip train vehicle positions this phase. |
| gtfs-realtime-bindings | 3.0.0 per CLAUDE.md | GTFS-R protobuf | Later phase when the KeyID key arrives; not now |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GTFS-derived stop store (recommended) | PTV `stops/location` per location | Needs the key to even show TRAN-01; needs exact location sent upstream; pending state on every new place; cannot be tested before the key. Rejected. |
| GTFS-derived stop store | Bulk PTV `stops/route/...` crawl | ~hundreds of calls, needs key, no direction info. Rejected. |
| Direction pairs from GTFS `stop_times` (offline) | Direction pairs from live departures | Needs departures before the pair can be chosen; extra calls. Rejected as primary. |

**Installation:** none.

## Package Legitimacy Audit

No external packages are installed or recommended in this phase (stdlib + existing dependencies only), so slopcheck was not run and no registry names were introduced.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none new) | - | - | - | - | n/a | - |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
`pyproj` is already named in CLAUDE.md's stack but is not in `pyproject.toml`; adding it is "needs David's approval" and the planner must gate it behind `checkpoint:human-verify` if chosen.

## Architecture Patterns

### System Architecture Diagram

```
 OFFLINE (weekly timer, user shinigami, MemoryMax 900M)
 data.ptv.vic.gov.au/downloads/gtfs.zip (310 MB, no key)
   -> inner 2/ (metro train) 3/ (metro tram) 4/ (metro bus) google_transit.zip
   -> stops.txt + stop_times.txt + trips.txt + routes.txt (streamed)
   -> var data: transit_stops.json  { PTV stop id, name, mode, poles[lat,lon,dirs], gtfs_ids, routes }

 STARTUP
 TransitStore.load(transit_stops.json) -> lat-bucket index (like CameraStore)

 PHONE ──GET /api/profile?lat&lon | ?place=──▶ resolve_location ──▶ assemble_profile
                                                    │  (exact providers skipped for Home pin: exact_ok False)
                                                    ▼
                       TransitStopsProvider.query()   (sync, memory only)
                          nearest per mode within limit, direction pair, walk time
                          -> records WATCH SET {stop_id: last_seen}  (no network)
                       TransitDeparturesProvider.query()  reads cache  (layer_cache write-through)
                       TransitVehiclesProvider.query()    reads cache
                       TransitDisruptionsProvider.query() reads cache, filters to shown route/stop ids
                                                    │ one orjson response, per-layer status/as_of
 PHONE <─────────────────────────────────────────────┘ then opens /api/stream (SSE)

 BACKGROUND (Runtime polled loop, 30 s, jittered; no watchers = no calls)
 TransitDeparturesProvider.refresh():
   for stop in watch set (seen < 3 min ago, max ~6):
      GET /v3/departures/route_type/{rt}/stop/{id}?max_results=25&expand=Run,Route,Direction,Disruption,VehiclePosition
        (signed; one call per stop)  ──▶ normalise ──▶ store.put_layer("transit", "dep:{id}")
   optional: pattern calls for approaching runs without a position (interpolated estimate)
   then bus.publish({"type":"touch","provider":ids})
 TransitDisruptionsProvider.refresh() (300 s): GET /v3/disruptions?route_types=0&1&2 -> cache (global)

 stream.py on touch: for each subscriber, provider.query(ctx, lat, lon) (their exact point, only if exact_ok)
   -> SSE "layer" frame -> web applyLayer -> model.selectVisible / TagLayer / edge pointers / readouts
```

### Recommended Project Structure
```
server/shinigami/
├── transit/
│   ├── __init__.py
│   ├── model.py        # normalised Departure / Vehicle / Disruption dataclasses (source-neutral)
│   ├── ptv_client.py   # sign_request(), PtvClient (httpx), tolerant pydantic parse, no logging of URLs
│   ├── store.py        # TransitStore: load json, bucket index, nearest per mode, pairing, walk time
│   ├── sources.py      # DepartureSource / VehicleSource Protocols; PtvSource impl; (later) GtfsRtSource
│   ├── severity.py     # classify_disruption() pure fn (D-17)
│   └── watch.py        # WatchSet (stop_id -> last_seen), TTL 180 s
├── providers/transit.py  # 4 Provider subclasses sharing one TransitService
└── data/refresh_transit.py  # GTFS -> transit_stops.json (offline)
server/tests/fixtures/ptv/   # stops, departures (tram/train/bus), runs, pattern, disruptions, errors
deploy/refresh-transit.sh + service/timer (or extend refresh-data.sh)
web/src/map/{tags.ts (extend), edge-pointers.ts (new), transit-card.ts (new), vehicle-marker.ts (new)}
web/src/ui/{next-list.ts, readouts.ts, model.ts} (extend)
web/public/icons.svg  # + stop-train/stop-tram/stop-bus, veh-train/veh-tram/veh-bus
```

### PTV Timetable API v3: exact reference (from the public swagger)

Source: `https://timetableapi.ptv.vic.gov.au/swagger/docs/v3` (HTTP 200, fetched today, 131,709 bytes) [VERIFIED: swagger]. Base `https://timetableapi.ptv.vic.gov.au`. Every request needs `devid` and `signature` query params (the `token` param says "Please ignore").

**route_type codes** (swagger enum 0..4; names from `/v3/route_types`, which needs a key): 0 Train, 1 Tram, 2 Bus, 3 V/Line, 4 Night Bus. The enum values are [VERIFIED: swagger]; the name mapping 0=train, 1=tram, 2=bus is consistent with the v2 docs (stevage v2 doc: 0 Train, 1 Tram, 2 Bus, 3 V/Line, 4 NightRider) [MEDIUM: community doc for v2]. Night Tram and Night Train are inside tram/train [CITED: vic.gov.au/public-transport-timetable-api].

| Need | Endpoint | Key params |
|------|----------|------------|
| Stops near a point | `GET /v3/stops/location/{lat},{lon}` | `route_types` (multi), `max_results` (default 30), `max_distance` (metres, default 300), `stop_disruptions` bool. Response `V3.StopsByDistanceResponse`: `stops[]` {stop_id, stop_name, stop_suburb, route_type, stop_latitude, stop_longitude, stop_distance, routes[], disruption_ids[]}, `disruptions` map. **Not needed** given the GTFS store; use only for a store-vs-PTV agreement check. |
| Departures for a stop | `GET /v3/departures/route_type/{rt}/stop/{stop_id}` | `max_results`, `date_utc` (ISO UTC, default now), `include_cancelled` (metro train only), `direction_id`, `platform_numbers`, `look_backwards`, `gtfs` (stop_id is GTFS id when true), `include_geopath`, `expand` (multi) |
| Departures, one route | `.../stop/{stop_id}/route/{route_id}` | same |
| Directions of a route | `GET /v3/directions/route/{route_id}` | -> `directions[]` {direction_id, direction_name, route_id, route_type} |
| Routes | `GET /v3/routes?route_types=&route_name=` | -> `routes[]` RouteWithStatus {route_id, route_name, route_number, route_type, route_gtfs_id, route_service_status{description,timestamp}} |
| Runs of a route (+positions) | `GET /v3/runs/route/{route_id}/route_type/{rt}?expand=VehiclePosition&expand=VehicleDescriptor` | all runs for the route (large) |
| One run | `GET /v3/runs/{run_ref}/route_type/{rt}` | single run |
| Stopping pattern of a run | `GET /v3/pattern/run/{run_ref}/route_type/{rt}` | `expand` (Stop, Route, Run, Direction, Disruption, VehiclePosition, VehicleDescriptor; default Disruption), `stop_id`, `date_utc`, `include_skipped_stops`, `include_geopath`. Returns `departures[]` (every stop of the run with times), `stops{}` with lat/lon when `expand=Stop`, `runs{}`, `directions{}`, `disruptions[]` |
| All disruptions | `GET /v3/disruptions` | `route_types` (multi), `disruption_modes` (multi, enum 1,2,3,4,5,7..14,100), `disruption_status` (0/1, meaning not documented in swagger) |
| By route / stop / both | `GET /v3/disruptions/route/{id}`, `/stop/{id}`, `/route/{id}/stop/{id}` | `disruption_status` |
| Disruption modes | `GET /v3/disruptions/modes` | names unknown without key |

**`expand` values:** the swagger lists integer enums `[0,1,2,3,4,5,6,7,2147483647]` with the description "All, Stop, Route, Run, Direction, Disruption, VehiclePosition, VehicleDescriptor or None. Run must be expanded to receive VehiclePosition and VehicleDescriptor." The integer-to-name mapping is not stated. Use the **names** (`expand=Run&expand=Route&expand=Direction&expand=Disruption&expand=VehiclePosition`), repeated (collectionFormat `multi`). ASP.NET enum binding accepts names; this is the form PTV's description uses but I could not test it without a key [MEDIUM-LOW]. For runs endpoints the swagger enum is `[0,1,2,2147483647]` for "All, VehiclePosition, VehicleDescriptor, None".

**Departure object** (`V3.Departure`): `stop_id`, `route_id`, `run_id` (-1 when alphanumeric), `run_ref` (string, use this), `direction_id`, `disruption_ids[]`, `scheduled_departure_utc`, `estimated_departure_utc`, `at_platform` (metro train only), `platform_number` (metro train only, string), `flags`, `departure_sequence`, `departure_note`. Times are ISO 8601 UTC strings. **`estimated_departure_utc` null/absent = scheduled only**: swagger calls it "Real-time estimate of departure time"; that null means "no real-time" is the natural reading but the swagger does not say it explicitly [MEDIUM]. Response `V3.DeparturesResponse`: `departures[]`, `stops{}`, `routes{}`, `runs{}`, `directions{}`, `disruptions{}` (maps keyed by id as strings), `status{version, health}`.

**Run object** (`V3.Run`): `run_ref`, `route_id`, `route_type`, `final_stop_id`, `destination_name`, `status` ("scheduled" for non-train; train status string values not documented: "cancelled" is the likely value but unverified [LOW]), `direction_id`, `vehicle_position`, `vehicle_descriptor`, `express_stop_count`, `run_note`.

**VehiclePosition** (`V3.VehiclePosition`): `latitude`, `longitude`, `bearing` ("Only available for some bus runs. May be null"), `easting`, `northing`, `direction`, `expiry_time` ("CIS - Metro Train Vehicle Location"), `supplier`, `datetime_utc` (when supplied). **Per swagger: lat/lon only for some bus runs; metro trains via MGA easting/northing; no tram positions are documented anywhere.** `V3.Run.vehicle_position` description: "Available for some Bus, Nightrider and Train runs. May be null." `VehicleDescriptor` gives operator and (some tram/bus) vehicle `id`, `low_floor`, `air_conditioned`: **do not show or store vehicle ids** (privacy rule: by route, never by driver/vehicle identity). [VERIFIED: swagger]

**Disruption** (`V3.Disruption`): `disruption_id`, `title`, `url`, `description`, `disruption_status` ("Planned"/"Current" per swagger description), `disruption_type` (free string; real values not in swagger [LOW]), `published_on`, `last_updated`, `from_date`, `to_date` (null if unknown), `routes[]` {route_type, route_id, route_name, route_number, route_gtfs_id, direction{direction_id, direction_name, service_time}}, `stops[]` {stop_id, stop_name}, `colour`, `display_on_board`, `display_status`. `/v3/disruptions` returns `disruptions` as an object with arrays per category: `general, metro_train, metro_tram, metro_bus, regional_train, regional_coach, regional_bus, school_bus, telebus, night_bus, ferry, interstate_train, skybus, taxi`. Flatten `general + metro_train + metro_tram + metro_bus + night_bus`.

**Licence / attribution:** CC BY 4.0; requested wording "Source: Licensed from Public Transport Victoria under a Creative Commons Attribution 4.0 International Licence." Must not imply PTV endorsement [CITED: vic.gov.au/public-transport-timetable-api]. Put it in the layer `attribution` string. The same page says the API is for dynamic use, not bulk download (use the GTFS dataset for static data), which supports the GTFS stop-store decision. **Rate limits: no figure is published anywhere I could reach** (v2 doc: "Do not hammer our servers"). Budget conservatively (below).

### HMAC-SHA1 signing (exact)

Per PTV's "API key and signature" document (RTF, fetched today) and its C#/Java samples [CITED: vic.gov.au/sites/default/files/2025-06/PTV-Timetable-API-key-and-signature-document.rtf]:
- Message = request path **plus query string**, with no base URL, **with `devid=<ID>` appended** to the query (use `?` if no query yet, else `&`). Case-sensitive; must be byte-identical to what is sent.
- Key = the 128-bit key string as ASCII bytes. Algorithm HMAC-SHA1.
- Signature = **uppercase hex** digest. Append `&signature=<SIG>` **last**.

Worked example, FAKE key `00000000-0000-0000-0000-000000000000`, devid `1000001` (computed with Python `hmac` and cross-checked with `openssl dgst -sha1 -hmac`; both agree):

| Signed message | Signature |
|----------------|-----------|
| `/v3/route_types?devid=1000001` | `6F409F877AFDAC161D72FF50A977789DC11FC30A` |
| `/v3/stops/location/-37.8136,144.9631?route_types=1&max_distance=800&max_results=10&devid=1000001` | `3CBCFCAAD4E49A23034FFCCFB481DE7EB3AEFCF8` |
| `/v3/departures/route_type/1/stop/2720?max_results=20&expand=Run&expand=Route&expand=Direction&expand=Disruption&expand=VehiclePosition&devid=1000001` | `2E233A9C90E8356BC38C8FAD87DE980DE11EE99F` |

Use these three as unit-test vectors. **Do not use PTV's own doc example** (key `9c132d31-...`, path `/v2/mode/2/line/787/stops-for-line`, claimed `D5474F34...`): it computes to `1FD3AC2EC7FE0EA39D7D5EF44A23B89AA7974B41` with the documented algorithm; the doc sample is evidently illustrative. The older `.planning/research/PITFALLS.md` suggestion to unit-test against the doc example therefore does not work. The signature step itself cannot be proven against the live server without a key [MEDIUM until David's first real call succeeds].

### Pattern 1: Static GTFS stop store with PTV ids (TRAN-01)

**What:** An offline job builds `transit_stops.json`; `TransitStore` loads it at startup into lat-buckets (copy `CameraStore`: `floor(lat*100)` buckets, `span = ceil(radius/1100)+1`, atomic swap, `reload_if_changed`, `loaded/count/built_at` for `/api/health`).

**Verified facts from the real feed (downloaded 2026-11-13):**
- Outer zip folders: `1/` regional train, `2/` metro train, `3/` metro tram, `4/` metro bus, `5/` regional bus, `6/`, `10/`, `11/`. Each contains `google_transit.zip` (sizes: 2 = 25 MB, 3 = 53 MB, 4 = 68 MB). Use 2, 3, 4 only (V/Line out of scope).
- `stop_url` is `https://transport.vic.gov.au/stop/<N>/?utm_...`; **`<N>` is the PTV stop id** (Melbourne Central = 1120, Flagstaff = 1068, both consistent with my recollection of PTV ids; also GTFS `stop_id` != PTV id, e.g. GTFS 10311 -> PTV 2587). [MEDIUM-HIGH: strong circumstantial match, PTV `gtfs` flag exists too; add a post-key agreement check]
- Trams: 1624 GTFS stops -> 1088 distinct PTV ids (536 duplicates). Flinders St Station/Swanston St #13 = PTV 2204 with two poles 46 m apart: pole 19499 serves directions 1 (toward e.g. Glen Iris/Carnegie), pole 19685 serves direction 0 (toward Melbourne University/Moreland). So a tram PTV stop = both directions.
- Buses: 22,633 GTFS stops -> 16,194 PTV ids. Opposite sides usually have different ids.
- Trains: platform rows carry `stop_url` and a `parent_station`; the parent rows (`location_type=1`, 226 of them) carry the station coordinates but no URL. One station = one PTV id; use the parent's lat/lon. **The metro-train feed also contains 224 "... Rail Replacement Bus Stop" rows with the same PTV id: filter rows whose name contains "Replacement"** or they overwrite the station name (my first prototype returned "Melbourne Central Rail Replacement Bus Stop").
- `stop_times.txt` streaming pass for all 3 modes took 11.5 s (tram, 7.3 M rows), 10.9 s (bus, 6.7 M rows), 1.3 s (train) on my PC with plain `csv.reader` and a `trip_id -> (route_id, direction_id)` dict (~160 k trips). Memory is small.

**Record per PTV stop:** `{id, mode, name, poles: [[lat, lon, [dirkeys]]...], gtfs_ids, routes: [short names]}` where `dirkey = "<route_short_name>:<gtfs direction_id>"`. Estimated JSON size ~3-5 MB for ~17 k PTV stops [ASSUMED, not measured]. Keep `gtfs_ids` and route short names: they are the join keys for the later GTFS-R seam.

**Nearest and pairing algorithm (prototyped, results below):**
1. Distance to a stop = min haversine over its poles (existing `geo.haversine_m`). Candidates per mode within D-03 limits (train 1500 m, tram 800 m, bus 500 m).
2. A = nearest. If A already serves both directions of some route (`(r,0)` and `(r,1)` both in A's dirkeys; true for most tram PTV stops), A is the only stop.
3. Otherwise B = nearest other stop in range that serves, for some route r in A, the opposite direction of A's `(r,d)`. Trains: A only. So max = 1 train + 2 tram + 2 bus = 5 (plus a second tram only in the one-direction case), matching "about 5 to 6".
4. Show "none nearby" items for modes with no candidate (never silently missing).

Prototype output on real data [VERIFIED: run locally]:
- CBD (-37.8136, 144.9631): train Melbourne Central 409 m; tram Bourke Street Mall/Elizabeth St #3 (PTV 2720) at 27 m, both directions in one stop; bus Elizabeth St/Lonsdale St 167 m (dir 1) plus Hardware St/Lonsdale St 241 m (dir 0).
- Clayton/Monash (-37.9142, 145.1304): train Clayton Station 1452 m (just inside 1.5 km); tram none nearby; bus "Monash University" (PTV 33430, 13 poles) 111 m covering both directions.
- Brunswick: train 119 m, tram 185 m, bus 9 m. Doncaster Junction area: bus only, train and tram none nearby.

**Walk time:** `walk_s = round(distance_m * 1.3 / (5000/3600))` = `distance_m * 0.936` s (5 km/h with 30% detour allowance [Claude's discretion; planner may tune]). Send `distance_m` and `walk_s` in each stop item's `detail`.

### Pattern 2: Layer split and who owns what

Four providers (one `Layer` per provider is the existing contract), sharing a `TransitService` object that holds the store, caches, watch set and PTV client. All four set `exact_location_only=True`.

| Layer id | Tier | Content |
|----------|------|---------|
| `transit_stops` | `computed` (like cameras) | stop items with `geom` Point (name, mode, `distance_m`, `walk_s`, route list, `pole_dirs` hint), "none nearby" items per mode, a `summary` item with ptv state (`ok`/`no_key`/`error`) |
| `transit_departures` | `polled` driver (see below) | non-positioned items, one per upcoming departure: `id="dep:{stop}:{run_ref}"`, `group="{stop}:{direction_id}"`, `target_ts` = estimated else scheduled, `detail{live, scheduled_ts, delay_s, route_number, route_type, destination, direction_name, platform, at_platform, walk_s, stop_id, disruption_ids, cancelled}` (positioned items would be hidden from the drawer by `selectVisible`) |
| `transit_vehicles` | `polled` (touch-published) | items `kind="transit_vehicle"` with `geom` Point, `detail{route_number, route_type, destination, heading_stop_id, eta_ts, pos_ts, pos_src: "ptv"|"est"|"gtfsrt"}`; no vehicle id |
| `transit_disruptions` | `polled` (300 s, global fetch, per-client filter) | items with `detail{title, description, url, route_ids, stop_ids, from_ts, to_ts}`, `severity` 0 or 3 per D-17, `target_ts = to_ts` when known |

**Why exact + home gate come free:** `assemble.py` skips `exact_location_only` providers for pins unless `exact_ok`. `exact_ok` is `camera_ok()` = place exists and `Place.cameras` true, and `places.py` forces `cameras=False` for Home / `is_home` / home-like labels. So Home pin gets no transit layers at all, and fail-closed for any caller that forgets. (A non-home place with `cameras = false` also loses transit. This matches D-04's "`Place.home` / `cameras=false` style gate" and the review's fail-closed rule; flag to David in open questions.)

### Pattern 3: PLAT-04-safe live data (the key design)

**Why not `on_demand` `fetch_cell`:** `fetch_cell` gets only the **0.1 degree cell centre** (~11 km); stops near the user cannot be derived from that, and passing the exact point upstream is exactly what the cell snap exists to prevent. PTV only needs **stop ids**, which `query()` can compute from the exact point locally.

**Why not plain `polled`:** `Runtime._poll_loop` calls `refresh()` then `_publish_layer(p, "global", 0.0, 0.0)` which runs `provider.query(ctx, 0.0, 0.0)` and broadcasts the result as a "global" layer to **every** subscriber. For a location-dependent layer that yields an empty/pending layer that clobbers real data on the phone (`applyLayer` replaces whole layers). **Required runtime change:** in `Runtime._publish_layer`, if `provider.meta.exact_location_only`, publish `{"type": "touch", "provider": id}` instead of a layer. **Required stream change:** in `event_stream`, handle `touch` events: if the provider is in the providers list and the subscriber is `exact_ok`, call `provider.query(ctx, lat, lon, ctx.clock())` and yield a `layer` frame (the stream already has the subscriber's exact lat/lon; for pins these are server-held and never sent). Also needs `assemble`-equivalent gating, so extract the gate rule into a helper used by both. Add tests for both.

**Demand-driven watch set:** `query()` (sync, called by `/api/profile` and at SSE start) records the chosen stop ids into `WatchSet` with `last_seen=now` (in-memory dict, no I/O, no coordinates stored). The departures `refresh()` runs every 30 s (jittered by the runtime) and only fetches stops seen in the last 180 s; when the phone is closed/backgrounded the watch set empties and there are **zero upstream calls**. First open of a new place: stops instant (static), departures `pending` until the first refresh (up to 30 s; to shorten, `query()` can also nudge an immediate fetch via a `ctx.runtime` hook, optional). The persisted `layer_cache` rows (`provider_id="transit"`, `cell="dep:{stop_id}"`) let a restart show last departures as `stale` immediately; the client already drops items whose `target_ts` has passed.

**Call volume and TTLs (conservative; real limit unknown):**
- Departures: 1 call per watched stop per 30 s. With about 5 stops: ~10 calls/min while the app is open. Fresh TTL 30 s, `stale_after_s` 120 s per item, layer `status="stale"` when `as_of` older than 120 s.
- Vehicles: no extra calls (positions arrive in the departures response via `expand=Run&expand=VehiclePosition`); `pos_ts` from `datetime_utc`; client fades > 120 s.
- Optional interpolated tram/bus positions: pattern calls for at most ~4 approaching runs, refreshed every 60 s (`/v3/pattern/run/{run_ref}/route_type/{rt}?expand=Stop&expand=Run`); cache per `run_ref`.
- Disruptions: 3 calls per 5 min (`/v3/disruptions?route_types=0&route_types=1&route_types=2`), global, filtered per client in `query()`.
- Add a small in-client concurrency/rate guard (max ~60 calls/min total, at most 4 in flight) and treat HTTP 429/5xx as failures so `_poll_loop` backoff (30 s doubling to 1800 s) applies. Departures with `max_results=25` per stop (tune with the key: busy CBD tram stops list ~20 route-directions).

**No-key state:** `Settings` gains `ptv_devid: SecretStr | None` and `ptv_key: SecretStr | None` with `validation_alias=AliasChoices("PTV_DEVID", "SHINIGAMI_PTV_DEVID")` (the class has `env_prefix="SHINIGAMI_"` but D-19 mandates un-prefixed names, and `shinigami.service` loads `EnvironmentFile=/etc/shinigami/.env`). With either missing: `PtvClient.configured == False`; refresh returns immediately (no calls, no log spam); `transit_stops` still works; departures/vehicles/disruptions layers return `status="pending"` with a `summary` item `state="no_key"` so the UI can say "Departures · PTV key not set". `/api/health` adds `transit: {stops: {loaded, count, age_days}, ptv: "no_key"|"ok"|"error", live_age_s}` (never ids, coordinates, devid or signature).

### Pattern 4: Vehicles heading to David's stops from PTV data alone (D-11)

What PTV gives: positions only on some bus runs (+ train CIS easting/northing); **nothing for trams**. What it cannot give: any stream of all vehicles on a route near a stop without expanding the whole route's runs (`/v3/runs/route/...` returns every run; too heavy to poll).

Approach, behind one seam:
```python
class VehicleSource(Protocol):
    async def positions(self, stops: list[StopRef], deps: list[Departure]) -> list[Vehicle]: ...
# Vehicle(run_ref, route_id, route_number, mode, lat, lon, bearing|None, ts, source, heading_stop_id, eta_ts)
```
1. `PtvRunPositionSource` (default): for each upcoming departure at a watched stop, if its run has `vehicle_position.latitude/longitude`, emit a vehicle with `pos_src="ptv"`. "Heading to" = the run appears in that stop's upcoming departures (not yet departed) AND straight-line distance to the stop <= ~2 km (D-11). ETA = the departure's estimated/scheduled time at that stop.
2. `PtvInterpolatedSource` (fills trams and buses without a position): for the soonest ~1-2 runs per route-direction at a stop, fetch the stopping pattern with `expand=Stop`, locate the two consecutive stops bracketing now using estimated (else scheduled) times, and place a marker linearly between their coordinates (straight line; `include_geopath=true` could improve it but is larger). Mark `pos_src="est"` and show an "estimated" caveat on the vehicle card. This is the only way to satisfy success criterion 3 for trams with PTV data alone; it cannot be validated without a key, so build it fixture-first and flag it.
3. `GtfsRtSource` (later, Deferred): GTFS-R VehiclePosition feeds map to the same `Vehicle`; join via the store's `gtfs_ids` and route short names. Nothing else changes.

Pitfall: do not claim "2 stops away" unless the pattern was fetched; otherwise say "heading to X, ETA M:SS".

Open question for David (below): accept labelled interpolated tram markers now, or ship TRAN-03 with only real bus positions until GTFS-R arrives.

### Pattern 5: Disruptions (D-15..D-17)

- Fetch network disruptions per mode every 5 min (3 calls), cache globally.
- Per client in `query()`: keep a disruption if any `routes[].route_id` is in the route ids of the **shown** stops' departures (from departures `routes{}` map, i.e., live ids) or any `stops[].stop_id` equals a shown stop id. Before departures arrive the layer is `pending` (route ids unknown). Active filter: `disruption_status == "Current"` or `from_date <= now`; and `to_date` null or `> now`; also keep "Planned" starting within 24 h as non-red info (D-17 says planned-works notices stay shown). Cap at ~6.
- `severity` via one pure function `classify_disruption(type, title, description) -> 0|3`: red (3) only for suspended / closed / cancelled / replacement buses ("suspend", "closed", "closure" of the stop/route, "cancel", "replacement bus"/"buses replace"). Everything else 0 (white/blue + warning mark). **PTV's actual `disruption_type` strings are not in the swagger and I could not see any [LOW]**; match case-insensitively on type+title, unknown = non-red, and keep fixtures easy to edit when real data is seen. Also use departure-level cancellation: for metro trains pass `include_cancelled=true` and treat `run.status == "cancelled"` [LOW] as red; trams/buses have no documented cancelled marker.
- A disruption with known `to_date` may also create a countdown row (D-16 exception): `target_ts = to_ts`, name like `Route 96 · works end`.
- Attribution on the layer.

### Pattern 6: Web integration

**What exists (read):** `tags.ts` `TagLayer` is camera-specific: `update(items)` replaces `located`; `reconcile()` ranks by distance (`rankTags`, within 30 m first), `assignTags` caps full labels at `BASE_FULL=8` (below zoom 17.5) / `MAX_FULL=20`, demotes overlapping labels, clusters compact icons (`CLUSTER_MAX=6`), `MAX_TOTAL=60`; `makeEl` builds `div.map-tag` > `.tag-icon` (svg `<use href="/icons.svg#...">`) + `.tag-label` + `.tag-tick` via `createElement`/`textContent` only; markers are MapLibre `Marker` (CSSOM transforms, fine under CSP); cards via `card.open(el, content, opts)` with `CardContent {title, primary, extra, secondary[], caveats[]}`; `iconFor` is hard-wired to camera groups; the marker position is set once at creation (`setLngLat` only in the creation branch), so **moving markers need `marker.setLngLat` on every update for existing entries**. `map.ts` only calls `tags.update` when `cameras_cctv`/`cameras_road` layer objects change (`CAMERA_LAYERS`, `lastCamLayers`), so it must also watch the three new layers.

**Changes:**
1. Generalise `TagCand` with `prio` (stop 0, vehicle 1, camera 2) and a per-kind descriptor (`iconFor`, `spokenType`, `cardContent`). `rankTags`: prio first, then the existing near-30 m/distance order within a priority. Stops are exempt from the overlap demotion in `assignTags` (D-13: "Nearby stops always get a label"); a paired bus stop at 20-60 m would otherwise be demoted. Cap vehicles (about 8). Vehicles are icon + route-number badge (no long name chip), so they compete for icon slots, not the ~20 label chips; cameras shrink first because they rank last. Red `near` class stays cameras-only (blood red scarce; vehicles are blue, never red).
2. Vehicle movement: in the existing-entry branch call `marker.setLngLat(newLngLat)` when the point changed; optional short rAF lerp (~1 s) via the marker element offset CSSOM; respect `prefers-reduced-motion` (jump). Fade after `pos_ts` > 120 s by toggling a class (CSS rule, no inline style attribute). Keep `selectedId` card open across position updates (the card re-anchors on `move`).
3. Stop card and vehicle card: new content builders next to `camera-card.ts` (`transit-card.ts`): stop card lists up to ~8 lines (2 per route-direction, D-07), each with `LIVE`/`SCHED`, delay text, platform for trains, dim class for uncatchable, a warning mark + alert text for disruption ids; vehicle card shows route, destination, heading stop, countdown, "estimated position" caveat when `pos_src="est"`. The card countdown must tick: the card is static text today, so either re-render on a 1 s ticker while open or reuse the existing `ticker.ts`.
4. **Edge pointers (D-14): new `edge-pointers.ts`.** For each stop item, `map.project([lon,lat])`; if outside the viewport inset by the safe-area/HUD margins, place an element on the screen edge along the ray from the viewport centre, rotated to point at it, text `Name · 900 m`; tap -> `map.easeTo` to the stop (reduced motion: `jumpTo`). Recompute on `moveend` and profile changes (not every `move` frame; `move` throttled by rAF at most). Build with `createElement` + `textContent`; position/rotate with `el.style.setProperty(...)` (CSSOM is allowed under `style-src 'self'`; the repo already does this in `drawer.ts`) never `setAttribute("style")` or inline `style=` markup. Distance text from `detail.distance_m` (pins use "server" origin exactly as cameras do).
5. Sprites: add `stop-train`, `stop-tram`, `stop-bus`, `veh-train`, `veh-tram`, `veh-bus` symbols to `web/public/icons.svg` (self-hosted, original). The service worker precaches the app shell; check `sw-routes.ts` still excludes `/api/*`.
6. Drawer rows (`model.ts` `selectVisible`, `next-list.ts`): `selectVisible` skips items with `geom` (so departures must have none) and groups by `${layer}|${group}` taking the min `target_ts`, and `redCountdown` marks the soonest `urgent` (< 15 min) row red. **Transit needs its own branch**: group = `stop:direction`; choose the first departure with `target_ts - walk_s >= now` (catchable, D-08), else the soonest with a "missed/too soon" dim state (never blank); `countdownText` = departure countdown; secondary `leave in M:SS` = `target_ts - walk_s - now`; `redCountdown = leaveIn <= 0` (D-09); **exclude transit rows from the generic `urgent`/`redCountdown` rule** (otherwise every tram within 15 min turns red) and **from `cornerRows` in `readouts.ts`** (otherwise the two soonest departures take over the two corner readouts that show sun/UV). The row name text e.g. `Tram 96 to St Kilda`; kind tag `tram · LIVE` / `tram · SCHED`. `RowVM`, `row-line` DOM and `NextList.update` need two small additions (leave-in text, live flag, missed class). `isStale` uses `item.stale_after_s` already.
7. Disruption corner readout: `Readouts.right` currently holds the camera count readout; add a second readout `N disruptions · your routes` (hidden when 0 and when the layer is absent) with a tap handler that opens a list (reuse `Card`, or a small sheet like `location-sheet`). Readouts currently has no interactivity, so this is new.
8. Home backstop (`app.ts`): `isCameraLayer`, `stripCameraLayers`, `noCameraPlaces` / `camerasOff(key)` and the `onLayer` filter (WR-W5) are camera-named. Generalise to "exact layers" (`cameras_*`, `transit_*`) for camera-off places, in the cached-profile path and the stream frame path. Add a vitest that a `transit_stops` layer pushed for a Home pin is not rendered or stored. Readout text for pins without transit: "Transit · not shown for saved places" (mirror `cameraCountText`).

### Anti-Patterns to Avoid
- **Calling PTV from `query()` or from the `/api/profile` handler.** Everything upstream is in `refresh()`.
- **Letting `_publish_layer(p, "global", 0, 0)` run for the exact transit providers** (clobbers real layers).
- **One layer for everything**: layer status (key missing vs stale vs fresh) would be conflated; keep four layers.
- **Putting `geom` on departure items** (hidden from the drawer by `selectVisible`) or leaving the generic urgent/red rule on transit rows.
- **Logging `str(exc)` or URLs** for PTV failures: `httpx.HTTPStatusError` messages embed the full URL including `devid` and `signature`. Log provider id + exception class only (the runtime already does); never `repr(response.request.url)`.
- **Parsing PTV strictly.** Fields are routinely null/absent; use all-optional models with `extra="ignore"`; tolerate `stop_latitude == 0`.
- **Storing or showing vehicle ids/operator descriptors** (`vehicle_descriptor.id`): privacy rule; drop at the parser.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC-SHA1 hex | custom hashing | stdlib `hmac`/`hashlib` | one-liner, verified against openssl |
| Spatial lookup of ~18 k stops | STRtree/PostGIS | lat-bucket dict like `CameraStore` | already proven in repo, no new deps (STRtree/Shapely is not installed) |
| Great-circle distance | new maths | `shinigami.geo.haversine_m` | existing |
| ISO UTC parse | regex | `datetime.fromisoformat` (3.12 handles `Z`) | stdlib |
| SSE fan-out | new socket/WebSocket | existing `EventBus` + `/api/stream` | already carries layer frames |
| Retry/backoff | new loop | `Runtime._poll_loop` backoff (30 s -> 1800 s, jitter) | already tested |
| Layer persistence | new file/db | `Store.put_layer`/`get_layer` (`layer_cache`) | existing WAL write-through |
| Card placement/leader lines | new geometry | `card.ts` `placeCard`, `leader.ts` | existing |
| Disruption wording | NLP | one `classify_disruption()` keyword function + fixtures | small, testable |

**Key insight:** the work is integration (per-client live layers over a shared poller, Home gating, moving markers), not data wrangling; reuse the Phase 1-2 machinery and add only the two small runtime/stream changes and one new web component.

## Runtime State Inventory

Not a rename/refactor/migration phase: omitted.

## Common Pitfalls

### Pitfall 1: Poll loop publishes an empty layer to everyone
**What goes wrong:** `Runtime._poll_loop` -> `_publish_layer(provider, "global", 0.0, 0.0)` -> `query(ctx, 0, 0)` returns empty transit layer, `applyLayer` replaces the phone's real layer.
**How to avoid:** touch-event design above; test: after a refresh with an exact provider, no `layer` event for `cell == "global"` is published, and a subscriber receives a layer computed for its own location.
**Warning signs:** departures vanish ~30 s after load.

### Pitfall 2: Home leak through the live path
**What goes wrong:** gate only `assemble` but let the stream `touch` handler query a Home pin; or register the Home point's stops in the watch set.
**How to avoid:** the same `exact_ok` rule in the touch path; assert in tests that a `place=home` stream never emits `transit_*` frames and the watch set stays empty. Server logs must never contain stop ids tied to a request. Note for David: when standing at home on live GPS, PTV does see ids of nearby stops (accepted by D-04's "live GPS works as normal").

### Pitfall 3: Signature mismatch from re-encoding
**What goes wrong:** the signed string differs from the sent URL (httpx re-encodes, param order changes, lat/lon formatting differs), giving 403.
**How to avoid:** build the final URL string once from an ordered list of `(key, value)` pairs; sign exactly that path+query; pass the finished URL to httpx with **no** `params=`; format lat/lon with a fixed `f"{x:.6f}"` (only needed if `stops/location` is used); repeat multi-value keys (`expand=Run&expand=Route`). Respx test asserts the received URL equals the signed message plus `&signature=`. Casing of path segments is significant.
**Warning signs:** HTTP 403 on everything after the key is added.

### Pitfall 4: Wrong mapping from GTFS stop to PTV stop
**What goes wrong:** using the GTFS `stop_id` as the PTV id, or trusting `stop_url` blindly.
**How to avoid:** key on the `stop_url` number; add a post-key "agreement check" (one `stops/location` call near a known point, compare returned `stop_id`s with the store) in the manual smoke script. If it fails, the store can use the `gtfs=true` departures flag instead (accepts GTFS stop ids) [MEDIUM].

### Pitfall 5: Rail replacement stops overwrite stations
Described above; filter "Replacement" names; test with a fixture row.

### Pitfall 6: Catchable logic against a stale server list
The server list is a snapshot; the clock keeps moving. Send enough upcoming departures (at least 4 per stop-direction) with absolute `target_ts` and compute catchability on the phone each tick. Walk times up to ~12 min (800 m tram) mean a 20-result list at a busy stop may contain no catchable departure; handle the empty case explicitly ("no catchable service in the next N min").

### Pitfall 7: Red overload
Generic `urgent` row logic turns the soonest row blood red; transit must define red = leave-now or D-17 service-stopping only. Corner readouts must not be hijacked by departure rows.

### Pitfall 8: Real-time semantics unverified
`estimated_departure_utc` null = scheduled-only and "estimated earlier than scheduled" are assumptions until the key is in. Keep `live = estimated is not None`; `delay_s = estimated - scheduled`; show "delayed N min" only if `delay_s >= 60`. Add a manual smoke checklist item to verify one live and one scheduled-only departure.

### Pitfall 9: Tram vehicle positions do not exist in PTV
TRAN-03 with PTV alone has no real tram positions. See Pattern 4 and the open question; do not promise real tram movement.

### Pitfall 10: Weekly GTFS job on a constrained CT
The zip is 310 MB and growing; existing `refresh-data.sh` caps downloads at 1 GiB and the unit has `MemoryMax=900M`, `ProtectSystem=strict`. Download to `/var/lib/shinigami/tmp`, extract inner zips to files (not `z.read` into RAM for 68 MB members; reading into memory worked in my test but streams are safer), delete temp files in a trap, use `curl -z`/ETag to skip unchanged, run as `shinigami`, never root. Write `transit_stops.json` atomically (tmp + rename) so a reload never reads a half file; validate `version` field and stop counts (refuse if < 80% of previous) so a bad download cannot empty the store.

## Code Examples

### Sign a request (verified against openssl)
```python
# Source: PTV signature document (RTF) + reproduced locally; FAKE key in tests only
import hashlib, hmac

BASE = "https://timetableapi.ptv.vic.gov.au"

def sign_path(path_and_query: str, devid: str, key: str) -> str:
    sep = "&" if "?" in path_and_query else "?"
    msg = f"{path_and_query}{sep}devid={devid}"
    sig = hmac.new(key.encode("ascii"), msg.encode("ascii"), hashlib.sha1).hexdigest().upper()
    return f"{BASE}{msg}&signature={sig}"

# sign_path("/v3/route_types", "1000001", "00000000-0000-0000-0000-000000000000")
#  -> .../v3/route_types?devid=1000001&signature=6F409F877AFDAC161D72FF50A977789DC11FC30A
```

### Request builder (one string, no httpx `params=`)
```python
def departures_url(rt: int, stop_id: int, max_results: int = 25) -> str:
    q = [("max_results", max_results), ("expand", "Run"), ("expand", "Route"),
         ("expand", "Direction"), ("expand", "Disruption"), ("expand", "VehiclePosition")]
    qs = "&".join(f"{k}={v}" for k, v in q)
    return f"/v3/departures/route_type/{rt}/stop/{stop_id}?{qs}"
# fetch: r = await ctx.http.get(sign_path(departures_url(1, 2720), devid, key), timeout=10)
# on failure log ONLY provider id + type(exc).__name__ (httpx errors embed the signed URL)
```

### Tolerant parse of a departure
```python
from datetime import datetime
from pydantic import BaseModel, ConfigDict

class PtvDeparture(BaseModel):
    model_config = ConfigDict(extra="ignore")
    stop_id: int | None = None
    route_id: int | None = None
    run_ref: str | None = None
    direction_id: int | None = None
    scheduled_departure_utc: str | None = None
    estimated_departure_utc: str | None = None
    at_platform: bool | None = None
    platform_number: str | None = None
    disruption_ids: list[int] = []

def ts(s: str | None) -> float | None:
    return datetime.fromisoformat(s).timestamp() if s else None  # 3.12 accepts trailing Z
```

### Touch event instead of a global layer (runtime.py sketch)
```python
def _publish_layer(self, provider, cell_id, lat, lon):
    bus = self.ctx.bus
    if bus is None:
        return
    if provider.meta.exact_location_only:      # per-client layers: never query (0,0)
        bus.publish({"type": "touch", "provider": provider.meta.id})
        return
    ...
# stream.py: on ev["type"] == "touch": look up provider by id; if exact_ok:
#    layer = provider.query(ctx, lat, lon, ctx.clock()); yield ServerSentEvent("layer", layer.model_dump_json())
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PTV v2 `mode`/`line` endpoints | v3 `route_type`/`route`, `run_ref` strings | v3 (migration guide) | Use `run_ref` (`run_id` deprecated, -1 for alphanumeric) |
| Realtime for all via PTV API | PTV API real-time "where made available"; GTFS-R feeds give tram/bus/train trip updates + positions | ongoing | PTV-first now, GTFS-R later behind the same seam |

**Deprecated/outdated:** `run_id` (use `run_ref`); v2 docs at stevage.github.io (v2 only, no realtime then).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `expand` accepts enum names (`Run`, `VehiclePosition`...) | PTV reference | Calls ignore expansion; fall back to integer mapping (None=0? unverified) |
| A2 | `estimated_departure_utc` null means scheduled-only | PTV reference, UI | Wrong LIVE/SCHED labels |
| A3 | PTV `departures` for a tram stop returns both directions for the PTV stop id | Pattern 1 | Need per-pole separate stops; grouping by `direction_id` still works, only the card changes |
| A4 | `stop_url` number == PTV API `stop_id` | Pattern 1 | Store joins to nothing; mitigation: `gtfs=true` flag or stops/location crawl |
| A5 | Metro train `run.status` value for cancellation is "cancelled" | Disruptions | Cancelled trains not red |
| A6 | PTV `disruption_type` strings contain suspend/closure/cancel/replacement keywords | Disruptions | Red marker missing or over-firing |
| A7 | No tram positions in PTV runs (swagger only documents bus/train) | Vehicles | If present, interpolation unnecessary |
| A8 | Rate limit is generous enough for ~20 calls/min per open app | Call volume | 429s; guard + backoff handle; may need longer intervals |
| A9 | `transit_stops.json` ~3-5 MB | Store | Memory estimate only |
| A10 | Walk factor 1.3 and 5 km/h | Walk time | Cosmetic |
| A11 | `disruption_status` param 0/1 meaning (Planned/Current order) | PTV reference | Not used; filter locally instead |
| A12 | Non-home place with `cameras=false` should also lose transit | Home gate | Over-gating a public place; easy to loosen with a dedicated flag |

## Open Questions (RESOLVED)

1. **Tram vehicle markers with PTV only?**
   - Known: PTV exposes no tram positions; buses only "some"; trains CIS coordinates needing pyproj.
   - Unclear: whether David accepts labelled "estimated position" markers interpolated from timetable/live estimates, or prefers only real bus positions until GTFS-R.
   - Recommendation: build interpolation behind `VehicleSource`, labelled `estimated`; skip train positions (avoids adding pyproj).
   - RESOLVED: D-20 (estimated tram markers labelled as estimated; real bus positions; no train markers).
2. **Should `Place.cameras=false` (non-home) also block transit?** Recommendation: yes, reuse the existing `exact_ok` gate (fail-closed); add a `transit` flag only if David wants Home-like places that still show buses.
   - RESOLVED: D-21 (any camera-off saved place gets no transit; existing exact gate reused, no separate flag).
3. **Rail replacement buses and V/Line:** metro GTFS only; V/Line stations out of scope. OK?
   - RESOLVED: D-22 (metro train, tram and bus only; V/Line out; rail-replacement rows filtered).
4. **First-open latency for a brand-new place:** departures appear after the first refresh (<= 30 s) unless `query()` nudges an immediate fetch. Recommendation: add the nudge (single-flight, rate-guarded).
   - RESOLVED: D-23 (server nudges one immediate fetch; no upstream call in the profile request).
5. **PTV rate limit and ToS wording:** unpublished; confirm in practice (watch for 429s) and keep attribution text.
   - RESOLVED: accepted: client rate guard (plan 03-06), observe 429s in practice, CC BY attribution kept.
6. **Key arrival unknown:** all live behaviour is unverified until David adds the key; plan a manual "first live smoke" step (3 calls, prints status and shapes only).
   - RESOLVED: D-24 and plan 03-20 (fixtures schema-derived and labelled; David runs the redacted smoke script after adding the key).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| GTFS zip `data.ptv.vic.gov.au/downloads/gtfs.zip` | stop store build | yes (HEAD 200, downloaded here in 79 s) | 310,635,000 B, Last-Modified 2026-11-12 | fixture subset for tests |
| PTV swagger (public) | contract | yes (HTTP 200) | v3 | - |
| PTV Timetable API (key) | departures, disruptions, vehicles | no (no key here; David adds on CT) | - | fixtures + "no key" state |
| Python 3.12 stdlib (csv/zipfile/hmac) | job, signing | yes (local 3.12) | 3.12 | - |
| openssl | cross-check only | yes | - | - |
| pyproj / shapely | train positions / STRtree | not in pyproject | - | skip train positions; bucket index |

**Missing dependencies with no fallback:** none for planning.
**Missing dependencies with fallback:** PTV key (build and test fully on fixtures; real-time truth needs David's first live call on the CT).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio (auto) + respx (server); vitest 5 + happy-dom (web) |
| Config file | `pyproject.toml` `[tool.pytest.ini_options]` (`testpaths=["server/tests"]`, `pythonpath=["server"]`); `web/package.json` (`vitest`) |
| Quick run command | `uv run pytest server/tests -x -q -k transit` ; `cd web && npx vitest run src/map src/ui src/model.test.ts` |
| Full suite command | `uv run pytest` ; `cd web && npx vitest run && npm run build` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRAN-01 | refresh job builds `transit_stops.json` from tiny GTFS fixture zips (PTV id from `stop_url`, parent station for trains, "Replacement" filtered, dirkeys) | unit | `uv run pytest server/tests/test_refresh_transit.py -x` | Wave 0 |
| TRAN-01 | store nearest per mode with limits 1500/800/500, both-directions tram, bus opposite-direction pair, "none nearby", walk_s | unit | `uv run pytest server/tests/test_transit_store.py -x` | Wave 0 |
| TRAN-01 | `transit_stops` layer via `/api/profile`; works with no key; pin place gets exact point; Home pin gets no transit layers; coordinates not logged | integration | `uv run pytest server/tests/test_transit_profile.py -x` | Wave 0 |
| TRAN-02 | signing vectors (3 FAKE-key vectors above) and URL == signed message | unit | `uv run pytest server/tests/test_ptv_signing.py -x` | Wave 0 |
| TRAN-02 | departures parse (live, scheduled-only, train platform/at_platform), respx contract incl. 403/429/500/timeout; no devid/signature in logs, exceptions, health | unit | `uv run pytest server/tests/test_ptv_client.py -x` | Wave 0 |
| TRAN-02 | watch set TTL, poll fetches only watched stops, idle makes zero calls, no-key makes zero calls | unit | `uv run pytest server/tests/test_transit_poll.py -x` | Wave 0 |
| PLAT-04 | `/api/profile` with transit performs no network I/O (respx assert_all_called False / no routes) | integration | existing `test_profile_readonly.py` extended | extend |
| TRAN-02 | runtime publishes `touch` not a `(0,0)` layer for exact providers; stream turns touch into per-subscriber layer; Home subscriber gets none | integration | `uv run pytest server/tests/test_runtime.py server/tests/test_stream.py -x` | extend |
| TRAN-02 | model: catchable selection, leave-in, red only when leave-in <= 0, transit excluded from generic urgent and `cornerRows`, LIVE/SCHED | unit | `cd web && npx vitest run src/model.test.ts src/ui/next-list.test.ts src/ui/readouts.test.ts` | extend |
| TRAN-03 | vehicle items: only runs at watched stops, within ~2 km, stale pos dropped, no vehicle id in payload; interpolation unit | unit | `uv run pytest server/tests/test_transit_vehicles.py -x` | Wave 0 |
| TRAN-03 | TagLayer priority stop>vehicle>camera, stops exempt from overlap demotion, marker `setLngLat` on update, fade class | unit | `cd web && npx vitest run src/map/tags.test.ts` | extend |
| TRAN-03 | edge pointers: on/off-screen test, angle/position clamp, label text, tap -> easeTo, no innerHTML/inline style attribute | unit | `cd web && npx vitest run src/map/edge-pointers.test.ts` | Wave 0 |
| TRAN-04 | disruption filter by shown route/stop ids, active window, `classify_disruption` red vs non-red table, countdown row only with `to_date` | unit | `uv run pytest server/tests/test_transit_disruptions.py -x` | Wave 0 |
| TRAN-04 | corner readout count text and tap list; warning mark on rows/cards | unit | `cd web && npx vitest run src/ui/readouts.test.ts src/map/transit-card.test.ts` | Wave 0 |
| D-04 | client backstop: transit layers stripped for camera-off place (cached + stream) | unit | `cd web && npx vitest run src/app.test.ts` | extend |
| HUD-10/PLAT | deploy verify: health.transit store loaded, profile at CBD contains `transit_stops` with >= 1 tram, ptv state reported; SKIP live checks when `no_key` | smoke | `bash deploy/verify.sh --local` | extend |

### Sampling Rate
- **Per task commit:** the relevant quick command above (server `-k transit`, web touched files).
- **Per wave merge:** `uv run pytest` and `cd web && npx vitest run`.
- **Phase gate:** both full suites plus `npm run build` green, then `/gsd:verify-work`; manual device check for edge pointers, moving markers, red leave-now (UAT-DEVICE.md pattern).

### Wave 0 Gaps
- [ ] `server/tests/fixtures/ptv/*.json`: hand-built from the swagger schema (NOT recorded): stops_location, departures_tram (live + scheduled mix, two directions), departures_train (platform, at_platform, cancelled), departures_bus_with_position, pattern_run, disruptions (suspended, delays, planned works with to_date null/known), errors. Mark each file "schema-derived, not recorded"; replace with recordings (devid/signature stripped) after the key arrives.
- [ ] Tiny GTFS fixture zips (outer + 3 inner) for the refresh job test, covering tram pole pairs sharing a PTV id, a parent-station train, a rail-replacement row, a bus opposite-direction pair.
- [ ] `scripts/ptv_smoke.py` (manual, run by David on the CT with env): 3 calls (route_types, one departures, one disruptions), prints HTTP status, field presence and counts only, never URLs, never ids; optionally writes redacted recordings.
- [ ] Extend `conftest.py` with a `ptv_settings` fixture (fake devid/key) and a transit store fixture.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (Tailscale-only access unchanged) | existing |
| V3 Session Management | no | existing |
| V4 Access Control | yes | Home gate: `exact_location_only` + `exact_ok`, client backstop; tests |
| V5 Input Validation | yes | pydantic tolerant parse of upstream JSON; existing query validation on `/api/profile` and `/api/stream` |
| V6 Cryptography | yes | stdlib `hmac`/`hashlib` only; never hand-roll; key via `SecretStr` |
| V7 Error handling and logging | yes | log provider id + exception class only; never URLs, devid, signature, stop ids per request |
| V14 Config | yes | `PTV_DEVID`/`PTV_KEY` only from env (`EnvironmentFile=/etc/shinigami/.env`, mode 0640 root:shinigami) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Key/signature leak via exception text, logs, health, SSE | Information disclosure | `SecretStr`; never `str(exc)`/URL in logs; httpx logger stays WARNING; test asserts devid/key/signature absent from `caplog`, `/api/health`, `/api/profile`, stream frames, error responses (extend `test_nologging.py`) |
| Home location revealed via transit layers (stops + distance) | Information disclosure | exact gate on assemble and stream; empty watch set for Home; client backstop; tests |
| Location revealed to PTV (stop ids) | Information disclosure | accepted for live GPS; only stop ids sent, never coordinates; no `stops/location` calls; document |
| Saved-place trilateration from stop geoms + distance_m | Information disclosure | accepted for non-home public places (same accepted risk as cameras, review WR-S3) |
| Upstream response abuse (huge/malformed JSON) | Tampering/DoS | `timeout`, size cap on response body, tolerant parse with try/except per item, cap items (e.g. 60 departures per stop) |
| Over-polling PTV | DoS (upstream ban) | watch-set TTL, 30 s cadence, concurrency/rate guard, backoff |
| Vehicle/person identification | Privacy | drop `vehicle_descriptor.id`/operator ids at the parser; show route only; `ItemKind` has no person kinds |
| XSS via upstream text (disruption titles, stop names) | Tampering | `textContent` only, no `innerHTML`; cap lengths; CSP `style-src 'self'` |

## Sources

### Primary (HIGH confidence)
- PTV Timetable API v3 swagger: https://timetableapi.ptv.vic.gov.au/swagger/docs/v3 (fetched 2026-11-13; all endpoint, parameter and schema facts)
- PTV key and signature document (RTF): https://www.vic.gov.au/sites/default/files/2025-06/PTV-Timetable-API-key-and-signature-document.rtf (signing algorithm and samples)
- Victorian GTFS Schedule zip: https://data.ptv.vic.gov.au/downloads/gtfs.zip (downloaded and inspected locally: structure, stops, `stop_url`, `stop_times`)
- Repo code read: `server/shinigami/{providers/base.py, providers/cameras.py, cameras_store.py, places.py, api/profile.py, api/stream.py, assemble.py, runtime.py, store.py, schema.py, settings.py, main.py}`, `web/src/{map/tags.ts, map/card.ts, map/camera-card.ts, map/leader.ts, map/map.ts, ui/next-list.ts, ui/readouts.ts, ui/drawer.ts, model.ts, app.ts, types.ts}`, `deploy/*`

### Secondary (MEDIUM confidence)
- https://www.vic.gov.au/public-transport-timetable-api (licence, attribution text, dynamic-use guidance, real-time statement)
- https://www.vic.gov.au/public-transport-timetable-api-faqs (real-time for metro train/tram/bus "where made available")
- https://stevage.github.io/PTV-API-doc (v2 only: mode numbers, tram signage "#N" is not the stop id, "do not hammer")
- https://discover.data.vic.gov.au/dataset/ptv-timetable-api (CC BY 4.0, update frequency)

### Tertiary (LOW confidence)
- Everything tagged LOW/ASSUMED above: real `disruption_type` strings, train `run.status` values, tram position absence, `expand` integer mapping, rate limits.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (no new dependencies; stdlib verified).
- Stop store and TRAN-01: HIGH for data structure and algorithm (prototyped on real data), MEDIUM-HIGH for `stop_url` == PTV id.
- Signing: HIGH on algorithm (doc + two independent computations), MEDIUM until first live call.
- PTV live behaviour (real-time, positions, disruption strings, rate limits): LOW-MEDIUM; swagger-only.
- Architecture (runtime/stream touch change, Home gate, web changes): HIGH, based on reading the code.
- Pitfalls: MEDIUM-HIGH.

**Research date:** 2026-11-13
**Valid until:** 2026-12-13 for GTFS/store facts (feed re-published weekly); re-check PTV behaviour as soon as the key is added.
