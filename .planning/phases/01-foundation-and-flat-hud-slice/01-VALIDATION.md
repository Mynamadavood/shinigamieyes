---
phase: 1
slug: foundation-and-flat-hud-slice
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-05
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `01-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Backend: pytest 9.2 + pytest-asyncio 1.4 + respx · Frontend: vitest 5.1 + fake-indexeddb + happy-dom |
| **Config file** | none yet. Wave 0 creates `pyproject.toml [tool.pytest.ini_options]` (`asyncio_mode="auto"`) and `web/vitest.config.ts` |
| **Quick run command** | `uv run pytest -x -q && npm --prefix web run test -- --run` |
| **Full suite command** | `uv run pytest && npm --prefix web run test -- --run && npm --prefix web run build` |
| **Deployed smoke** | `deploy/verify.sh` (health, serve status, funnel off, loopback bind, restart policy). Run from the dev PC (on the tailnet) or on the LXC |
| **Estimated runtime** | ~30 seconds (quick), ~90 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run the full suite command
- **Before `/gsd:verify-work`:** Full suite green, `deploy/verify.sh` clean on the LXC, and the device UAT checklist signed off by David
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Filled in by the planner and executor as task IDs are assigned. The requirement → test mapping:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| PLAT-01 | Only reachable on the tailnet; app binds 127.0.0.1; funnel off; FQDN = `shinigami.<tailnet>.ts.net` | smoke | `deploy/verify.sh` | ❌ W0 | ⬜ pending |
| PLAT-02 | Manifest valid (`display: standalone`, `start_url`, icons, apple meta tags) | unit | `npm --prefix web run test -- --run manifest` | ❌ W0 | ⬜ pending |
| PLAT-03 | IndexedDB last profile renders before network; replaced after fetch; SSE replaces a layer without reload | vitest (mocked fetch/EventSource) | `npm --prefix web run test -- --run store net` | ❌ W0 | ⬜ pending |
| PLAT-04 | `/profile` makes no outbound HTTP; in-process p95 ≤ 50 ms (budget 300 ms) | pytest + timing | `uv run pytest server/tests/test_profile_readonly.py` | ❌ W0 | ⬜ pending |
| PLAT-05 | Fetch timeout ≤ 4 s → OFF-GRID banner, cache kept, ticking continues; recovery clears banner | vitest (fake timers) | `npm --prefix web run test -- --run offgrid` | ❌ W0 | ⬜ pending |
| PLAT-06 | 100 m hysteresis; denied/timeout → pin path; places endpoint; geocode proxy cache + 1 req/s + UA | vitest + pytest (respx) | `npm --prefix web run test -- --run location` ; `uv run pytest -k geocode` | ❌ W0 | ⬜ pending |
| PLAT-07 | systemd `Restart=always`, `WantedBy=multi-user.target`; CT `onboot: 1`; survives `systemctl kill` | smoke | `deploy/verify.sh` | ❌ W0 | ⬜ pending |
| HUD-01 | Adaptive formatter boundaries; remaining = target − (now + offset); recompute after simulated 10-min background | vitest (fake timers) | `npm --prefix web run test -- --run format ticker clock` | ❌ W0 | ⬜ pending |
| HUD-02 | Expired → red pulse then removed; stale → dim + `Xh old`; first-unexpired per group | vitest (DOM) | `npm --prefix web run test -- --run list freshness` | ❌ W0 | ⬜ pending |
| ENV-04 | ARPANSA parse (BOM, UTC, status); clear-sky UV ≥ 3 window from Open-Meteo fixture; fallback; stale | pytest (fixtures + respx) | `uv run pytest -k "arpansa or uv_window"` | ❌ W0 | ⬜ pending |
| ENV-07 | Golden/blue boundaries for fixed lat/lon vs reference; date rollover; DST days (Oct/Apr) | pytest | `uv run pytest -k sun` | ❌ W0 | ⬜ pending |
| SSE | `hello` first; ping events; layer event after provider refresh; restart not blocked by open stream | pytest-asyncio | `uv run pytest -k stream` | ❌ W0 | ⬜ pending |
| Privacy | Access log disabled; no coordinates in app logs; home coords not in git | pytest (caplog) | `uv run pytest -k nologging` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `pyproject.toml` pytest config; `server/tests/conftest.py` (app factory, frozen clock, respx mock, tmp SQLite)
- [ ] `server/tests/fixtures/uvvalues.xml` (real file including the BOM), `server/tests/fixtures/open_meteo_uv.json`
- [ ] `web/vitest.config.ts`, `web/src/**/*.test.ts` stubs, fake-indexeddb setup
- [ ] `deploy/verify.sh`, `deploy/CHECKLIST.md`, `deploy/UAT-DEVICE.md`
- [ ] Framework installs (pytest, pytest-asyncio, respx, vitest, fake-indexeddb, happy-dom)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| iPhone opens `https://shinigami.<tailnet>.ts.net` with valid TLS (Pi-hole DNS, AdGuard Safari ext present) | PLAT-01 | Real device + DNS environment (tailscale#19147) | Open in Safari, check no cert/SSL error; if failing, follow the diagnosis ladder in 01-RESEARCH.md |
| Home-screen install launches full-screen, safe-area correct | PLAT-02 | iOS standalone behaviour | Share → Add to Home Screen; launch; check notch/home-indicator padding |
| Cold open < 1 s shows cached profile | PLAT-03 | Real device timing | Open from home screen after prior use; stopwatch / Safari Web Inspector |
| OFF-GRID with Tailscale disconnected | PLAT-05 | Network state on device | Toggle Tailscale off; reopen; banner shows, items keep ticking |
| Countdowns correct after 10+ min backgrounded | HUD-01 | iOS suspension | Background app 10 min; reopen; compare with expected times |
| GPS prompt behaviour in standalone mode | PLAT-06 | iOS permission UX | Record whether iOS re-prompts; denial falls back to pin |
| Survives Proxmox host reboot | PLAT-07 | Host reboot | Reboot host; app reachable again without manual steps |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
