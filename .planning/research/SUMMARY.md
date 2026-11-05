# Project Research Summary

**Project:** Shinigami Eyes (v1 = City mode)
**Domain:** Private, location-driven multi-source geo-aggregation HUD (iOS PWA + FastAPI on Proxmox, Tailscale-only, Melbourne)
**Researched:** 2026-11-05
**Confidence:** MEDIUM (architecture patterns HIGH; upstream feed details MEDIUM; competitor and UX claims LOW-MEDIUM)

## Executive Summary

Shinigami Eyes is a single-user situational-awareness dashboard: a read-only aggregator of ~15 public Melbourne/Victorian feeds, shown as a dark tilted 3D map with a ranked "next thing that matters" strip. Build it as a modular monolith with a strict split between slow work and fast reads: background pollers and importers fetch upstream data into local stores (memory + SQLite); the request path only reads those stores and never calls an upstream. The core value — "cached profile in under 1 s, every item named with a ticking countdown" — rests on two things: a read-only request path, and one normalized `Item` carrying an **absolute `target_ts`** so countdowns tick truthfully from a cached or IndexedDB copy.

Recommended: one FastAPI process with one uvicorn worker, SQLite (R*Tree for static data) + in-memory snapshots, SSE for live fill-in. No Redis, PostGIS, Celery or microservices. Data tiers: polled global snapshots, one streamed AIS socket, static datasets imported by CLI jobs, plus a thin on-demand cell cache. Frontend: vanilla TypeScript + Vite + MapLibre, CSS-only glitch effects, no second WebGL context, served same-origin with the API behind `tailscale serve` HTTPS.

Main risks are unreliable inputs and the iPhone, not the code: several feeds are fragile/unofficial (BOM, VicEmergency, Melbourne Water, pollen, Overpass), some have no clean source (road-camera coordinates, heritage, pollen), several API keys have unknown lead time, and iPhone `*.ts.net` HTTPS / standalone geolocation / MapLibre tilted-3D performance are unproven. Mitigations: apply for keys today; spike phone/Tailscale/map in Phase 1; every feed behind the Provider contract with a fixture and a "layer offline, never all clear" failure mode; enforce tiers and a cut line (Tier 3 layers become link-outs if they cost more than a day).

## Conflicts Between Research Files and Resolutions

| # | Conflict | Resolution |
|---|----------|------------|
| 1 | **VicEmergency.** PROJECT.md said "no official feed"; STACK probed `emergency.vic.gov.au/public/events-geojson.json` and `data.emergency.vic.gov.au/Show?pageId=getIncidentJSON` — both live. | Use the public feeds as best-effort (no SLA): validate schema, show feed age, **never render empty as "all clear"**. Keep "register interest in official feed" to-do. PROJECT.md updated. |
| 2 | **GTFS-R needs a key too** (`KeyID` header, 24 calls/60 s per mode), separate from the PTV Timetable key. | Apply for both today; build transit against recorded protobuf fixtures. PROJECT.md updated. |
| 3 | **Tiles.** STACK: OpenFreeMap. ARCHITECTURE/PITFALLS: self-hosted PMTiles. | Dev against OpenFreeMap behind one style-URL config; **self-hosted Protomaps PMTiles (Melbourne extract, same origin, self-hosted glyphs/sprites/font) is the v1 production default, landing in Phase 2**. OpenFreeMap leaks viewport to a third party and breaks offline. Verify building `height` drives `fill-extrusion`; default levels × 3 m. |
| 4 | **Spatial index.** Shapely STRtree vs SQLite R*Tree. | SQLite R*Tree for static datasets; brute-force numpy/haversine for small snapshots; Shapely/pyproj only for real geometry. |
| 5 | **Scheduler.** APScheduler vs custom runtime. | Custom asyncio Provider Runtime (backoff, circuit breaker, singleflight, presence gating). Skip APScheduler. |
| 6 | **Transit first or later?** | Transit is Phase 3, after skeleton, map slice and importer framework; swap with Phase 4 if keys are late. Phase 1 proves the countdown grammar with no-key providers. |
| 7 | **Satellite passes:** client SGP4 vs server. | Server-side `skyfield` → absolute `target_ts`. |
| 8 | **Weather:** BOM unofficial works but terms restrict scraping. | Open-Meteo primary; BOM unofficial + FTP radar best-effort, private-use only; radar can drop to link-out. |
| 9 | **Overpass flaky** (502 today). | Never query live; weekly Geofabrik Victoria extract via `osmium tags-filter`. |
| 10 | **Hosting.** | Unprivileged LXC, uv venv + systemd, Tailscale with `/dev/net/tun` passthrough (or on host); disable node key expiry. |

## Upstream Keys and Registrations to Do NOW

All free; lead times unknown or waitlisted — submit today, build with fixtures meanwhile.

| Priority | Item | Where | Notes |
|----------|------|-------|-------|
| 1 | **Vic GTFS-Realtime key** (Metro Train, Tram, Bus) | `opendata.transport.vic.gov.au` | Header `KeyID`; 24 calls/60 s per mode. Blocks transit. |
| 2 | **PTV Timetable API v3** devid + key | Email `APIKeyRequest@ptv.vic.gov.au`, subject "PTV Timetable API - request for key" | HMAC-SHA1 signing. Disruptions, departures-by-stop. |
| 3 | **OpenElectricity key** | `platform.openelectricity.org.au` | Waitlisted. Fallback: AEMO NEM summary endpoint (unverified). |
| 4 | **EPA Victoria "Environment Monitoring" product** | `portal.api.epa.vic.gov.au` | Air quality hourly; confirm product name. |
| 5 | **aisstream.io key** | aisstream.io (GitHub login) | Server-side websocket only; 3 connections. |
| 6 | Register interest, official VicEmergency feed | EMV | Not a blocker. |
| Optional | OpenSky OAuth2; City of Melbourne app key | — | Fallback / higher quota only. |

**Day-1 Tailscale admin:** enable MagicDNS + HTTPS certificates, **choose and freeze the final hostname** (renaming orphans the installed PWA), use a non-revealing tailnet name (appears in CT logs), disable node key expiry for the server.

**No key needed:** adsb.lol, CelesTrak, ARPANSA UV, Open-Meteo, BOM (unofficial), BOM FTP radar, VicEmergency feeds, City of Melbourne (anonymous), Wikipedia (descriptive UA), ACMA bulk download, Geofabrik/OSM, OpenFreeMap/Protomaps builds, Nominatim (1 req/s, cache forever).

## Key Findings

### Recommended Stack

One FastAPI process (`--workers 1`), SQLite (WAL) + in-memory snapshots. Vanilla TS + Vite + MapLibre served by FastAPI `StaticFiles` on one origin; HTTPS via `tailscale serve` (never Funnel). Versions verified against PyPI/npm 2026-11-05; maplibre-gl 6.x API and vite-plugin-pwa 2.0 / Vite 8 compatibility unverified (fallback: hand-written ~40-line service worker).

- Python 3.12/3.13 + FastAPI 0.162 + uvicorn 0.54 (single worker)
- httpx 0.28, orjson, pydantic 2.14
- SQLite R*Tree + in-memory snapshots
- gtfs-realtime-bindings 3.0
- skyfield (ISS/satellites, sun, golden hour → `target_ts`)
- `websockets` (single aisstream client)
- pyosmium / osmium-tool (weekly Victoria extract → CCTV, heritage)
- maplibre-gl 6.16 + hand-authored dark style; `symbol` layers for tags (not DOM markers)
- Protomaps PMTiles (self-hosted)
- Vite 8 + vanilla TS + `idb-keyval`
- CSS-only glitch, self-hosted pixel font
- Unprivileged LXC + uv + systemd, `tailscale serve`

### Expected Features

**Table stakes:** Item schema (`name`, `kind`, absolute `target_ts`, `source`, `fetched_at`) with client-ticking countdowns and stale indicators; cached-first single-call profile + IndexedDB cache; PTV stops/departures/approaching vehicles + disruptions; weather with "rain in N min" + AQ/UV/pollen chips; hazards with severity banner; location handling with manual-pin fallback; dark tilted 3D map with tags/cards, ranked budgeted layout, layer toggles; hero that plays over real loading and never delays it; source-health page; graceful out-of-coverage; Tailscale-only.

**Differentiators:** one "name + countdown" grammar across domains + "next thing that matters" strip; surveillance (CCTV ~150 m + fixed cameras, "mapped, not exhaustive"); sky (planes, ISS/satellite passes) and bay ships; heritage + Wikipedia "what am I looking at"; grid/water; ACMA towers; golden/blue hour; listen-in link-outs; Signal event schema as SPENCER hook.

**Defer:** context auto-presets, haptics/sound, push notifications, SPENCER/LifeOS adapters, personal layers, AR camera, SDR/house/transcription, trip planning, history playback. Never: any person-level tag.

**Ranking:** score = urgency × relevance × severity × user weight. Three tiers: 3–4 item "next" strip, ~8–12 budgeted map tags with collapse badges, drawer for the rest. Slow environment data as colour-banded chips that escalate on thresholds. Hazards pre-empt everything. No reflow while reading. Hero: 1–1.5 s, skippable, cold-open only, scan sweep reveals real layers; red stays scarce; glitch only on state change.

### Architecture Approach

Modular monolith with read-only request path: API → Profile Assembler → StaticStore (SQLite R*Tree) + SnapshotStore (memory, persisted) + CellCache (H3/grid). Provider Runtime (asyncio supervisor: jitter, backoff, circuit breakers, singleflight, presence-gated polling) writes stores and publishes `layer.updated` to an in-process Event Bus → SSE hub pushes whole-layer replacements (`rev`, `Last-Event-ID` replay). Every layer is one `Provider` module producing the same `Item`/`Layer` envelope; frontend uses a style registry. Importers are CLI jobs with swap-on-import (reject >50% shrink).

Components: Provider registry + runtime; Profile Assembler + stores; SSE hub + event bus; importers (GTFS static, OSM CCTV, ACMA, heritage, cameras, CoM); Signals/Outbox ports (log-only sink in v1 — the SPENCER/LifeOS seam); PWA shell (SW, IndexedDB, MapLibre, ticker, style registry).

### Critical Pitfalls

1. **Countdowns lie on cached data** — absolute `target_ts` + `valid_until` + `fetched_at` + `server_time` offset; render `target − now` on a 1 Hz tick; recompute on `visibilitychange`; dim/drop expired.
2. **Origin churn / missing HTTPS destroy the PWA** — freeze MagicDNS hostname before first install; `tailscale serve` cert; real-iPhone test from first deploy; disable key expiry; 3–5 s `AbortController` timeouts + "OFF-GRID" state.
3. **Upstream calls in the request path** — read-only handlers, per-layer TTL/`max_stale`, singleflight, last-good on error; p95 `/profile` ≤ 300 ms.
4. **Scope creep across 15+ layers** — vertical slice first; one Provider contract (~1 day/layer); Tier 1/2/3 with a cut line (Tier 3: VicEmergency, BOM radar, pollen, Melbourne Water, Broadcastify, aisstream).
5. **Safety/legal framing** — never empty-as-safe; allow-list item kinds (place, infrastructure, public transit vehicle, aircraft, vessel, self); listen-in link-outs only; cameras static-display only (no proactive alerts while driving — learner permit); snap coordinates to cells for third-party calls; don't log precise coordinates.
6. **MapLibre 3D on iPhone** — pixelRatio ≤ 2, `symbol` layers with per-layer caps, handle `webglcontextlost`, perf spike on real phone before adding layers.
7. **Timezone** — UTC storage, `zoneinfo` Australia/Melbourne, `tzdata` package (Windows dev); test across April 2027 DST change.

## Implications for Roadmap

Seven dependency-ordered phases, each usable on its own:

1. **Foundation, device spike, flat HUD slice** — schema with absolute `target_ts` + kind allow-list, Provider contract, stores, `/profile`, `/health`, SSE, LXC + `tailscale serve` on frozen hostname, PWA shell (SW, IndexedDB, safe-area, timeouts, OFF-GRID), countdown ticker, location + manual pin, flat ranked list with two no-key providers (sun/golden hour, ARPANSA UV), iPhone spikes (standalone geolocation, wake lock, MapLibre FPS).
2. **Static import framework, 3D map and hero (surveillance slice)** — importer CLI + R*Tree, OSM CCTV via Geofabrik, fixed cameras (geocode/OSM cross-ref), self-hosted PMTiles + glyphs/sprites, dark style, 3D extrusions, budgeted tags, red volumes, cards, hero activation tap.
3. **Transit** — GTFS static import, GTFS-R per mode, stops/departures/approaching vehicles/alerts, scheduled vs live labels, then PTV v3 (HMAC).
4. **Environment, grid/water, ranking** — Open-Meteo + BOM, rain countdown, radar, EPA AQ, UV, pollen decision, CFA fire danger, golden hour, grid (OpenElectricity/AEMO), Melbourne Water; ranking score, strip, chips, toggles.
5. **Hazards, sky, bay** — VicEmergency, planes (adsb.lol/OpenSky), ISS/satellites (CelesTrak + skyfield), ships (aisstream).
6. **On-demand + remaining static** — CellCache SWR, Wikipedia, heritage, ACMA towers, City of Melbourne (out_of_coverage outside CBD), Broadcastify/KiwiSDR link-outs.
7. **Signals seam, polish, hardening** — signal detectors, log-only sink, outbox, `/ingest`, `/api/prewarm` (Shortcuts), glitch bursts + reduce-effects, Sources/attribution screen, storage persist, context-loss recovery, 20-min soak, backups.

**Ordering rationale:** contracts first (reused by everything); map + hero in Phase 2 so polish isn't deferred forever (flat list keeps HUD useful before the map); transit after frameworks and keys; Phases 5/6 reorderable; polish and signals can run in parallel from Phase 2.

### Research Flags

- **Strong:** Phase 3 (GTFS-R URLs/key, multi-mode static zip, ID joins, PTV signing); Phase 4 (pollen has no feed, BOM terms, EPA product/quota, OpenElectricity, CFA unprobed, CoM parking dataset ID).
- **Moderate:** Phase 1 (`tailscale serve` flags, iPhone `*.ts.net` SSL issue tailscale#19147); Phase 2 (Protomaps schema vs MapLibre 6.x, camera coordinates); Phase 5 (VicEmergency schema, aisstream limits, OpenSky auth); Phase 6 (heritage source, ACMA join).
- **Skip:** Phase 7 (standard patterns).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Versions and endpoint liveness probed 2026-11-05; auth details, GTFS-R paths, maplibre 6.x, Vite 8/PWA plugin unverified. |
| Features | MEDIUM | Scope grounded in PROJECT.md; competitor/UX guidance is reasoning. |
| Architecture | MEDIUM-HIGH | Standard patterns; upstream specifics and iOS storage not re-verified. |
| Pitfalls | MEDIUM | Legal points LOW — primary-source check needed. |

**Overall:** MEDIUM

### Gaps to Address

- **Pollen / thunderstorm asthma** — no feed; decide in Phase 4 (scrape Melbourne Pollen per ToS, Open-Meteo pollen if AU-covered, or VicEmergency thunderstorm-asthma warnings only).
- **Fixed road-safety cameras** — dataset may lack lat/lon and be stale (Jan 2023); one-time geocode or OSM cross-reference; show imported date.
- **Heritage** — VHD API 403; prefer static spatial dataset + OSM tags + Wikipedia; confirm licence.
- **Melbourne Water** — scrape only; check data.vic.gov.au; Tier 3.
- **Keys** — GTFS-R URLs and issuance time, PTV responsiveness, OpenElectricity waitlist, EPA product name.
- **iPhone specifics** — answered by the Phase 1 device spike.
- **Live parking dataset ID** — found ID is archival (2016); find current one.
- **Legal (~30 min primary sources)** — Surveillance Devices Act scope, learner-permit phone rules, Broadcastify embedding terms; required before radio milestone.

## Sources

**Primary (HIGH):** PyPI/npm registry queries (2026-11-05); live probes (2026-11-05) of OpenFreeMap, adsb.lol, OpenSky, CelesTrak, CoM Opendatasoft v2.1, Wikipedia geosearch, VicEmergency (both feeds), ARPANSA, Open-Meteo, BOM, OpenElectricity v4 (auth error), EPA portal, Overpass (502); AISStream docs; PROJECT.md.

**Secondary (MEDIUM):** Vic GTFS Realtime dataset metadata (discover.data.vic.gov.au/dataset/gtfs-realtime); PTV Timetable API key/signature doc; EPA Vic developer portal; OpenElectricity docs; ACMA licence data page; MapLibre 3D buildings example; Tailscale Serve/HTTPS docs; SQLite R*Tree, H3, Protomaps/PMTiles, GTFS-RT reference docs.

**Tertiary (LOW):** competitor feature sets and HUD UX (reasoning); tailscale#19147; iOS storage eviction/geolocation behaviour; fixed-camera "no lat/lon" claim; Victorian legal summaries (not legal advice).

---
*Research completed: 2026-11-05*
*Ready for roadmap: yes*
