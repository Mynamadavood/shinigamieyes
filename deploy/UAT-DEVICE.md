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
- [ ] Stale/expired rows dim/pulse as specified. Result / notes:

Sign-off (David): ______________________  Date: __________
