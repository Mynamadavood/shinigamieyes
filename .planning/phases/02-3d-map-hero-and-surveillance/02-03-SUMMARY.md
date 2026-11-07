---
phase: 02-3d-map-hero-and-surveillance
plan: 03
subsystem: web-ui
tags: [hud, drawer, readouts, shell]
requires: [02-02]
provides: [ShellSlots, Drawer, Readouts, phase-2 tokens]
affects: [02-07, 02-08]
key-files:
  created: [web/src/styles/hud.css, web/src/ui/drawer.ts, web/src/ui/readouts.ts, web/src/ui/shell.test.ts, web/src/ui/drawer.test.ts, web/src/ui/readouts.test.ts]
  modified: [web/src/ui/shell.ts, web/src/model.ts, web/src/model.test.ts, web/src/styles/tokens.css, web/src/styles/app.css, web/src/app.ts]
requirements: [HUD-04, HUD-05]
metrics:
  completed: 2026-11-07
---

# Phase 2 Plan 3: Watch Dogs HUD frame Summary

Full-screen HUD shell (grid map-host, red title bar, banner, location strip, corner readouts) with a three-snap pull-up drawer holding the Phase 1 list; positioned and summary items are excluded from rows.

## Commits
- b9a056a Task 1: tokens, shell slots, hud.css grid, selectVisible filter
- 9ce1006 Task 2: Drawer + snapTarget
- 523d2e2 Readouts + app.ts wiring

## Deviations
- Added `web/src/ui/shell.test.ts` (not in files_modified) to cover the mountShell behavior spec.
- `.drawer:not(.open)` has touch-action none; open states rely on the handle for drags (touch-action intersection would otherwise block list scrolling). Pulling down from the list at scrollTop 0 is not implemented (handle drag only).
- `Readouts` right column is reserved only (02-07 fills it).

## Verification
web: 18 files / 137 tests pass; build green. No innerHTML or inline style attributes in new UI files.

## Known Stubs
None blocking; map-host is the offline grid until 02-08.

## Self-Check: PASSED
