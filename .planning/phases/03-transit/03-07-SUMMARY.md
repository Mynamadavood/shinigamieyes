---
phase: 03-transit
plan: 07
subsystem: web-drawer
tags: [transit, departures, drawer, leave-now, TRAN-02]
requires: [03-04]
provides: [departure rows in transitRows, NextList onRowTap]
affects: [03-10 (wires onRowTap to the map)]
key-files:
  modified:
    - web/src/model.ts
    - web/src/model.test.ts
    - web/src/ui/next-list.ts
    - web/src/ui/next-list.test.ts
    - web/src/styles/app.css
decisions:
  - "Leave-now window is inclusive at 60 s (60 s >= leaveIn > -30 s), as the UI-SPEC states"
metrics:
  tasks: 2
  files: 5
completed: 2026-11-15
---

# Phase 3 Plan 07: Drawer departure rows Summary

Catchable departure rows in the drawer: one row per stop and direction with a departure countdown, a `leave in` countdown, a LIVE/SCHED mark, delay and platform notes, one red LEAVE NOW row at most, a "too late to catch" state, and a row-tap callback.

## What was built

- `model.ts`: `departureRows()` inside `transitRows()`. It groups `transit_departures` items by `group` and picks the first non-cancelled departure whose `leaveIn` is above -30 s, falling back to the soonest as `missed`. Caps are 2 rows per stop and 6 overall. Exported constants: `LEAVE_NOW_MS`, `CATCH_GRACE_MS`, `ROWS_PER_STOP`, `MAX_DEP_ROWS`. The status row disappears once any departure row exists. A red leave-now row clears `redCountdown` on the generic soonest-urgent row.
- `next-list.ts`: `.row-live`, note text, `.row-leave` (`.leave-val`, `.leave-chip`), classes `leave-now`, `missed`, `sched`, and `NextList(host, { onRowTap })`. Rows with `transit && !none && stopId != null` get `role="button"`, `tabindex` and click/Enter/Space handling. A row whose id persists keeps its node, so rolling to the next departure plays no expiry pulse. textContent only, no innerHTML, no inline styles.
- `app.css`: classes only. Red is used only under `.row.leave-now` and `.leave-chip`.

## Deviations from locked decisions (both follow UI-SPEC; to be put to David in 03-20 Task 2)

1. **D-08 catch grace.** D-08 says a departure sooner than the walk time is skipped. The build keeps a departure catchable until leave-in falls below -30 s (`CATCH_GRACE_MS`), because the walk time already carries a 30% detour allowance.
2. **D-09 single red row.** D-09 says the row turns blood red when it is time to leave. The build turns only the single soonest row in the leave-now window red (`LEAVE NOW` chip). Other rows in the window read `leave now` in white, so the drawer never shows two red countdowns.

## Deviations from the plan text (Rules 1-3)

None. Test note: the plan's first behaviour example (departure at +3 min, walk 2 min, `leave in 01:00`) sits exactly on the inclusive 60 s leave-now boundary, so that row would be red `LEAVE NOW`. The test uses +4 min / `leave in 02:00`; the boundary itself is inclusive per UI-SPEC line 282.

## Verification

- `npm --prefix web test -- --run src/ui/next-list.test.ts src/model.test.ts`: 42 passed.
- `npm --prefix web run build`: exit 0.
- Full `npm --prefix web test -- --run`: 34 files, 335 tests passed.
- Gates: no `innerHTML` or `setAttribute("style")` in next-list.ts; `onRowTap` present; the four constants are present in model.ts.

## Commits

- f509685: model departure rows
- f46b830: row DOM, CSS and tests

## Known Stubs

None. `onRowTap` is not yet passed by any caller; plan 03-10 wires it.

## Self-Check: PASSED
