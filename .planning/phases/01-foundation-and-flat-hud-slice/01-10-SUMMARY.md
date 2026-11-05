---
phase: 01-foundation-and-flat-hud-slice
plan: 10
subsystem: location
tags: [geocode, nominatim, search, sheet]
requires: [01-09]
provides:
  - "GET /api/geocode?q= Nominatim proxy (cache forever, 1 req/s slots, 429 past 3 s backlog, 502 search_failed)"
  - "searchAddress(q) client (4 s abort) and search input/results in the Set Location sheet"
affects: []
key-files:
  created: [server/shinigami/api/geocode.py, server/tests/test_geocode.py, web/src/location-search.ts, web/src/location-search.test.ts]
  modified: [server/shinigami/main.py, web/src/ui/location-sheet.ts, web/src/ui/location-sheet.test.ts, web/src/styles/location.css, web/src/app.ts]
requirements-completed: [PLAT-06]
completed: 2026-11-06
---

# Phase 1 Plan 10: Address search Summary

David can type an address in the Set Location sheet, press Enter, and pin any of up to 5 results; geocoding happens only on his server (Nominatim proxied, cached forever), never from the phone.

## Tasks

| Task | Result | Commit |
|------|--------|--------|
| 1 Server /api/geocode proxy | 11 new tests | 3b3593a |
| 2 Sheet search UI + client | 13 new tests | see git log (feat(01-10): address search) |

## Verification
- `uv run pytest -q`: 85 passed. `uv run ruff check server`: clean.
- `npm --prefix web run test -- --run`: 103 passed. `npm --prefix web run build`: OK.
- Greps: no "nominatim" in web/src, no `input` listener in the sheet, no hex colours in location.css.
- Not done: live Nominatim call and manual browser run (tests use respx fixtures only).

## Deviations from Plan
1. **[Rule 2 - Privacy] httpx INFO logging leaked the query**: httpx logs full request URLs at INFO, so the geocode query appeared in logs. `main.py` now sets the `httpx` logger to WARNING; a caplog test covers it.
2. Empty `contact_email` makes the proxy return 502 search_failed without calling Nominatim (per instructions), logging one startup-style warning.
3. Limiter uses slot reservation (no lock) with `_now`/`_sleep` module seams; state is module-level.
4. Search results use `.search-row` (not `.sheet-row`); two existing sheet tests were updated (Tab trap now ends at the search input; searchHost is no longer empty). `SheetHandlers.onSearch` is required.
5. RED/GREEN committed together per task.

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
