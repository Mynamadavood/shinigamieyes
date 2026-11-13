---
phase: 3
slug: transit
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-13
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `03-RESEARCH.md` section "Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest + pytest-asyncio + respx (server); vitest + happy-dom (web) |
| **Config file** | `pyproject.toml` `[tool.pytest.ini_options]`; `web/package.json` |
| **Quick run command** | `uv run pytest server/tests -x -q -k transit` ; `cd web && npx vitest run <touched test files>` |
| **Full suite command** | `uv run pytest` ; `cd web && npx vitest run && npm run build` |
| **Estimated runtime** | ~90 seconds (both suites) |

---

## Sampling Rate

- **After every task commit:** Run the relevant quick command (server `-k transit`, or the touched web test files)
- **After every plan wave:** Run `uv run pytest` and `cd web && npx vitest run`
- **Before `/gsd:verify-work`:** Both full suites plus `npm run build` must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

Task IDs are filled in by the planner; rows below are the requirement-level contract each plan must map onto.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0/1 | TRAN-01 | — | N/A | unit | `uv run pytest server/tests/test_refresh_transit.py -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | TRAN-01 | — | N/A | unit | `uv run pytest server/tests/test_transit_store.py -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | TRAN-01, D-04 | Home location leak | Home pin gets no transit layers; pins get no coordinates; coordinates not logged | integration | `uv run pytest server/tests/test_transit_profile.py -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | TRAN-02 | Key leak | Signed URL built correctly from FAKE-key vectors | unit | `uv run pytest server/tests/test_ptv_signing.py -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | TRAN-02 | Key leak | No devid/signature in logs, exceptions or health output; 403/429/500/timeout handled | unit | `uv run pytest server/tests/test_ptv_client.py -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | TRAN-02 | Upstream abuse | Only watched stops polled; idle and no-key make zero calls | unit | `uv run pytest server/tests/test_transit_poll.py -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | PLAT-04 | — | `/api/profile` makes no network call | integration | `uv run pytest server/tests/test_profile_readonly.py -x` | ✅ extend | ⬜ pending |
| TBD | TBD | 2 | TRAN-02, D-04 | Home location leak | Stream sends per-subscriber transit; Home subscriber gets none | integration | `uv run pytest server/tests/test_runtime.py server/tests/test_stream.py -x` | ✅ extend | ⬜ pending |
| TBD | TBD | 2 | TRAN-02 | — | N/A | unit | `cd web && npx vitest run src/model.test.ts src/ui/next-list.test.ts src/ui/readouts.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | 3 | TRAN-03 | Tracking people | No vehicle or driver id in payload; stale positions dropped | unit | `uv run pytest server/tests/test_transit_vehicles.py -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | 3 | TRAN-03 | — | N/A | unit | `cd web && npx vitest run src/map/tags.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | 3 | TRAN-03 | CSP | No innerHTML or inline style attribute | unit | `cd web && npx vitest run src/map/edge-pointers.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 3 | TRAN-04 | — | N/A | unit | `uv run pytest server/tests/test_transit_disruptions.py -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | 3 | TRAN-04 | — | N/A | unit | `cd web && npx vitest run src/ui/readouts.test.ts src/map/transit-card.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | D-04 | Home location leak | Client strips transit layers for camera-off places (cached and stream) | unit | `cd web && npx vitest run src/app.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | 4 | HUD-10 | — | Health reports transit store and key state without coordinates or key material | smoke | `bash deploy/verify.sh --local` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/tests/fixtures/ptv/*.json` — schema-derived (not recorded) fixtures: stops, tram/train/bus departures, pattern run, disruptions, errors
- [ ] Tiny GTFS fixture zips for the stop refresh job (tram pole pair, parent-station train, rail-replacement row, bus opposite pair)
- [ ] `server/tests/conftest.py` — `ptv_settings` fixture (fake devid/key) and a transit store fixture
- [ ] `scripts/ptv_smoke.py` — manual post-key smoke: 3 calls, prints status and shapes only, never URLs or ids

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Edge pointers, moving vehicle markers, red "leave now" row on the real phone | TRAN-02, TRAN-03 | Needs iPhone Safari, real GPS and motion | Open the app near a tram stop; check pointers aim at off-screen stops, a marker moves, the row turns red at leave time |
| First live PTV call after the key is added | TRAN-02, TRAN-04 | Needs David's key on the CT | David runs `scripts/ptv_smoke.py` on the CT; compare printed shapes with the fixtures |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
