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
- (filled in by plan 02-06 Task 3 and 02-14)

- [ ] Hero on cold open: force-quit, launch from the home screen; red eyes play for 1.5 s or less (stopwatch) with cached rows already visible underneath. Result / notes:
- [ ] Tapping anywhere (or the x box) during the hero skips straight to the map. Result / notes:
- [ ] Hero does not replay when returning to the app from the background. Result / notes:
- [ ] Reduced motion (Settings > Accessibility > Motion > Reduce Motion on): hero is a still frame of about 0.7 s, no flash, still skippable. Result / notes:
- [ ] 3D map look: tilted about 60 degrees, dark land, blue extruded buildings, street labels at zoom 16 and closer. Result / notes:
- [ ] Smoothness: pan and zoom over the CBD with tags on; no visible stutter, labelled tags capped (about 20, rest as small icons). Result / notes:
- [ ] Offline: view an area, turn Tailscale off, force-quit, reopen; tiles already seen still draw, unseen areas show the dark grid, OFF-GRID banner shows. Result / notes:
- [ ] Zero third-party requests: Safari Web Inspector Network tab (from the PC/Mac) on a cold open; every request host is the ts.net origin. Result / notes:
- [ ] Camera count readout reads like `6 cameras · 150 m · mapped, not exhaustive` and a CCTV card says `Mapped, not exhaustive.`. Result / notes:
- [ ] Speed/red-light camera card says `Static info only.` and `Source: OpenStreetMap`. Result / notes:
- [ ] Camera tags are blue, and turn red within about 30 m (at most 3 red at once). Result / notes:
- [ ] Long-press (half a second) drops a blue pin; the strip reads `PIN · Dropped pin`; `Use GPS` on its card returns to GPS. Result / notes:
- [ ] Drawer: drag the handle, flick, and tap the handle to move between peek, half and full. Result / notes:
- [ ] Recenter button appears after panning and snaps the map back to you. Result / notes:
- [ ] Tapping a building turns it solid red with a `BUILDING` card; everything else stays blue. Result / notes:
- [ ] Your position shows as the small red suited-figure marker with a faint accuracy ring. Result / notes:
- [ ] Saved place (e.g. Home): map shows the area, no Home marker, readout says cameras are not shown for saved places. Result / notes:
- [ ] CBD buildings with parts do not show doubled or flickering extrusions (building_part check). Result / notes:
- [ ] Provisional decisions confirmed or changed: saved places show no cameras; guard cameras excluded and private operator names dropped; `Source: OpenStreetMap` / colour-only building highlight / `BUILDING` title; server-side map tiles. Result / notes:

Sign-off (David): ______________________  Date: __________
