---
phase: 03-transit
plan: 09
subsystem: transit
tags: [ptv, departures, polling, watch-set, fastapi]
requires: [03-02, 03-05, 03-06]
provides:
  - transit_departures polled layer (30 s) served per phone at its own stops
  - WatchSet (180 s TTL, max 6 stops, ids only) driving demand-only PTV polling
  - DepartureSource Protocol + PtvDepartureSource; direction_group()
  - cache cells layer_cache("transit", "dep:{stop_id}") = {departures, positions}
affects: [03-10, 03-12, 03-13, 03-16]
key-files:
  created:
    - server/shinigami/transit/watch.py
    - server/shinigami/transit/sources.py
    - server/tests/test_transit_poll.py
  modified:
    - server/shinigami/transit/service.py
    - server/shinigami/providers/transit.py
    - server/shinigami/main.py
    - server/tests/test_profile_readonly.py
    - server/tests/test_nologging.py
    - server/tests/test_stream.py
key-decisions:
  - "Within one touch() call the first ref counts as most recent, so the nearest stops survive the 6-stop cap"
  - "Trains group as city/out by direction name; other modes a/b by bearing to the final stop, else r{route}:{dir}"
  - "No stops nearby gives a fresh empty layer; no client (no key) gives pending with no nudge"
requirements-completed: [TRAN-02]
completed: 2026-11-15
---

# Phase 3 Plan 09: Live departures (server) Summary

Demand-driven departures: a watch set of recently viewed stops feeds a 30 s poller through a swappable `DepartureSource`; results go to the SQLite layer cache and each phone reads them through a cache-only `query()` that also nudges one fetch when it first sees a new stop. No key, closed app or Home place all mean zero PTV calls.

## Tasks
1. Watch set, source seam, direction groups (commit dc1003f): `watch.py`, `sources.py`, `TransitService.watch/client/source/attach_http/cached_departures`.
2. Provider, wiring, tests (commit 1ae1a55): `TransitDeparturesProvider`, `attach_http(ctx.http)` and provider registered in `main.py`, poll/readonly/nologging tests.

## Verification (exact)
- `uv run pytest -q` (in server): 226 passed, 1 skipped.
- `uv run ruff check .` (in server): all checks passed.
- Acceptance greps: no `lat|lon` in watch.py; `interval_s=30`, `nudge("transit_departures")`, `attach_http(ctx.http)`, `class DepartureSource(Protocol)` all present; no log line with `lat|lon|url|stop_id|str(exc)`.
- Live PTV semantics (estimated null = scheduled, cancelled status string, signing against the real server) are UNVERIFIED until David adds the key (D-24). Only schema-derived fixtures and respx were used; no real PTV call was made.

## Deviations from Plan
- [Rule 3] `server/tests/test_stream.py` (not in files_modified) updated: the layer count and expected id set now follow the registered providers instead of a hard-coded 6, because adding a provider broke it. Same kind of edit 03-05 made.
- Task 1's tests live in `test_transit_poll.py`, which imports the Task 2 provider, so that file was committed with Task 2 (Task 1 commit has the source only).

## Known Stubs
None.

## Threat Flags
None. Only stop ids go to PTV; failure logs carry class and kind only.

## Self-Check: PASSED (files exist; commits dc1003f and 1ae1a55 present)
