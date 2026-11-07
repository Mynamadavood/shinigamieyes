---
phase: 2
slug: 3d-map-hero-and-surveillance
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-11-07
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 02-RESEARCH.md § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (+pytest-asyncio, respx) server; vitest + happy-dom web (no WebGL: `vi.mock("maplibre-gl")`, keep map glue thin) |
| **Config file** | `pyproject.toml` `[tool.pytest.ini_options]`; `web/package.json` / `web/vitest.config.ts` |
| **Quick run command** | `uv run pytest -x -q` and `npm --prefix web test -- --run` |
| **Full suite command** | both quick commands + `npm --prefix web run build` + `bash deploy/verify.sh --local` (on the LXC, by David) + `bash deploy/verify.sh --remote https://shinigami.tail4c915f.ts.net` (dev PC) |
| **Estimated runtime** | ~30 seconds (local suites) |

---

## Sampling Rate

- **After every task commit:** quick run command (both suites)
- **After every plan wave:** full local suites + build
- **Before `/gsd:verify-work`:** full suite green + deploy verify + device UAT
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Each task in 02-01..02-14 carries its own `<verify><automated>` command or is an explicit checkpoint (02-01 package/glyph gate, 02-06 provisioning, 02-14 device gate); Wave 0 test files are created inside the plans that need them. Requirement → test map:

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| HUD-03 | Hero ≤1500 ms cap, skip on tap, cold open only, reduced-motion path | unit (fake timers) | `npm --prefix web test -- --run hero` | ❌ W0 | ⬜ pending |
| HUD-03 | First paint not blocked by hung IDB (WR-06) | unit | `npm --prefix web test -- --run app` | ❌ W0 | ⬜ pending |
| HUD-04 | `buildStyle` valid, Protomaps v4 source-layers, extrusion minzoom 15, same-origin URLs only | unit | `npm --prefix web test -- --run style` | ❌ W0 | ⬜ pending |
| HUD-05 | Tag rank/budget (≤20 full, ≤60 total), collision demotion, 30 m near-state, red cap 3 | unit | `npm --prefix web test -- --run tags` | ❌ W0 | ⬜ pending |
| HUD-05 | Card placement flip/shift, leader endpoints | unit | `npm --prefix web test -- --run card` | ❌ W0 | ⬜ pending |
| HUD-05 / D-07 | Long-press state machine (500 ms, 10 px cancel, 2nd finger cancel) | unit | `npm --prefix web test -- --run longpress` | ❌ W0 | ⬜ pending |
| D-05 | Drawer snap math, flick threshold | unit | `npm --prefix web test -- --run drawer` | ❌ W0 | ⬜ pending |
| HUD-10 | CSP unchanged (no `blob:`, no third-party host) | pytest | `uv run pytest server/tests/test_health.py` | ✅ extend | ⬜ pending |
| HUD-10 | `/tiles/{z}/{x}/{y}.mvt` 200 gzip, 204 outside, immutable headers, MVT+gzip asserted | pytest (tiny generated PMTiles) | `uv run pytest server/tests/test_tiles.py` | ❌ W0 | ⬜ pending |
| HUD-10 | Built `dist` has no external hosts (except attribution links) | verify.sh grep | `bash deploy/verify.sh --local` | ❌ W0 | ⬜ pending |
| SURV-01 | CCTV radius 150 m, uncapped count, zero-state copy, `pending` when data missing | pytest | `uv run pytest server/tests/test_cameras.py` | ❌ W0 | ⬜ pending |
| SURV-01 | Refresh job: guard excluded, direction words, operator privacy, relation join | pytest on `.osm` fixture | `uv run --group data pytest server/tests/test_refresh_cameras.py` | ❌ W0 | ⬜ pending |
| SURV-02 | Road cameras within 1 km, speed vs red-light typing, no alert phrasing | pytest | `uv run pytest server/tests/test_cameras.py` | ❌ W0 | ⬜ pending |
| D-14 | Camera items never in drawer rows (`selectVisible` filters on `geom`) | unit | `npm --prefix web test -- --run model` | ✅ extend | ⬜ pending |
| Privacy | `place=` profiles carry no camera items/distances, no coordinates | pytest | `uv run pytest server/tests/test_profile_readonly.py` | ✅ extend | ⬜ pending |
| D-15 | SW tile route: CacheFirst, 200-only, expiry | unit | `npm --prefix web test -- --run sw` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/tests/test_tiles.py` (generate a tiny PMTiles in-test)
- [ ] `server/tests/test_cameras.py`, `server/tests/test_refresh_cameras.py` + `server/tests/fixtures/enforcement.osm`
- [ ] `web/src/map/*.test.ts`, `web/src/ui/hero.test.ts`, `web/src/ui/drawer.test.ts`, SW route test, `model.test.ts` extension
- [ ] `deploy/verify.sh`: `/tiles` probe, glyph probe, no-external-hosts grep, CSP has no `blob:`
- [ ] Spike: real extract `--dry-run` size, feature-id check, `building_part` check
- [ ] Package installs gated by human-verify (maplibre-gl, workbox-*, PyPI pmtiles, osmium)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 3D look, pitch 60, smooth (30+ fps) with tags capped | HUD-04, SC5 | WebGL + real iPhone GPU | Device UAT gate: pan/zoom over CBD with tags on |
| Hero timing on a real cold open | HUD-03 | iOS launch path | Force-quit, launch, stopwatch ≤1.5 s, tap skips |
| Offline draws cached tiles, grid elsewhere | D-15 | Service worker + Tailscale off | View area, Tailscale off, reopen, pan beyond |
| Zero third-party requests | HUD-10 | Real network | Safari Web Inspector Network tab on device |
| Long-press pin, drawer gestures | D-05, D-07 | Touch | Device UAT |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-07 (plan check)
