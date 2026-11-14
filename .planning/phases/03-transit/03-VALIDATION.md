---
phase: 3
slug: transit
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-11-13
updated: 2026-11-14
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `03-RESEARCH.md` section "Validation Architecture". Task IDs filled by the planner (plans 03-01..03-20).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + pytest-asyncio + respx (server); vitest + happy-dom (web) |
| **Config file** | `pyproject.toml` `[tool.pytest.ini_options]`; `web/package.json` |
| **Quick run command** | `uv run pytest server/tests -x -q -k transit` ; `npm --prefix web test -- --run <touched test files>` |
| **Full suite command** | `uv run pytest -q` ; `npm --prefix web test -- --run && npm --prefix web run build` |
| **Estimated runtime** | ~90 seconds (both suites) |

vitest can be flaky under load: re-run once before treating a failure as real.

---

## Sampling Rate

- **After every task commit:** Run the task's `<automated>` command (server `-k transit` or the touched web test files)
- **After every plan wave:** Run `uv run pytest -q` and `npm --prefix web test -- --run`
- **Before `/gsd:verify-work`:** Both full suites plus `npm run build` must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-T1 | 03-01 | 1 | TRAN-01, D-22 | T-03-01-01..03 | Shrink guard, fixed member names, counts-only output | unit | `uv run pytest server/tests/test_refresh_transit.py -x -q` | ❌ W0 (created in task) | ⬜ pending |
| 03-01-T2 | 03-01 | 1 | TRAN-01, D-01..03, D-05 | T-03-01-03 | No coordinates logged | unit | `uv run pytest server/tests/test_transit_store.py -x -q` | ❌ W0 (created in task) | ⬜ pending |
| 03-02-T1 | 03-02 | 1 | TRAN-02, D-23 | T-03-02-03/04 | touch, not a (0,0) layer; nudge single-flight + 10 s gap | integration | `uv run pytest server/tests/test_runtime.py -x -q` | ✅ extend | ⬜ pending |
| 03-02-T2 | 03-02 | 1 | TRAN-02, D-04, D-21 | T-03-02-01/02 | Home subscriber gets no exact frame; no coords in logs | integration | `uv run pytest server/tests/test_stream.py server/tests/test_places.py server/tests/test_profile_readonly.py -x -q` | ✅ extend | ⬜ pending |
| 03-03-T1 | 03-03 | 1 | TRAN-01 | T-03-03-03 | Same-origin original sprites | unit | `npm --prefix web test -- --run src/transit.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 03-03-T2 | 03-03 | 1 | TRAN-01, D-05, D-13 | T-03-03-01/02 | No innerHTML / style attribute | unit | `npm --prefix web test -- --run src/map/tags.test.ts src/map/transit-card.test.ts src/map/camera-card.test.ts` | ✅ extend + ❌ W0 | ⬜ pending |
| 03-04-T1 | 03-04 | 1 | TRAN-01, D-03 | T-03-04-02 | No transit rows without transit_stops | unit | `npm --prefix web test -- --run src/model.test.ts src/ui/next-list.test.ts src/ui/readouts.test.ts` | ✅ extend | ⬜ pending |
| 03-04-T2 | 03-04 | 1 | D-04, D-21 | T-03-04-01 | Client strips transit layers for camera-off places (cached, stream, save) | unit | `npm --prefix web test -- --run src/app.test.ts src/offgrid.test.ts` | ✅ extend | ⬜ pending |
| 03-05-T1 | 03-05 | 2 | TRAN-01, D-19 | T-03-05-01 | SecretStr; app runs with no key | unit | `uv run pytest server/tests/test_transit_profile.py -x -q` | ❌ W0 (created in task) | ⬜ pending |
| 03-05-T2 | 03-05 | 2 | TRAN-01, D-04, D-21 | T-03-05-01/02 | Home pin gets no transit layers; health has no ids/coords/secrets | integration | `uv run pytest -q` | ✅ extend | ⬜ pending |
| 03-06-T1 | 03-06 | 2 | TRAN-02 | T-03-06-01/02/03 | FAKE-key vectors; no devid/key/signature/URL in errors or logs; rate guard | unit | `uv run pytest server/tests/test_ptv_signing.py server/tests/test_ptv_client.py -x -q` | ❌ W0 (created in task) | ⬜ pending |
| 03-06-T2 | 03-06 | 2 | TRAN-02/03/04, D-24 | T-03-06-04/05/06 | Tolerant parse; vehicle descriptors dropped; fixtures labelled schema-derived | unit | `uv run pytest server/tests/test_ptv_client.py -x -q` | ❌ W0 (fixtures created in task) | ⬜ pending |
| 03-07-T1 | 03-07 | 2 | TRAN-02, D-08, D-09, D-10 | T-03-07-03 | One red leave-now; stale never red | unit | `npm --prefix web test -- --run src/model.test.ts` | ✅ extend | ⬜ pending |
| 03-07-T2 | 03-07 | 2 | TRAN-02, D-09, D-10 | T-03-07-01/02 | No innerHTML / style attribute | unit | `npm --prefix web test -- --run src/ui/next-list.test.ts src/model.test.ts` | ✅ extend | ⬜ pending |
| 03-08-T1 | 03-08 | 2 | TRAN-01, D-14 | T-03-08-01/03 | CSSOM custom properties only | unit | `npm --prefix web test -- --run src/map/edge-pointers.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 03-08-T2 | 03-08 | 2 | TRAN-01, D-13, D-14 | T-03-08-02 | No pointers without transit_stops | unit | `npm --prefix web test -- --run src/map` | ✅ extend | ⬜ pending |
| 03-09-T1 | 03-09 | 3 | TRAN-02, D-18, D-23 | T-03-09-03/04 | Watch set holds ids only, TTL 180 s, max 6 | unit | `uv run pytest server/tests/test_transit_poll.py -x -q` | ❌ W0 (created in task) | ⬜ pending |
| 03-09-T2 | 03-09 | 3 | TRAN-02, PLAT-04, D-19, D-23 | T-03-09-01/04/05/06 | Idle and no-key = zero calls; /api/profile no network; no secrets in logs/health/profile/stream; Home request leaves watch set empty, no nudge | integration | `uv run pytest -q` | ✅ extend | ⬜ pending |
| 03-10-T1 | 03-10 | 3 | TRAN-02, D-07 | T-03-10-02/04 | Ticker only while open; no style attribute | unit | `npm --prefix web test -- --run src/map/card.test.ts` | ✅ extend | ⬜ pending |
| 03-10-T2 | 03-10 | 3 | TRAN-02, D-07, D-08, D-10, D-17 | T-03-10-01/03 | No run refs or ids in card text | unit | `npm --prefix web test -- --run src/map` | ✅ extend | ⬜ pending |
| 03-11-T1 | 03-11 | 3 | TRAN-02, D-06 | T-03-11-01 | focusStop false without transit layer | unit | `npm --prefix web test -- --run src/map/map.test.ts` | ✅ extend | ⬜ pending |
| 03-11-T2 | 03-11 | 3 | TRAN-02, D-06 | T-03-11-02 | Safe before map ready | unit | `npm --prefix web test -- --run src/app.test.ts` | ✅ extend | ⬜ pending |
| 03-12-T1 | 03-12 | 3 | TRAN-01, D-22 | T-03-12-01/02/05 | Refuse root, hardened unit, zip deleted, placeholders only | smoke | `bash -n deploy/refresh-transit.sh && bash -n deploy/deploy.sh` (+ CR scan, grep gates) | ❌ W0 (created in task) | ⬜ pending |
| 03-12-T2 | 03-12 | 3 | TRAN-01/02/04, D-21, D-24 | T-03-12-04 | Home transit leak fails deploy; no key material in health/profile | smoke | `bash -n deploy/verify.sh` (+ grep gates); live: `bash deploy/verify.sh --local` in 03-19 | ✅ extend | ⬜ pending |
| 03-12-T3 | 03-12 | 3 | TRAN-02, D-24 | T-03-12-03 | Smoke output: >= 4 step lines (ok/fail/skip) + optional run_status_values hint; no URL/ids/key | unit | `uv run pytest server/tests/test_ptv_smoke.py -x -q` | ❌ W0 (created in task) | ⬜ pending |
| 03-13-T1 | 03-13 | 3 | TRAN-04, D-16, D-17 | T-03-13-02 | End rows never red | unit | `npm --prefix web test -- --run src/model.test.ts src/ui/readouts.test.ts` | ✅ extend | ⬜ pending |
| 03-13-T2 | 03-13 | 3 | TRAN-04, D-16, D-17 | T-03-13-01 | No innerHTML | unit | `npm --prefix web test -- --run src/ui/next-list.test.ts` | ✅ extend | ⬜ pending |
| 03-14-T1 | 03-14 | 4 | TRAN-04, D-17 | — | N/A (pure classifier) | unit | `uv run pytest server/tests/test_transit_disruptions.py -x -q -k classify` | ❌ W0 (created in task) | ⬜ pending |
| 03-14-T2 | 03-14 | 4 | TRAN-04, D-15, D-16 | T-03-14-01..04 | Filtered to shown routes/stops; no url field; zero calls idle/no-key; new watch ref nudges transit_disruptions (first-open lag); Home: no nudge | integration | `uv run pytest -q` | ❌ W0 + ✅ extend | ⬜ pending |
| 03-15-T1 | 03-15 | 4 | TRAN-04, D-16, D-17 | T-03-15-01 | No anchors / innerHTML in sheet | unit | `npm --prefix web test -- --run src/ui/readouts.test.ts src/ui/disruption-sheet.test.ts` | ❌ W0 + ✅ extend | ⬜ pending |
| 03-15-T2 | 03-15 | 4 | TRAN-04, D-16 | T-03-15-02/03 | Readout/attribution hidden for Home | unit | `npm --prefix web test -- --run && npm --prefix web run build` | ✅ extend | ⬜ pending |
| 03-16-T1 | 03-16 | 4 | TRAN-04, D-16, D-17 | T-03-16-01 | Alert text trimmed, textContent | unit | `npm --prefix web test -- --run src/map/transit-card.test.ts` | ✅ extend | ⬜ pending |
| 03-16-T2 | 03-16 | 4 | TRAN-04, D-16, D-17 | T-03-16-02 | Red badge only for severity 3 | unit | `npm --prefix web test -- --run src/map` | ✅ extend | ⬜ pending |
| 03-17-T1 | 03-17 | 5 | TRAN-03, D-11, D-18, D-20 | T-03-17-01/04 | No vehicle/run ids; no train markers; est labelled | unit | `uv run pytest server/tests/test_transit_vehicles.py -x -q` | ❌ W0 (created in task) | ⬜ pending |
| 03-17-T2 | 03-17 | 5 | TRAN-03, D-11, D-12 | T-03-17-01/02/03 | Pattern call budget; zero calls idle/no-key; /api/profile no network; Home and cameras=false (all 4 providers): no transit_ keys/frames, empty watch set, no nudges, zero respx calls | integration | `uv run pytest -q` | ✅ extend | ⬜ pending |
| 03-18-T1 | 03-18 | 5 | TRAN-03, D-12, D-13, D-20 | T-03-18-02/03/04 | Vehicles never red; no style attribute | unit | `npm --prefix web test -- --run src/map/tags.test.ts` | ✅ extend | ⬜ pending |
| 03-18-T2 | 03-18 | 5 | TRAN-03, D-12, D-20 | T-03-18-01 | No ids / "stops away" in vehicle card | unit | `npm --prefix web test -- --run && npm --prefix web run build` | ✅ extend | ⬜ pending |
| 03-19-T1 | 03-19 | 6 | all | T-03-19-01/04 | Push only after "push"; no zip tracked | gate | `uv run pytest -q && uv run ruff check && npm --prefix web test -- --run && npm --prefix web run build && bash -n deploy/verify.sh` | ✅ | ⬜ pending |
| 03-19-T2 | 03-19 | 6 | HUD-10, D-21 | T-03-19-02/03 | Health/profile without key material; Home leak check PASS live | smoke | `bash deploy/verify.sh --remote https://shinigami.tail4c915f.ts.net` | ✅ extend | ⬜ pending |
| 03-20-T1 | 03-20 | 7 | TRAN-02/04, D-19, D-24 | T-03-20-01 | Key added by David only; redacted smoke | manual + smoke | `ssh shinigami 'curl -s http://127.0.0.1:8000/api/health'` (ptv state) | ✅ | ⬜ pending |
| 03-20-T2 | 03-20 | 7 | TRAN-01..04, D-04 | T-03-20-02 | No transit UI at Home on device; David confirms countdown format, D-08 catch grace, D-09 single red row (notes, not blockers) | manual | Device UAT (deploy/UAT-DEVICE.md Gate 4) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Sampling continuity: every auto task has an `<automated>` command; the only manual tasks are the two checkpoints in 03-20 (after automated verify in 03-19).

---

## Wave 0 Requirements

Wave 0 artefacts are created inside the first task that needs them (TDD tasks write the test first), so no separate Wave 0 plan exists:

- [ ] `server/tests/fixtures/ptv/*.json` + `README.md`: schema-derived (not recorded) fixtures (03-06-T2)
- [ ] `server/tests/gtfs_fixture.py`: tiny nested GTFS zips generated in tmp_path (tram pole pair, parent-station train, rail-replacement row, bus opposite pair, ignored 1/ folder) (03-01-T1)
- [ ] `server/tests/conftest.py`: FakeRuntime.nudge (03-02-T1); settings with `transit_stops_path`, `ptv_devid=None`, `ptv_key=None` and a transit store file helper (03-05-T1)
- [ ] `server/shinigami/transit/smoke.py` + `scripts/ptv_smoke.py`: manual post-key smoke, 3 calls + agreement check, prints status and shapes only (03-12-T3)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Edge pointers, moving vehicle markers, red "leave now" row, Home dark, on the real phone | TRAN-01..04, D-04 | Needs iPhone Safari, real GPS and motion | 03-20 Task 2 (Gate 4 in deploy/UAT-DEVICE.md) |
| First live PTV call after the key is added | TRAN-02, TRAN-04, D-24 | Needs David's key on the CT | 03-20 Task 1: David runs `scripts/ptv_smoke.py` on the CT; compare printed shapes with the fixtures |
| Countdown format (`06:12` zero-padded vs `6:12`) | TRAN-02 | David's preference | 03-20 Task 2 item 6: recorded as a note, not a blocker |
| 30 s catch grace vs strict walk-time cut-off (D-08) | TRAN-02 | Deviation from locked wording, follows UI-SPEC | 03-20 Task 2 item 7; recorded in 03-07-SUMMARY |
| Single red leave-now row (D-09) | TRAN-02 | Deviation from locked wording, follows UI-SPEC | 03-20 Task 2 item 8; recorded in 03-07-SUMMARY |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner sign-off 2026-11-14 (pending checker)
