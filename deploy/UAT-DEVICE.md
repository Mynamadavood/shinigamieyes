# Device UAT gates

Record a result or note under each item.

## Gate 1: Skeleton go/no-go (plan 01-03)

- [ ] Safari opens `https://shinigami.<tailnet>.ts.net` with no TLS error (Pi-hole DNS and AdGuard present). Result / notes:
- [ ] `/api/health` JSON shows. Result / notes:
- [ ] Share, Add to Home Screen installs with the black/red icon. Result / notes:
- [ ] Launch is full-screen, status bar black-translucent, content not under the notch or home indicator. Result / notes:
- [ ] SSE probe counter ticks once per second in standalone mode for at least 10 s. Result / notes:
- [ ] With Tailscale toggled off the URL does not load. Result / notes:
- [ ] `pct reboot <CTID>`, then the app works again without manual steps. Result / notes:

Go / No-go: ______

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
