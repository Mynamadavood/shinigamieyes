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

Task-level map (task IDs = `{plan}-T{n}`; commands copied from each plan's `<automated>` verify):

| Task ID | Wave | Requirement | Behavior | Test Type | Automated Command | Status |
|---------|------|-------------|----------|-----------|-------------------|--------|
| 01-01-T1 | 1 | (gate) | Package legitimacy checkpoint before first install | checkpoint | `test ! -f uv.lock && test ! -d web/node_modules` | ⬜ pending |
| 01-01-T2 | 1 | PLAT-01 | FastAPI factory, /api/health, /api/_sse_probe, headers | pytest | `uv run pytest server/tests/test_health.py -q && uv run ruff check server` | ⬜ pending |
| 01-01-T3 | 1 | PLAT-02 | Vite PWA shell, manifest, iOS meta, SW | vitest + build | `npm --prefix web run test -- --run manifest && npm --prefix web run build` | ⬜ pending |
| 01-02-T1 | 1 | PLAT-01, PLAT-07 (+PLAT-04 host probe) | LXC/setup/deploy scripts, systemd unit, verify.sh incl. profile_p95 | static (bash -n + grep) | `bash -n deploy/*.sh && grep -q "Restart=always" deploy/shinigami.service` (full chain in 01-02 Task 1) | ⬜ pending |
| 01-02-T2 | 1 | PLAT-01, PLAT-07 | CHECKLIST, UAT-DEVICE gates, config examples | static (grep) | `grep -q "Gate 1" deploy/UAT-DEVICE.md && grep -q "Gate 2" deploy/UAT-DEVICE.md` | ⬜ pending |
| 01-03-T1 | 2 | PLAT-01, PLAT-07 | David provisions LXC + deploys skeleton | checkpoint + smoke | `bash deploy/verify.sh --remote "https://$SHINIGAMI_FQDN"` | ⬜ pending |
| 01-03-T2 | 2 | PLAT-01, PLAT-07 | Remote verification of skeleton from dev PC | smoke | `bash deploy/verify.sh --remote "https://$SHINIGAMI_FQDN"` (fail 0) | ⬜ pending |
| 01-03-T3 | 2 | PLAT-01, PLAT-02 | iPhone Gate 1 | manual + sign-off grep | `grep -A60 "Gate 1" deploy/UAT-DEVICE.md \| grep -qiE "signed"` | ⬜ pending |
| 01-04-T1 | 3 | ENV-07 | Item/Layer/Profile contract, Provider base, Sun provider | pytest | `uv run pytest server/tests/test_schema.py server/tests/test_sun.py -q` | ⬜ pending |
| 01-04-T2 | 3 | PLAT-04 | Read-only /api/profile, no outbound, no logging, in-process p95 | pytest + timing | `uv run pytest server/tests/test_profile_readonly.py server/tests/test_nologging.py -q` | ⬜ pending |
| 01-05-T1 | 4 | HUD-01 | Formatter, clock offset, boundary-aligned ticker | vitest (fake timers) | `npm --prefix web run test -- --run format clock ticker` | ⬜ pending |
| 01-05-T2 | 4 | HUD-01 | HUD shell + next-list wired to /api/profile | vitest + build | `npm --prefix web run test -- --run && npm --prefix web run build` | ⬜ pending |
| 01-06-T1 | 4 | ENV-04 | SQLite store + ARPANSA provider | pytest (fixtures + respx) | `uv run pytest server/tests/test_store.py server/tests/test_arpansa.py -q` | ⬜ pending |
| 01-06-T2 | 4 | ENV-04 | UV protection window (clear-sky, fallback) | pytest (respx) | `uv run pytest server/tests/test_uv_window.py -q` | ⬜ pending |
| 01-06-T3 | 4 | PLAT-04, ENV-04 | Runtime, event bus, lifespan, read-only profile preserved | pytest | `uv run pytest -q` | ⬜ pending |
| 01-07-T1 | 5 | HUD-02 | Freshness rules, view-model states | vitest | `npm --prefix web run test -- --run freshness model` | ⬜ pending |
| 01-07-T2 | 5 | HUD-02, HUD-01 | Expiry pulse/dim/drop, stale/urgent, loading/empty | vitest (DOM) + build | `npm --prefix web run test -- --run list && npm --prefix web run build` | ⬜ pending |
| 01-08-T1 | 6 | PLAT-03 (SSE) | /api/stream hello/layers/ping/shutdown | pytest-asyncio | `uv run pytest -k stream -q` | ⬜ pending |
| 01-08-T2 | 6 | PLAT-03 | IndexedDB cache + stream client reconnect | vitest (fake-indexeddb) | `npm --prefix web run test -- --run store net` | ⬜ pending |
| 01-08-T3 | 6 | PLAT-05, PLAT-03 | OFF-GRID banner + cached-first boot | vitest (fake timers) + build | `npm --prefix web run test -- --run offgrid && npm --prefix web run build` | ⬜ pending |
| 01-09-T1 | 7 | PLAT-06 | places.toml, /api/places, place-aware profile/stream | pytest | `uv run pytest server/tests/test_places.py -q` | ⬜ pending |
| 01-09-T2 | 7 | PLAT-06 | Location state machine, 100 m hysteresis | vitest | `npm --prefix web run test -- --run location` | ⬜ pending |
| 01-09-T3 | 7 | PLAT-06 | Location strip + Set Location sheet | vitest + build | `npm --prefix web run test -- --run location && npm --prefix web run build` | ⬜ pending |
| 01-10-T1 | 8 | PLAT-06 | Nominatim proxy /api/geocode (cache, 1 req/s, UA) | pytest (respx) | `uv run pytest -k geocode -q` | ⬜ pending |
| 01-10-T2 | 8 | PLAT-06 | Address search in Set Location sheet | vitest + build | `npm --prefix web run test -- --run location && npm --prefix web run build` | ⬜ pending |
| 01-11-T1 | 9 | PLAT-07 | Push + redeploy full app | full suite + checkpoint | `uv run pytest -q && npm --prefix web run test -- --run && npm --prefix web run build` | ⬜ pending |
| 01-11-T2 | 9 | PLAT-01, PLAT-03, PLAT-04, PLAT-05, PLAT-06 | Remote verification incl. profile_p95 <= 300 ms on host | smoke | `bash deploy/verify.sh --remote "https://$SHINIGAMI_FQDN"` (fail 0, skip 0, PASS profile_p95) | ⬜ pending |
| 01-11-T3 | 9 | all Phase 1 manual-only | iPhone Gate 2 + host reboot | manual + sign-off grep | `grep -A80 "Gate 2" deploy/UAT-DEVICE.md \| grep -qiE "signed"` | ⬜ pending |

> `nyquist_compliant` and `wave_0_complete` stay `false` at planning time on purpose: the executor flips them to `true` after Wave 0 (01-01/01-02 test scaffolds + verify.sh) has run green and every row above has an existing test file.

Requirement → test mapping:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| PLAT-01 | Only reachable on the tailnet; app binds 127.0.0.1; funnel off; FQDN = `shinigami.<tailnet>.ts.net` | smoke | `deploy/verify.sh` | ❌ W0 | ⬜ pending |
| PLAT-02 | Manifest valid (`display: standalone`, `start_url`, icons, apple meta tags) | unit | `npm --prefix web run test -- --run manifest` | ❌ W0 | ⬜ pending |
| PLAT-03 | IndexedDB last profile renders before network; replaced after fetch; SSE replaces a layer without reload | vitest (mocked fetch/EventSource) | `npm --prefix web run test -- --run store net` | ❌ W0 | ⬜ pending |
| PLAT-04 | `/profile` makes no outbound HTTP; in-process p95 ≤ 50 ms (budget 300 ms); on-host p95 ≤ 300 ms over 20 requests | pytest + timing; smoke | `uv run pytest server/tests/test_profile_readonly.py` ; `deploy/verify.sh` (`profile_p95`) | ❌ W0 | ⬜ pending |
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
