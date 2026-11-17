---
phase: 03-transit
verified: 2026-11-18T00:30:00Z
status: human_needed
score: 4/4 roadmap truths verified (code); 1 item awaits device re-check
overrides_applied: 0
human_verification:
  - test: "Edge pointers (D-14) after deploying the review fixes (CR-W1 b18f349, WR-W5 617535a)"
    expected: "With a nearby stop off-screen, an arrow chip 'Name · 900 m' shows on the screen edge, points the right way under the 60 degree follow pitch, hides while a sheet is open, and tapping it moves the map to the stop"
    why_human: "The old code never showed pointers in the real app (CR-W1), yet UAT item 1 recorded a pass. The fix is jsdom-tested only and is not deployed. CT 110 still runs 93d55ae."
  - test: "Vehicle fade-out (WR-W4 f7e84d3) on the phone"
    expected: "A vehicle whose position is older than about 2 min fades to the fade opacity instead of staying fully opaque"
    why_human: "jsdom cannot run the CSS cascade"
  - test: "Real-position bus marker (optional, noted in UAT)"
    expected: "At least one bus marker comes from a real PTV position, not an estimate"
    why_human: "The smoke sample showed runs_with_position=0. Whether David has seen a real-position bus is not recorded."
---

# Phase 3: Transit Verification Report

**Phase goal:** David can see how to get moving from where he stands: nearby stops, live departures, approaching vehicles and disruptions.
**Verified:** 2026-11-18 against HEAD (includes the 31 review-fix commits). Not pushed, not deployed.
**Status:** human_needed
**Re-verification:** No, initial.

Note: ROADMAP marks this phase `Mode: mvp`, but the goal is not in "As a ..., I want to ..., so that ..." form. I verified against the roadmap success criteria with the standard method. This is a process warning, not a delivery gap.

## Goal Achievement: roadmap truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Nearest train, tram and bus stops with distance and walk time (TRAN-01) | VERIFIED (pointer part: human) | `TransitStopsProvider` (providers/transit.py:46) calls `service.nearby()` over `TransitStore` (GTFS-built stops, per-mode limits, direction pairs). It emits `stop:{id}` items and "none nearby" rows per mode. It is registered in main.py:63. The web consumes it in `web/src/transit.ts`, `map/tags.ts` and `ui/next-list.ts`. UAT item 1 passed on device. |
| 2 | Next departures with live countdowns, each labelled live or scheduled (TRAN-02) | VERIFIED | `TransitDeparturesProvider` polls PTV through `PtvClient` and serves from cache. `query()` is sync. The web renders ticking rows with LIVE/SCHED and "leave in". Live smoke: 12 live / 48 scheduled. UAT item 2 passed. |
| 3 | Vehicles approaching the nearest stops visible on the map (TRAN-03) | VERIFIED | `TransitVehiclesProvider` and `transit/vehicles.py` (real PTV positions plus estimated trams, D-20). Markers are rendered in `map/tags.ts` and open a card. UAT item 3 passed. Whether a real-position bus was seen is unrecorded (human item 3). |
| 4 | Current disruptions on nearby routes listed (TRAN-04) | VERIFIED | `TransitDisruptionsProvider` filters to routes and stops that are shown, and `severity.py` classifies red only for service-stopping alerts. The web has `ui/disruption-sheet.ts` and the corner readout in `readouts.ts`. Live: 204 disruptions parsed. UAT item 4 passed. |

**Score:** 4/4 truths verified in code. D-14 (an aspect of truth 1) needs a device re-check after deploy.

## D-decision spot checks

| Decision | Status | Evidence |
|----------|--------|----------|
| D-04 / D-21 Home and camera-off places get no transit | VERIFIED | All four transit providers are `exact_location_only=True`. `assemble.exact_allowed` skips them for any pin unless `camera_ok` (`Place.cameras`). `stream.py` touch events re-check the same gate. `resolve_location` never matches home-like or camera-off places to a GPS label. The web has a second layer: `stripExactLayers`, `camerasOff()` and a stream-layer drop (WR-W5), failing closed until the places list confirms `cameras: true`. |
| D-08 / D-09 | VERIFIED, narrowed | The 30 s catch grace and the single red leave-now row were accepted by David in UAT items 7 and 8. This narrows the original wording. |
| D-12, D-13, D-16, D-17 | VERIFIED in code | Vehicle cards, tag priority, the disruption readout, and red limited to service-stopping alerts (hardened by WR-S5). |
| D-14 edge pointers | NEEDS HUMAN | `EdgePointers` exists and is wired in map.ts. CR-W1 (hidden() always true) is fixed in the code but not deployed or re-checked. |
| D-18 / D-19 key safety | VERIFIED | `PTV_DEVID` and `PTV_KEY` are `SecretStr` in settings.py, unwrapped only in main.py:54-55. `ptv_client.py` states it never logs, and callers log only the provider id, exception type and kind. `smoke.py` prints statuses and shapes only. No key reference appears in web/. The app runs without a key (`ptv: idle`). |
| D-20 estimated trams, no trains | VERIFIED | Estimated markers are flagged. WR-S4 stops untimed positions from showing at any age. |
| D-22 / D-23 | VERIFIED | `refresh-transit.sh` and the weekly timer build the store, and verify.sh checks it. A first-open nudge is single-flight and rate-guarded (WR-S1 to S3). |
| PLAT-04 no upstream call in the profile path | VERIFIED | `providers/transit.py` has `async def` only in `refresh` and `nudge_refresh`. `query()` is sync with no `ctx.http` use. A nudge only flags stop ids. |
| No raw run or vehicle ids in payloads | VERIFIED | WR-S7 hashes departure ids. |

## Required artifacts and wiring

All exist, are substantive and are wired. Server: `transit/{store,service,ptv_client,vehicles,severity,sources,watch,smoke,model}.py`, `providers/transit.py` (4 providers registered in main.py), `runtime.py` (nudge, backoff), `deploy/{refresh-transit.sh,shinigami-transit.*,verify.sh}`. Web: `transit.ts`, `map/{tags,edge-pointers,transit-card,card}.ts`, `ui/{next-list,disruption-sheet,readouts}.ts`. The wiring server → profile/stream → app.ts → drawer, map and readouts was traced. Data flows from real PTV and GTFS (live smoke 10/10 stop-id agreement).

## Behavioural checks

| Check | Result |
|-------|--------|
| `uv run pytest -q` | 313 passed, 1 skipped |
| `npm --prefix web test -- --run` | 35 files, 430 passed |
| Debt-marker grep (TODO, FIXME, XXX, TBD) in phase source | none |

## Requirements coverage

| Req | Status |
|-----|--------|
| TRAN-01 | SATISFIED (pointer part pending device re-check) |
| TRAN-02 | SATISFIED |
| TRAN-03 | SATISFIED |
| TRAN-04 | SATISFIED |

Bookkeeping: REQUIREMENTS.md still shows TRAN-01..04 unchecked and "Pending" in the traceability table, while ROADMAP marks the phase complete. Update this when closing the phase.

## Anti-patterns

None blocking. 15 IN-* review findings were left open by choice.

## Gaps

None. No truth failed.

## Human verification required

1. **Edge pointers (D-14)** after deploying HEAD: pointers appear, aim correctly, hide behind sheets, and a tap recentres on the stop.
2. **Vehicle fade-out (WR-W4):** a stale vehicle fades.
3. **Optional:** confirm one real-position bus marker.

Deploy first: CT 110 runs 93d55ae, and the review fixes (including WR-S8/S9 deploy-script changes) are unpushed.

---

_Verified: 2026-11-18_
_Verifier: Claude (gsd-verifier)_
