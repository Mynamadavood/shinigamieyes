# Domain Pitfalls

**Domain:** Private iOS PWA HUD + FastAPI/Proxmox backend behind Tailscale, aggregating Melbourne/Victorian public data, MapLibre 3D map
**Researched:** 2026-11-05
**Overall confidence:** MEDIUM. Most items come from established platform behaviour and training knowledge, and web access was not used to re-verify them. Anything marked LOW or "verify" must be checked in the phase that touches it. Upstream API terms and keys change often.

---

## Critical Pitfalls

Mistakes that cause rewrites or break the Core Value ("cached profile in under 1 s, every item with a countdown").

### Pitfall 1: Cached profile shows countdowns that are already wrong
**What goes wrong:** The core value is "cached profile instantly, live fills in after". A cached tram "arrives in 3:12" that is 40 minutes old renders as a confident, wrong countdown. Or the countdown is a stored integer decremented by `setInterval`.
**Why it happens:** Cache stores a relative value ("192 s") instead of an absolute instant. Timers are throttled or suspended when iOS backgrounds the PWA.
**Consequences:** The HUD lies on every cold open, which is the exact moment it is meant to impress. Trust is lost.
**Prevention:**
- Every item carries `target_epoch_ms` (absolute UTC) plus `valid_until` and `fetched_at`.
- Render countdown as `target - (Date.now() + serverOffset)`, recomputed on `requestAnimationFrame` or a 1 Hz tick. Never decrement a stored counter.
- On `visibilitychange` to visible, recompute immediately.
- Items past `valid_until` are dimmed with an "age" badge or dropped, never shown as live.
- Measure phone clock skew against a server timestamp on every response (`serverOffset`).
**Detection:** Open the app after 10 minutes in the background. If any departure still shows a positive countdown, this is broken.
**Phase:** Foundation / data contract (before any layer is built). The item schema must include these fields from day one.

### Pitfall 2: Hostname/origin churn destroys the installed PWA
**What goes wrong:** The PWA is installed from `https://host.tailnet.ts.net`. Renaming the Tailscale node, changing tailnet name, or moving the VM changes the origin. All storage, service worker, and location/motion permissions are lost, and the home-screen icon must be reinstalled.
**Why it happens:** Origin = scheme + host + port. Tailscale hostnames feel disposable.
**Prevention:** Pick the final MagicDNS name once, before the first install (for example `eyes.<tailnet>.ts.net`). Give the Proxmox guest a stable Tailscale identity. Document it in PROJECT.md. Serve the frontend and API from the same origin (`tailscale serve` path routing) to avoid CORS and mixed-content problems.
**Detection:** Icon opens to an empty state, or the geolocation prompt reappears after infra changes.
**Phase:** Infrastructure / Tailscale setup (first phase).

### Pitfall 3: HTTPS skipped, so geolocation and service workers silently do not work
**What goes wrong:** Developing over `http://100.x.x.x:8000` works on a laptop (localhost is a secure context) but on iPhone `navigator.geolocation`, service workers, and DeviceOrientation permission all fail or are absent. "Offline shell" never registers.
**Prevention:**
- Enable HTTPS certificates and MagicDNS in the Tailscale admin console.
- Use `tailscale serve --https=443 http://127.0.0.1:8000` on the server, which gives a real Let's Encrypt cert with auto-renewal.
- Never use `tailscale funnel` (that exposes the app publicly and violates the hard constraint).
- Test on the real iPhone from the first deploy, not only desktop.
- Note that machine/tailnet names go into public Certificate Transparency logs. Use a non-revealing tailnet name and hostname.
**Detection:** `window.isSecureContext === false`, or `navigator.serviceWorker` is undefined on the phone.
**Phase:** Infrastructure (first phase). Verify with a "hello HUD" PWA before any feature work.

### Pitfall 4: Tailscale breaks silently (key expiry, LXC TUN, off-tailnet phone)
**What goes wrong:**
- The server node key expires (default about 180 days) and the HUD dies months later with no obvious reason.
- Tailscale inside an unprivileged LXC fails without `/dev/net/tun` passthrough.
- The iPhone's Tailscale VPN toggles off, or another VPN has taken the single iOS VPN slot. The app then hangs on fetch with no timeout.
**Prevention:**
- Disable key expiry on the server node in the admin console.
- Use a VM, or an LXC with TUN configured, and test after reboot.
- The service worker caches the app shell and last profile so the HUD always opens. Wrap all fetches in a 3 to 5 s timeout using `AbortController`.
- Show a distinct "OFF-GRID / tailnet unreachable" HUD state, not an infinite spinner.
- Enable Tailscale "Connect On Demand" on iOS if available (verify).
**Detection:** Turn off Wi-Fi/Tailscale on the phone and open the app. It must open to a cached profile with a clear status.
**Phase:** Infrastructure, then PWA shell phase.

### Pitfall 5: The profile endpoint fans out to upstreams on the request path
**What goes wrong:** A single `/profile?lat&lon` endpoint calls PTV, Overpass, EPA, and others live. The slowest or rate-limited upstream blocks the response, or a 429 cascades. This violates "never the slow path".
**Prevention:**
- Strict separation: background ingestion workers (APScheduler or asyncio tasks) write to a local store (SQLite/PostGIS/Redis). Request handlers read only the local store.
- Per-layer TTL, stale-while-revalidate, per-layer deadline, and per-layer health status.
- Return cached data immediately, then push updates incrementally (SSE or per-layer endpoints), so one layer's failure never blanks the screen.
- Key caches by geohash or tile (not raw lat/lon) to get hits.
- Use circuit breakers and exponential backoff per upstream.
**Detection:** p95 of `/profile` is above 300 ms, or it varies with upstream latency.
**Phase:** Backend architecture (early). Must exist before layer 2.

### Pitfall 6: Scope creep from 15+ layers kills v1
**What goes wrong:** Each layer has its own auth, quirks, licence, scraping fragility, and UI card. Solo dev, summer holidays: the app is never finished, and the hero + map polish is deferred forever.
**Prevention:**
- Build a vertical slice first: hero activation, 3D map, location, ONE layer (PTV via GTFS-RT) with countdowns, installed on the phone.
- Define one layer plugin contract (fetch, normalise to `Item{id,name,kind,geom,target_epoch,valid_until,source,attribution}`, TTL, health) so each new layer is about a day of work.
- Tier the layers:
  - Tier 1 (clean official feeds): PTV GTFS-RT, CelesTrak/ISS, sun/golden hour, OpenElectricity, ARPANSA UV, City of Melbourne.
  - Tier 2: OSM CCTV, heritage, Wikipedia, ACMA, adsb.lol.
  - Tier 3 (fragile or legally grey): VicEmergency, BOM radar, Melbourne Pollen, Melbourne Water, Broadcastify, aisstream.
- Pre-agree a "cut line". Tier 3 ships as link-outs or is dropped if it takes more than 1 day.
- Skip a layer's polish until all Tier 1 and 2 layers work.
**Detection:** More than 3 layers in progress, or no on-phone build for 2 weeks.
**Phase:** Roadmap structure itself. Order phases by slice, then tiers.

---

## Moderate Pitfalls

### iOS Safari PWA platform limits

#### Pitfall 7: Geolocation in standalone mode re-prompts and is unreliable
**What goes wrong:** Home-screen web apps on iOS have historically re-asked for location permission frequently (per launch or per session), unlike Safari tabs. `watchPosition` drains battery. There is no background location. Indoors fixes are coarse.
**Prevention:**
- Use one `getCurrentPosition` on open, with a cached last-known position as the instant fallback.
- Refresh only on `visibilitychange` or after significant movement. Avoid continuous `watchPosition`.
- Provide a manual "pin location" fallback (tap the map) so the app is never useless when denied.
- Treat iOS Shortcuts automations as optional triggers, not core.
- Test the behaviour on the actual iOS version (MEDIUM/LOW confidence on current persistence behaviour; verify on device early).
**Phase:** PWA shell / location phase.

#### Pitfall 8: DeviceOrientation (compass) needs a user gesture and may re-prompt
**What goes wrong:** On iOS, `DeviceOrientationEvent.requestPermission()` must be called from a tap handler. Calling it on load fails silently. Heading is `webkitCompassHeading`, not `alpha`. The compass is noisy and near metal or indoors it drifts.
**Prevention:** Make the "activation" tap on the hero screen the single user gesture that requests orientation, unlocks audio, and requests the wake lock. Feature-detect and degrade to north-up. Smooth the heading (low-pass filter). Defer compass-driven map bearing if it is flaky; it is not needed for v1.
**Phase:** Hero/activation phase.

#### Pitfall 9: Service worker and storage eviction, plus unbounded tile cache
**What goes wrong:** iOS may evict origin storage under pressure. Home-screen apps are mostly exempt from the 7-day Safari ITP cap, but quota is small and not guaranteed. Caching map tiles in the SW without limits balloons storage and triggers eviction. Cache-first on `index.html` leaves users stuck on a stale build after deploys.
**Prevention:**
- Call `navigator.storage.persist()` and check `navigator.storage.estimate()`.
- Store the last profile in IndexedDB, not localStorage.
- Versioned app-shell cache with an explicit update flow (`skipWaiting` plus "new version, reload" toast).
- Tile cache is capped (LRU, a few tens of MB, home area only).
- Keep a hardcoded "last known good" fallback.
**Detection:** After a few days unused, does the app still open offline?
**Phase:** PWA shell phase.

#### Pitfall 10: MapLibre 3D on iPhone: memory, context loss, DPR, markers
**What goes wrong:** Tilted fill-extrusion buildings, many layers, retina DPR, and hundreds of HTML markers cause jank, thermal throttling, or the iOS tab/PWA killing the WebGL context. Returning from background can show a black canvas (context lost).
**Prevention:**
- Cap `pixelRatio` at 2 (try 1.5 under load).
- Render tags as GeoJSON `symbol` layers, not DOM markers. Cluster or cap per layer (for example 40 items).
- Limit extrusion to a radius or zoom range. Keep a "lite" fallback.
- Handle `webglcontextlost` and `webglcontextrestored`, and re-create the map on resume if needed.
- Avoid custom heavy shaders and post-processing for glitch effects; do glitch with CSS/overlay canvas, or throttle them.
- Test on the real phone (not simulator) with a 20-minute session.
**Detection:** FPS below 30 when tilted, phone warm, or a black map after backgrounding.
**Phase:** Map phase. Do a perf budget spike before adding layers.

#### Pitfall 11: Basemap tiles, glyphs, and sprites quietly depend on external services
**What goes wrong:** MapLibre needs a vector tile source. OSM's public tile servers forbid heavy use, free tile hosts change terms, and fonts/sprites loaded from CDNs break the offline shell. OSM building heights are sparse in much of Melbourne, so the "3D" looks flat in suburbs.
**Prevention:** Self-host a Victoria/Melbourne PMTiles extract (Protomaps or OpenMapTiles-based) on Proxmox, served over the tailnet. Self-host glyph PBFs and sprites (including the pixel font). Default extrusion height when `height` is missing (levels × 3 m, else a fallback). Include "© OpenStreetMap contributors" attribution.
**Phase:** Map phase.

#### Pitfall 12: Notch, safe area, and viewport quirks
**What goes wrong:** Full-screen standalone mode puts the HUD under the Dynamic Island and home indicator. `100vh` is wrong, rubber-band scrolling and pull-to-refresh behaviour interferes with the map, and double-tap zoom hijacks gestures.
**Prevention:** `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style=black-translucent`. Use `env(safe-area-inset-*)` padding, `100dvh`, `overscroll-behavior: none`, `touch-action` on the map container. Provide `apple-touch-icon` and splash images (iOS does not fully honour the web manifest). Use `navigator.wakeLock` if keeping the screen on (buggy in the past; verify).
**Phase:** PWA shell phase.

### Upstream API pitfalls

#### Pitfall 13: PTV Timetable API v3 HMAC signature errors
**What goes wrong:** 403 "Invalid signature". Typical causes: signing the full URL with host, omitting `devid` from the signed string, lowercase hex, signing after URL-encoding differently from what is sent, appending parameters after the signature, trailing whitespace in the key.
**Prevention:** Server-side only (the key never reaches the client). Sign `"/v3/<path>?<params>&devid=<ID>"` with HMAC-SHA1 using the key, uppercase hex digest, and append `&signature=` last. Write a unit test against the signing example in PTV's docs. Rate limits are poorly documented, so cache aggressively. The key has not been applied for yet and the issue time is unknown, so apply now.
**Confidence:** MEDIUM (verify the current docs).
**Phase:** Apply for the key immediately (task, not a phase). Integrate in the PTV phase after GTFS-RT.

#### Pitfall 14: GTFS-RT feed key, protobuf cost, and static/realtime ID mismatch
**What goes wrong:**
- Victoria's realtime feeds come through the Transport Victoria Open Data portal and need a registered API key (header name and mechanism: verify in portal docs). Keys live server-side only.
- Per-mode feeds (metro train, tram, bus, V/Line) are large. Parsing on every phone request wastes CPU. Poll once per about 20 to 30 s on the server and store a compact index by stop.
- Static GTFS for Victoria is a multi-mode bundle (nested zips per mode). `trip_id` / `route_id` / `stop_id` mismatch between static and realtime when static data is stale. Static feed updates need a scheduled refresh.
- Static times are agency-local `HH:MM:SS` and can exceed 24:00:00.
- Realtime may lack arrival times (departure only) or have stale/missing updates. Tram feeds are patchy.
**Prevention:** Daily static refresh with a version check. Build a stop-to-upcoming index in memory/SQLite. Show "scheduled" vs "live" visibly. Use the feed header `timestamp` for staleness. Cap polling to what is needed (only modes within the user's area, or all modes but sparsely). Use `gtfs-realtime-bindings`.
**Phase:** PTV phase.

#### Pitfall 15: OpenSky rate limits and credits
**What goes wrong:** Anonymous access is heavily limited (small daily credits, coarse time resolution). New accounts use OAuth2 client credentials rather than basic auth (verify). Bounding-box size affects credit cost. Polling every second per client burns the quota in minutes and results in 429s.
**Prevention:** Use adsb.lol's free point/radius API as primary (check its terms and attribution), with OpenSky as fallback. One server-side poll per area, at 10 to 15 s intervals, shared across all requests. Respect `X-Rate-Limit-Remaining` headers. Interpolate positions client-side between polls for the smooth movement.
**Confidence:** MEDIUM/LOW on current limits (verify).
**Phase:** Sky layer (Tier 2).

#### Pitfall 16: BOM blocks scrapers and prohibits scraping
**What goes wrong:** bom.gov.au sits behind a CDN that returns 403 for non-browser user agents, and its terms restrict automated access and redistribution. Radar images and observations "work" for a week and then break. The temptation is to fake a browser UA.
**Prevention:** Prefer BOM's documented anonymous FTP products (verify the current availability and terms) for observations and forecasts, or a different provider (for example Open-Meteo for forecasts, noting non-commercial licensing). Treat radar as a Tier 3 link-out ("open BOM radar") if no clean feed exists. Isolate it behind the layer contract so a failure shows "layer offline", not an error.
**Confidence:** MEDIUM.
**Phase:** Environment layer. Decide the source before the phase starts.

#### Pitfall 17: VicEmergency has no official feed
**What goes wrong:** Community scrapers use an undocumented GeoJSON endpoint behind the VicEmergency site. It can change shape, vanish, or be blocked. Showing a stale "no fires nearby" is dangerous because it implies safety.
**Prevention:** Register interest in the official data feed (already on the to-do list). Use the unofficial endpoint behind the layer contract with a schema validator. Never show an empty state as "all clear". Show "feed age: X min" and "unverified, check VicEmergency app". The HUD is not a safety tool, so say so in the card. Poll sparingly with an identifying User-Agent.
**Phase:** Hazards layer (Tier 3).

#### Pitfall 18: aisstream.io websocket limits
**What goes wrong:** A subscription message with API key and bounding box must be sent promptly after connect (a few seconds) or the server closes the connection. Per-key connection limits, no SLA (beta service), and coverage depends on volunteer terrestrial receivers, so Port Phillip may be patchy. Opening one socket per client breaks the key.
**Prevention:** One long-lived backend socket with reconnect + backoff, a bounding box limited to Port Phillip, an in-memory latest-position table with TTL, and clients read from that table. Show "last seen" for each vessel. Do not claim completeness.
**Confidence:** MEDIUM (verify current docs).
**Phase:** Bay layer (Tier 3).

#### Pitfall 19: Overpass API rate limits and false "no cameras" reassurance
**What goes wrong:** Public Overpass instances throttle (limited slots per IP, 429/504 under load). Running a query per phone move gets blocked. OSM CCTV tagging (`man_made=surveillance`) is incomplete, and many cameras are not mapped. Showing "0 cameras within 150 m" implies a privacy guarantee that does not exist. Fixed speed camera lists omit mobile cameras.
**Prevention:**
- Don't query Overpass live. Ingest the Victoria OSM extract (Geofabrik) or a nightly Overpass dump for Melbourne into SQLite/PostGIS and query locally. Surveillance data changes slowly, so a daily refresh is fine.
- Copy: "known / mapped cameras" never "cameras". Add "Not exhaustive" in the card.
- Show speed camera data as "fixed cameras (published list)". Mobile cameras are not listed.
**Phase:** Surveillance layer (Tier 2), ingestion pipeline built once and reused for heritage/ACMA.

#### Pitfall 20: CelesTrak, other API etiquette, and unregistered keys
**What goes wrong:** CelesTrak asks for infrequent TLE/GP downloads (hours, not seconds) and blocks abusive IPs. Wikipedia requires a descriptive User-Agent. OpenElectricity needs an API key and is rate-limited. EPA Vic's AirWatch/monitoring API needs a registered key (verify). City of Melbourne's Socrata API works better with an app token. ARPANSA, Melbourne Pollen, and Melbourne Water are not formal APIs.
**Prevention:** Keep a **source register** (URL, auth, quota, TTL, licence, attribution, owner status) in the repo and fill it in before the layer starts. Compute ISS/satellite passes locally using `sgp4`/`skyfield` from cached TLEs (refresh every 6 to 12 h). Only report visible passes when the sun/sky conditions make sense (twilight, sat illuminated).
**Phase:** Each layer phase. Source register created in the backend foundation phase.

### Data licensing

#### Pitfall 21: Attribution and licence obligations ignored
**What goes wrong:** "It's private" is treated as "no obligations". Several sources require attribution even for personal use, and some restrict redistribution or caching.
**Prevention:**
- A single "Sources" screen in the app, populated from each item's `source` / `attribution` field.
- Typical obligations (verify each): OSM is ODbL, "© OpenStreetMap contributors". Transport Victoria data and City of Melbourne are typically CC BY 4.0. Wikipedia is CC BY-SA. ACMA RRL data licensed CC BY. BOM, Melbourne Water, and Melbourne Pollen have restrictive terms, so link out rather than cache or re-serve.
- Never expose the backend publicly (this also keeps you clear of redistribution clauses). Do not republish data.
- Heritage Database terms are unclear (LOW), so check them before bulk ingesting.
- Hero art (anime reference) and fonts: personal private use is fine, but confirm the pixel font's licence.
**Phase:** Source register (foundation), the Sources screen (HUD polish).

### Legal line (Victoria / Australia)

Not legal advice. MEDIUM/LOW confidence. Spend 30 minutes with primary sources, or ask a lawyer or the university legal service, before the radio features.

#### Pitfall 22: Drifting into tracking people
**What goes wrong:** Surveillance Devices Act 2008 (Vic; verify the Act name and year) restricts listening/optical/tracking/data surveillance devices used to monitor people and private activities. Features that look harmless drift into it: "nearby phones" Wi-Fi/BT scans, plate or face recognition, CCTV image viewing, recording audio. The out-of-scope list already covers this.
**Prevention:** Keep the rule in code as well as docs: an item `kind` allow-list (place, infrastructure, vehicle-as-public-transit, aircraft, vessel, self). Reject anything person-level. Aircraft and vessels are broadcast public identifiers, but do not log them long-term or tie them to a named individual (for example, do not look up an aircraft owner and then display a person's name).
**Phase:** Foundation (as a design rule), re-checked in each phase review.

#### Pitfall 23: Scanner / listen-in legalities and rebroadcasting
**What goes wrong:** In Australia, receiving unencrypted radio is generally lawful, but intercepting telecommunications (the Telecommunications (Interception and Access) Act) and recording private conversations (state surveillance devices law) are not. Re-streaming, recording, or sharing emergency-service audio can create issues. Many Victorian emergency services are digital or encrypted, so Broadcastify CFA/FRV feeds may be sparse or unavailable.
**Prevention:** v1 Listen-in = link-outs only: open the Broadcastify or KiwiSDR/WebSDR page in a browser tab/iframe from the phone. The backend does not proxy, record, transcribe, or restream. Check Broadcastify's embedding terms. Keep transcription (whisper.cpp) out of scope until legal review.
**Phase:** Listen-in layer (Tier 3, link-out only). Revisit with the later SDR milestone.

#### Pitfall 24: Speed camera warnings, radar-detector law, and phone use while driving
**What goes wrong:** Victoria bans radar/laser detector use, and showing fixed camera locations from the published list is a grey area (LOW; verify) if it becomes live "camera ahead" alerts while driving. David holds a learner permit and learner drivers in Victoria cannot use a mobile phone at all while driving, including hands-free (verify current VicRoads rules). An interactive HUD that he opens in the car is a fine risk.
**Prevention:** Show cameras on the map as static information, with no audible or proactive "approaching camera" alerts. Add a "driving" posture rule: no HUD interaction while driving (passenger use only), and in the phase doc note that learner-logbook features (milestone 2) must not need phone interaction mid-drive. Don't mark the road safety cameras layer as an "evasion" feature.
**Phase:** Surveillance layer plus later learner-logbook milestone.

---

## Minor Pitfalls

### Pitfall 25: Timezone and DST bugs (Australia/Melbourne)
**What goes wrong:** Streak "dies at midnight" computed in UTC or the server timezone. DST shifts (Melbourne starts DST first Sunday in October, ends first Sunday in April; next change is early April 2027, which is inside the build window) produce 23 or 25 hour days, and "midnight" can be ambiguous. GTFS static times are local. `zoneinfo` fails on Windows dev machines without the `tzdata` package. The Proxmox VM may be set to UTC.
**Prevention:** Store everything as UTC epoch. Convert with `zoneinfo.ZoneInfo("Australia/Melbourne")` for "end of local day" and service-day logic. Add `tzdata` to dependencies (Windows dev). Send both epoch and IANA zone to the client and use `Intl.DateTimeFormat` with `timeZone: 'Australia/Melbourne'`. Unit-test with freeze-time across the 2027-04-04 transition. Compute golden hour/sunset with `astral`/`skyfield` for the actual lat/lon.
**Phase:** Foundation (time utilities), PTV phase.

### Pitfall 26: Personal location data in logs and caches
**What goes wrong:** Request logs and cache keys contain precise lat/lon history. The constraints say personal data never leaves Proxmox, and that is satisfied only if third-party calls (Overpass, Wikipedia, weather) don't receive David's exact coordinates.
**Prevention:** Prefer local ingestion so queries are local. Where an upstream must be called, snap coordinates to a tile or geohash. Disable access logging of query strings, or truncate them. No analytics SDKs, no Google Fonts or CDN assets.
**Phase:** Backend foundation.

### Pitfall 27: Shared Proxmox resources
**What goes wrong:** 32 GB is shared with SPENCER and LifeOS. Unbounded in-memory caches, big GTFS parse spikes, or PMTiles/OSM imports starve neighbours.
**Prevention:** Set a VM/container memory limit, use SQLite or PostGIS on disk for static data, stream-parse the static GTFS. Run heavy imports off-peak. Keep the CUDA 12 pin note for later.
**Phase:** Backend foundation.

### Pitfall 28: Pop-up cards, glitch effects, and sound hurting usability
**What goes wrong:** Heavy glitch animation tanks FPS and battery, and audio fails to play without a user gesture. Floating tags overlap into unreadable clutter in dense areas such as the CBD.
**Prevention:** Glitch effects via CSS transitions on a few elements, with a "reduce effects" toggle. Label collision handling (MapLibre symbol collision), a priority score per item, and a cap per layer. Unlock audio on the activation tap.
**Phase:** HUD polish.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Infrastructure / Tailscale / HTTPS | #2, #3, #4: origin churn, no HTTPS, key expiry | Fix hostname, `tailscale serve` HTTPS, disable key expiry, real-phone test |
| Backend architecture | #5, #26, #27: request-path fan-out, location logging, RAM | Ingest-then-read, per-layer TTL/health, geohash keys |
| Item/data contract | #1, #25: countdown drift, TZ | Absolute epoch plus `valid_until`; UTC storage; `tzdata` |
| PWA shell | #7, #9, #12: geolocation prompts, eviction, safe areas | Manual pin fallback, persist storage, versioned SW, safe-area CSS |
| Hero / activation | #8, #28: compass gesture, audio | One activation tap for all permissions |
| Map | #10, #11: WebGL perf, tile hosting | Self-hosted PMTiles, symbol layers, perf budget, context-loss handling |
| PTV | #13, #14: HMAC, GTFS-RT quirks | Apply for the key now; GTFS-RT first, static refresh, staleness labels |
| Surveillance | #19, #24, #22: Overpass limits, false reassurance, driving | Local OSM ingest, "known cameras" wording, static display only |
| Environment | #16, #20: BOM blocking, key-gated APIs | Decide sources first; link-out fallback |
| Hazards | #17: unofficial VicEmergency | Never show "all clear"; feed-age label |
| Sky / Bay | #15, #18, #20: OpenSky credits, aisstream limits, CelesTrak etiquette | adsb.lol primary, single shared socket/poll, local SGP4 |
| Listen-in | #23: legality | Link-outs only, no proxying or recording |
| All layers | #6, #21: scope creep, attribution | Tiering and cut line, source register, Sources screen |

## Research Flags for Roadmap
- **Needs deeper research before its phase:** PTV/GTFS-RT portal key mechanics (#14), BOM data source decision (#16), EPA/OpenElectricity key and quota details (#20), aisstream current limits (#18), OpenSky current auth/credits (#15), Victorian law summary for scanning and driving (#23, #24).
- **Standard patterns, unlikely to need research:** Tailscale serve HTTPS, SW app shell, safe-area CSS, MapLibre symbol layers, timezone handling.
- **Early device spike (do in phase 1):** iOS standalone geolocation re-prompt behaviour, DeviceOrientation permission persistence, wake lock, and MapLibre tilted-3D FPS on David's actual iPhone and iOS version. These are the least documented and the most likely to force design changes.

## Sources

- Training-knowledge synthesis, not re-verified online in this pass (MEDIUM/LOW overall).
- To verify when each phase starts:
  - Transport Victoria Open Data portal: https://opendata.transport.vic.gov.au
  - PTV Timetable API v3 docs: https://www.ptv.vic.gov.au/footer/data-and-reporting/datasets/ptv-timetable-api/
  - Tailscale HTTPS/serve docs: https://tailscale.com/kb/1153/enabling-https
  - OpenSky REST API: https://openskynetwork.github.io/opensky-api/
  - aisstream docs: https://aisstream.io/documentation
  - Overpass usage policy: https://wiki.openstreetmap.org/wiki/Overpass_API
  - CelesTrak GP data usage: https://celestrak.org/NORAD/documentation/gp-data-formats.php
  - WebKit PWA / storage policy: https://webkit.org/blog/
  - Victorian legislation: https://www.legislation.vic.gov.au
