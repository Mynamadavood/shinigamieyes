---
phase: 01-foundation-and-flat-hud-slice
plan: 09
subsystem: location
tags: [gps, places, pin, hysteresis, sheet]
requires: [01-08]
provides:
  - "GET /api/places (id, label only); place/src/label params on /api/profile and /api/stream"
  - "location.ts state machine (createLocation, toParams, loadPlaces), LocationStrip, LocationSheet (searchHost for 01-10)"
affects: [01-10]
key-files:
  created: [server/shinigami/places.py, server/shinigami/api/places.py, server/tests/test_places.py, web/src/location.ts, web/src/location.test.ts, web/src/ui/location-strip.ts, web/src/ui/location-sheet.ts, web/src/ui/location-sheet.test.ts, web/src/styles/location.css]
  modified: [server/shinigami/api/profile.py, server/shinigami/api/stream.py, server/shinigami/main.py, web/src/app.ts, web/src/styles/tokens.css]
requirements-completed: [PLAT-06]
completed: 2026-11-06
---

# Phase 1 Plan 09: GPS, saved places and Set Location sheet Summary

The profile now follows David: one GPS fix on open and on return to the app (100 m hysteresis, no watch), or a one-tap saved place chosen by id so home coordinates never leave the server.

## Tasks

| Task | Result | Commit |
|------|--------|--------|
| 1 Server places, /api/places, place-aware profile and stream | 14 new tests, 73 total | 4c3ad26 |
| 2 Location state machine | 11 tests | 68f605e |
| 3 Strip, sheet, app wiring | 10 tests + stripText, 90 web total | 9a2fd92 |

## Verification
- `uv run pytest -q`: 73 passed. `uv run ruff check server`: clean.
- `npm --prefix web run test -- --run`: 90 passed (12 files). `npm --prefix web run build`: OK.
- places.toml is gitignored (`var/`); `git ls-files` shows no places.toml. No innerHTML in strip/sheet. tokens.css diff is additions only.
- Not done: manual desktop-browser run of the full stack (GPS prompt, picking Monash). Covered by unit tests (sheet, state machine, stripText) instead.

## tokens.css addition
`--c-backdrop: rgba(0, 0, 0, 0.72)` (appended; no existing token changed).

## Deviations from Plan
1. **[Rule 1] Refetch queueing**: `refetch()` dropped calls while one was in flight, which would lose a location change. It now queues one rerun and discards a response whose params changed mid-flight.
2. `LocationDeps` gained optional `onState` and `now` (strip/sheet re-render, test clock). `useGps()` forces acceptance of the next fix and bypasses the in-flight guard so the switch back from a pin always re-profiles.
3. On start, restored state with params (pin/search/last GPS fix) calls onChange immediately, so the first fetch uses the saved location. `boot` awaits only this IndexedDB read after the cached render.
4. Without `navigator.geolocation`, a stub reports failure so the pin path opens.
5. RED/GREEN committed together per task.

## Known Stubs
None. `searchHost` is intentionally empty until 01-10.

## Threat Flags
None. Labels use textContent; place ids validated by pattern; warnings log ids only (tested).

## Self-Check: PASSED
Commits 4c3ad26, 68f605e, 9a2fd92 and all listed files present.
