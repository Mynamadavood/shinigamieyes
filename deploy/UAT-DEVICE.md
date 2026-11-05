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

- [ ] Cold open from the home screen shows the cached profile in under 1 s (Safari Web Inspector or stopwatch). Result / notes:
- [ ] Golden/blue hour and UV rows tick every second. Result / notes:
- [ ] Background the app 10+ minutes (10-minute background), reopen: countdowns match expected times. Result / notes:
- [ ] Tailscale off: `OFF-GRID · last sync Xm ago` banner shows, rows keep ticking. Result / notes:
- [ ] Tailscale back on: banner clears without reload. Result / notes:
- [ ] GPS prompt behaviour in standalone mode recorded (prompts on every cold launch? after 24 h? on resume?). Result / notes:
- [ ] Deny GPS: `GPS off` shows and the Place Sheet opens once. Result / notes:
- [ ] Pick `Monash Clayton`: profile changes. Result / notes:
- [ ] Address search for a street returns results. Result / notes:
- [ ] The home-screen app installed at Gate 1 updates to the new build after force-quit and reopen, without reinstalling. Result / notes:
- [ ] Full Proxmox host reboot: app reachable again with no manual steps (PLAT-07). Result / notes:
- [ ] Stale/expired rows dim/pulse as specified. Result / notes:

Sign-off (David): ______________________  Date: __________
