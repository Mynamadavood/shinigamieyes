---
phase: 01-foundation-and-flat-hud-slice
plan: 05
subsystem: web-hud
tags: [vanilla-ts, vitest, countdown, tokens, fontsource]
requires: [01-01, 01-04]
provides:
  - "fmtCountdown, clock offset (measureOffset/setOffset/nowMs), boundary-aligned startTicker"
  - "selectVisible view model, fetchProfile (4 s abort), mountShell, NextList component"
  - "tokens.css UI-SPEC token contract, app.css HUD styling"
affects: [01-07, 01-08, 01-09]
key-files:
  created: [web/src/types.ts, web/src/format.ts, web/src/clock.ts, web/src/ticker.ts, web/src/model.ts, web/src/net.ts, web/src/ui/shell.ts, web/src/ui/next-list.ts, web/src/styles/tokens.css, web/src/styles/app.css, web/src/format.test.ts, web/src/clock.test.ts, web/src/ticker.test.ts, web/src/model.test.ts]
  modified: [web/src/main.ts]
  deleted: [web/src/style.css]
key-decisions:
  - "Group key for first-unexpired selection is layer+group so groups in different layers never collide"
requirements-completed: [HUD-01]
completed: 2026-11-05
---

# Phase 1 Plan 05: Countdown HUD Summary

Styled Shinigami HUD (red title bar, location strip, NEXT list) with sun rows whose countdowns are recomputed from absolute server-corrected time every second and on foregrounding.

## Tasks

| Task | Result | Commit |
|------|--------|--------|
| 1 Time core (format, clock, ticker) | 18 tests pass | 913d091 |
| 2 Shell, next-list, tokens, fonts, wiring | 25 tests total pass, build OK, 10 woff2 in dist | 2823852 |

## Verification
- `npm --prefix web run test -- --run`: 25 passed (5 files). `npm --prefix web run build` (tsc + vite): OK.
- Gates: no innerHTML, no hex colours in app.css, no googleapis/gstatic/cdn, built JS contains `SHINIGAMI EYES`.
- Not done: live visual check against running uvicorn (build/grep checks only).

## Deviations from Plan
1. **[Rule 1] Plan arithmetic error**: behaviour spec said `measureOffset(1000, 999_000, 999_200) === 1_100`; correct value is 1_000_000 - 999_100 = 900. Test asserts 900; formula is the specified RTT midpoint.
2. Removed obsolete `web/src/style.css` (replaced by styles/tokens.css + app.css).
3. Extra size tokens (`--bw`, `--marker-w`, `--close-box`, `--t-fade`, `--lh-*`) added to tokens.css so app.css has no literal px except none beyond tokens.
4. RED/GREEN committed together per task.

## Known Stubs
Footer shows client-corrected clock time, not a distinct server freshness; freshness slot in rows is empty until 01-07. Fetch failure leaves list empty until 01-08.

## Threat Flags
None.

## Self-Check: PASSED
Commits 913d091 and 2823852 exist.
