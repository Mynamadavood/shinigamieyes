---
phase: 01-foundation-and-flat-hud-slice
plan: 07
subsystem: web-hud
tags: [freshness, stale, urgent, expiry, vitest]
requires: [01-05]
provides:
  - "ageTag/isStale (freshness.ts); RowVM gains ageTag, stale, urgent, redCountdown"
  - "NextList.setState(loading|empty|no-data-offline|ready); expiry pulse-dim-drop state machine"
affects: [01-08]
key-files:
  created: [web/src/freshness.ts, web/src/freshness.test.ts, web/src/ui/next-list.test.ts]
  modified: [web/src/model.ts, web/src/model.test.ts, web/src/ui/next-list.ts, web/src/styles/app.css]
requirements-completed: [HUD-02, HUD-01]
completed: 2026-11-05
---

# Phase 1 Plan 07: Trustworthy Rows Summary

Every row shows an age tag, stale rows dim, rows under 15 min go urgent (only the soonest gets red countdown text), and expired rows flash red, dim and collapse over 1.2 s (0.3 s with reduced motion) before being dropped.

## Tasks

| Task | Result | Commit |
|------|--------|--------|
| 1 Freshness + view-model states | 36 tests total pass | 7b1d122 |
| 2 next-list states, expiry, CSS | 46 tests total pass, build OK | d95e3fd |

## Verification
- `npm --prefix web run test -- --run`: 46 passed (7 files). `npm --prefix web run build`: OK.
- Gates: no inline style usage in next-list.ts, no hex colours in app.css, `steps(` and `prefers-reduced-motion` present, no 1800/21600 constants on the client.
- Not done: live visual check in a browser against uvicorn.

## Deviations from Plan
1. CSS selectors use the existing `.row-count` class (01-05) rather than `.countdown` named in the plan.
2. Expiry flash uses `--c-red-deep` fill (existing token) with the red marker, rather than a full `--c-red` fill, to keep text legible.
3. RED/GREEN committed together per task.

## Known Stubs
None. main.ts does not yet call `setState` (wired in 01-08).

## Threat Flags
None. All text via textContent; no innerHTML.

## Self-Check: PASSED
