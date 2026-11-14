---
phase: 03-transit
plan: 13
subsystem: web-drawer
tags: [transit, disruptions, drawer, TRAN-04]
requires: [03-07]
provides: [RowVM.warn, RowVM.endRow, transit-end rows, row-warn glyph]
affects: [03-15 (routes end-row taps to the disruption sheet)]
key-files:
  modified:
    - web/src/model.ts
    - web/src/model.test.ts
    - web/src/ui/next-list.ts
    - web/src/ui/next-list.test.ts
    - web/src/styles/app.css
decisions:
  - "End rows are appended after other transit rows (sorted among themselves by end time), not merged into the generic timed-row sort"
metrics:
  tasks: 2
  files: 5
completed: 2026-11-15
---

# Phase 3 Plan 13: Drawer disruption marks Summary

Departure rows hit by a shown disruption carry a warning glyph (white for info, red only for service stopped), and disruptions ending within 24 h add up to 2 countdown rows.

## What was built

- `model.ts`: `RowVM.warn?: 0|1|3` and `endRow?`; `MAX_END_ROWS = 2`, `END_WINDOW_MS = 86_400_000`. `applyWarnings` matches departures against `transit_disruptions` by `route_ids`, `stop_ids` or the departure's `disruption_ids`; severity 3 maps to warn 3, otherwise 1; highest wins; no layer gives 0. `endRows` builds `transit-end:{disruption_id}` rows named from the first route label ("Tram 96 disruption", "Bus 907 disruption", "Train disruption"), kindTag `disruption · ends`, never urgent or red, `transit true` (so excluded from corner readouts), soonest 2 only. Disruption items never reach the generic loop (03-04 skip).
- `next-list.ts`: `svg.row-warn.info|stop` (href `/icons.svg#warn`) created once per row via `createElementNS`, first child of `.row-kind`, toggled in place; aria-label suffix ", disruption" / ", service stopped"; end rows get class `transit end`, `role=button`, and call `onRowTap`. The departure head-text lookup now uses `r.live.previousSibling` so the glyph can sit first.
- `app.css`: `.row-warn` 16px, `.info` text colour, `.stop` red; no other red added.

## Deviations from Plan

None beyond the decision above (plan was ambiguous on end-row ordering relative to other timed rows).

## Verification

- `npm --prefix web test -- --run src/model.test.ts src/ui/readouts.test.ts`: 33 passed.
- `npm --prefix web test -- --run src/ui/next-list.test.ts`: 22 passed.
- Gates: `MAX_END_ROWS = 2` and `transit-end:` present in model.ts; `row-warn` in next-list.ts and app.css; no `innerHTML` / `setAttribute("style")` in next-list.ts.
- Full `npm --prefix web test -- --run`: 359 passed, 2 failed, both in `src/app.test.ts` "departure row tap (D-06)" (another executor's uncommitted in-progress app.ts/app.test.ts work, not touched by this plan).
- `npm --prefix web run build`: FAILS with a single TS2322 in `src/app.test.ts(165,73)` (mock `createMap` lacks `focusStop`), same unfinished foreign work. No errors in this plan's files. Re-run needed after that plan lands.

## Commits

- 92820eb: model disruption warnings and end rows
- 5729f8d: warning glyph, end rows in drawer, CSS, tests

## Known Stubs

None. Nothing passes `onRowTap` for end rows yet; 03-15 wires the disruption sheet.

## Self-Check: PASSED
