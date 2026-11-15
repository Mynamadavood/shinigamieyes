---
phase: 03-transit
plan: 14
subsystem: transit
tags: [ptv, disruptions, fastapi]
requires: [03-09]
provides: [transit_disruptions layer, classify_disruption]
affects: [03-13, 03-15]
key-files:
  created: [server/shinigami/transit/severity.py, server/tests/test_transit_disruptions.py]
  modified: [server/shinigami/transit/service.py, server/shinigami/providers/transit.py, server/shinigami/main.py, server/tests/test_profile_readonly.py]
requirements: [TRAN-04]
completed: 2026-11-15
---

# Phase 3 Plan 14: Transit disruptions (server) Summary

Global PTV disruptions fetched every 5 min only while watched, filtered per phone to shown routes and stops, with red severity reserved for service-stopping alerts by one keyword function.

## Tasks
1. Severity classifier: `classify_disruption`, `RED_PATTERNS` (a38c555).
2. `TransitDisruptionsProvider`, `service.cached_disruptions`, `service.last_new_refs`, main.py wiring, tests (see git log).

## Deviations
- [Rule 3] `server/tests/test_profile_readonly.py` line 123 changed to expect nudges `["transit_departures", "transit_disruptions"]`; the new provider legitimately nudges on a first open. The plan asked to extend this test but did not list it in files_modified. `test_stream.py` needed no edit.
- PTV 5xx errors carry kind `http_5xx` (not `http_500`); the log test asserts that.
- Task 1 and 2 tests live in one file that imports the provider, so Task 1 was committed as severity.py alone and the tests arrived with Task 2.

## Verification
- `uv run pytest -q`: 249 passed, 1 skipped. `uv run ruff check .`: clean.
- Greps: no `"url"` in providers/transit.py; `interval_s=300` and `TransitDisruptionsProvider(transit)` present.
- `ruff format --check` flags providers/transit.py and transit/store.py (pre-existing style); not reformatted to avoid unrelated churn.

## Self-Check: PASSED
