---
phase: 03-transit
plan: 01
subsystem: transit
tags: [gtfs, stops, nearest-stop, python]
requires: []
provides:
  - "transit_stops.json build job (GTFS Schedule, no key)"
  - "TransitStore.nearby(): nearest stop per mode with direction pairs and walk time"
affects: [03-02, later transit plans]
tech-stack:
  added: []
  patterns: ["CameraStore lat-bucket index (floor(lat*100)), counts-only refresh job with shrink guard"]
key-files:
  created:
    - server/shinigami/data/refresh_transit.py
    - server/shinigami/transit/__init__.py
    - server/shinigami/transit/store.py
    - server/tests/gtfs_fixture.py
    - server/tests/test_refresh_transit.py
    - server/tests/test_transit_store.py
  modified: []
key-decisions:
  - "Train positions and names come from the parent station row; rows named Replacement are dropped"
  - "Poles with identical rounded coordinates inside one PTV stop are merged (dirkeys unioned)"
requirements-completed: [TRAN-01]
duration: ~15 min
completed: 2026-11-15
---

# Phase 3 Plan 01: Transit stop data and nearest-stop store Summary

Key-free GTFS Schedule to transit_stops.json job (stdlib, PTV ids from stop_url) plus an in-memory TransitStore returning the nearest stop per mode, opposite-direction partners and walk time.

## Tasks

1. GTFS stop build job with generated fixture zips: commit 7c9049b (`feat(03-01): GTFS schedule to transit_stops.json build job`).
2. TransitStore: commit 079bb19 (`feat(03-01): TransitStore nearest stop per mode with direction pairs`).

## Verification

- `uv run pytest server/tests/test_refresh_transit.py server/tests/test_transit_store.py -x -q`: 11 passed.
- `uv run ruff check server`: All checks passed.
- `git ls-files server/tests | grep zip`: nothing.

## Deviations from Plan

None - plan executed as written. An earlier session stopped before writing any files, so work started clean.

## Known Stubs

None.

## Notes

Full test suite not run (other executors have in-flight edits to runtime.py and conftest.py); only this plan's tests were run.

## Self-Check: PASSED
