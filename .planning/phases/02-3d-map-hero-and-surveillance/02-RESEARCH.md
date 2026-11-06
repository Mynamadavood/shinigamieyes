# Phase 2: 3D Map, Hero and Surveillance - Research

**Researched:** 2026-11-07
**Domain:** MapLibre GL JS 6.x 3D map on iOS PWA, self-hosted Protomaps tiles, OSM-derived camera data, CSS/SVG hero
**Confidence:** MEDIUM (stack and APIs HIGH; tile-extract size, Protomaps feature ids and OSM camera coverage are unverified until the first real extract exists)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Red-eyes opening (HUD-03)**
- **D-01:** Plays on **every cold open** only (fresh launch). Not on resume from background.
- **D-02:** Animation: **eyes snap open + red iris flash**, then cut to the map. Total ≤ 1.5 s, plays **over real loading** (cached profile + map init run underneath), never delays data.
- **D-03:** Art: an **original SVG** of anime-style eye line art in the spirit of `.planning/references/hero-eyes.png`, **blood red on black** (never the reference's magenta), **not traced** from the reference.
- **D-04:** Keep the reference's framing: red pixel-font **`EYES` title bar with the `×` box**. **Tap anywhere** (incl. `×`) skips straight to the map.

**Map view and camera (HUD-04, HUD-10)**
- **D-05:** **Full-screen map** with a **pull-up "next" drawer** at the bottom: collapsed it shows the top 2–3 countdowns; dragged up it shows the full Phase 1 list (same row component and styling).
- **D-06:** Camera is **north-up, follows David's position**, tilted to show extruded buildings. **No compass / heading rotation** (no DeviceOrientation permission).
- **D-07:** **Free pan / pinch / rotate**, a **recenter** button snaps back to David, and **long-press drops a manual pin** at that spot (fulfils Phase 1 D-08's "pin can be dropped on the map"). A dropped pin behaves like an address-search pin (source `search`/manual, coordinates from the client).
- **D-08:** Self-hosted tiles cover **Greater Melbourne** (Dandenongs, Geelong, Mornington Peninsula), not all of Victoria. Outside the extract the map degrades to the offline grid look (D-15), data still works.

**Map tags and info cards (HUD-05)**
- **D-09:** Items **without a position** (sun, UV) render as **fixed HUD corner readouts** (Watch Dogs "REMOTE IP / LIVE STREAMING" style text, name + countdown), and in the drawer. Only items with a real position get **floating tags**.
- **D-10:** Tapping a tag opens a **floating framed card beside the tag** with a thin leader line (as in `.planning/references/nethack-view.png`). Tap elsewhere closes it.
- **D-11:** **Tag budget ~20 labelled tags**: nearest and most urgent (red/severity) get full icon + label; the rest shrink to small icons that expand to labels when zoomed in. Keeps the map smooth on the iPhone (success criterion 5).
- **D-12:** Camera card content: **type, distance, source + "mapped, not exhaustive"**, plus direction / operator / surveillance type when OSM has them. Speed/red-light card: **type, road/location, "static info only"**.

**Cameras (SURV-01, SURV-02)**
- **D-13:** Camera tags are **neutral blue**, switching to **blood red within ~30 m** (red stays scarce, Phase 1 D-03).
- **D-14:** Cameras live **on the map only**, plus a **HUD count readout** like `6 cameras · 150 m · mapped, not exhaustive`. The drawer stays countdowns-only. (Resolves the "everything has a countdown" rule: cameras are positioned facts, not timed items.)
- **D-15a:** CCTV radius **~150 m**; speed/red-light cameras within **~1 km**. Static info only, **no proactive alerts**.
- **D-16:** The caveat **"mapped, not exhaustive"** appears on the count readout **and** every camera card. The UI must never imply "no cameras here" when the count is 0 (e.g. `0 mapped cameras · 150 m · not exhaustive`).

**Offline map, marker, buildings**
- **D-15:** Offline (Tailscale off / tiles unreachable): **recently seen tiles are cached on the phone** so the area around David still draws; anything uncached renders as a **dark blue grid**, with tags and the marker still on top. OFF-GRID banner behaviour from Phase 1 unchanged.
- **D-17:** David's position marker is an **original small red suited-figure silhouette** (a nod to the Death Note vibe, **not** a likeness of any existing character), with a faint **GPS accuracy ring**. A manual pin uses a distinct **blue** marker.
- **D-18:** **Tapped building only** lights up in **solid blood red** (extrusion) with a small card (name / height if the tile data has it). All other buildings stay blue. Camera-bearing buildings are **not** tinted.

**Carried forward (Phase 1, still binding)**
- Blood red scarce + desaturated NetHack blue + white; pixel font for titles only, monospace with tabular numerals for names/countdowns (Phase 1 D-01..D-03).
- Countdown format and maths, expiry pulse, stale dimming, OFF-GRID banner (Phase 1 D-04..D-07).
- Pinned places' coordinates never reach the client; place layers computed at the 0.1° cell (Phase 1 review fix CR-02). Map pins dropped by David are client-known and fine.
- Every third-party lookup goes through the server; the phone never calls a third party (HUD-10, Phase 1 geocode/suggest pattern).

### Claude's Discretion
- Exact tilt angle, zoom range, drawer heights and snap points, animation easing/timings within the stated limits.
- Icon set for tags (must be self-hosted sprites, on-theme, original).
- Tile pipeline details (Protomaps PMTiles extract, style authoring, glyph/sprite generation) and how the server serves them (range requests from FastAPI or static).
- CCTV data pipeline (Geofabrik extract + osmium filter vs. Overpass bulk, weekly refresh) and speed-camera geocoding approach, following CLAUDE.md research notes (no live Overpass in the request path).
- Phone-side tile cache size and eviction.
- `prefers-reduced-motion` handling for the opening and pulses (should simplify, not remove, the skip path).

### Deferred Ideas (OUT OF SCOPE)
- Map rotating with compass heading (rejected for Phase 2; could revisit with AR work later).
- Tinting buildings that carry cameras red (rejected for now to keep red scarce).
- All-of-Victoria tile coverage (Greater Melbourne only for now).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HUD-03 | Hero activation ≤1.5 s, skippable, over real loading, never delays data | "Hero" pattern: CSS/SVG, compositor-only properties, map init deferred two frames after hero paints, dynamic `import()` of the map chunk, WR-06 IDB timeout fix first |
| HUD-04 | Dark tilted 3D map, desaturated blue, extruded buildings | MapLibre 6.16 + hand-authored style on Protomaps v4 schema (`buildings.height/min_height`, NOT `render_height`); fill-extrusion limits (opacity and vertical-gradient are layer-wide) |
| HUD-05 | Floating icon+label tags, tap opens card | DOM `Marker`s (≤60), client-side rank/collision on `moveend`, SVG leader overlay, feature-state building highlight |
| HUD-10 | Tiles, fonts, sprites from David's server only | Server decodes PMTiles to `/tiles/{z}/{x}/{y}.mvt`; glyph PBFs committed under `web/public/glyphs`; no map sprite needed (icons are the app SVG sprite); CSP unchanged except nothing new is needed |
| SURV-01 | CCTV within ~150 m from OSM, "mapped, not exhaustive" | Geofabrik Victoria PBF → pyosmium filter → `cameras.json` in `/var/lib/shinigami/data`; in-memory computed provider; 616 mapped nodes in the Greater Melbourne bbox (Overpass count, 2026-11-06) |
| SURV-02 | Fixed speed / red-light cameras, static info only | OSM `type=enforcement` relations (175 in bbox) with `highway=speed_camera` device nodes; official dataset has NO coordinates and no speed/red-light split |
</phase_requirements>

## Summary

The whole phase hangs on one architectural choice: **the server decodes PMTiles and serves plain `/tiles/{z}/{x}/{y}.mvt`** (gzip bytes passed through with `Content-Encoding: gzip`). That removes the need for the `pmtiles` and `@protomaps/basemaps` npm packages, makes phone-side offline caching a stock Workbox `CacheFirst` route (no 206/Range handling), keeps CSP untouched, and keeps location inside the tailnet. MapLibre 6.16.0 is ESM-only, needs no `blob:` worker (so the existing `worker-src 'self'` CSP holds) and needs a one-time `setWorkerUrl()` call under Vite. Style is hand-authored in TypeScript from the CSS tokens, against the **Protomaps v4 schema** (layers `earth`, `water`, `landuse`, `natural`, `roads`, `buildings`; building props `height`/`min_height`, no `name`), which differs from the OpenMapTiles `render_height` naming used in CLAUDE.md and CONTEXT.

Cameras come from one weekly offline job: the Geofabrik Victoria PBF (244 MB) filtered with pyosmium into a small JSON file read at startup by a new **computed** provider (sync, no I/O in the request path, same shape as `SunProvider`). Two findings change the UI-SPEC copy: (1) the official Victorian fixed-camera dataset is a 287-row XLSX of suburb + intersection text with **no coordinates and no speed/red-light type** (verified by opening the file), so OSM is the only practical source and the speed-card source line must read `Source: OpenStreetMap`; (2) in OSM, Victorian enforcement cameras live in `type=enforcement` **relations** whose `device` members are the `highway=speed_camera` nodes, so a node-only filter is not enough (only 4 + 1 nodes carry an `enforcement=*` tag in the metro bbox, versus 175 relations).

Two MapLibre facts also contradict the UI-SPEC: `fill-extrusion-opacity` and `fill-extrusion-vertical-gradient` are **layer-wide** (not data-driven, no feature-state), so "selected building: opacity 1, gradient off" must be implemented as a colour-only feature-state switch (`fill-extrusion-color` does support feature-state). And privacy: camera layers must **not** be computed from server-held preset coordinates, because distances/positions near Home would let the client triangulate it (CR-02 class leak). Default: no camera layers for `place=` pins; see Open Questions.

**Primary recommendation:** Build in this order: (1) Phase 1 robustness fixes WR-06/04/07/08 + shell restructure with drawer and a placeholder map-less HUD, (2) tile pipeline + `/tiles` endpoint + glyphs + style + map screen, (3) camera data pipeline + provider + tags/cards/count readout, (4) hero + long-press pin + offline cache + device pass. Every step stays independently deployable.

## Project Constraints (from CLAUDE.md)

- Backend only on Proxmox, reachable only over Tailscale; no Funnel, no public exposure.
- Python 3.12/3.13 + FastAPI, **single uvicorn worker** (in-process cache/runtime); no Redis/PostGIS/Celery.
- Never call any upstream in the `/api/profile` request path (Overpass was returning 502 during this research too); static datasets load at startup, refresh weekly.
- No second WebGL context (three.js) beside MapLibre; hero/tags/cards/ring are SVG/DOM/CSS.
- Fonts/tiles/glyphs/sprites self-hosted, never a CDN at runtime.
- Cached data on screen in < 1 s; live data fills in after. Map code must not sit on the cached-paint path.
- Privacy: published infrastructure only; nothing that identifies or tracks other people (Surveillance Devices Act); cameras are infrastructure.
- Single-user iOS PWA limits: no background location, secure context via `tailscale serve`.
- Proxmox LXC is small (default 1.5 GB RAM, **8 GB disk**) and shared; large files go under `/var/lib/shinigami` (the only service-writable path under `ProtectSystem=strict`).
- Registry safety: new npm/PyPI packages are gated by a human-verify checkpoint (slopcheck could not run in this session, see audit).
- GSD workflow: edits only through GSD commands (this research writes only the RESEARCH.md).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Vector tile storage and decode | API / Backend | Database / Storage (PMTiles file) | Keeps the phone talking to one origin; SW-cacheable plain GETs |
| Tile caching for offline (D-15) | Browser / Client (service worker) | API (immutable cache headers) | Workbox runtime cache of 200 responses |
| Style, 3D buildings, marker, ring, pin drop | Browser / Client (MapLibre) | — | Rendering and gestures are client-only |
| Camera dataset build (OSM → JSON) | Offline job on the LXC (systemd timer) | Database / Storage | Heavy parse; never in the request path |
| Camera radius query + `Item.geom` | API / Backend (computed provider) | Browser (re-sorts by distance from live GPS) | Server owns the dataset; client owns near-state (30 m) from its own coordinates |
| Preset-place privacy (CR-02) | API / Backend | — | Server withholds exact coordinates, and therefore camera layers, for `place=` pins |
| Tag rank / budget / collision | Browser / Client | — | Depends on screen projection |
| Hero animation | Browser / Client (CSS/SVG, compositor) | — | Must not wait on network |
| Cached-first paint, IDB, WR-06 timeout | Browser / Client | — | Core value; independent of the map chunk |
| Drawer, readouts, cards | Browser / Client (DOM) | — | Hand-written modules over Phase 1 components |
| Data refresh scheduling | OS (systemd timer) | API (reload on mtime) | Service sandbox is read-only apart from `/var/lib/shinigami` |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| maplibre-gl | 6.16.0 (npm, modified 2026-10-25) [VERIFIED: npm registry] | Map, 3D extrusions, markers | Mandated by CLAUDE.md; ESM-only, WebGL2 required; includes iOS worker-termination fix (6.15/6.16 changelog) and Safari 26.6 workaround [CITED: github.com/maplibre/maplibre-gl-js CHANGELOG] |
| pmtiles (PyPI) | 3.8.1 [VERIFIED: PyPI] | Server-side PMTiles reader (`Reader`, `MmapSource`) | Official Protomaps Python package, BSD-3; replaces the JS `pmtiles` package |
| osmium (PyPI, "pyosmium") | 4.3.2 [VERIFIED: PyPI] | Filter Geofabrik PBF for cameras | Official osmcode binding; `data` dependency group only, not in the API venv |
| go-pmtiles CLI | v1.31.2 (2026-07-22) [VERIFIED: GitHub releases] | `pmtiles extract` of Greater Melbourne from the Protomaps daily build | Official tool; single static binary |
| Protomaps daily build | `https://build.protomaps.com/YYYYMMDD.pmtiles`, 20261106 = 139,353,480,483 bytes, z0–15 [VERIFIED: HEAD request 2026-11-07; CITED: docs.protomaps.com/basemaps/downloads] | Tile source | Version 4 schema, OSM data |
| Geofabrik Victoria PBF | `…/australia-oceania/australia/victoria-latest.osm.pbf` (redirects to `victoria-261104.osm.pbf`, 243,583,462 bytes) [VERIFIED: HEAD request] | Camera source data | Daily, ODbL, small |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| workbox-strategies | 7.4.1 [VERIFIED: npm registry] | `CacheFirst` route for `/tiles/` and `/glyphs/` | Same Workbox family already installed (core/precaching/routing 7.4.1) |
| workbox-expiration | 7.4.1 [VERIFIED: npm registry] | `ExpirationPlugin` (maxEntries, `purgeOnQuotaError`) | Bound the phone-side tile cache |
| workbox-cacheable-response | 7.4.1 [VERIFIED: npm registry] | Cache only status 200 | Avoid caching 204/errors |
| @playwright/test | 1.65.0 [VERIFIED: npm registry] | Optional dev-only no-third-party-request smoke | Only if the planner wants an automated network assertion; headless WebGL via SwiftShader is MEDIUM |
| JetBrains Mono Regular TTF (OFL) | — | Source for glyph PBFs | One-time glyph generation via maplibre.org/font-maker (web app, WASM, ZIP output) [CITED: github.com/maplibre/font-maker] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server decodes PMTiles to z/x/y | `pmtiles` JS `Protocol` + HTTP Range from FastAPI | Needs `pmtiles` npm, SW range-caching (206 is not storable in Cache API), Safari range quirks. Rejected |
| Hand-authored style | `@protomaps/basemaps` `layers()` | It emits fill buildings, POIs, shields, sprite references and Noto Sans fonts; we need ~12 layers with extrusion and no sprite. Use it only as a schema reference. Not installed |
| pyosmium | `osmium-tool` apt + `osmium cat -f opl` parsing | Works without pip, but the relation→member and way→road-name joins are easier in Python. Fallback only |
| Brute-force/bucketed haversine | Shapely STRtree | ~1–5k camera points; haversine with a latitude prefilter is microseconds. No Shapely dependency needed this phase |

**Installation:**
```bash
# web (human-verify checkpoint first, see audit)
npm --prefix web install maplibre-gl@6.16.0 workbox-strategies@7.4.1 workbox-expiration@7.4.1 workbox-cacheable-response@7.4.1
# server
uv add pmtiles==3.8.1                    # runtime dep (tile endpoint)
uv add --group data osmium==4.3.2        # data-refresh job only
# LXC: pmtiles CLI v1.31.2 -> /usr/local/bin (pin release + sha256 in deploy script)
```
`deploy.sh` currently runs `uv sync --frozen --no-dev`; the data job needs `--group data` (or its own venv) and the unit for it must be root-installed like `shinigami.service`.

**Version verification:** `npm view` and PyPI JSON queried 2026-11-07 (versions above). `pmtiles` (npm 4.5.0) and `@protomaps/basemaps` (5.7.2) exist but are intentionally NOT used.

## Package Legitimacy Audit

slopcheck could NOT be run in this session (installing it was blocked by the sandbox permission classifier). Per protocol, every package below is therefore **[ASSUMED] for legitimacy** and the planner must gate each install behind a `checkpoint:human-verify` task. Registry facts were read with `npm view` / PyPI JSON (read-only).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| maplibre-gl | npm | 5.9 yrs (2020-12) | ~9.8M/wk | github.com/maplibre/maplibre-gl-js | not run | Approved pending human verify; no postinstall |
| workbox-strategies / -expiration / -cacheable-response | npm | 7–9 yrs | ~12M/wk each | github.com/googlechrome/workbox | not run | Approved pending human verify; same family already installed; no postinstall |
| @playwright/test (optional, dev) | npm | 6 yrs | ~109M/wk | github.com/microsoft/playwright | not run | Optional; no postinstall; browsers download on `playwright install` (separate step) |
| pmtiles | PyPI | 5.7 yrs (2021-02) | n/a | github.com/protomaps/pmtiles | not run | Approved pending human verify (name confirmed from docs.protomaps.com authors; **not** the same project as the npm `pmtiles`) |
| osmium | PyPI | long-lived (osmcode) | n/a | github.com/osmcode/pyosmium | not run | Approved pending human verify. Distribution name is `osmium` (PyPI `pyosmium` does not exist; `pip index versions pyosmium` returned no match) |
| go-pmtiles binary | GitHub release | v1.31.2 | n/a | github.com/protomaps/go-pmtiles | n/a | Not a package-manager install; pin version and sha256 in the deploy script. (I did not download or run it here: the sandbox denied it) |

**Packages removed due to slopcheck [SLOP] verdict:** none (slopcheck not run)
**Packages flagged [SUS]:** none known
**Not installed on purpose:** npm `pmtiles`, `@protomaps/basemaps` (UI-SPEC lists them as optional; this research makes them unnecessary), `idb-keyval` already present.

## Architecture Patterns

### System Architecture Diagram

```
 COLD OPEN (iPhone, standalone PWA)
   index.html -> main.ts
      |
      +--> [1] mount shell + hero overlay (inline SVG, CSS only)  ----> hero timer 1500 ms / tap = skip
      |
      +--> [2] IDB read (WR-06: raced vs 300 ms timeout) -> cached Profile -> drawer rows + readouts + count   (<1 s, no map dependency)
      |
      +--> [3] after hero's first painted frame (double rAF): dynamic import('./map/map') (maplibre chunk, SW-precached)
      |         new Map(style from tokens) --setWorkerUrl--> worker (same-origin /assets/...js)
      |         tiles: GET /tiles/{z}/{x}/{y}.mvt?v=BUILD --> SW CacheFirst(tiles-v1) --miss--> server
      |         glyphs: GET /glyphs/JetBrainsMono-Regular/{range}.pbf --> SW CacheFirst
      |         tile error / offline --> silently ignored -> CSS grid shows through transparent canvas
      |
      +--> [4] GET /api/profile?lat&lon (existing) --> layers: sun, uv, cameras_cctv, cameras_road ... --> IDB cache
                  |                                                                                         |
                  +--> SSE /api/stream (existing live fill-in)                                              v
                                                                      tags (<=60 DOM markers) + count readout + cards

 SERVER (FastAPI, 1 worker)
   /tiles/{z}/{x}/{y}.mvt --> pmtiles.Reader(MmapSource) on /var/lib/shinigami/tiles/greater-melbourne.pmtiles
                              hit -> 200 gzip bytes (immutable); outside extract -> 204 (cached)
   /api/profile -> assemble_profile -> CameraProvider.query (sync, in-memory list loaded at startup from
                   /var/lib/shinigami/data/cameras.json) -> Items with geom=Point, distance computed from request lat/lon
   place=<preset> -> NO camera layers (privacy; see Open Questions)

 OFFLINE JOBS (systemd timer, user shinigami, weekly/quarterly, NOT in deploy.sh path)
   refresh-tiles.sh : pmtiles extract build.protomaps.com/<latest>.pmtiles --bbox=... -> tmp -> atomic rename
   refresh-cameras.py: Geofabrik victoria-latest.osm.pbf -> pyosmium (nodes + enforcement relations + road names) -> cameras.json (atomic) -> server reloads on mtime
```

### Recommended Project Structure
```
server/shinigami/
├── api/tiles.py              # GET /tiles/{z}/{x}/{y}.mvt (+ /api/tiles/meta: build id, bbox, attribution)
├── tiles.py                  # PMTiles reader wrapper, startup assertions (MVT + GZIP), LRU of tile bytes optional
├── providers/cameras.py      # computed providers: cctv (150 m) and road cameras (1 km), reads CameraStore
├── cameras_store.py          # loads cameras.json, lat-bucket index, mtime reload
├── data/refresh_cameras.py   # offline job (imports osmium, only run from the data group)
web/public/glyphs/JetBrainsMono-Regular/{0-255,256-511,...}.pbf   # committed, generated once
web/public/icons.svg          # app SVG sprite (cctv, speed-cam, redlight-cam, building, recenter, pin)
web/src/map/
├── map.ts                    # create Map, camera/follow state, setWorkerUrl, error swallowing
├── style.ts                  # buildStyle(tokens) pure function (unit-testable)
├── buildings.ts              # selection via feature-state / queryRenderedFeatures
├── marker-figure.ts, pin.ts, accuracy-ring.ts
├── tags.ts                   # rank, budget, collision (pure) + marker DOM
├── card.ts, leader.ts        # card placement (pure) + SVG leader
├── longpress.ts              # state machine
web/src/ui/
├── hero.ts + hero.css        # SVG + timeline controller
├── drawer.ts                 # snap math pure + DOM
├── readouts.ts               # corner readouts, camera count readout
deploy/
├── refresh-tiles.sh, refresh-data.sh, shinigami-data.service, shinigami-data.timer, install-pmtiles.sh
```

### Pattern 1: Server-side PMTiles to z/x/y (recommendation for D-15 and HUD-10)
**What:** `Reader(MmapSource(open(path,'rb'))).get(z,x,y)` returns the stored (gzip) MVT bytes; return them unchanged with `Content-Encoding: gzip`, `Content-Type: application/x-protobuf`, `Cache-Control: public, max-age=31536000, immutable`; return `204` when `get` is `None` or z is outside header min/max zoom.
**Why:** Cache API cannot store 206 responses, so range-served PMTiles would need `workbox-range-requests` and custom handling; plain 200 tiles are trivially `CacheFirst`. The extract is also one less JS dependency and the CSP/connect-src stay `'self'`.
**Startup assertions (important):** the Python reader hard-codes gzip directory decompression and spec v3; assert `tile_type == MVT` and `tile_compression == GZIP` from `Reader.header()` at startup and log a clear error otherwise (the format enum already includes MLT and ZSTD, so a future daily build change would otherwise fail silently).
**Cost:** `Reader.get` re-parses directories on every call (gunzip + varint decode). Expect a few ms per tile; set a perf test budget (p95 < 25 ms warm) and add a small `functools.lru_cache` around directory parsing only if it is missed. Use a sync `def` route (threadpool) so the event loop is not blocked.
**Versioning:** serve `tiles: ["{origin}/tiles/{z}/{x}/{y}.mvt?v={build}"]` where `build` comes from the PMTiles metadata/extract date file, so a new extract busts the phone cache.
```python
# Source: pmtiles 3.8.1 reader.py (read from the wheel); route shape is a sketch
from fastapi import APIRouter, Response
router = APIRouter()
@router.get("/tiles/{z}/{x}/{y}.mvt")
def tile(z: int, x: int, y: int, request: Request) -> Response:
    t = request.app.state.tiles           # wrapper holding Reader + header
    data = t.get(z, x, y)                 # None if absent / out of zoom
    if data is None:
        return Response(status_code=204, headers={"Cache-Control": "public, max-age=86400"})
    return Response(data, media_type="application/x-protobuf",
                    headers={"Content-Encoding": "gzip",
                             "Cache-Control": "public, max-age=31536000, immutable"})
```
Mount this router before the `StaticFiles` mount (as the existing routers are) and exempt `/tiles/` and `/glyphs/` from the `headers_mw` `no-store`-for-`/api/` logic (already API-only) while adding long cache headers for them.

### Pattern 2: Extract and where it lives
- Command (LXC, user `shinigami`, never in `deploy.sh`): `pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles /var/lib/shinigami/tiles/greater-melbourne.pmtiles.tmp --bbox=144.2,-38.55,145.75,-37.45` then atomic `mv`. [CITED: docs.protomaps.com/pmtiles/cli]. Pick the date by HEAD-probing the last few days (today's build 404s until published: 20261107 was 404, 20261106 200).
- Suggested bbox (WGS84 min lon, min lat, max lon, max lat): `144.2,-38.55,145.75,-37.45` covers Geelong (144.36), Mornington Peninsula to Cape Schanck, the Dandenongs and Healesville. [ASSUMED] adjust after viewing.
- **Size is unverified.** Real data point: a Berlin extract (0.67° x 0.34°) was ~84 MB at z0–15 [CITED: pyviz tutorial / web search]. Greater Melbourne is ~8x the area but largely rural/ocean; estimate 300–900 MB. **Wave 0 task: run `pmtiles extract … --dry-run` first and record the size.** `--maxzoom=15` is the planet max anyway; if size is too large, trim the bbox, not the zoom (z15 carries the per-building features).
- Path: `/var/lib/shinigami/tiles/` (the unit's `StateDirectory=shinigami`, mode 0750, UMask 0027; service user can read, the job runs as that user). Never under `/opt/shinigami` (git tree, read-only to the service, and `deploy.sh lock_down` does `chown -R`/`chmod -R` there).
- Disk: the CT default is **8 GB** (`proxmox-create-lxc.sh`, `DISK_GB`). node_modules + venv + extract + the 244 MB PBF temp file will be tight; plan `pct resize <CTID> rootfs +8G` and delete the PBF after processing.
- Refresh: manual/quarterly is enough (buildings change slowly); a monthly timer is optional. Keep the previous file until the new one passes a `pmtiles verify`/header check, then rename.

### Pattern 3: Style authored from tokens (Protomaps v4 schema)
- `buildStyle(tokens, origin)` returns a plain object; unit test asserts every URL starts with `origin` (HUD-10) and that no layer uses an unknown source-layer.
- Source: `{type:"vector", tiles:[origin+"/tiles/{z}/{x}/{y}.mvt?v="+build], minzoom:0, maxzoom:15, attribution:"© OpenStreetMap contributors · Protomaps"}`. Always use absolute URLs built from `location.origin` (relative URL support in style `tiles`/`glyphs` was not verified).
- Source-layers and properties used [CITED: docs.protomaps.com/basemaps/layers]: `earth` (land fill; **use this instead of a `background` layer** so missing tiles show the CSS grid), `water`, `landuse` (`kind`: park, wood, …), `natural`, `roads` (`kind`: highway, major_road, minor_road, path, rail; `kind_detail`; `name` for labels, [ASSUMED] present on roads), `buildings` (`kind`: building | building_part | address; `height`, `min_height`; **no `name`**).
- Buildings: z0–14 are merged blobs with quantised heights (20 m step ≤ z12, 10 m z13, 5 m z14); individual OSM buildings exist at **z15** (tile maxzoom, overzoomed above) [CITED: Protomaps `Buildings.java`]. So set the extrusion layer `minzoom: 15` (not 14), and treat selection/height card as valid only at z15+. Filter `["==",["get","kind"],"building"]` first; check `building_part` visually in the CBD (parents and parts can double-extrude).
- Height expression: `["coalesce",["get","height"],8]`, base `["coalesce",["get","min_height"],0]`. The `render_height`/`render_min_height` names in CLAUDE.md/CONTEXT are OpenMapTiles (OpenFreeMap) and do not exist here.
- Glyphs: `glyphs: origin+"/glyphs/{fontstack}/{range}.pbf"`, `text-font: ["JetBrainsMono-Regular"]` (name without spaces avoids %20 paths). Street labels: `symbol-placement: "line"`, `text-field: ["get","name"]`, minzoom 16. **No `sprite` key at all**: the map style has no icons (tags are DOM), so there is no sprite to host; `icons.svg` (app sprite) satisfies the "sprites from own server" intent.
- Projection: set `projection: {type:"mercator"}` explicitly in the style (do not rely on defaults). [ASSUMED default is mercator]
- Map options (6.16.0 d.ts verified): `maxPitch: 70`, `minZoom: 11`, `maxZoom: 19.5`, `renderWorldCopies: false`, `fadeDuration: 0`, `maxTileCacheSize: 100`, `pixelRatio: Math.min(devicePixelRatio, 2)`, `canvasContextAttributes: {antialias:false, powerPreference:"high-performance"}` (antialias moved into `canvasContextAttributes`; defaults already antialias false), `attributionControl: {compact:true}`, `localIdeographFontFamily` left default. `cooperativeGestures: false`. `map.on("error", () => {})` swallow tile/glyph errors (UI-SPEC "never surface a raw error").
- Attribution: ODbL needs "© OpenStreetMap contributors". The default bottom-left control will sit under the drawer; offset it above `--drawer-peek` with CSS and also print the line in the drawer footer. [ASSUMED acceptable under ODbL "reasonable" attribution]

### Pattern 4: Worker/CSP under Vite for MapLibre 6
```ts
// Source: maplibre.org/maplibre-gl-js docs (bundlers section, fetched 2026-11-07)
import { Map, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
setWorkerUrl(workerUrl);
```
- Current CSP (`worker-src 'self'`, `img-src 'self' data:`, `font-src 'self'`, `connect-src 'self'`, `style-src 'self'`) is sufficient: 6.x loads its worker as a real same-origin URL, `blob:` is not required [CITED: v5→v6 migration guide]. MapLibre sets styles through the CSSOM (`el.style.x = …`), which `style-src` without `unsafe-inline` does not block; **your own code must not use `setAttribute("style")` or `innerHTML` with `style=` attributes** (blocked). Use classes, CSS custom properties set via `el.style.setProperty`, and SVG presentation attributes.
- `import * as`/named imports only (ESM, no default export). WebGL2 is mandatory: a `GPUInitializationError` is thrown by the constructor; catch it and keep the HUD without a map (grid only).
- The worker file must be in the SW precache (`vite-plugin-pwa` glob already includes `js`; also add `pbf` for `glyphs/*/0-255.pbf` and `svg` for `icons.svg`). Bundle grows by roughly 1 MB raw: load maplibre via dynamic `import()` so the cached-paint path never waits on it.

### Pattern 5: Tags, cards, collision (client)
- DOM `Marker` with `pitchAlignment:"viewport"`, `rotationAlignment:"viewport"`, `anchor:"center"`, `subpixelPositioning` off (all in the 6.16 `MarkerOptions`). ≤60 markers is comfortable for DOM; symbol layers are not needed and would force a sprite + glyph load for labels.
- Ranking/budget/collision as pure functions over `{id, lngLat, distance, near}` + a `project()` callback; run on `moveend` debounced 100 ms (and on new profile). Distance is recomputed on the client from the live fix (haversine in TS), not trusted from the server (the cached profile ages as David walks).
- Card placement is a pure function (tag rect, viewport, safe insets, readout/drawer rects) → unit-testable; leader updated in rAF on map `move`.
- Building tap: `map.on("click")` only fires for map canvas clicks (DOM tags/cards sit above and swallow theirs). `queryRenderedFeatures(point,{layers:["buildings-3d"]})[0]`.

### Pattern 6: Building highlight with MapLibre's real constraints
`fill-extrusion-color` supports `feature-state`; `fill-extrusion-opacity` (zoom-only) and `fill-extrusion-vertical-gradient` (zoom-only) do **not** [VERIFIED: style-spec v8.json 26.5.1]. So:
```ts
paint: {
  "fill-extrusion-color": ["case", ["boolean",["feature-state","selected"],false], tokens.red, tokens.building],
  "fill-extrusion-height": ["coalesce",["get","height"],8],
  "fill-extrusion-base":   ["coalesce",["get","min_height"],0],
  "fill-extrusion-opacity": 1,                 // layer-wide; UI-SPEC's 0.92 would make the red building 0.92 too
  "fill-extrusion-vertical-gradient": true     // layer-wide; red building shades like the others
}
map.setFeatureState({source:"protomaps", sourceLayer:"buildings", id}, {selected:true})
```
Requires **numeric feature ids** in the tiles. Protomaps' OSM building path calls `.setId(FeatureId.create(...))` but the Overture path has it commented out [CITED: Buildings.java], so ids are likely present but **must be verified on the real extract (Wave 0 spike: `queryRenderedFeatures(...)[0].id !== undefined`)**. Fallback if ids are missing: put the queried feature's geometry into a GeoJSON source rendered by a second `fill-extrusion` layer (flat red, opacity 1, gradient off), accepting tile-edge clipping. Clear the previous selection with `removeFeatureState`. Amend UI-SPEC: "solid" red = colour only; opacity 1 for the whole layer (or accept 0.92).

### Pattern 7: Long-press pin (D-07)
Custom pointer/touch state machine on `map.getCanvasContainer()`: start on a single-finger `touchstart` not on tag/card/readout/drawer, 500 ms timer, cancel on move > 10 px, a second touch, or any MapLibre `dragstart/zoomstart/rotatestart/pitchstart`; on fire convert with `map.unproject()` using container-relative coordinates and reject non-finite results (touching above the horizon at pitch 60). Do not use MapLibre's own touch `contextmenu` event (added in 6.11.0 [CITED: CHANGELOG]) because the ring animation needs the start time. CSS on the container: `-webkit-touch-callout:none; -webkit-user-select:none; user-select:none`. The dropped pin calls the existing search-location handler with `src=search`, `label="Dropped pin"` (profile API already accepts it, `label` ≤120).

### Pattern 8: Accuracy ring
Use a `circle` layer (GeoJSON source of one Point) with `circle-pitch-alignment:"map"`, `circle-pitch-scale:"map"`, and update `circle-radius` (px) from metres on `zoom` (throttled): `px = metres / (78271.51696 * cos(lat°) / 2^zoom)` clamped to [16, 150]. (`zoom` cannot be nested inside `max/min` in a style expression, which is why the clamp is done in JS.) Hide when accuracy ≤ 10 m.

### Pattern 9: Hero and cold-open over real loading
- DOM/CSS only: inline `<svg viewBox="0 0 360 128">`, animations in a stylesheet (CSP ok). Use **transform and opacity only** for the parts that must stay smooth while the main thread is busy with MapLibre init (lid `scaleY` in `steps(4)`, flood rect opacity 2 frames, layer fade). Avoid `stroke-dashoffset` draw-on (main thread); fake draw-on with a `translateX` mask rectangle.
- Order: paint hero first; start map construction after the hero's first painted frame (`requestAnimationFrame` ×2 then `import("./map/map")`), never before; cached profile paint is independent of both.
- Flag: module-level `let played = false`; skip if `performance.getEntriesByType("navigation")[0]?.type === "back_forward"` or `pageshow` with `event.persisted`; never on `visibilitychange`. Hard `setTimeout(1500)` end regardless of map/data readiness. Reduced motion: static eyes 500 ms + 200 ms fade (UI-SPEC).
- WR-06 (IndexedDB read hang) is a **prerequisite**: race `loadProfile/loadLastSync/location.start` against ~300 ms so the first paint promise cannot hang behind IDB.

### Pattern 10: Camera provider (computed tier)
- `CameraProvider.query(ctx, lat, lon, now)`: sync, reads in-memory `CameraStore` (loaded in `create_app`/lifespan from `/var/lib/shinigami/data/cameras.json`; reload when mtime changes, checked at most every few minutes). Two layers (`cameras_cctv` radius 150 m, `cameras_road` radius 1000 m) so each layer's status, `as_of` and attribution are separate.
- Item: `kind="infrastructure"`, `layer="cameras_cctv"|"cameras_road"`, `group` = `cctv|speed|redlight`, `target_ts=None`, `geom={"type":"Point","coordinates":[lon,lat]}`, `detail` = optional `{camera_type, direction_words, operator, surveillance, road, suburb, distance_m}` (omit missing keys), `stale_after_s=None`, `computed=True`. Layer `status`: `pending` when the file is missing/unparsable (client shows `Cameras · not loaded yet`), `fresh` with 0 items when loaded and nothing nearby (client shows zero copy).
- `as_of` = dataset build time; attribution `© OpenStreetMap contributors (ODbL)`.
- Existing client pitfall: `selectVisible()` in `web/src/model.ts` includes **any item with `target_ts === null`** as a drawer row (value-only rows like `uv_now`). Camera items would appear in the drawer, violating D-14. Exclude `item.geom !== null` (or an allowlist of layers) in `selectVisible` and cover with a test.
- Sort by distance, cap at the 60-marker budget server-side too (`LIMIT 60` per layer), but the count readout must use the **uncapped** count (carry `detail`/layer-level `count` in the first item or an extra summary Item such as `cameras:summary` with `geom=None`, `detail={count, radius_m}`; the summary must be excluded from the drawer by the same filter, give it `layer` of the camera layer and `target_ts=None`, `geom=None` → add `detail.hidden=true` or filter by layer prefix).

### Anti-Patterns to Avoid
- **Computing camera layers from a preset pin's real coordinates.** Camera positions plus per-camera distances near Home let the client solve for Home (same class as CR-02). See Open Questions.
- Third-party hosts anywhere: the stock Protomaps flavors reference `protomaps.github.io` glyph/sprite URLs; do not copy `layers()` examples verbatim.
- Serving PMTiles ranges to the phone and caching 206s.
- Loading Overpass/Geofabrik from the request path or at startup; the job is offline.
- Building DOM with `innerHTML` + inline `style=`: blocked by CSP.
- Setting a full-screen `background` layer: kills the grid-through-missing-tiles design.
- Per-frame tag re-ranking: do it on `moveend`.

## Camera Data Pipeline (SURV-01 / SURV-02 detail)

**CCTV (SURV-01).** Source: `man_made=surveillance` **nodes** in the Geofabrik Victoria PBF. Overpass count on 2026-11-06 for the Greater Melbourne bbox: **616 nodes** (sparse: mapped cameras are a small subset of real ones, hence the mandatory caveat). The per-150 m CBD probe did not return a usable result (see Open Questions). Tags to keep: `surveillance` (public/outdoor/indoor), `surveillance:type` (camera, ALPR), `camera:type` (fixed/dome/panning), `camera:direction` or `direction`, `operator`, `name`. **Exclude `surveillance:type=guard`** (that tag means a human guard, i.e. a person, which the project privacy rule forbids). Omit `operator` when `operator:type` is `private`/`individual` or otherwise looks personal (privacy; planner decision with David, see Open Questions). Direction: convert degrees/compass abbreviations to words (`north-east`) in the job; never ship degrees (UI-SPEC). Licence: ODbL; keep `Source: OpenStreetMap` on cards and the attribution control.

**Speed / red-light (SURV-02).** Findings:
- Official dataset "Road Safety Camera Network - Fixed Camera Locations" (CC BY 4.0, data.vic.gov.au metadata modified 2026-03-27) points to `fixed-camera-locations-january-2023.xlsx`: 287 rows, **two columns only: Suburb and free-text Location** (e.g. "Hoddle Street at the intersection of Hoddle Street and Victoria Street, Abbotsford"), **no latitude/longitude and no speed-vs-red-light type** [VERIFIED: downloaded and parsed the XLSX 2026-11-07]. Geocoding intersection phrases via Nominatim (1 req/s, intersections poorly supported) would give approximate, unverifiable points. Not recommended as the primary source.
- OSM: Victorian cameras are mapped as **relations** `type=enforcement` (175 in the Greater Melbourne bbox, 2026-11-06) with `device` member nodes tagged `highway=speed_camera` (sample: `Hume Freeway Epping Northbound Point-to-Point/Instantaneous Speed Camera`, `maxspeed=100`); relation tag `enforcement=maxspeed | traffic_signals | average_speed` gives the type. Only 4 nodes carry `enforcement=traffic_signals` and 1 `enforcement=maxspeed` directly. A node-only filter would therefore miss most. [VERIFIED: Overpass count queries; node-level `highway=speed_camera` count did not return (502) so total device nodes is unknown]
- Job design (pyosmium, two passes over the PBF): pass 1 collect `type=enforcement` relations → `{device node id: enforcement}`; pass 2 emit nodes that are `highway=speed_camera` OR in that map (type from relation, else from node `enforcement`, else `speed`), and `man_made=surveillance` nodes (CCTV filter above); optionally a way pass to attach the nearest named `highway=*` way name through shared node ids (cameras are usually vertices on the carriageway) for the card's road line; suburb comes from `addr:suburb` if present, otherwise omitted. Missing optional rows are omitted, never "unknown" (UI-SPEC). Output `cameras.json`: `[{id,k,lat,lon,…}]` ≈ a few thousand rows.
- Coverage honesty: OSM has ~175 enforcement relations vs the official 287 locations, so the speed-card source/caveat must stay "mapped, not exhaustive" too. **UI-SPEC amendment needed:** speed card source line `Source: OpenStreetMap` (not "Victorian road safety camera list"); consider the same caveat text as CCTV plus "Static info only." Keep the official list as a cross-check/later enrichment only.
- No geocoding is needed this phase.
- Verify the pyosmium API against docs.osmcode.org/pyosmium before coding (`osmium.FileProcessor`, `with_filter`, relation `members` iteration); the snippet shapes in this document are sketches. [ASSUMED]
- Refresh cadence: weekly timer (Geofabrik PBF is daily; weekly is plenty). `ProtectSystem=strict` service units for the job need `ReadWritePaths=/var/lib/shinigami` (the `StateDirectory`) and network. Download with a descriptive User-Agent that contains no email address (project rule) to a temp file under `/var/lib/shinigami/tmp`, process, delete.

## Phone-Side Offline Cache (D-15)

- SW `registerRoute(({url}) => url.pathname.startsWith("/tiles/"), new CacheFirst({cacheName:"tiles-v1", plugins:[new CacheableResponsePlugin({statuses:[200]}), new ExpirationPlugin({maxEntries: 2500, maxAgeSeconds: 60*24*3600, purgeOnQuotaError:true})]}))`. Same for `/glyphs/` (separate cache, no expiry needed). Keep the existing `NavigationRoute` `denylist` and add `/tiles/` and `/glyphs/`.
- Entry budget: an urban z15 tile is plausibly 20–100 KB gzip; 2500 entries ≈ 50–250 MB. [ASSUMED] tune after measuring real tiles. iOS home-screen PWAs get a generous but not infinite quota; `purgeOnQuotaError` prevents a hard failure. [ASSUMED]
- Offline behaviour: SW miss + no network → fetch rejects → MapLibre fires `error` for that tile (swallowed) → no geometry drawn → CSS grid shows through. Precache `glyphs/*/0-255.pbf` (and the punctuation range) so street labels survive a first-ever-offline open.
- A server 204 (outside extract) is deliberately not cached by the SW (status filter); the server sends a 1-day cache header on it so the browser HTTP cache absorbs repeats.
- Old-version tiles die through LRU eviction when the `?v=` build changes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PMTiles directory parsing | Own varint/dir reader | `pmtiles` (PyPI) `Reader` | Spec edge cases (run-length entries, leaf dirs, Hilbert ids) |
| OSM PBF parsing | Own protobuf decoder | `osmium` (pyosmium) | Format complexity; tested C++ |
| Tile extraction | Own tile slicer | `pmtiles extract` | Range-optimised remote extraction |
| SDF glyph PBFs | Own glyph rasteriser | maplibre.org/font-maker (WASM) output, committed | Correct SDF encoding |
| Offline cache expiry | Own LRU in IndexedDB | `workbox-expiration` | Quota handling, tested |
| Map gestures, projection, picking | Own raycasting | `map.project/unproject`, `queryRenderedFeatures`, feature-state | Handles pitch, overzoom |
| Haversine | — | existing `geo.haversine_m` | Already tested in Phase 1 |

**Hand-rolling is acceptable here (small and specific):** style builder, tag rank/collision, card placement, drawer snap, long-press state machine, accuracy-ring radius clamp, hero timeline. No UI framework or bottom-sheet library (all React-oriented).

## Runtime State Inventory

Not a rename/refactor phase; omitted.

## Common Pitfalls

### Pitfall 1: Schema mismatch (OpenMapTiles vs Protomaps)
**What goes wrong:** Copying `render_height`, `building` source-layer or OpenFreeMap style snippets gives a flat blank map.
**Why:** CLAUDE.md research targeted OpenFreeMap; Phase 2 CONTEXT chose Protomaps (D-08).
**How to avoid:** Use only the Protomaps names listed above; a unit test asserts the source-layer allowlist.
**Warning signs:** Map shows land only; no console error (silent).

### Pitfall 2: Merged buildings and building ids below z15
**What goes wrong:** Extrusions at z14 are merged blobs with 5 m-quantised heights and no stable ids; tapping selects a block.
**How to avoid:** Extrusion `minzoom: 15`; initial camera zoom 17 is fine; set `minZoom` for selection logic.

### Pitfall 3: Layer-wide extrusion paint props
**What goes wrong:** Implementing UI-SPEC literally (per-feature opacity/gradient) is impossible.
**How to avoid:** Pattern 6; amend the UI-SPEC wording.

### Pitfall 4: Camera items leak into the drawer
**What goes wrong:** `selectVisible` accepts `target_ts === null` rows; cameras show up as drawer rows.
**How to avoid:** Filter positioned items in `model.ts` and test it (D-14).

### Pitfall 5: Preset-pin coordinate leak via camera layer
**What goes wrong:** Client learns camera positions and distances around a server-held place and triangulates it.
**How to avoid:** No camera layers for `place=` sources (or opt-in per place). Also never emit `distance_m` for pin sources.

### Pitfall 6: OSM enforcement relations missed
**What goes wrong:** Node-only filtering yields almost no speed/red-light cameras.
**How to avoid:** Relation member join (see pipeline); a fixture test with a tiny `.osm` XML containing a relation + device nodes.

### Pitfall 7: Hero jank from main-thread work
**What goes wrong:** `new Map()`, style parse and worker startup block the main thread; main-thread animations stutter or skip frames.
**How to avoid:** Compositor-only hero properties, start map two frames after hero paint, dynamic import.

### Pitfall 8: iOS WebGL lifecycle
**What goes wrong:** Backgrounding can drop the GL context or stop tile loading (fixed in 6.15/6.16 changelog entries: iOS worker shutdown, Safari 26.6 regression).
**How to avoid:** Pin `maplibre-gl@6.16.0` (not older 6.x), handle `webglcontextlost/restored` by repaint, call `map.resize()` + `triggerRepaint()` on `visibilitychange` visible; device UAT item.

### Pitfall 9: CSP regressions from DOM code
**What goes wrong:** `setAttribute("style", …)`/`innerHTML` with `style=` are blocked silently; fonts or images from `blob:` blocked.
**How to avoid:** Lint rule/test: grep source for `setAttribute("style"` and `style=` in templates; keep `test_health` CSP assertions; do not add `blob:` to `worker-src`.

### Pitfall 10: Stale-location hybrid profile (WR-04) now shows wrong cameras
**What goes wrong:** Old location's camera layer merged with the new location's other layers; tags appear in the wrong place.
**How to avoid:** Fix WR-04 (tag profile with its params key; ignore frames/layers from another key) before cameras ship. Also fix WR-07 (drawer empty/loading states) and WR-08 (GPS timeout ≠ "off") because the map, marker and "locating" state depend on them; WR-03 (HTTP error ≠ OFF-GRID) is recommended; WR-02 and WR-05 do not touch Phase 2.

### Pitfall 11: Tiny LXC
**What goes wrong:** 8 GB disk / 1.5 GB RAM fill with node_modules, PBF temp and extract.
**How to avoid:** Resize disk; process the PBF streaming; delete temps; run jobs outside deploys.

### Pitfall 12: Tile format drift
**What goes wrong:** A future daily build switching tile type/compression (MLT, zstd) breaks the Python reader silently.
**How to avoid:** Startup assertion + `/api/health` field `tiles: ok|missing|unsupported`.

## Code Examples

### Extract command (dry run first)
```bash
# Source: docs.protomaps.com/pmtiles/cli (flags verified from docs)
pmtiles extract https://build.protomaps.com/20261106.pmtiles /var/lib/shinigami/tiles/gm.tmp \
  --bbox=144.2,-38.55,145.75,-37.45 --dry-run
```

### Tag budget (pure, unit-testable sketch)
```ts
type Cand = { id: string; x: number; y: number; dist: number };
export function rank(c: Cand[]): Cand[] {                 // within 30 m first, then nearest
  return [...c].sort((a, b) => (a.dist <= 30 ? 0 : 1) - (b.dist <= 30 ? 0 : 1) || a.dist - b.dist);
}
export function assignFull(ranked: Cand[], max = 20, w = 176, h = 32): Set<string> {
  const full = new Set<string>(); const boxes: Cand[] = [];
  for (const c of ranked) {
    if (full.size >= max) break;
    if (boxes.some(b => Math.abs(b.x - c.x) < w && Math.abs(b.y - c.y) < h)) continue; // demote to compact
    full.add(c.id); boxes.push(c);
  }
  return full;
}
```

### Test: tiny PMTiles generated in pytest (no binary fixture)
```python
# Source: pmtiles 3.8.1 package ships writer.py (Writer.write_tile / finalize); exact signatures to confirm when coding
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MapLibre UMD + `maplibre-gl-csp.js` + `blob:` worker | ESM-only, real-URL worker, `setWorkerUrl()` under bundlers | 6.0.0 | CSP stays `worker-src 'self'` |
| `antialias` map option | `canvasContextAttributes` | v5+ | Default antialias already false |
| WebGL1 fallback | WebGL2 required | 6.0.0 | Constructor throws `GPUInitializationError` |
| `import maplibregl from` default | named/namespace import | 6.0.0 | Update snippets |
| Protomaps v3 schema/sprites | v4 builds; `@protomaps/basemaps` 5.x flavors | 2025 | Use v4 layer names |
| MapLibre touch contextmenu absent | `contextmenu` on touch long-press | 6.11.0 | Available but not used |

**Deprecated/outdated:** CLAUDE.md claims `protomaps-themes-base` replaced by `@protomaps/basemaps` (true) and that vite-plugin-pwa Vite-8 support was "LOW-MEDIUM": now resolved, peer range includes `^8.0.0` and 2.0.0 is already installed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Greater Melbourne extract size 300–900 MB | Pattern 2 | Disk plan; verify with `--dry-run` |
| A2 | Protomaps `roads` features carry `name` | Pattern 3 | No street labels; fall back to no labels |
| A3 | Protomaps building tiles carry numeric feature ids in the daily build | Pattern 6 | Selection needs GeoJSON fallback |
| A4 | MapLibre default projection is mercator without an explicit setting | Pattern 3 | We set it explicitly anyway |
| A5 | MapLibre treats a 204 tile response as an empty tile | Pattern 1 | Else log noise/errors for out-of-extract tiles (swallowed) |
| A6 | Relative `tiles`/`glyphs` URLs not relied on (absolute built from origin) | Pattern 3 | None (we avoid the question) |
| A7 | pyosmium API shapes (FileProcessor, filters, relation members) | Camera pipeline | Rework of the job script |
| A8 | Phone SW cache budget 2500 entries ≈ 50–250 MB and iOS quota acceptable | Offline cache | Cache purged sooner; tune |
| A9 | Attribution placement acceptable under ODbL | Pattern 3 | Add a visible credit line |
| A10 | `building_part` double extrusion problem in CBD | Pattern 3 | Visual artefact only |
| A11 | Playwright headless WebGL (SwiftShader) can render MapLibre for the network assertion | Validation | Fall back to static checks + device test |
| A12 | Suggested bbox covers what David calls Greater Melbourne | Pattern 2 | Adjust bbox |
| A13 | All npm/PyPI packages legitimate (slopcheck not run) | Audit | Human-verify checkpoint gates installs |
| A14 | Excluding private-operator names and `guard` tags is the right privacy default | Camera pipeline | Needs David's confirmation |

## Open Questions

1. **Preset places and the map (CR-02 vs HUD-04).**
   - Known: presets resolve to server-held coordinates the client must never learn; the map needs a centre; camera positions near a preset would reveal it.
   - Unclear: what the map shows for `place=` pins.
   - Recommendation (default): map centres on the 0.1° cell centre at low zoom with no camera layers; count readout reads `Cameras · not shown for saved places`. Optional per-place `public = true` flag in `places.toml` (opt-in, default off) turns a preset into a client-known pin (like search). Needs David's yes/no because it adds a setting.
2. **Speed/red-light card source copy.** UI-SPEC says "Victorian road safety camera list"; data will be OSM. Recommend amending to `Source: OpenStreetMap` and adding "Mapped, not exhaustive." Needs ui-phase amendment.
3. **Building card name.** Protomaps buildings have no `name`; D-18 "name if present" will never trigger. Title is always `BUILDING`. Accept.
4. **Extrusion opacity/gradient** (layer-wide). Accept colour-only highlight, opacity 1. Needs UI-SPEC wording change.
5. **Camera operator privacy rule.** Recommend omitting `operator` for private/individual tags and excluding `surveillance:type=guard`. Confirm with David.
6. **CBD CCTV count probe** (150 m around -37.8136,144.9631) did not return a usable result (the Overpass call was cut off); real counts per radius should be measured from the PBF in Wave 0.
7. **Dev/prod data parity.** Dev PC (Windows) can run go-pmtiles (Windows build exists) and pyosmium; a small CBD extract (~2–5 MB) as a gitignored dev tile file avoids needing the 139 GB source.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | web build/tests | ✓ (dev PC) | v24.15.0 | — |
| Python | server/tests | ✓ (dev PC) | 3.12.10 | — |
| uv | server env | ✓ | present (`~/.local/bin/uv`) | pip |
| go-pmtiles CLI | tile extract | ✗ on dev PC and (unverified) LXC | release v1.31.2 exists for Linux/Windows | download pinned release in deploy script |
| osmium-tool | alt PBF filtering | ✗ | — | pyosmium (primary) |
| pyosmium wheels on LXC (Debian, py3.12/3.13) | camera job | not probed | — | `apt install osmium-tool` + OPL parse |
| Overpass public API | spot counts only | ✓ but flaky (502 seen) | 0.7.62.11 | not used in production |
| Geofabrik / build.protomaps.com | data jobs | ✓ (HEAD 200) | — | — |
| Proxmox LXC disk/RAM | files + jobs | default 8 GB / 1.5 GB | — | `pct resize` +8 GB |
| Real iPhone | perf/offline UAT | external | — | none (device-only) |

**Missing with no fallback:** none. **Missing with fallback:** go-pmtiles, osmium (install in deploy scripts). I attempted to download/run go-pmtiles for a `--dry-run` size probe and install slopcheck, both blocked by the sandbox; those two checks remain open for the executor.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (+pytest-asyncio, respx) server; vitest 5.1 + happy-dom 21 web |
| Config file | `pyproject.toml` `[tool.pytest.ini_options]`; `web/package.json` (vitest) |
| Quick run command | `uv run pytest -x -q` ; `npm --prefix web test -- --run` |
| Full suite command | both above + `bash deploy/verify.sh --local` on the LXC |

happy-dom has no WebGL, so MapLibre cannot run in unit tests; keep map glue thin and `vi.mock("maplibre-gl")`.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HUD-03 | Hero ≤1500 ms hard cap, skip on tap, not on resume, reduced-motion path | unit (fake timers) | `npm --prefix web test -- --run hero` | ❌ Wave 0 |
| HUD-03 | First paint not blocked by hung IDB (WR-06) | unit (never-resolving IDB mock) | `npm --prefix web test -- --run app` | ❌ Wave 0 |
| HUD-04 | `buildStyle` produces valid style, correct source-layers, extrusion minzoom 15, only same-origin URLs | unit | `npm --prefix web test -- --run style` | ❌ Wave 0 |
| HUD-04 | 3D look, pitch 60, 30+ fps | device-only | UAT-DEVICE.md | manual |
| HUD-05 | Tag rank/budget(≤20 full, ≤60 total)/collision demotion/near-state 30 m, red cap 3 | unit (pure) | `npm --prefix web test -- --run tags` | ❌ Wave 0 |
| HUD-05 | Card placement flip/shift, leader endpoints | unit (pure) | `npm --prefix web test -- --run card` | ❌ Wave 0 |
| HUD-05 | Long-press state machine (500 ms, 10 px cancel, 2nd finger cancel) | unit | `npm --prefix web test -- --run longpress` | ❌ Wave 0 |
| HUD-05 | Drawer snap math, flick threshold | unit | `npm --prefix web test -- --run drawer` | ❌ Wave 0 |
| HUD-10 | CSP unchanged, no `blob:`/third-party host | pytest | `uv run pytest server/tests/test_health.py` | ✅ extend |
| HUD-10 | Style/glyph/tile URLs same-origin; built `dist` contains no external hosts except attribution `<a href>` | script (grep) in verify.sh + vitest | `bash deploy/verify.sh --local` | ❌ Wave 0 |
| HUD-10 | Runtime: zero third-party requests in a page load | Playwright network assertion (optional) or device Safari Web Inspector | `npx playwright test no-third-party` | ❌ optional |
| HUD-10 | `/tiles` 200 gzip, 204 outside extract, immutable headers, header assertion MVT+GZIP | pytest with a tiny generated PMTiles | `uv run pytest server/tests/test_tiles.py` | ❌ Wave 0 |
| HUD-10 | Tile endpoint latency p95 | pytest timing proxy / verify.sh p95 on `/tiles/…` | `bash deploy/verify.sh --local` | ❌ Wave 0 |
| SURV-01 | Radius filter 150 m, count uncapped, zero copy source, `pending` when file missing | pytest | `uv run pytest server/tests/test_cameras.py` | ❌ Wave 0 |
| SURV-01 | Job: guard excluded, direction words, operator privacy rule, relation join | pytest on a small `.osm` XML fixture | `uv run --group data pytest server/tests/test_refresh_cameras.py` | ❌ Wave 0 |
| SURV-02 | 1 km road cameras typed speed/redlight from relation tags; no alert phrasing in payload | pytest | same | ❌ Wave 0 |
| D-14 | Camera items never appear in drawer rows | unit | `npm --prefix web test -- --run model` | ✅ extend |
| Privacy | `place=` profile has no camera items/distances; no coordinate fields | pytest | `uv run pytest server/tests/test_profile_readonly.py` | ✅ extend |
| D-15 | SW route config (CacheFirst + 200-only + expiry) | unit on route module | `npm --prefix web test -- --run sw` | ❌ Wave 0 |
| D-15 | Offline draws cached tiles, grid elsewhere | device-only | UAT-DEVICE.md | manual |
| Perf proxy | Main bundle gz size and map chunk lazy | script in verify/CI | `node scripts/check-bundle.mjs` (new) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest -x -q` and `npm --prefix web test -- --run` (both < 30 s).
- **Per wave merge:** full suite + `npm --prefix web run build` (includes `tsc --noEmit`) + `verify.sh --local` after deploy.
- **Phase gate:** full suite green plus device UAT checklist (hero timing on a cold open, 30+ fps with tags capped, offline tile cache, long-press pin, drawer gestures, no third-party requests in Web Inspector Network tab).

### Wave 0 Gaps
- [ ] `server/tests/test_tiles.py` (generate a tiny PMTiles with the package writer in the test)
- [ ] `server/tests/test_cameras.py`, `test_refresh_cameras.py` (+ `server/tests/fixtures/enforcement.osm`)
- [ ] `web/src/map/*.test.ts`, `ui/hero.test.ts`, `ui/drawer.test.ts`, `sw` route test, `model.test.ts` extension
- [ ] verify.sh additions: `/tiles` probe, glyph 0-255 probe, no-external-hosts grep, CSP has no `blob:`
- [ ] Spike: real extract dry-run size + feature-id check + `building_part` check
- [ ] Dev dependency install: maplibre-gl, workbox-strategies/expiration/cacheable-response (human-verify first)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Tailnet-only access (unchanged) |
| V3 Session Management | no | No sessions |
| V4 Access Control | yes | Tailscale ACLs; `/tiles` and data files are read-only to the service; no new write endpoints |
| V5 Input Validation | yes | FastAPI path ints with range constraints (`z` 0–15, `x,y` < 2^z), reject out-of-range with 404/204; existing query validation for dropped-pin lat/lon/label |
| V6 Cryptography | no | TLS by `tailscale serve`; no new crypto |
| V12/V14 Files & config | yes | Atomic file replace; no path built from user input; sandbox `ReadWritePaths` limited to `/var/lib/shinigami`; checksum-pinned go-pmtiles binary |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Preset-place coordinates inferred from camera positions/distances | Information disclosure | No camera layers or `distance_m` for `place=` sources; contract test |
| Query logging of tile coordinates (movement history) | Information disclosure | Keep `--no-access-log` (tile URLs encode location); do not add request logging for `/tiles` |
| Tile/glyph path traversal | Tampering | Integer-typed path params only; glyph files served via `StaticFiles` from `web/dist` |
| Third-party request leaking location | Information disclosure | Same-origin style, CSP `connect-src/img-src/font-src 'self'`, verify.sh host grep, Web Inspector UAT |
| Malicious/oversized PBF or pmtiles on refresh | Tampering / DoS | HTTPS to fixed hosts only, size cap, temp file then atomic rename, run as unprivileged user with sandboxed unit |
| Root executing artifacts in a service-writable dir (CR-01 class) | Elevation | Job scripts and units are root-owned in `/opt`; the job writes only data under `/var/lib/shinigami`; root never executes anything from there |
| Showing people-adjacent data (guards, private operator names) | Privacy | Exclude `surveillance:type=guard`; omit private operator names |

## Sources

### Primary (HIGH confidence)
- maplibre-gl 6.16.0 package (npm pack, d.ts, dist listing) and `CHANGELOG.md` / v5→v6 migration guide (raw GitHub, fetched 2026-11-07): ESM-only, `worker-src` guidance, `setWorkerUrl`, iOS fixes, touch contextmenu, WebGL2.
- https://maplibre.org/maplibre-gl-js/docs/ (bundlers section): Vite `?worker&url` snippet.
- `@maplibre/maplibre-gl-style-spec` 26.5.1 `v8.json`: extrusion property data-driven/feature-state support.
- https://docs.protomaps.com/pmtiles/cli , /basemaps/downloads , /basemaps/layers , /pmtiles/maplibre , /basemaps/maplibre
- Protomaps `Buildings.java` (raw GitHub): building attributes, ids, zoom handling; `base_layers.ts` (font/sprite names).
- go-pmtiles releases (GitHub API): v1.31.2; `build.protomaps.com/20261106.pmtiles` HEAD (139,353,480,483 bytes).
- pmtiles 3.8.1 wheel source (reader.py, tile.py).
- Geofabrik Victoria PBF HEAD (243,583,462 bytes).
- data.vic.gov.au CKAN `package_show` + the downloaded XLSX (columns Suburb, Location; 287 rows).
- Overpass count queries 2026-11-06/07 (surveillance 616 nodes; enforcement relations 175; sample device nodes).
- npm registry / PyPI JSON (versions, dates, repos, downloads).

### Secondary (MEDIUM confidence)
- github.com/protomaps/basemaps-assets, maplibre/font-maker, stadiamaps/sdf_font_tools pages (glyph tooling).
- Web search: Berlin extract size example, Protomaps build URL pattern.

### Tertiary (LOW confidence)
- Size and quota estimates (A1, A8), Playwright WebGL headless viability (A11).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH for versions and MapLibre 6 facts; MEDIUM for Protomaps tile contents until a real extract is inspected.
- Architecture: MEDIUM-HIGH (server-side tiles, computed camera provider follow established project patterns).
- Camera data: MEDIUM (official dataset verified coordinate-less; OSM relation structure verified by sample; counts partial).
- Pitfalls: HIGH for MapLibre/CSP/model.ts items (verified in source); MEDIUM for iOS-specific behaviours (device UAT).

**Research date:** 2026-11-07
**Valid until:** ~2026-12-07 (maplibre-gl releases roughly fortnightly; Protomaps builds daily)
