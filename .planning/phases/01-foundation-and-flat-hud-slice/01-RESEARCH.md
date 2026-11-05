# Phase 1: Foundation and Flat HUD Slice - Research

**Researched:** 2026-11-05
**Domain:** Private PWA + FastAPI on Proxmox LXC, served over Tailscale HTTPS; cached-first countdown HUD
**Confidence:** MEDIUM-HIGH (stack, ARPANSA, astral, Open-Meteo, Tailscale commands verified today; iOS standalone geolocation behaviour and the iPhone `*.ts.net` TLS issue can only be settled on the real phone)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Flat HUD look**
- **D-01:** Full Shinigami HUD styling from day one, not a throwaway plain list. The Phase 1 list should become the "next" strip / drawer of the final HUD, so its styling carries forward into Phase 2.
- **D-02:** Black background, thin frames. Use a **pixel font for titles/headers only** (like the "EYES" title bar in the hero reference) and a **clean monospace for item names and countdowns**, with tabular numerals.
- **D-03:** Palette: **blood red** for highlights and urgent items (kept scarce so it keeps its meaning), **desaturated cold NetHack blue** for neutral items and the world, white for text. No pink or magenta.

**Countdowns, expiry and OFF-GRID**
- **D-04:** Adaptive countdown format:
  - under 1 h: `mm:ss`, ticking every second (e.g. `18:42`)
  - under 1 day: `3h 12m`
  - longer: `14d 6h`
  - Always computed as `target_ts − (now + server offset)`, never a decrementing counter.
- **D-05:** When a countdown hits zero it gives a **brief red pulse, then dims and drops off** the list.
- **D-06:** Stale data **dims and shows an age tag** (e.g. `2h old`). Every item shows data freshness.
- **D-07:** Server unreachable → a **persistent full-width red banner**: `OFF-GRID · last sync 14m ago`. Cached items stay visible and keep ticking underneath. Fetches time out in 3–5 s, so the app never hangs.

**Location and manual pin**
- **D-08:** GPS by default. Manual pin = **one-tap saved places plus address search** (geocoded on David's server, never from the phone to a third party). From Phase 2 onward, the pin can also be dropped on the map.
- **D-09:** Starting presets: **Home (Bulleen)**, **Monash Clayton**, **Melbourne CBD**, **Hammers Gym Nunawading**. The exact home coordinates/address live in server-side config only, never in git.
- **D-10:** Location refresh: get a fresh fix **on open and when returning to the app**, then update only after moving **~100 m**. No continuous high-accuracy watch, to save battery.

**Server and hostname**
- **D-11:** Runs in a **new unprivileged Debian LXC** on Proxmox, isolated from SPENCER and LifeOS (~1–2 GB RAM).
- **D-12:** Tailscale is already on the Proxmox host. The LXC joins the tailnet as **its own node** named **`shinigami`** (needs `/dev/net/tun` passthrough). The hostname is **frozen**: `https://shinigami.<tailnet>.ts.net`. Disable key expiry on the node. HTTPS via `tailscale serve`, never Funnel.
- **D-13:** Setup is delivered as **scripts David runs**: the repo ships a setup script plus a short checklist, David pastes a few commands into the Proxmox shell, and Claude verifies afterwards. Claude gets no SSH access.

### Claude's Discretion
- Exact pixel and monospace font choices (must be self-hosted), sizes and spacing.
- Precise stale thresholds per layer, pulse/fade timings, list ordering within Phase 1 (a simple urgency sort is fine until Phase 4 ranking).
- Geocoder choice for address search (Nominatim proxied and cached server-side is the research default).
- Whether the LXC is created by a host-side script (`pct create`) or by a manual checklist step followed by an in-container script.
- Service manager details (systemd + uv per research).

### Deferred Ideas (OUT OF SCOPE)
None. Discussion stayed within phase scope. (Phase boundary: no 3D map, hero activation, map tags/cards (Phase 2); no ranking strip/chips/toggles (Phase 4); no Shortcuts prewarm (Phase 7).)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAT-01 | Fixed HTTPS `*.ts.net` address, not public | LXC + `tailscale serve --bg --https=443`, loopback bind, no Funnel; hostname freeze; iPhone TLS spike (tailscale#19147) |
| PLAT-02 | Home-screen install, standalone, safe-area | Manifest + apple meta + `viewport-fit=cover` + `env(safe-area-inset-*)`; single origin from FastAPI StaticFiles |
| PLAT-03 | Last profile <1 s from device cache, live fill-in without reload | idb-keyval last profile, SW-cached shell, `/profile` then SSE whole-layer replacement |
| PLAT-04 | `/profile` only from local caches; p95 ≤ 300 ms | Read-only handler, SQLite `layer_cache` + memory, background refresh, test that blocks outbound HTTP |
| PLAT-05 | OFF-GRID state with cached profile | 4 s AbortController, failure-based detection (not `navigator.onLine`), banner with last-sync age |
| PLAT-06 | GPS + manual pin | Foreground `getCurrentPosition`, 100 m hysteresis, server-config presets, Nominatim proxy |
| PLAT-07 | Service survives reboot, restarts on failure | systemd `Restart=always` + `pct set --onboot 1`, tailscaled enabled, `tailscale serve --bg` persistence |
| HUD-01 | Name + ticking countdown from absolute time | Item schema `target_ts`, `server_time` offset, boundary-aligned 1 Hz ticker, recompute on `visibilitychange`/`pageshow` |
| HUD-02 | Expired/stale dimmed or removed, freshness shown | `fetched_at`/`stale_after_s` per item, age tag, pulse-then-drop |
| ENV-04 | UV index + countdown to "protection no longer needed" | ARPANSA live index + Open-Meteo hourly clear-sky UV → UV ≥ 3 window boundaries |
| ENV-07 | Golden / blue hour countdowns | `astral` 3.2 local computation → `target_ts` |
</phase_requirements>

## Summary

Phase 1 is a walking skeleton with a hard infrastructure front-end. The fastest way to de-risk is to prove the chain **LXC → Tailscale → `tailscale serve` HTTPS → installed iPhone PWA** with a trivial page *before* building anything else, because the two things that cannot be fixed later are the hostname (renaming orphans the installed PWA and its IndexedDB) and iPhone trust of the `*.ts.net` endpoint. Open issue tailscale/tailscale#19147 (iPhone gets `ERR_SSL_PROTOCOL_ERROR` on Serve endpoints, iOS 26.4.x) is still open as of Sept 2026; the leading hypothesis is a third-party DoH/VPN/DNS app hijacking `.ts.net` lookups, not a TLS defect. Plan for a device checkpoint with a diagnosis ladder, not a code fix.

The application is small: one FastAPI process serving `/api/profile`, `/api/stream` (SSE), `/api/places`, `/api/geocode`, `/api/health`, and the built Vite bundle on the same origin. Three providers: **Sun** (golden/blue hour, computed with `astral`, no network), **ARPANSA UV** (live Melbourne index, one XML file for all cities), and **UV window** (Open-Meteo hourly clear-sky UV → the UV ≥ 3 window boundaries, because ARPANSA only publishes the current reading, not a "protection until" time). The client renders IndexedDB first, then `/profile`, then SSE; every countdown is `target_ts − (Date.now() + offset)`.

Two findings change earlier assumptions: (1) the ARPANSA feed has **no forecast/window data**, so "UV protection until" must be derived elsewhere (Open-Meteo, with an elevation-based local fallback); (2) uvicorn's access log records query strings, so `/profile?lat&lon` would write David's coordinates to the journal. Run with `--no-access-log`. Also: Vite 8.3.5 needs Node ≥ 22.12, which Debian 13's packaged Node (v20 line) does not meet, so the LXC needs a NodeSource Node 22/24 or the bundle must be built elsewhere.

**Primary recommendation:** Wave 1 = deploy a hello-world FastAPI + minimal PWA to the real LXC/iPhone (proves PLAT-01, 02, 07); then layer schema → providers → `/profile` → client cache/ticker → SSE → location, each demonstrably working on the phone.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| HTTPS, tailnet-only reachability | Tailscale (`tailscale serve` on LXC) | — | Real cert, no public exposure; app binds 127.0.0.1 |
| Static PWA shell delivery | API/Backend (FastAPI StaticFiles) | Browser SW cache | One origin, no CORS, one cert |
| Golden/blue hour computation | API/Backend (astral → `target_ts`) | — | "Server computes time semantics; client only subtracts" |
| UV live index + window | API/Backend (providers + SQLite cache) | — | Upstream calls only in background, never in request path |
| Profile assembly | API/Backend (read-only) | SQLite `layer_cache` | PLAT-04 |
| Live fill-in | API/Backend (SSE hub) | Browser EventSource | Server→phone only |
| Countdown rendering/ticking | Browser (1 Hz ticker) | — | Must work from cache with no server |
| Last-profile cache | Browser (IndexedDB) | Backend SQLite | iOS evicts SW caches; IDB is the real offline store |
| OFF-GRID detection | Browser | — | Failure of fetch/SSE, not `navigator.onLine` |
| GPS / pin selection | Browser (Geolocation) | Backend (presets, geocode) | Presets and home coords server-side only |
| Address search | API/Backend (Nominatim proxy + cache) | — | D-08: phone never talks to a third party |
| Process supervision | OS (systemd in LXC) + Proxmox `onboot` | — | PLAT-07 |

## Standard Stack

### Core (backend)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python (uv-managed) | 3.12 | Runtime | Dev machine has 3.12.10; pin `requires-python = ">=3.12,<3.14"` and `.python-version`; uv installs the same interpreter on the LXC so Debian's system Python doesn't matter [VERIFIED: local `python --version`; uv 0.12.3 present] |
| FastAPI | 0.162.0 | HTTP API | Mandated [VERIFIED: PyPI 2026-11-05] |
| uvicorn | 0.54.0 | ASGI, single worker, `--no-access-log` | [VERIFIED: PyPI] |
| sse-starlette | 3.6.0 | `EventSourceResponse` (ping, disconnect, graceful shutdown) | Handles keepalive and shutdown correctly vs hand-rolled StreamingResponse [VERIFIED: PyPI; README via WebFetch] |
| astral | 3.2 | Golden/blue hour, sun times | Pure Python, no ephemeris download, has `golden_hour`/`blue_hour` [VERIFIED: PyPI + ran locally] |
| httpx | 0.28.1 | Upstream client (ARPANSA, Open-Meteo, Nominatim) | [VERIFIED: PyPI] |
| pydantic / pydantic-settings | 2.14.x / 2.16.2 | Schema, settings from `.env` | [VERIFIED: PyPI] |
| tzdata | 2026.6 | `zoneinfo` on Windows dev | Pitfall: Windows has no system tz database [VERIFIED: PyPI] |
| sqlite3 (stdlib) | — | `layer_cache`, geocode cache, WAL | Single process; operations are microseconds so sync access is acceptable |

Not needed in Phase 1: APScheduler, orjson (pydantic v2 serialises in Rust; FastAPI's ORJSONResponse may be deprecated, `[ASSUMED]`), Shapely, pyproj, aiosqlite, gtfs bindings. Do not add them.

### Core (frontend)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vite | 8.3.5 | Build. **Requires Node ^22.12 or ^24** | [VERIFIED: npm engines] |
| vite-plugin-pwa | 2.0.0 | Manifest + Workbox SW | Peer `vite` includes `^8.0.0`; deps `workbox-build ^7.4.1`, `workbox-window ^7.4.1` [VERIFIED: npm view] |
| idb-keyval | 6.3.0 | IndexedDB key-value | [VERIFIED: npm] |
| @fontsource/silkscreen | 5.3.0 | Pixel title font, OFL-1.1 | Self-host as bundled woff2 [VERIFIED: npm license field] |
| @fontsource/jetbrains-mono | 5.3.0 | Monospace for names/countdowns, OFL-1.1 | Digits are fixed-width; also set `font-variant-numeric: tabular-nums` [VERIFIED: npm license field] |
| TypeScript | take the `npm create vite` vanilla-ts default (registry latest is 7.0.2) | Types | If 7.x tooling conflicts with vitest/vite plugin, pin 5.x `[ASSUMED]` |

### Test / dev
| Library | Version | Purpose |
|---------|---------|---------|
| pytest / pytest-asyncio | 9.2.0 / 1.4.1.post1 | Backend tests [VERIFIED: PyPI] |
| respx | latest | Mock httpx (ARPANSA, Open-Meteo, Nominatim fixtures) |
| ruff | latest | Lint/format |
| vitest | 5.1.0 | Frontend unit tests (formatter, ticker, offset, IDB) [VERIFIED: npm] |
| fake-indexeddb | latest | IDB under vitest `[ASSUMED]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| astral | skyfield 1.55 | Skyfield needs an ephemeris file (.bsp) download; astral is enough for sun. Skyfield arrives in Phase 5 for ISS |
| Press Start 2P | Silkscreen | Press Start 2P is very wide and tall; Silkscreen is tighter and closer to a "title bar" look. Both OFL-1.1 |
| sse-starlette | native `StreamingResponse` | Saves a dependency but you re-implement ping, disconnect polling, shutdown cancel |
| vite-plugin-pwa | hand-written ~40-line `sw.js` | Plugin now declares Vite 8 support; use it with `injectManifest` for control. Fall back to hand-written if the build breaks |
| Open-Meteo for UV window | elevation-threshold from astral | Local fallback needs no network but threshold is approximate; keep as fallback |

**Installation:**
```bash
# backend (repo root, uv)
uv init --python 3.12
uv add "fastapi==0.162.0" "uvicorn[standard]==0.54.0" "httpx==0.28.1" "pydantic>=2.14,<3" \
  pydantic-settings "sse-starlette==3.6.0" "astral==3.2" tzdata
uv add --dev pytest pytest-asyncio respx ruff

# frontend (web/)
npm create vite@latest web -- --template vanilla-ts
cd web && npm i idb-keyval @fontsource/silkscreen @fontsource/jetbrains-mono
npm i -D vite-plugin-pwa workbox-window vitest fake-indexeddb
```

**Version verification:** All versions above were read from PyPI/npm on 2026-11-05 (`pip index versions`, `npm view`).

## Package Legitimacy Audit

slopcheck could not be installed/run in this session (the install command was blocked by the harness). Per protocol, packages not previously confirmed by official docs are tagged `[ASSUMED]` and the planner should put **one** `checkpoint:human-verify` before the first `uv add` / `npm i` (David eyeballs the lockfile diff). All packages exist on the correct ecosystem registry (verified by `pip index versions` / `npm view`); no `postinstall` script on `vite-plugin-pwa`.

| Package | Registry | Source Repo | slopcheck | Disposition |
|---------|----------|-------------|-----------|-------------|
| fastapi, uvicorn, httpx, pydantic, pydantic-settings, pytest, pytest-asyncio, tzdata | PyPI | well-known | not run | Approved (high-profile; carried from STACK.md) |
| sse-starlette 3.6.0 | PyPI | github.com/sysid/sse-starlette | not run | `[ASSUMED]` - checkpoint |
| astral 3.2 | PyPI | well-known (sffjunkie/astral) | not run | `[ASSUMED]` - checkpoint |
| vite, vitest, vite-plugin-pwa 2.0.0, workbox-window, idb-keyval | npm | github.com/vite-pwa/vite-plugin-pwa etc. | not run | Approved (vite-pwa org repo confirmed via npm `repository.url`; modified 2026-10-03) |
| @fontsource/silkscreen, @fontsource/jetbrains-mono | npm | fontsource | not run | `[ASSUMED]` - checkpoint (license OFL-1.1 read from registry) |
| fake-indexeddb, respx | npm / PyPI | — | not run | `[ASSUMED]` - checkpoint |

**Removed due to [SLOP]:** none (tool not run). **Flagged [SUS]:** none identified.

## Architecture Patterns

### System Architecture Diagram

```
 iPhone (home-screen PWA, standalone)                         Proxmox host
 ┌───────────────────────────────────────┐                  ┌────────────────────────────────────────────┐
 │ cold open                             │                  │ LXC "shinigami" (unprivileged Debian)      │
 │  1 SW serves shell (cache-first)      │                  │  tailscaled (own node, /dev/net/tun)       │
 │  2 read IndexedDB profile:last ──┐    │                  │    └─ tailscale serve --bg --https=443     │
 │  3 render dimmed + start ticker  │    │   HTTPS (tailnet │         → http://127.0.0.1:8000            │
 │  4 GPS fix (never blocks render) │    │   only, ts.net)  │  systemd: uvicorn --workers 1              │
 │  5 GET /api/profile?lat&lon ─────┼────┼─────────────────►│   FastAPI                                  │
 │     (AbortController 4 s)        │    │                  │    /api/profile  READ-ONLY ──► Assembler   │
 │  6 ok → replace IDB, undim,      │    │ ◄── Profile ─────│        │ memory + SQLite layer_cache       │
 │     offset = server_time − mid   │    │                  │        ├─ SunProvider (astral, in-proc)    │
 │     fail → OFF-GRID banner,      │    │                  │        ├─ ArpansaProvider (snapshot)       │
 │     keep ticking cache           │    │                  │        └─ UvWindowProvider (per 0.1° cell) │
 │  7 EventSource /api/stream ──────┼────┼─────────────────►│   /api/stream (SSE)  ◄── Event bus         │
 │     layer events replace layers  │    │ ◄── layer/ping ──│        ▲ publish layer.updated             │
 │  visibilitychange/pageshow →     │    │                  │   background tasks (asyncio):              │
 │   recompute, reconnect, refetch  │    │                  │     ARPANSA 5 min ─► uvvalues.xml          │
 └──────────────────────────────────┘    │                  │     Open-Meteo per cell (singleflight)     │
   Manual pin: GET /api/places,          │                  │   /api/geocode ─► Nominatim (1 rps, cache) │
   GET /api/geocode?q= (Enter, no AC)    │                  │   StaticFiles(dist) + no-cache for sw.js   │
                                         └──────────────────┴────────────────────────────────────────────┘
```

### Recommended Project Structure
```
shinigamieyes/
├── pyproject.toml, uv.lock, .python-version
├── server/shinigami/
│   ├── main.py            # app factory, lifespan, StaticFiles mount LAST
│   ├── settings.py        # pydantic-settings (.env), places file path
│   ├── schema.py          # Item, Layer, Profile (pydantic)  <- reused by every phase
│   ├── providers/         # base.py (contract) sun.py arpansa.py uv_window.py
│   ├── runtime.py         # background tasks, singleflight, backoff, event bus
│   ├── store.py           # sqlite layer_cache + geocode_cache (WAL)
│   ├── assemble.py        # read-only profile assembly
│   ├── api/               # profile.py stream.py places.py geocode.py health.py
│   └── geo.py             # haversine, cell snapping
├── server/tests/ (fixtures/uvvalues.xml, open_meteo_uv.json)
├── web/ (Vite)
│   ├── src/ main.ts store.ts(IDB) clock.ts ticker.ts format.ts net.ts(sse+fetch) location.ts ui/*.ts styles/*.css
│   ├── src/sw.ts          # injectManifest
│   └── public/ icons, licenses/OFL-*.txt
├── deploy/ (proxmox-create-lxc.sh, lxc-setup.sh, shinigami.service, verify.sh, CHECKLIST.md, places.example.toml)
└── .env.example
```

### Pattern 1: Item / Layer / Profile schema (frozen contract for all 7 phases)
```python
# Source: ARCHITECTURE.md contract, adapted for Phase 1. [ASSUMED] field names - planner may rename but keep semantics.
class Item(BaseModel):
    id: str                    # stable across refreshes
    layer: str                 # "sun" | "uv"
    group: str                 # series key, e.g. "golden_evening", "uv_window"; client shows first unexpired per group
    name: str                  # "Golden hour"
    verb: str                  # "starts" | "ends" | "until" ...
    target_ts: float           # ABSOLUTE epoch seconds UTC
    kind: Literal["place","infrastructure","transit_vehicle","aircraft","vessel","self","environment"]  # allow-list; no person kinds
    severity: int = 0          # 0..3 (red only for >=2)
    detail: dict | None = None # e.g. {"now_index": 6.9}
    fetched_at: float          # when the underlying data was obtained/computed
    stale_after_s: int         # age beyond which client dims + shows "Xh old"
class Layer(BaseModel):
    id: str; status: Literal["fresh","stale","pending","error","out_of_coverage"]
    rev: int; as_of: float | None; attribution: str; items: list[Item]
class Profile(BaseModel):
    server_time: float; rev: int; location: {lat, lon, cell, source}; layers: dict[str, Layer]
```
Note `kind` allow-list is the project's person-level-data hard rule; encode it in the type, not a comment.

### Pattern 2: Multi-boundary emission + client "first unexpired per group"
**What:** Server emits every future boundary within ~36 h per group (e.g. golden evening start, golden evening end, blue start, blue end, next morning's...), each a separate Item with its own `target_ts`. The client shows, per `group`, the earliest item whose `target_ts` is still in the future.
**Why:** When "starts in" hits zero the corresponding "ends in" item already exists, so the cached profile stays truthful offline for hours without any server round-trip (D-05 pulse-then-drop works with no network).

### Pattern 3: Boundary-aligned ticker with absolute time
```ts
// clock.ts  - offset measured with RTT midpoint
export function measureOffset(serverTime: number, tSend: number, tRecv: number) {
  return serverTime * 1000 - (tSend + tRecv) / 2;        // ms; add to Date.now()
}
export const nowMs = () => Date.now() + offset;
// ticker.ts - one timer, aligned to the next whole corrected second; also fire on resume
function schedule() {
  const delay = 1000 - (nowMs() % 1000);
  timer = setTimeout(() => { tick(); schedule(); }, delay + 5);
}
for (const ev of ['visibilitychange','pageshow','focus']) addEventListener(ev, () => { if (!document.hidden) { tick(); } });
```
Offline with no measured offset this session: use offset 0 (iOS keeps device time NTP-synced) `[ASSUMED]`; never decrement a counter.

### Pattern 4: Countdown formatter (D-04)
```ts
export function fmt(sec: number): string {            // sec = floor(remaining)
  if (sec <= 0) return '00:00';
  if (sec < 3600)  return `${pad(sec/60|0)}:${pad(sec%60)}`;          // 59:59
  if (sec < 86400) return `${sec/3600|0}h ${(sec%3600)/60|0}m`;       // 1h 0m, 3h 12m
  return `${sec/86400|0}d ${(sec%86400)/3600|0}h`;                    // 14d 6h
}
```
Test boundaries 3599→`59:59`, 3600→`1h 0m`, 86399→`23h 59m`, 86400→`1d 0h`.

### Pattern 5: Read-only profile handler + background refresh
`/api/profile` reads `layer_cache`/memory and calls Sun provider (pure CPU, ms) inline; for UV window it reads the cell row. Cache miss → returns `status:"pending"`, `items:[]`, enqueues a singleflight background fetch; completion publishes `layer.updated` to the SSE hub. Persist every refresh to SQLite so a restart is not cold. Add a test that monkeypatches `httpx.AsyncClient.send` to raise and still gets 200 from `/api/profile`.

### Pattern 6: SSE with iOS-safe reconnect
- Server: `sse-starlette` `EventSourceResponse` with `ping=15` and a custom ping factory emitting a real `event: ping` frame (comment pings are invisible to JS, so a client watchdog needs a data event). Headers: `Cache-Control: no-cache`, `X-Accel-Buffering: no`. First frame: `event: hello` with `server_time`. Phase 1 may send full layers on connect instead of `Last-Event-ID` replay (whole-layer replacement is idempotent). Set uvicorn `--timeout-graceful-shutdown 5` so open streams don't block `systemctl restart`, and keep sse-starlette `shutdown_grace_period` below it [CITED: github.com/sysid/sse-starlette README].
- Client: iOS can leave a dead `EventSource` with `readyState === OPEN` and no `error` event after backgrounding (reported on iOS 18; anecdotal) [CITED: developer.apple.com/forums/thread/765183, github.com/flarum/framework/pull/4590]. Therefore: on `visibilitychange`(visible) **and** `pageshow` (bfcache restore) **and** `online`, close and recreate the EventSource and refetch `/profile`; add a 40 s watchdog that recreates the stream if no `ping` arrived. Skip reconnects while `document.hidden`.
- The stream URL carries `lat`/`lon` (reopen when the accepted location changes by >100 m). Access log is off so this is not logged.

### Pattern 7: Location store
State = `{mode: 'gps' | 'pin', pin?: {id|lat,lon,label}, lastFix?, lastAccepted?}` persisted in IDB. Render never waits on GPS: use `lastAccepted` (or the pinned place) immediately. Then `getCurrentPosition({enableHighAccuracy:false, timeout:8000, maximumAge:60000})` on open and on `visibilitychange`→visible; accept the new fix only if `haversine(new, lastAccepted) ≥ 100 m` or none exists (D-10). Do not use the Permissions API to decide anything (reported inconsistent on iOS: `prompt` while calls succeed, WebKit bug 275479, per search result). On denial/timeout: show "GPS unavailable" chip and the preset list; the pin is one tap. If the cached profile's location is >500 m from the current location, label it "previous location" (do not present it as "here").

### Anti-Patterns to Avoid
- **Server-supplied "seconds remaining":** breaks IDB restore and SSE reconnect.
- **`navigator.onLine` for OFF-GRID:** reports true on a captive/dead tailnet. Detect by fetch/SSE failure.
- **Caching `/api/*` in the service worker:** profile freshness is the page's job; SW precaches shell+fonts only and passes `/api/*` through (never intercept `/api/stream`).
- **Any upstream call in a request handler,** including the Open-Meteo UV window. Only `/api/geocode` talks upstream on demand (user-initiated, not `/profile`).
- **Autocomplete against Nominatim:** banned by policy; submit on Enter.
- **Rendering upstream strings with `innerHTML`:** use `textContent`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Golden/blue hour maths | Own solar equations | `astral.sun.golden_hour/blue_hour` | Edge cases at twilight, DST, date rollover |
| SSE framing, ping, disconnect | Custom StreamingResponse loop | `sse-starlette` | Shutdown + disconnect handling |
| App-shell precache + versioning | Hand-managed cache lists | vite-plugin-pwa `injectManifest` (Workbox precache) | Revisioned precache, atomic update |
| IndexedDB boilerplate | Raw IDB API | `idb-keyval` | 600 B, promise API |
| Geocoding | Own gazetteer | Nominatim proxy + SQLite cache | Policy-compliant, cache forever |
| Timezone handling | Fixed UTC+10/11 | `zoneinfo("Australia/Melbourne")` + `tzdata` | DST starts first Sunday of April 2027 / October |
| TLS certificates | Self-signed / mkcert | `tailscale serve` | Real LE cert, iOS trusts, no profile install |
| Process supervision | Shell loops/cron `@reboot` | systemd unit | Restart policy, journald |

**Key insight:** The only novel code in this phase is the contract (schema + ticker) and the glue. Everything on the "boring infrastructure" list has a standard component; time spent re-solving them is time not spent on the device spike that actually carries the risk.

## Runtime State Inventory

Not a rename/migration phase (greenfield). Omitted.

## Common Pitfalls

### Pitfall 1: iPhone cannot open the `*.ts.net` endpoint (tailscale#19147)
**What goes wrong:** Safari/Chrome show `ERR_SSL_PROTOCOL_ERROR` although the node and other devices work. Reports on iOS 26.4.1/26.4.2; iPadOS worked. Issue open, no maintainer response as of late Sept 2026 [CITED: github.com/tailscale/tailscale/issues/19147].
**Why:** Leading hypothesis (unconfirmed) is DNS: a third-party DoH/DNS/VPN app intercepts `.ts.net`; if the tailnet ever had Funnel on a route the phone may receive a public IP and be reset on 443. One reporter fixed it by removing a DoH app and a VPN; one had none and still failed.
**How to avoid / diagnose ladder (put in CHECKLIST.md):** (1) iPhone: Tailscale app connected, MagicDNS on, no other VPN/DNS profile; (2) in Safari open `http://100.x.y.z` ... or `https://shinigami.<tailnet>.ts.net/api/health`; (3) `tailscale funnel status` on the LXC must show nothing (the endpoint must never have been funneled); (4) try cellular vs Wi-Fi; (5) last resort `NodeAttrDisableSplitDNSWhenNoCustomResolvers` tailnet attribute (untested in thread). **Warning sign:** works from laptop, fails from iPhone. Treat this as a go/no-go gate before building UI.

### Pitfall 2: First HTTPS request is slow / fails (cert issuance)
**What goes wrong:** Tailscale obtains the Let's Encrypt cert on first TLS connection; first load can take seconds. **Avoid:** `verify.sh` does a warm-up `curl` before the phone test; MagicDNS and "HTTPS Certificates" must be enabled in the admin console first [CITED: tailscale.com/kb/1242/tailscale-serve; API-KEYS.md].

### Pitfall 3: Hostname churn orphans the PWA
Choose `shinigami` once; device name collisions silently become `shinigami-1`. **Avoid:** `tailscale up --hostname=shinigami` after confirming no existing machine of that name (delete stale entries in the admin console first); `verify.sh` asserts the FQDN equals the expected one. Never reinstall the LXC with a new node identity without removing the old machine. Use a non-revealing tailnet name (appears in cert transparency logs) [SUMMARY.md].

### Pitfall 4: Coordinates written to logs
`uvicorn` access log prints the full request line including `?lat=…&lon=…` and journald keeps it. **Avoid:** `--no-access-log`, log only layer/status, never raw coordinates; `places.toml` and `.env` outside git and mode 0600.

### Pitfall 5: ARPANSA feed quirks
**What goes wrong:** (a) File starts with a UTF-8 BOM — `ET.fromstring(response.content)` (bytes) works; decoding to `str` first breaks. (b) `<utcdatetime>` is `YYYY/MM/DD HH:MM` in UTC with no seconds/zone marker; `<time>`/`<date>` are station local (Melbourne shown as 11:56 AM when utc 01:56, i.e. UTC+10 at probe time although AEDT is +11; do not use local fields). (c) Station list has one `Melbourne` entry (a single station for the whole metro). (d) Values like `3.0` are floats as strings; `<status>` can be non-`ok`. **Avoid:** parse `utcdatetime` explicitly as UTC; treat non-`ok` status or age > 30 min as stale [VERIFIED: probe 2026-11-05 `uvvalues.xml`].

### Pitfall 6: ARPANSA has no "protection until"
The feed contains only the current index. The UV-protection window (UV ≥ 3, the SunSmart threshold) must come from a forecast or a model. Open-Meteo hourly `uv_index_clear_sky` for -37.76,145.09 on probe day was ≥ 3 from about 09:30 to about 17:50 local (hourly values 2.6 at 09:00, 4.4 at 10:00; 4.7 at 17:00, 2.9 at 18:00) [VERIFIED: probe]. Use the **clear-sky** series (conservative, matches "when do I need protection"), linearly interpolate the 3.0 crossing, request `timeformat=unixtime&timezone=UTC` so boundaries are absolute. Fallback when Open-Meteo is unavailable: sun elevation threshold (observed ≈ 22° at 18:00 giving UV 2.9, i.e. ~20–25° in November; ozone/season dependent, `[ASSUMED]` 20°) flagged `detail.estimated=true`. Show the ARPANSA reading ("now 6.9") as detail, not as the window source. Open-Meteo free tier: personal non-commercial use fine, <10 000 calls/day, CC-BY 4.0 attribution [CITED: open-meteo.com/en/terms]. Whether "UV protection" copy should say clear-sky vs cloud-adjusted is a product call (Open Question 3).

### Pitfall 7: astral date/direction surprise
`golden_hour(observer, date, SunDirection.RISING, tzinfo)` for 2026-11-05 returned a **2026-11-06** morning window in testing (the "date" for rising events is resolved from the UTC solar day). **Avoid:** call for date-1, date, date+1, flatten all start/end boundaries, filter to `now ≤ t ≤ now+36h`. Unit-test with fixed coordinates and compare to a known table; verify around DST changeover (first Sunday of April 2027, 3 am→2 am) [VERIFIED: ran astral 3.2 locally]. Astral golden hour = sun -4°..+6°, blue hour = -8°..-4° (these are astral's definitions; state them in the UI detail).

### Pitfall 8: iOS standalone geolocation re-prompt
Could not confirm current iOS 18/26 behaviour from official sources (only adjacent WebKit bugs: Permissions API reporting `prompt`, ~24 h grace window). Home-screen apps have storage separate from Safari. **Avoid:** never gate rendering on a fix; persist last accepted location; provide the preset/pin path as a first-class alternative; record observed behaviour in the device checklist (does it prompt on every cold launch? after 24 h? on return from background?). Safari Settings → Websites → Location can pin "Allow" for the origin; test in standalone mode specifically (Safari-tab results do not transfer) [LOW].

### Pitfall 9: Service worker serving stale shell / caching the API
Set `sw.js` and `index.html` to `Cache-Control: no-cache`, hashed assets `immutable`. SW scope `/`. Use `registerType: 'autoUpdate'` with `clientsClaim` so a fixed shell reaches the phone without deleting the app. Exclude `/api/` from `navigateFallback`. Test: change a string, redeploy, force-quit and reopen the PWA on the phone.

### Pitfall 10: Vite 8 needs Node ≥ 22.12; Debian packaged Node is older
**Avoid:** install Node 22/24 LTS on the LXC (NodeSource or `fnm`) only if building there; simpler alternative: build `web/dist` on the Windows dev machine and have `deploy.sh` take a tarball. Decide (Open Question 2). Debian 13's repo Node is v20-line (`[ASSUMED]`).

### Pitfall 11: Tailscale in unprivileged LXC fails silently
Missing `/dev/net/tun` → `tailscaled` starts but `tailscale up` errors with "tun module not loaded / permission denied". Config lines on host (CT stopped, then start) [CITED: tailscale.com/kb/1130/lxc-unprivileged]:
```
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
```
or `pct set <CTID> --dev0 /dev/net/tun` (Proxmox UI: Resources → Add → Device Passthrough). Prefer the documented config lines in the script; restart the CT after editing. Also `ls -l /dev/net/tun` inside the CT must show a char device `c 10,200`.

### Pitfall 12: SSE through `tailscale serve`
Believed to stream fine but unverified (`[ASSUMED]`: Go reverse proxy flushes). Add to Wave-1 hello-world: a `/api/_sse_probe` that emits one event per second; confirm on iPhone in standalone mode. If buffered, fall back to short polling (`/api/profile?rev=`) for Phase 1 and re-decide.

### Pitfall 13: `systemctl restart` hangs on open SSE connections
Set `--timeout-graceful-shutdown 5`, `TimeoutStopSec=15`.

## Code Examples

### ARPANSA parse
```python
# Source: probed https://uvdata.arpansa.gov.au/xml/uvvalues.xml 2026-11-05
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
def parse_arpansa(content: bytes, station="Melbourne"):
    root = ET.fromstring(content)                     # bytes: handles the BOM
    loc = next(l for l in root.iter("location") if l.get("id") == station)
    if (loc.findtext("status") or "").strip().lower() != "ok": raise ValueError("station not ok")
    idx = float(loc.findtext("index"))
    ts = datetime.strptime(loc.findtext("utcdatetime").strip(), "%Y/%m/%d %H:%M").replace(tzinfo=timezone.utc)
    return idx, ts.timestamp()
```

### UV window from Open-Meteo hourly
```python
# GET https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&hourly=uv_index_clear_sky
#     &timezone=UTC&timeformat=unixtime&forecast_days=3
def uv_boundaries(times: list[int], uv: list[float], thr=3.0):
    out = []
    for (t0,a),(t1,b) in zip(zip(times,uv), zip(times[1:],uv[1:])):
        if (a < thr) != (b < thr):
            t = t0 + (thr - a) / (b - a) * (t1 - t0)       # linear interpolation
            out.append(("starts" if b >= thr else "ends", t))
    return out
```
Emit one Item per boundary within 36 h (`group="uv_window"`, name "UV protection", verb "starts"/"until"). Hourly sampling means ±5–10 min precision (`[ASSUMED]` acceptable; label "approx" in detail).

### Golden / blue hour
```python
from astral import LocationInfo
from astral.sun import golden_hour, blue_hour, SunDirection
obs = LocationInfo("x","AU","Australia/Melbourne",lat,lon).observer
for d in (today-1d, today, today+1d):
    for dirn in (SunDirection.RISING, SunDirection.SETTING):
        for name, fn in (("golden", golden_hour), ("blue", blue_hour)):
            start, end = fn(obs, d, dirn, tz)       # emit two boundaries; filter to [now, now+36h]
```
Wrap in `try/except ValueError` (sun never reaches the elevation at extreme latitudes; irrelevant for Melbourne but keep the guard).

### Tailscale + service (in-container script, run as root)
```bash
# Source: tailscale.com/kb/1242/tailscale-serve ; install via official script
curl -fsSL https://tailscale.com/install.sh | sh
systemctl enable --now tailscaled
tailscale up --hostname=shinigami            # prints login URL; David approves; then Admin → Machines → shinigami → Disable key expiry
tailscale serve --bg --https=443 http://127.0.0.1:8000
tailscale serve status                       # must show "(tailnet only)"
tailscale funnel status                      # must show nothing
```
Reset/off: `tailscale serve reset`. `--bg` persists across reboot [CITED: tailscale.com/kb/1242].

### Host-side LXC creation (pct), variables for storage/bridge/CTID
```bash
# Run in Proxmox shell. Template name must be read from `pveam available`; [ASSUMED] debian-13 is listed.
pveam update && pveam available --section system | grep -E 'debian-1[23]'
pveam download local <debian-template.tar.zst>
pct create $CTID local:vztmpl/<debian-template.tar.zst> \
  --hostname shinigami --unprivileged 1 --features nesting=1 \
  --cores 2 --memory 1536 --swap 512 --rootfs $STORAGE:8 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp --onboot 1 --startup order=5,up=30 --ostype debian
cat >> /etc/pve/lxc/$CTID.conf <<'EOF'
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
EOF
pct start $CTID
```
`--onboot 1` is what makes the CT return after a host reboot; the in-CT systemd unit handles the app and tailscaled.

### systemd unit
```ini
[Unit]
Description=Shinigami Eyes
After=network-online.target tailscaled.service
Wants=network-online.target
[Service]
User=shinigami
WorkingDirectory=/opt/shinigami
EnvironmentFile=/etc/shinigami/.env
ExecStart=/opt/shinigami/.venv/bin/uvicorn shinigami.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-access-log --timeout-graceful-shutdown 5
Restart=always
RestartSec=2
TimeoutStopSec=15
NoNewPrivileges=true
PrivateTmp=true
StateDirectory=shinigami
[Install]
WantedBy=multi-user.target
```
Extra sandbox options (`ProtectSystem=strict` etc.) may fail inside an unprivileged LXC; add one at a time and test.

### Manifest / iOS head
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="/apple-touch-icon-180.png">
<meta name="theme-color" content="#000000">
```
Manifest: `id:"/"`, `start_url:"/"`, `scope:"/"`, `display:"standalone"`, `background_color/theme_color:"#000000"`. CSS: `padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)`; use `100dvh`. The home-screen icon must be the `apple-touch-icon` PNG (iOS ignores manifest icons for the home screen) `[ASSUMED]`.

### Nominatim proxy rules
`GET /api/geocode?q=` (min 3 chars, max 120, submit-on-Enter) → global limiter 1 req/s with a 4/min ceiling for scheduled-ish use, UA like `ShinigamiEyes/0.1 (private; contact: <email from .env>)`, `countrycodes=au`, Melbourne `viewbox` bias, `limit=5`, SQLite cache keyed by normalised query with no expiry, return cached on upstream failure. Note: a trial query for "Hammers Gym Nunawading" returned no result, so POI-name search is unreliable; presets cover David's real places and address search is for streets [CITED: operations.osmfoundation.org/policies/nominatim; VERIFIED: probe].

### Presets (D-09)
`deploy/places.example.toml` committed (CBD, Monash Clayton, gym approximate public coordinates, home as `REPLACE_ME`); real `places.toml` lives at `/etc/shinigami/places.toml` (gitignored path, mode 0600). `/api/places` returns the list; the phone caches it in IDB (it is David's phone) so presets work OFF-GRID.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tailscale serve https / http://…` (pre-1.52 syntax) | `tailscale serve --bg --https=443 <target>` | 1.52 | Use new flags; `--bg` persists across reboots |
| LXC tun via cgroup lines only | Also `pct set --dev0 /dev/net/tun` / UI device passthrough | Proxmox 8.x | Either works |
| vite-plugin-pwa 1.x (Vite ≤7 peers) | 2.0.0 with Vite 8 peer | Oct 2026 (npm modified 2026-10-03) | Use plugin; confirm at scaffold |
| `www.bom.gov.au/fwo/*.json` | `api.weather.bom.gov.au` | — | Not Phase 1 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ORJSONResponse deprecated / unnecessary; skip orjson | Standard Stack | Trivial; add later |
| A2 | `tailscale serve` streams SSE without buffering | Pitfall 12 | Fallback to polling; spike catches it |
| A3 | Offline offset 0 is acceptable | Pattern 3 | ≤ ~1 s jump on reconnect |
| A4 | Sun-elevation UV≥3 fallback threshold ~20° in November | Pitfall 6 | Fallback window off by tens of minutes (flagged estimated) |
| A5 | Open-Meteo hourly linear interpolation gives ±10 min | Code Examples | Slightly early/late "until" |
| A6 | Debian 13 template exists and its repo Node is <22.12 | Pitfalls 10, Code | Script adjusts |
| A7 | iOS uses apple-touch-icon for home-screen icon | Manifest | Wrong icon; test on phone |
| A8 | Packages `sse-starlette`, `astral`, `@fontsource/*`, `fake-indexeddb`, `respx` legit (slopcheck unavailable) | Package Audit | Supply-chain risk; human-verify checkpoint |
| A9 | TypeScript 7.x compatible with the vite/vitest toolchain | Standard Stack | Pin 5.x |
| A10 | iOS standalone geolocation prompt frequency | Pitfall 8 | Design is tolerant either way |
| A11 | "UV protection" should use clear-sky UV, not cloud-adjusted | Pitfall 6 | Product copy; see Open Question 3 |

## Open Questions (RESOLVED)

1. **Is the Windows dev machine on the tailnet, and what is the tailnet name / does `shinigami` already exist as a machine?**
   - Unknown from here. If the dev machine is on the tailnet, Claude can verify `https://shinigami.<tailnet>.ts.net/api/health` directly (D-13); otherwise David pastes `verify.sh` output.
   - Recommendation: plan a `deploy/verify.sh` that prints one JSON blob David can paste, and a dev-machine curl step if reachable.
   - **RESOLVED:** D-14 - yes, the dev PC is on the tailnet; Claude runs `deploy/verify.sh --remote` from the dev PC.
2. **How does code reach the LXC?** Remote is `https://github.com/mynamadavood/shinigamieyes.git` (public/private unknown). Options: `git clone` in LXC (needs deploy key/PAT if private) + Node 22/24 for the build, or build `web/dist` on Windows and `scp` a tarball. Recommendation: tarball for `dist`, `git pull` for server code; decide at planning.
   - **RESOLVED:** D-15 - `git pull` from GitHub on the LXC (read-only deploy key if private) + deploy script that installs deps, builds the PWA and restarts the service; Node >= 22.12 via NodeSource.
3. **UV window source semantics.** Clear-sky (conservative, recommended) vs cloud-adjusted? And is approximate (±10 min, hourly interpolation) acceptable? Recommend clear-sky, label "approx".
   - **RESOLVED:** D-16 - clear-sky UV (Open-Meteo `uv_index_clear_sky`, UV >= 3 window), ~±10 min precision acceptable.
4. **Proxmox specifics:** storage name for rootfs, CTID, bridge, available Debian template. Script takes these as variables with defaults and prints what it detects.
   - **RESOLVED:** handled as script variables with defaults (CTID, storage, bridge, template) in plan 01-02's `deploy/` scripts.
5. **Does the iPhone currently run any DoH/VPN/DNS profile?** Directly relevant to Pitfall 1; ask David before the device checkpoint.
   - **RESOLVED:** D-17 - Pi-hole on Proxmox, no VPN normally, AdGuard as a Safari extension; the Wave-1 device go/no-go checks MagicDNS `*.ts.net` resolution through Pi-hole and that AdGuard does not block the PWA origin.
6. **Tailnet ACLs:** should only the phone reach `shinigami:443`? Optional hardening; default ACL permits all tailnet devices.
   - **DEFERRED:** optional hardening, not Phase 1 scope; default tailnet ACL is accepted for now.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python | server dev | ✓ (dev) | 3.12.10 | — |
| uv | env/lock | ✓ (dev) | 0.12.3 | — |
| Node | web build/dev | ✓ (dev) | 24.15.0 (meets Vite 8 ≥22.12) | — |
| Internet to ARPANSA / Open-Meteo / Nominatim | providers | ✓ (probed today) | — | cached last-good; astral fallback for UV window |
| Proxmox host, Tailscale on host | LXC, PLAT-01/07 | unknown (not probeable here) | — | none: David-run checklist |
| iPhone (iOS 26.x) | PLAT-01/02/03/05/06 acceptance | unknown | — | none: manual UAT |
| slopcheck | package audit | ✗ (blocked) | — | human-verify checkpoint |
| Node 22+ on LXC | optional on-box build | ✗/unknown | — | build on dev, ship `dist` |

**Missing with no fallback:** Proxmox/iPhone acceptance can only happen with David.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Backend | pytest 9.2 + pytest-asyncio 1.4 + respx |
| Frontend | vitest 5.1 (+ fake-indexeddb, jsdom/happy-dom) |
| Config | `pyproject.toml [tool.pytest.ini_options]` (`asyncio_mode="auto"`), `web/vitest.config.ts` — Wave 0 creates both |
| Quick run | `uv run pytest -x -q` and `npm --prefix web run test -- --run` |
| Full suite | `uv run pytest && npm --prefix web run test -- --run && npm --prefix web run build` |
| Deployed smoke | `deploy/verify.sh` (checks health, serve status, funnel off, loopback bind, restart policy) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAT-01 | Only tailnet-reachable; app binds 127.0.0.1; funnel off; FQDN matches | smoke (on LXC) | `deploy/verify.sh` | ❌ Wave 0 |
| PLAT-01 | iPhone opens the URL (TLS ok) | manual-only (device) | UAT checklist | ❌ |
| PLAT-02 | Manifest valid (`display`, `start_url`, icons, apple tags) | unit | `npm --prefix web run test -- manifest` | ❌ Wave 0 |
| PLAT-02 | Installs full-screen, safe-area correct | manual-only (device) | UAT | ❌ |
| PLAT-03 | IDB last profile rendered before network; replaced after fetch; SSE replaces layer without reload | unit/integration (vitest, mocked fetch/EventSource) | `npm --prefix web run test -- store net` | ❌ Wave 0 |
| PLAT-03 | <1 s cold open on phone | manual (stopwatch / Safari Web Inspector timeline) | UAT | ❌ |
| PLAT-04 | `/profile` makes no outbound HTTP; p95 ≤ 300 ms (target ≤ 50 ms in-process) | unit + timing | `uv run pytest server/tests/test_profile_readonly.py` | ❌ Wave 0 |
| PLAT-05 | Fetch timeout ≤ 4 s → OFF-GRID banner, cache kept, ticking continues; recovery clears banner | vitest (fake timers) | `npm --prefix web run test -- offgrid` | ❌ Wave 0 |
| PLAT-06 | 100 m hysteresis; denied/timeout → pin path; places endpoint; geocode proxy cache + rate limit + UA | vitest + pytest (respx) | `... -- location` ; `uv run pytest -k geocode` | ❌ Wave 0 |
| PLAT-07 | Unit has `Restart=always`, `WantedBy=multi-user.target`; CT `onboot: 1`; survives `systemctl kill`; survives host reboot | smoke + manual (reboot) | `deploy/verify.sh`; manual reboot UAT | ❌ |
| HUD-01 | Formatter boundaries; remaining = target − (now+offset); resume after simulated 10-min background recomputes; boundary-aligned tick | vitest (fake timers) | `... -- format ticker clock` | ❌ Wave 0 |
| HUD-02 | Expired → pulse class then removed; stale (age > `stale_after_s`) → dim + `Xh old` tag; per-group first-unexpired | vitest (DOM) | `... -- list freshness` | ❌ Wave 0 |
| ENV-04 | ARPANSA fixture parse (BOM, UTC, status); UV boundaries from Open-Meteo fixture; fallback estimate; stale handling | pytest (fixtures + respx) | `uv run pytest -k "arpansa or uv_window"` | ❌ Wave 0 |
| ENV-07 | golden/blue boundaries for fixed lat/lon vs reference table; date-rollover (astral quirk); DST day Oct/Apr | pytest | `uv run pytest -k sun` | ❌ Wave 0 |
| SSE | ping events arrive; `hello` first; layer event after provider refresh; restart not blocked by open stream | pytest-asyncio (httpx stream) | `uv run pytest -k stream` | ❌ Wave 0 |
| Privacy | access log disabled; no coordinates in app logs (caplog assertion) | pytest | `uv run pytest -k nologging` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** quick run commands above (< 30 s).
- **Per wave merge:** full suite + `npm run build`.
- **Phase gate:** full suite green + `deploy/verify.sh` clean on the LXC + device UAT checklist signed off by David before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `pyproject.toml` pytest config, `server/tests/conftest.py` (app factory with frozen clock, respx mock, tmp SQLite)
- [ ] `server/tests/fixtures/uvvalues.xml` (copy real file including BOM), `open_meteo_uv.json`
- [ ] `web/vitest.config.ts`, `web/src/**/*.test.ts` stubs; fake-indexeddb setup
- [ ] `deploy/verify.sh`, `deploy/CHECKLIST.md`, UAT device checklist (cold-open timing, airplane/off-tailnet OFF-GRID, background 10 min, kill+reopen, reboot, GPS prompt behaviour record)
- [ ] Framework installs per Installation block

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Partial | Network-level only: tailnet membership. Optionally check the `Tailscale-User-Login` header that `tailscale serve` adds when proxying `[ASSUMED]`, as defence in depth |
| V3 Session Management | No | No sessions/cookies |
| V4 Access Control | Yes | Bind 127.0.0.1 only (LAN cannot reach it), no Funnel, optional Tailscale ACL limiting `tcp:443` to the phone |
| V5 Input Validation | Yes | pydantic: `lat ∈ [-90,90]`, `lon ∈ [-180,180]`, optionally restrict to a Victoria bbox; `q` length ≤ 120 |
| V6 Cryptography | Yes | TLS via Tailscale; never self-signed; no custom crypto |
| V7 Logging | Yes | No coordinates in logs; `--no-access-log` |
| V14 Configuration | Yes | `.env`/`places.toml` mode 0600 outside git; `.gitignore` already excludes `.env*` |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Accidental public exposure (Funnel, 0.0.0.0 bind, port-forward) | Information disclosure | Loopback bind; `verify.sh` asserts `tailscale funnel status` empty and `ss -ltn` shows 127.0.0.1:8000 only |
| Home coordinates committed to git | Information disclosure | `places.toml` server-only; example file has placeholder |
| Coordinates in journald/access log | Information disclosure | `--no-access-log`; log hygiene test |
| Upstream-controlled strings → XSS | Tampering | `textContent` only; CSP `default-src 'self'` (fonts/images self-hosted; connect-src 'self') |
| Nominatim abuse / ban | DoS | 1 rps limiter, cache forever, UA with contact |
| Tailscale node key expiry takes the app offline | DoS | Disable key expiry on the node (admin console) |
| Third-party leak of location | Information disclosure | Phone talks only to its own origin; no CDN fonts/scripts; upstream calls use snapped cell centres (0.1° / ~11 km), not raw GPS |

## Sources

### Primary (HIGH)
- PyPI / npm registries queried 2026-11-05 (`pip index versions`, `npm view`): fastapi 0.162.0, uvicorn 0.54.0, sse-starlette 3.6.0, astral 3.2, skyfield 1.55, tzdata 2026.6, pytest 9.2.0, pytest-asyncio 1.4.1.post1, httpx 0.28.1; vite 8.3.5 (engines), vite-plugin-pwa 2.0.0 (peers/deps), idb-keyval 6.3.0, vitest 5.1.0, typescript 7.0.2, @fontsource/* 5.3.0 (OFL-1.1)
- Live probes 2026-11-05: ARPANSA `uvvalues.xml` (structure, Melbourne index 6.9); Open-Meteo hourly `uv_index`/`uv_index_clear_sky`; Nominatim query; local astral 3.2 run
- https://tailscale.com/kb/1242/tailscale-serve (flags, status, reset, `--bg` persistence)
- https://tailscale.com/kb/1130/lxc-unprivileged (tun lines, `pct set --dev0`)
- https://github.com/tailscale/tailscale/issues/19147 (open, iOS 26.4.x, DNS hypothesis)
- https://operations.osmfoundation.org/policies/nominatim/ (1 rps, UA, cache, no autocomplete)
- https://open-meteo.com/en/terms (personal non-commercial OK, <10k/day, CC-BY)
- https://github.com/sysid/sse-starlette (ping, shutdown, X-Accel-Buffering)

### Secondary (MEDIUM)
- https://developer.apple.com/forums/thread/765183, https://github.com/flarum/framework/pull/4590, https://github.com/dimakis/mitzo/pull/325 (iOS EventSource silent drop, bfcache `pageshow`) — anecdotal, verify on device
- Project research: STACK.md, ARCHITECTURE.md, SUMMARY.md, PITFALLS.md

### Tertiary (LOW)
- WebKit bug 275479 / Apple forums on geolocation permission state (adjacent, not specific to standalone iOS 26)
- Training knowledge for `pct create` options, apple-touch-icon behaviour, `Tailscale-User-Login` header

## Thinnest end-to-end slice (walking skeleton) and suggested wave order

1. **Wave 1 - Prove the pipe:** `deploy/` scripts (pct create + tun + onboot; in-CT tailscale up/serve, uv, systemd) serving a FastAPI `/api/health` + minimal manifest/SW/hello page + `/api/_sse_probe`. David installs it to the iPhone home screen. Gate: TLS ok, standalone full-screen, SSE streams, survives CT/host reboot. (PLAT-01, 02, 07.)
2. **Wave 2 - Contract + server:** schema, Provider base, SQLite store, Sun provider, `/api/profile`, PLAT-04 tests; ARPANSA + UV window providers with fixtures; runtime + event bus + `/api/stream`.
3. **Wave 3 - Client:** format/clock/ticker/store/net, flat HUD list with fonts and palette, OFF-GRID banner, expiry pulse/dim/drop, freshness tags.
4. **Wave 4 - Location:** GPS flow, hysteresis, places, geocode proxy, previous-location label.
5. **Wave 5 - Device UAT and hardening:** cold-open timing, background/foreground, offline, reboot, SW update, log hygiene, `verify.sh`.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - versions read from registries today; Node/Vite constraint verified.
- Architecture: MEDIUM-HIGH - follows project ARCHITECTURE.md; SSE-through-serve and iOS reconnect need device proof.
- Pitfalls: MEDIUM - Tailscale/iOS items are issue-thread level evidence.
- UV window method: MEDIUM - data verified, interpolation/semantics are a design choice.

**Research date:** 2026-11-05
**Valid until:** 2026-11-19 (fast-moving: Vite/plugin versions, tailscale#19147 status)
