<!-- GSD:project-start source:PROJECT.md -->
## Project

**Shinigami Eyes**

A private, Watch Dogs-style profiler of David's surroundings: a full-screen iPhone home-screen web app (PWA) backed by his Proxmox home lab, reachable only over Tailscale. Open it anywhere in Melbourne and the eyes "activate" — a live profile of the street, the room, the sky, the airwaves and David himself, so he is always one step ahead (Light Yagami energy). It profiles places, infrastructure and David's own life — never other people.

**Design rule:** like Death Note's Shinigami eyes, everything shown gets a **name and a countdown** (Tram: arrives in 3:12 · Golden hour: ends in 18 min · Gym streak: dies at midnight).

**Core Value:** **An instant, glanceable HUD:** open the app and a cached profile of where you are is on screen in under a second, every item named with a ticking countdown — live data fills in after. If everything else fails, this must work.

### Constraints

- **Hosting**: Backend on David's Proxmox only; phone reaches it only over Tailscale — privacy and control
- **Privacy/Legal**: Published or broadcast-to-everyone data only; nothing that identifies or tracks other people — Victoria's Surveillance Devices Act
- **Radio**: Receive-only, unencrypted signals only; nothing rebroadcast — legal
- **Performance**: Cached data on screen in < 1 s, live data fills in after — "never the slow path"
- **Tech stack**: Python + FastAPI backend; iOS PWA frontend with MapLibre 3D map — chosen for data/radio tooling fit
- **Platform**: iOS Safari PWA limits (no background location) — use iOS Shortcuts automations as triggers
- **Dependencies**: API keys not yet applied for — Vic GTFS-Realtime (KeyID), PTV Timetable v3, EPA Victoria, aisstream.io, OpenElectricity (waitlisted); build adapters against recorded fixtures until keys arrive. VicEmergency public feeds work today but have no SLA
- **Tiles**: self-hosted Protomaps PMTiles (Melbourne extract) in production so location never leaks to a tile CDN; OpenFreeMap only for early dev
- **Timeline**: Solo, summer holidays 2026–27; each phase must be usable on its own
- **Resources**: Proxmox 32 GB RAM shared with SPENCER, LifeOS and other VMs
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Guiding Decisions (opinionated)
## Recommended Stack
### Backend Core
| Technology | Version (npm/PyPI verified 2026-11-05) | Purpose | Why |
|------------|---------|---------|-----|
| Python | 3.12 or 3.13 | Runtime | Wheels exist for everything below; avoid bleeding-edge 3.14 until shapely/pyproj/protobuf wheels confirmed (LOW) |
| FastAPI | 0.162.0 | HTTP API | Mandated; async, pydantic v2 |
| Uvicorn | 0.54.0 | ASGI server | Single worker (`--workers 1`) so in-process cache and schedulers are shared; do NOT use multiple workers |
| Pydantic | 2.14.2 | Models/validation | Typed per-layer payloads |
| httpx | 0.28.1 | Async upstream client | HTTP/2, timeouts, shared AsyncClient with per-host limits |
| orjson | 3.13.0 | Fast JSON | Use `ORJSONResponse`; profile payloads are large |
| APScheduler | 3.11.3 (use `AsyncIOScheduler`) | Background fetchers | Runs inside the FastAPI lifespan; interval jobs per layer. Do NOT adopt the 4.x alpha line. Celery/ARQ/RQ are overkill without Redis |
| gtfs-realtime-bindings | 3.0.0 | Parse GTFS-R protobuf | Official Google package; `FeedMessage.ParseFromString` |
| Shapely | 2.2.0 | STRtree spatial index | Fast radius/nearest queries; vectorised |
| pyproj | 3.8.0 | Metric distance (EPSG:7855 MGA55) | Use for the 150 m buffer rather than degrees; or use haversine for simple cases |
| aiosqlite / stdlib sqlite3 | stdlib | Persistent cache + static datasets | WAL mode. One file, trivially backed up |
| websockets | latest 15.x (verify at install) | aisstream.io client | Long-lived server-side socket (browser connections forbidden by AISStream) |
### Frontend / PWA
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vite | 8.3.5 | Build | Standard; verify plugin compatibility at scaffold time |
| TypeScript + vanilla DOM | - | UI | See decision 4 |
| maplibre-gl | 6.16.0 | Map, 3D buildings, pitch | `fill-extrusion` layer; pitch up to 85; `fill-extrusion-rounded-corner-distance` available. Version jump from 4/5 is large: read the 6.x changelog before copying older snippets (MEDIUM) |
| vite-plugin-pwa | 2.0.0 | Manifest + service worker (Workbox) | Offline shell + last profile caching. Confirm Vite 8 peer support at install (LOW-MEDIUM; fall back to a hand-written 40-line service worker) |
| pmtiles | 4.5.0 | PMTiles protocol for MapLibre | Only if self-hosting tiles (phase 2+) |
| @protomaps/basemaps (replaces protomaps-themes-base 4.5.0) | check | Prebuilt style layers | Only with PMTiles; the old package still resolves at 4.5.0 |
| IndexedDB (idb-keyval) | latest | Last profile on device | Show instantly on open before network returns |
### Map tiles and styling
| Choice | Role | Why |
|--------|------|-----|
| **OpenFreeMap** `https://tiles.openfreemap.org/planet` (TileJSON 3.0, verified live, versioned build 20261101) | Primary vector source, v1 | Free, no key, no registration, OpenMapTiles schema, `building` layer with `render_height` / `render_min_height` for extrusions. Fetched directly by the phone (needs normal internet, not Tailscale) |
| Own dark style JSON (hand-authored) | Look | Start from the OpenFreeMap `dark` style (`/styles/dark` returns 200) or Liberty, then replace colours: land #05070d, water #0a1424, roads desaturated blue, buildings `fill-extrusion` blue-grey with hover/selected red via `feature-state`. Do not use a stock theme unmodified: the NetHack look comes from the restyle |
| Protomaps PMTiles (self-hosted, ~Melbourne extract) | Phase-2 fallback | Single static file served by the backend with HTTP range requests; removes third-party dependency and enables offline. Extract with the `pmtiles extract` CLI against the Protomaps daily build, bbox for Victoria. Do this only if OpenFreeMap reliability bites |
| MapTiler/Stadia/Mapbox | Not used | Keys, quotas, terms for no benefit |
### HUD / glitch UI (all small, hand-rolled preferred)
| Library | Purpose | Verdict |
|---------|---------|---------|
| CSS only (`clip-path` slices, `mix-blend-mode`, `@keyframes`, text-shadow RGB split, scanline `repeating-linear-gradient`) | Glitch effects | **Recommended.** Zero deps, GPU cheap on iPhone. Respect `prefers-reduced-motion` |
| Pixel font: "Press Start 2P" or "VT323" / "Silkscreen" (self-hosted woff2, never Google CDN at runtime; SW-cached) | Title bar, labels | Recommended |
| GSAP (free for all use since the Webflow acquisition) | Hero activation sequence timeline | Optional; only for the eyes reveal |
| three.js / R3F / Pixi shaders | WebGL glitch | NOT recommended: second GL context beside MapLibre kills iPhone perf and battery |
| Pre-built "cyberpunk" CSS kits (Cyberpunk-CSS, nes.css) | - | Skip: opinionated, will fight the red/blue palette |
### Deployment (Proxmox)
| Technology | Choice | Why |
|------------|--------|-----|
| Unprivileged **LXC** (Debian 12/13) with Docker nested (`nesting=1,keyctl=1`) OR plain LXC + `uv` + systemd | LXC | ~100 MB RAM overhead vs a VM's GBs on a shared 32 GB host. A VM only if you will later need USB passthrough for RTL-SDR (USB passthrough to LXC is possible but fiddly; decide in the hardware milestone, and the SDR can live in its own VM/container anyway) |
| Docker Compose: `api` + `tailscale` (optional sidecar) | Packaging | Reproducible; one `compose.yml`, volume for SQLite + static datasets. Prefer **systemd + uv venv** if you want the fewest moving parts (MEDIUM) |
| uv | Python env/lockfile | Fast, reproducible |
| Backups | Proxmox vzdump of the LXC | Config + SQLite covered |
- Install Tailscale on the LXC (needs `/dev/net/tun` passthrough in the LXC config) or on the Proxmox host and `tailscale serve` to the container, or use the sidecar container with `TS_SERVE_CONFIG`.
- Run `tailscale serve --bg --https=443 http://127.0.0.1:8000` -> `https://<host>.<tailnet>.ts.net`. Requires MagicDNS + "HTTPS Certificates" enabled in the admin console. Certs are real Let's Encrypt certs, so iOS Safari trusts them with no profile install. This is mandatory: geolocation, service workers and Add-to-Home-Screen all require a secure context.
- **Never `tailscale funnel`** (public). Keep ACLs so only the phone can reach tcp:443.
- Known risk: a reported iPhone SSL error on `*.ts.net` Serve endpoints (tailscale/tailscale#19147, unresolved in what I could see) and first-request cert-issuance delay. Spike this in phase 1 on the real phone before building anything else. (MEDIUM)
- Map tiles load from OpenFreeMap over the open internet, which works with Tailscale split-DNS unless an exit node is forced.
- Serve the built PWA static files from FastAPI itself (`StaticFiles`) so there is one origin: no CORS, one cert.
## Caching design (concrete)
- `cache[layer_key] = (payload, fetched_at, ttl, source_status)` in-process; write-through to SQLite table `layer_cache`.
- Profile endpoint: compute geohash/tile of the request, merge layers from cache, return in one orjson response with per-layer `fetched_at`, `stale: bool`, absolute `expires_at` (for countdowns). A second `/stream` SSE or WebSocket pushes live refreshes after first paint.
- Global-feed layers (GTFS-R, OpenSky bbox, AIS, VicEmergency, UV) are fetched on a schedule for Melbourne metro bbox, not per request, which also respects rate limits.
- Static datasets (CCTV via Overpass, cameras, stops, trees, heritage, ACMA sites) are loaded into STRtrees at startup and refreshed nightly/weekly.
## Data Source Verification (probed 2026-11-05)
| Layer | Endpoint | Auth | Rate limit / notes | Format | Status |
|-------|----------|------|--------------------|--------|--------|
| Vic GTFS-Realtime (Metro Train, Tram, Bus; Trip Updates, Vehicle Positions, Service Alerts) | Dataset "GTFS Realtime" on `opendata.transport.vic.gov.au` (portal returns 200); URL paths per mode listed on the dataset page | **KEY**: free API key from the portal, sent as HTTP header `KeyID` | **24 calls / 60 s per mode** (so poll each feed <= every 5 s... practically every 10-30 s). CC BY 4.0. Tram refreshes ~60 s | Protobuf | KEY (apply now; this is separate from the PTV Timetable key; PROJECT.md says GTFS-R first, but it also needs a key, so apply for both on day 1). HIGH on header/limit (official metadata), MEDIUM on exact URL paths: read from dataset page at implementation |
| Vic GTFS Schedule (static stops/routes) | Same portal, "GTFS Schedule" zip (~large, hundreds of MB) | None | Nightly download | CSV in zip | Working (not re-probed). Use only stops.txt/routes.txt/trips.txt/stop_times.txt filtered to Melbourne metro into SQLite; do not load the full zip in memory |
| PTV Timetable API v3 | `https://timetableapi.ptv.vic.gov.au/v3/...` | **KEY**: email `APIKeyRequest@ptv.vic.gov.au`, subject "PTV Timetable API - request for key"; you get `devid` + 128-bit key; every request signed `HMAC-SHA1(path?query&devid=..., key)` appended as `&signature=` | No published limit; be gentle | JSON | KEY. Process documented in a Vic gov doc dated June 2025; not verified that the mailbox is responsive today (MEDIUM). Value-add vs GTFS-R: disruptions, departures by stop with platform, route names. Lead time unknown: apply now |
| Overpass (OSM surveillance `man_made=surveillance`, etc.) | `https://overpass-api.de/api/interpreter` | None; send a descriptive User-Agent | Public server returned **502 "at capacity" today** and 406 without UA; other mirrors I tried timed out | JSON | WORKING-BUT-FLAKY. **Do not query live from the profile path.** Run one bulk query for Greater Melbourne weekly (or download a Geofabrik Victoria extract and filter with `pyosmium`/`osmium-tool`) into SQLite. Backoff + mirror list |
| Victorian fixed road safety cameras | data.vic.gov.au dataset "Road Safety Camera Network - Fixed Camera Locations" (CC BY 4.0, quarterly) | None | Static | XLS/CSV | **Caveat:** a third-party analysis says it has suburb/intersection text but **no lat/lon** (287 locations). Plan to geocode once (Nominatim, cached forever) or cross-reference OSM `highway=speed_camera` / `enforcement=*`. Latest resource I saw was Jan 2023, so staleness risk. MEDIUM-LOW |
| EPA Victoria air quality (AirWatch / Environment Monitoring API) | Developer portal `portal.api.epa.vic.gov.au` (200) | **KEY**: sign up, subscribe to the "Environment Monitoring" product, key in profile | Default 5 req/s; CC BY 4.0. Hourly data | JSON | KEY. Portal confirmed up; product name from a community post (MEDIUM). Cache hourly |
| ARPANSA UV | `https://uvdata.arpansa.gov.au/xml/uvvalues.xml` | None | Updates every few minutes | XML, all cities in one file (`<location id="Melbourne">`, `<index>`, `<utcdatetime>`) | **WORKING** (probed, live today). Undocumented/unofficial-but-public URL: treat as best-effort, 5-min poll. Parse with `xml.etree`. HIGH liveness / MEDIUM stability |
| BOM weather | `https://api.weather.bom.gov.au/v1/locations?search=3000` (200) then `/v1/locations/{geohash6}/observations`, `/forecasts/daily`, `/forecasts/hourly`, `/warnings` | None, but **unofficial, undocumented** | Be gentle, cache >= 5-10 min; send browser-like UA | JSON | WORKING (observations path returned 200). Legal grey zone: BOM terms restrict redistribution; fine for private use. Old `www.bom.gov.au/fwo/*.json` now **301-redirects**; avoid. **Fallback: Open-Meteo** (`api.open-meteo.com`, verified working, no key, free non-commercial) for weather so HUD never goes blank |
| BOM rain radar | Official anonymous FTP `ftp://ftp.bom.gov.au/anon/gen/radar/` (listing works) holds PNG radar frames (IDR023 etc.) + transparency overlays | None | Frames every 5-6 min; fetch server-side, re-project as MapLibre `image` source with the radar's corner coordinates | PNG | WORKING. Alternative tile source: RainViewer (policy has changed repeatedly; verify before use, LOW) |
| CFA fire danger rating | `https://www.cfa.vic.gov.au/ws/fdrfeed` style RSS / `emergency.vic.gov.au` warnings | None | - | RSS/XML | Not probed; verify at implementation (LOW) |
| Pollen / thunderstorm asthma | Melbourne Pollen (AirHealth Pty Ltd / Uni Melbourne); thunderstorm asthma forecast from Vic Health + BOM, surfaced via VicEmergency | none found | Counts only published ~1 Oct to 31 Dec | Web only | **NO OFFICIAL FEED.** No API or developer docs found. v1: either scrape melbournepollen.com.au gently (fragile; check ToS) or fall back to the Open-Meteo Air Quality API pollen fields (grass pollen; Europe-only coverage historically, check Australia, LOW) or show VicEmergency thunderstorm asthma warnings only. It is currently pollen season, so this is visible to the user: decide early |
| City of Melbourne open data | `https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/{id}/records` (Opendatasoft Explore v2.1) | None (anonymous) | Anonymous quota is modest (low thousands/day per IP; use `exports/geojson` for bulk) | JSON/GeoJSON/CSV | WORKING. Verified dataset IDs: `pedestrian-counting-system-past-hour-counts-per-minute`, `pedestrian-counting-system-sensor-locations`, `pedestrian-counting-system-monthly-counts-per-hour`, `trees-with-species-and-dimensions-urban-forest`, `development-activity-monitor`, `parking-zones-linked-to-street-segments`, `on-street-car-parking-sensor-data-2016` (**2016: that ID is archival**; the live "on-street parking bay sensors" dataset has a different ID, find at implementation), `microclimate-sensor-locations`, `bus-stops`. Use `geofilter.distance=lat,lon,metres` for nearby queries |
| Victorian Heritage Database | `https://vhd.heritagecouncil.vic.gov.au` (API root gave **403** to bare curl) | Unknown | - | - | **Unverified.** Likely needs a browser UA or has no public API. Alternatives: Heritage Council data via data.vic.gov.au (Vicmap Heritage / "Victorian Heritage Register" spatial layers, WFS) loaded as static data; plus OSM `heritage=*` tags and Wikipedia. LOW; needs phase-level research |
| Wikipedia geosearch | `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=lat|lon&gsradius=<=10000&format=json` | None; send UA with contact per Wikimedia policy | ~200 req/s polite; cache by 100 m tile for days | JSON | **WORKING** (200 verified). Follow with `prop=extracts&exintro` for blurbs |
| VicEmergency incidents/warnings | `https://emergency.vic.gov.au/public/events-geojson.json` and `https://data.emergency.vic.gov.au/Show?pageId=getIncidentJSON` | None | Poll every 60 s | GeoJSON / JSON | **WORKING today** (both returned live incidents, e.g. DEECA planned burns, CFA grass fires). **This contradicts the PROJECT.md assumption of "no official feed".** These are the public website feeds, not a documented API with an SLA, so keep the "register interest in the official data feed" to-do and treat these as best-effort. HIGH liveness / MEDIUM stability and terms |
| Planes: adsb.lol | `https://api.adsb.lol/v2/point/{lat}/{lon}/{radius_nm}` | None (v2 is open) | No stated limit; be polite | JSON (readsb-style `ac[]`) | **WORKING.** Primary choice: no auth, point+radius query matches the use case. ODbL data |
| Planes: OpenSky | `https://opensky-network.org/api/states/all?lamin&lomin&lamax&lomax` | Anonymous worked in probe; OpenSky has moved to OAuth2 client credentials for registered users with higher limits | Anonymous: very low, daily credit-based | JSON arrays (index-based) | WORKING (anonymous). Use as fallback only |
| Satellites: CelesTrak | `https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json` (also `GROUP=visual`) | None | **Fetch each group at most every few hours;** CelesTrak blocks abusive polling | JSON/OMM or TLE | **WORKING.** Propagate locally with `skyfield` (current 1.x; or `sgp4`) to compute pass times, which is exactly the "countdown" the HUD wants |
| Ships: aisstream.io | `wss://stream.aisstream.io/v0/stream` | **KEY**: free API key from account (GitHub login) | **3 connections per account and per IP; subscription must be sent within 3 s; bounding boxes required (lat,lon corner pairs); direct browser connections prohibited (server-side only);** binary frames of UTF-8 JSON; from Sept 2026 uncompressed connections get bandwidth limits so negotiate permessage-deflate; no SLA, no replay | JSON over WS | KEY, docs verified. Run as one long-lived task in the backend, keep latest position per MMSI in memory for Port Phillip bbox, reconnect with exponential backoff + jitter |
| ACMA RRL (towers/transmitters) | Bulk: "Radiocomms licence data" download page (full daily dataset zip, free). Live API at `api.acma.gov.au/SpectrumLicensingAPIOuterService/OuterService.svc` (per third-party; unconfirmed) | Bulk: none. API: Digital ID authentication (official page) | API returns max 2,000 rows/query | Zip of CSVs (bulk) | **Use the bulk download, not the API**, loaded into SQLite + STRtree weekly. Attribution required: "Based on Australian Communications and Media Authority information". Site coordinates are present in the site table (MEDIUM; check join `site` x `device_details` x `licence`) |
| OpenElectricity (AEMO NEM data) | `https://api.openelectricity.org.au/v4/...` (live: unauthenticated call returns JSON error "Not authenticated", API v4.5.20) | **KEY**: from `platform.openelectricity.org.au`; **signups waitlisted/gradual** per PyPI page | Limits "under review"; community tier is non-commercial; no numeric RPM published | JSON | KEY (possible wait). Python SDK `openelectricity` exists. **Fallback with no key:** AEMO NEM public `https://www.aemo.com.au/aemo/apps/api/report/ELEC_NEM_SUMMARY` (price/demand per region, unverified, LOW) or OpenNEM web JSON. Apply for the key now |
| Melbourne Water storage | `https://www.melbournewater.com.au/water-and-environment/water-management/water-storage-levels` (HTML, 200); `api.melbournewater.com.au` returned 403 | None for the page | Daily-ish updates | HTML (scrape) | **NO OFFICIAL FEED confirmed.** Scrape the storage page (storage % and capacity per reservoir) once a day with `selectolax`/`beautifulsoup4`; flag fragile. Check data.melbourne / data.vic.gov.au for a catchment dataset first (LOW) |
| Broadcastify / KiwiSDR | Links only | - | - | - | v1 = static deep links to Broadcastify CFA/FRV feeds and `kiwisdr.com/public` entries; no integration, no audio proxying (project rule: no rebroadcast) |
| Geocoding (if needed) | Nominatim (1 req/s, UA required) | None | Cache forever | JSON | Only for camera addresses; do not use for per-request lookups |
## Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| skyfield | 1.x (verify) | Satellite/ISS passes, sun/moon, golden hour | Sky layer and "golden hour ends in N min" countdown. `astral` is a lighter alternative for sun only |
| selectolax | latest | HTML scrape | Melbourne Water, optional pollen |
| tenacity | latest | Retry/backoff | Overpass, OpenElectricity |
| pyosmium / osmium-tool | latest | Offline Victoria OSM extract filtering | Preferred to live Overpass for CCTV |
| python-dotenv / pydantic-settings | latest | Secrets | Keys in env on the LXC, never in repo |
| structlog | latest | Logging per layer with freshness | Debugging data staleness |
| pytest, respx | latest | Tests with mocked upstream | Contract tests for each feed parser |
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Cache | In-process + SQLite | Redis 8.1 / Valkey (`valkey` 6.2.0 client) | Extra service; single-user, single-process app. Valkey is the right pick *if* you later add a shared cache (Valkey over Redis for licence reasons) |
| Spatial | Shapely STRtree + SQLite | PostGIS | A whole DB server for ~100k points. Overkill, RAM-hungry beside other VMs |
| Spatial | Shapely STRtree + SQLite | SpatiaLite | Native extension packaging pain on Alpine/Debian images, no real speed gain at this scale |
| Scheduler | APScheduler 3.x in lifespan | Celery / ARQ / Dramatiq | Need broker; no distributed workload |
| Scheduler | APScheduler 3.x | Plain `asyncio.create_task` loops | Acceptable and simpler for <15 layers; APScheduler gives jitter, misfire handling, per-job intervals. Either is fine (MEDIUM) |
| Frontend | Vanilla TS + Vite | React 19 / Svelte 5.57 | One-canvas HUD, solo dev, bundle size on iPhone. Svelte is the fallback if UI state grows |
| Frontend | Vite | Next.js / SvelteKit | SSR irrelevant; PWA static shell is the point |
| Tiles | OpenFreeMap | Protomaps self-host | Self-host is more ops and a ~GB file; keep as upgrade |
| Tiles | OpenFreeMap | MapTiler/Mapbox | Keys and quotas |
| Planes | adsb.lol | OpenSky as primary | OpenSky auth/limits; adsb.lol point queries are simpler |
| Weather | BOM unofficial + Open-Meteo fallback | Paid APIs | Not needed |
| Serving | `tailscale serve` | Caddy + manual certs / Funnel | Serve gives real certs with zero config; Funnel is public (violates constraint) |
| Deploy | LXC | Full VM | VM is heavier; choose VM only if you want USB SDR passthrough in the same guest |
## Installation
# Backend (uv)
# Frontend
# Only if self-hosting tiles later
# Run behind Tailscale
## What NOT to Use
- **Redis/Valkey, PostGIS, Celery in v1:** operational weight with no user-visible benefit.
- **Multiple uvicorn/gunicorn workers:** splits the in-process cache and duplicates schedulers/AIS socket.
- **Calling Overpass, BOM, Wikipedia, or any upstream in the request path:** breaks the <1 s rule; Overpass was returning 502 during research.
- **Tailscale Funnel / any public exposure:** violates the privacy constraint.
- **A second WebGL context (three.js) next to MapLibre on iOS:** memory/battery.
- **Direct browser calls to aisstream.io:** explicitly prohibited by the service; also leaks the key.
- **Old `www.bom.gov.au/fwo/*.json` URLs:** now redirect (301).
- **Google Fonts / CDN assets at runtime:** breaks offline shell; self-host.
## Key Risks for the Roadmap
## Sources
- Registries queried live 2026-11-05: PyPI (fastapi, uvicorn, httpx, gtfs-realtime-bindings, shapely, pyproj, apscheduler, redis, valkey, pydantic, orjson), npm (maplibre-gl, vite, svelte, pmtiles, protomaps-themes-base, vite-plugin-pwa, react). HIGH.
- Live endpoint probes today: OpenFreeMap TileJSON, adsb.lol, OpenSky, CelesTrak, City of Melbourne Opendatasoft v2.1, Wikipedia geosearch, VicEmergency (both feeds), ARPANSA uvvalues.xml, Open-Meteo, BOM api.weather.bom.gov.au, OpenElectricity v4 (auth error), EPA portal, Overpass (502). HIGH for liveness.
- Vic GTFS Realtime dataset metadata (KeyID header, 24 calls/60 s, CC BY 4.0): https://discover.data.vic.gov.au/dataset/gtfs-realtime ; https://data.gov.au/data/dataset/gtfs-realtime (MEDIUM-HIGH)
- PTV Timetable API key process (June 2025 gov doc): https://www.vic.gov.au/sites/default/files/2025-06/PTV-Timetable-API-key-and-signature-document.rtf ; example client https://github.com/r1cc4rdo/PTV_v3/blob/main/ptvv3.py (MEDIUM)
- EPA Victoria developer portal: https://portal.api.epa.vic.gov.au ; https://www.itnews.com.au/news/victoria-unlocks-govt-data-with-api-gateway-523914 (MEDIUM)
- AISStream docs: https://aisstream.io/documentation (HIGH, fetched today)
- OpenElectricity docs: https://docs.openelectricity.org.au/api-reference/data-limits ; https://pypi.org/project/openelectricity/ (MEDIUM)
- ACMA radiocomms licence data: https://www.acma.gov.au/radiocomms-licence-data (MEDIUM)
- Fixed road safety cameras: https://discover.data.vic.gov.au/dataset/road-safety-camera-network-fixed-camera-locations (MEDIUM-LOW on coordinates claim)
- MapLibre 3D buildings example: https://maplibre.org/maplibre-gl-js/docs/examples/3d-buildings/ (MEDIUM)
- Tailscale Serve/HTTPS guidance and iPhone issue: https://github.com/tailscale/tailscale/issues/19147 ; https://docs.openclaw.ai/gateway/stable-https-url (MEDIUM-LOW)
- Melbourne pollen/thunderstorm asthma context: https://www.melbournepollen.com.au/ (no API found)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
