---
phase: 03-transit
plan: 15
subsystem: web
tags: [transit, disruptions, hud, TRAN-04]
requires: ["03-04", "03-11", "03-13"]
provides: ["disruptionReadout", "Readouts.onDisruptionsTap", "DisruptionSheet", "disruptionRows", "PTV_LICENCE", "ShellSlots.attribution"]
affects: [web/src/app.ts]
key-files:
  created:
    - web/src/ui/disruption-sheet.ts
    - web/src/ui/disruption-sheet.test.ts
  modified:
    - web/src/ui/readouts.ts
    - web/src/ui/readouts.test.ts
    - web/src/styles/hud.css
    - web/src/ui/shell.ts
    - web/src/app.ts
    - web/src/app.test.ts
decisions:
  - "Readouts exposes a disruptionsEl getter so app.ts can return sheet focus to the readout button"
  - "Sheet title gets its own id (disruption-sheet-title) so it never clashes with the location sheet's sheet-title"
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 3 Plan 15: Disruption readout and sheet Summary

A corner readout counts disruptions on David's routes (red frame only when service is stopped), opens a DISRUPTIONS · YOUR ROUTES sheet with ticking end countdowns, and the PTV CC BY 4.0 line shows in the drawer footer whenever transit_stops is present.

## What was built
- `readouts.ts`: `disruptionReadout(profile)` (visible only for a non-pending layer with at least 1 item; red if any severity 3 or service_stopped), a lazily built `button.readout.readout-disruptions` under the camera readout with warn glyph, `count-num`/`count-rest`, `hidden` toggle, `red` class, aria-label, click to `opts.onDisruptionsTap`.
- `disruption-sheet.ts`: `disruptionRows` (red first, soonest end, latest update; max 6; routes max 3 then +n; stop-only uses `shortStopName`; meta "Current · updated 3m ago"), `DisruptionSheet` (location-sheet classes, focus to title, Escape/backdrop/Close, focus trap, 1 Hz ticker only while open, licence footer, textContent only, no anchors), `PTV_LICENCE` (single source definition).
- `hud.css`: readout, red state, pressed state, sheet row, NO SERVICE chip, footer rules.
- `shell.ts`: `p.footer-attrib` (hidden by default) as `ShellSlots.attribution`, sibling of the footer so the existing footer textContent update is untouched.
- `app.ts`: sheet construction, `onRowTap` end-row branch (collapse drawer, open sheet) before the departure branch, attribution hidden unless `transit_stops` exists.

## Deviations from Plan
None. (Attribution is a sibling of the footer element rather than a child, so the footer's textContent assignment cannot wipe it.)

## Verification
- `npm --prefix web test -- --run src/ui/readouts.test.ts src/ui/disruption-sheet.test.ts`: 13 passed.
- `npm --prefix web test -- --run src/app.test.ts`: 27 passed.
- Full `npm --prefix web test -- --run`: 35 files, 392 tests passed.
- `npm --prefix web run build`: first run printed a vite-plugin-pwa ENOENT on dist/sw.mjs (dist race with a parallel executor); retry exited 0.
- Grep gates: no `innerHTML`, `<a `, `createElement("a")` or `setAttribute("style"` in disruption-sheet.ts or readouts.ts; `DISRUPTIONS · YOUR ROUTES` in disruption-sheet.ts; `endRow` and `onDisruptionsTap` in app.ts; exactly one source definition of the licence text (disruption-sheet.ts).

## Commits
- feat(03-15): disruption readout and list sheet
- feat(03-15): wire disruption readout, sheet, end rows and PTV attribution

## Known Stubs
None.

## Self-Check: PASSED
