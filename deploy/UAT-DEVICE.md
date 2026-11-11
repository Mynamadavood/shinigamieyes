# Device UAT gates

Record a result or note under each item.

## Gate 1: Skeleton go/no-go (plan 01-03)

Automated pre-check (2026-11-05, dev PC over tailnet, FQDN `shinigami.<tailnet>.ts.net`):
- `verify.sh --local` (in CT): `{"mode":"local","pass":13,"fail":0,"skip":1,"p95_ms":null}`
- `verify.sh --remote`: `{"mode":"remote","pass":8,"fail":0,"skip":4,"p95_ms":null}` (sse_unbuffered PASS through tailscale serve, so SSE live fill-in stays; no polling fallback needed)
- Deploy fixes applied during bring-up: template pinned to host arch (arm64 picked by mistake), uv installed to /usr/local/bin, PATH set for the service user in deploy.sh.

- [x] Safari opens `https://shinigami.<tailnet>.ts.net` with no TLS error (Pi-hole DNS and AdGuard present). Result / notes: pass (David, iPhone, 2026-11-05)
- [x] `/api/health` JSON shows. Result / notes: pass (David, iPhone, 2026-11-05)
- [x] Share, Add to Home Screen installs with the black/red icon. Result / notes: pass (David, iPhone, 2026-11-05)
- [x] Launch is full-screen, status bar black-translucent, content not under the notch or home indicator. Result / notes: pass (David, iPhone, 2026-11-05)
- [x] SSE probe counter ticks once per second in standalone mode for at least 10 s. Result / notes: pass (David, iPhone, 2026-11-05)
- [x] With Tailscale toggled off the URL does not load. Result / notes: pass (David, iPhone, 2026-11-05)
- [x] `pct reboot <CTID>`, then the app works again without manual steps. Result / notes: pass (David, iPhone, 2026-11-05)

Go / No-go: GO. Sign-off: David, 2026-11-05 (all six steps passed)

## Gate 2: Phase acceptance (plan 01-11)

Automated pre-check (2026-11-06, after redeploy of 540b9e4):
- `verify.sh --local` (in CT): `{"mode":"local","pass":14,"fail":0,"skip":0,"p95_ms":2}`
- `verify.sh --remote` (dev PC over tailnet): `{"mode":"remote","pass":12,"fail":0,"skip":0,"p95_ms":84}`. First run failed `stream_hello` falsely (pipefail: curl's timeout exit masked the grep match); check fixed, server unchanged.
- `/api/profile?place=monash`: `source:"pin"`, `lat:null`, label `Monash Clayton`.
- `/api/geocode?q=flinders street melbourne`: HTTP 200, 4 results.
- After the DNS fix and Photon type-ahead (41a3032): `verify.sh --remote` `{"mode":"remote","pass":13,"fail":0,"skip":0,"p95_ms":44}` (adds `suggest_photon`).

- [x] Cold open from the home screen shows the cached profile in under 1 s (Safari Web Inspector or stopwatch). Result / notes: pass (David, iPhone, 2026-11-06)
- [x] Golden/blue hour and UV rows tick every second. Result / notes: pass per spec (David, iPhone, 2026-11-06). Rows > 1 h show `Hh Mm` and update per minute (D-04); seconds only appear under 1 h
- [x] Background the app 10+ minutes (10-minute background), reopen: countdowns match expected times. Result / notes: pass (David, iPhone, 2026-11-06)
- [x] Tailscale off: `OFF-GRID · last sync Xm ago` banner shows, rows keep ticking. Result / notes: pass (David, iPhone, 2026-11-06)
- [x] Tailscale back on: banner clears without reload. Result / notes: pass (David, iPhone, 2026-11-06)
- [x] GPS prompt behaviour in standalone mode recorded (prompts on every cold launch? after 24 h? on resume?). Result / notes: prompts once on first launch, never again (cold launch or resume) (David, iPhone, 2026-11-06)
- [x] Deny GPS: `GPS off` shows and the Place Sheet opens once. Result / notes: pass (David, iPhone, 2026-11-06) (Safari Websites location set to Never)
- [x] Pick `Monash Clayton`: profile changes. Result / notes: pass (David, iPhone, 2026-11-06); strip shows `PIN · Monash Clayton`
- [x] Address search for a street returns results. Result / notes: pass (David, iPhone, 2026-11-06) after two fixes: (1) MagicDNS in the CT could not resolve public hosts, every uncached search hit ConnectTimeout; CT now runs `tailscale set --accept-dns=false` and verify has `dns_upstream`; (2) added type-ahead suggestions via Photon (`/api/suggest`, 400 ms debounce, 3+ chars), Search key still runs Nominatim
- [x] The home-screen app installed at Gate 1 updates to the new build after force-quit and reopen, without reinstalling. Result / notes: pass (David, iPhone, 2026-11-06)
- [x] Full Proxmox host reboot: app reachable again with no manual steps (PLAT-07). Result / notes: pass (David, iPhone, 2026-11-06)
- [~] Stale/expired rows dim/pulse as specified. Result / notes: DEFERRED by David (2026-11-06): needs 30+ min with Tailscale off to age the UV layer. Logic covered by `web/src/freshness.test.ts` and the next-list expiry tests; on-device look still to confirm

Go / No-go: GO (11 of 12 pass, 1 deferred). Sign-off: David, 2026-11-06

## Gate 3: Phase 2 acceptance (plan 02-14)

Automated pre-check:
- 02-06 provisioning (2026-11-07, deployed 1dad315, run by Claude over SSH to the CT with David's key):
  - `verify.sh --remote` (dev PC over tailnet): `{"mode":"remote","pass":15,"fail":0,"skip":0,"p95_ms":249}` (tiles_health, tile_cbd PASS)
  - `verify.sh --local` (in CT): `{"mode":"local","pass":19,"fail":0,"skip":0,"p95_ms":2}`
  - `/api/tiles/meta`: `status ok`, minzoom 0, maxzoom 15, bounds 144.2,-38.55,145.75,-37.45
  - Extract: `greater-melbourne.pmtiles` 125 MB (dry-run estimate 130 MB); CT root 7.8 G, 5.6 G free after provisioning
  - Camera job (`shinigami-data.service`, 3 min, 249 MB peak): `cctv=674 speed=189 redlight=136`; cameras.json 82 KB; server picked it up on its 5-minute re-read with no restart; weekly timer armed
  - Bring-up fixes: pmtiles PATH under `pct exec` (b6a75d7); tile check uses GET + `Accept-Encoding: gzip`, CR-safe tile maths, data unit runs the script via bash (1dad315)
- 02-14 final pre-check (2026-11-08, deployed 8579cf1, run by Claude over SSH and the tailnet):
  - `verify.sh --local` (in CT): `{"mode":"local","pass":25,"fail":0,"skip":0,"p95_ms":2}`
  - `verify.sh --remote` (dev PC over tailnet): `{"mode":"remote","pass":21,"fail":0,"skip":0,"p95_ms":44}`
  - `/api/tiles/meta`: `status ok`, minzoom 0, maxzoom 15; `/sw.js` HTTP 200
  - Camera data refreshed by the weekly timer 2026-11-08 (next run 2026-11-15)
  - Local suites: pytest 125 passed / 1 skipped, web 241 passed, build clean. A date-dependent sun-time test was fixed (1c446e8, test only)
  - Device notes (minor, follow-up): the `Speed camera` tag label clips at the screen edge; an open card can cover nearby tags
- Fixes found during Wave 6 device checks: map host collapsed to 0 px under maplibre-gl.css (04776d9); fonts inlined as data: URLs blocked by CSP (46c4cd8); blank recenter icon on iOS (8579cf1)
- 02-18 gap-fix pre-check (2026-11-11, deployed 74acc09 after David's "push", run by Claude over SSH and the tailnet):
  - Gap plans 02-15 (saved-place cameras, never Home), 02-16 (guard posts, owner-name rule), 02-17 (label flip, card avoids tags)
  - Camera job re-run: `cctv=674 guard=0 speed=189 redlight=136` (Victoria OSM has no `surveillance:type=guard` nodes today; the job reads the full Victoria extract)
  - First verify run showed `place_no_cameras`/`place_cameras` as SKIP: a literal newline in a sed replacement made the places parse fail silently. Fixed in 3aec642 (verify.sh only)
  - With the fixed script: `verify.sh --local` (in CT, script piped over SSH) `{"mode":"local","pass":26,"fail":0,"skip":0,"p95_ms":2}`; `verify.sh --remote` `{"mode":"remote","pass":22,"fail":0,"skip":0,"p95_ms":67}` (one earlier remote run hit p95 355 ms while the camera job was running)
  - `/api/places`: 4 places, Home `cameras:false`, the other three `cameras:true`; no coordinates
  - Local suites: pytest 129 passed / 1 skipped, web 261 passed, build clean

- [x] Hero on cold open: force-quit, launch from the home screen; red eyes play for 1.5 s or less (stopwatch) with cached rows already visible underneath. Result / notes: pass (David, iPhone, 2026-11-10)
- [x] Tapping anywhere (or the x box) during the hero skips straight to the map. Result / notes: pass (David, iPhone, 2026-11-10)
- [x] Hero does not replay when returning to the app from the background. Result / notes: pass (David, iPhone, 2026-11-10)
- [~] Reduced motion (Settings > Accessibility > Motion > Reduce Motion on): hero is a still frame of about 0.7 s, no flash, still skippable. Result / notes: SKIPPED by David (not tried); still frame covered by hero tests
- [x] 3D map look: tilted about 60 degrees, dark land, blue extruded buildings, street labels at zoom 16 and closer. Result / notes: pass (David, iPhone, 2026-11-07/10; CBD screenshots show tilt, blue extrusions, dark land; labels at close zoom confirmed)
- [x] Smoothness: pan and zoom over the CBD with tags on; no visible stutter, labelled tags capped (about 20, rest as small icons). Result / notes: pass (David, iPhone, 2026-11-10, CBD walk)
- [x] Offline: view an area, turn Tailscale off, force-quit, reopen; tiles already seen still draw, unseen areas show the dark grid, OFF-GRID banner shows. Result / notes: pass (David, iPhone, 2026-11-10)
- [~] Zero third-party requests: Safari Web Inspector Network tab (from the PC/Mac) on a cold open; every request host is the ts.net origin. Result / notes: SKIPPED: no Mac for Safari Web Inspector. Covered by verify.sh `csp_header`, `dist_no_cdn_hosts`, `dist_no_inline_fonts` and the `connect-src 'self'` CSP, which blocks any other host
- [x] Camera count readout reads like `6 cameras · 150 m · mapped, not exhaustive` and a CCTV card says `Mapped, not exhaustive.`. Result / notes: pass (David, iPhone, 2026-11-07 screenshots: `4 cameras · 150 m · mapped, not exhaustive`; zero case `0 mapped cameras · 150 m · not exhaustive`; CCTV card `Mapped, not exhaustive.`)
- [x] Speed/red-light camera card says `Static info only.` and `Source: OpenStreetMap`. Result / notes: pass (David, iPhone, 2026-11-10)
- [x] Camera tags are blue, and turn red within about 30 m (at most 3 red at once). Result / notes: pass (David, iPhone, 2026-11-10); David asked for a double-check: code reviewed 2026-11-10, red only within 30 m, capped at 3 nearest (`assignTags`, test `reds only the 3 nearest within 30 m`), re-ranked on every GPS fix
- [x] Long-press (half a second) drops a blue pin; the strip reads `PIN · Dropped pin`; `Use GPS` on its card returns to GPS. Result / notes: pass (David, iPhone, 2026-11-10)
- [x] Drawer: drag the handle, flick, and tap the handle to move between peek, half and full. Result / notes: pass (David, iPhone, 2026-11-10)
- [x] Recenter button appears after panning and snaps the map back to you. Result / notes: pass (David, iPhone, 2026-11-08, after the iOS icon fix 8579cf1)
- [x] Tapping a building turns it solid red with a `BUILDING` card; everything else stays blue. Result / notes: pass (David, iPhone, 2026-11-07 screenshot: red building, card `Height: 125 m`)
- [x] Your position shows as the small red suited-figure marker with a faint accuracy ring. Result / notes: pass (David, iPhone, 2026-11-07 screenshots)
- [x] Saved place (e.g. Home): map shows the area, no Home marker, readout says cameras are not shown for saved places. Result / notes: pass as built (David, iPhone, 2026-11-10); decision 1 flipped below
- [x] CBD buildings with parts do not show doubled or flickering extrusions (building_part check). Result / notes: pass (David, iPhone, 2026-11-10: no doubling or flicker seen)
- [x] Provisional decisions confirmed or changed: saved places show no cameras; guard cameras excluded and private operator names dropped; `Source: OpenStreetMap` / colour-only building highlight / `BUILDING` title; server-side map tiles. Result / notes: (1) no cameras for saved places: FLIPPED, show cameras for every saved place except Home (Home stays hidden so its location never reaches the phone); (2) guards excluded / private operators dropped: FLIPPED, show guard posts and owner names unless OSM marks the owner private or the camera sits on a residential spot; (3) `Source: OpenStreetMap`, colour-only highlight, `BUILDING` title: CONFIRMED; (4) server-side tiles: CONFIRMED (David, 2026-11-10)

Gap re-check (David, iPhone, 2026-11-11, after 6dc96a0): pass on all four. Saved places other than Home show cameras and frame them (road cameras when no CCTV is mapped within 150 m: Monash, CBD and gym have none today); Home shows no cameras; edge labels flip left; an open card sits on the side covering the fewest tags. Owner names apply to CCTV cards only (seen on GPS); Victoria OSM has no guard posts today.
Device-check fix during the re-check: saved places with no nearby CCTV now frame the road cameras (6dc96a0).

Go / No-go: GO (17 pass, 2 skipped with cover; 2 provisional decisions flipped and shipped in 02-15/02-16; layout notes fixed in 02-17). Sign-off: David, 2026-11-11
