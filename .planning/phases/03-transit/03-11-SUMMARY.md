---
phase: 03-transit
plan: 11
subsystem: web
tags: [transit, map, drawer, maplibre]
requires: ["03-04", "03-07", "03-08"]
provides: ["MapHandle.focusStop", "drawer departure row tap -> stop card"]
affects: [web/src/map/map.ts, web/src/app.ts]
key-files:
  modified:
    - web/src/map/types.ts
    - web/src/map/map.ts
    - web/src/map/map.test.ts
    - web/src/app.ts
    - web/src/app.test.ts
decisions:
  - "focusStop looks only in lastStopItems (rendered transit_stops), so Home (no transit layer) returns false"
metrics:
  completed: 2026-11-15
  tasks: 2
---

# Phase 3 Plan 11: Drawer row to stop card Summary

Tapping a transit departure row collapses the drawer, eases the map to the stop (600 ms, or a jump under reduced motion) and opens its stop card on `moveend`.

## What was built
- `MapHandle.focusStop(stopId)` (types.ts, map.ts): finds `stop:{id}` in the last stop items; false if absent. Calls `goToStop(item)`, which turns follow off via `userPanned()`, registers a one-shot `moveend` that calls `tags.openById`, and eases (600 ms) or jumps (reduced motion).
- `app.ts`: a single `onRowTap` router (transit, not none, numeric stopId -> `drawer.collapse()` then `mapHandle?.focusStop`), passed to `NextList`. `mapHandle` is declared before the list; optional chaining makes a pre-map tap safe. Plan 03-15 can add its disruption-end branch there.
- Tests: 3 map tests (ease+open, reduced-motion jump, absent/Home returns false and no move) and 3 app tests (tap collapses+focuses, tap before map handle, non-departure rows never focus).

## Deviations from Plan
1. **[Scope] goToStop has one caller, not two.** The edge-pointer tap path lives in `web/src/map/edge-pointers.ts` (`EdgePointers.tap`), outside this plan's `files_modified`, so it was not refactored onto `goToStop`. `grep -c "goToStop(" map.ts` prints 2 (definition + focusStop), not the 3 the acceptance criterion asks for. Behaviour is identical (follow off, 600 ms ease, open on arrival); unifying would be a small follow-up in edge-pointers.ts.
2. **[Rule 3] Build typecheck:** the existing `mapLoader` double in app.test.ts lacked `focusStop`, which broke `tsc` in `npm run build`; added `focusStop: vi.fn(() => false)` (commit below).

## Verification
- `npm --prefix web test -- --run src/map/map.test.ts`: 46 passed.
- `npm --prefix web test -- --run src/app.test.ts`: 23 passed.
- Full `npm --prefix web test -- --run`: 34 files, 361 tests passed (run before the one-line double fix; app.test.ts re-run after: passing).
- `npm --prefix web run build`: exits 0 after the fix.
- `grep -n "onRowTap" / "focusStop(" web/src/app.ts` match; `focusStop` matches in types.ts and map.ts.

## Commits
- a0f07ea feat(03-11): MapHandle.focusStop
- ea7f224 feat(03-11): wire departure row taps
- test double fix commit (see git log, "test(03-11)")

## Known Stubs
None.

## Self-Check: PASSED
