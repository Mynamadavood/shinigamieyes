---
phase: 03-transit
plan: 06
subsystem: transit
tags: [ptv, hmac-sha1, httpx, pydantic, respx, fixtures]
requires:
  - phase: 03-01
    provides: transit package (store)
provides:
  - PtvClient with sign_path, rate guard, leak-proof PtvError
  - source-neutral Departure / Disruption / PatternStop / RunPosition / Vehicle records and tolerant parsers
  - six labelled schema-derived PTV fixtures
affects: [03-departures-provider, 03-disruptions-provider, 03-vehicles]
tech-stack:
  added: []
  patterns: [signed URL as one string (no params=), error kinds raised from None, no logging in client]
key-files:
  created:
    - server/shinigami/transit/ptv_client.py
    - server/shinigami/transit/model.py
    - server/tests/test_ptv_signing.py
    - server/tests/test_ptv_client.py
    - server/tests/fixtures/ptv/README.md
    - server/tests/fixtures/ptv/departures_tram.json
    - server/tests/fixtures/ptv/departures_train.json
    - server/tests/fixtures/ptv/departures_bus.json
    - server/tests/fixtures/ptv/pattern_tram.json
    - server/tests/fixtures/ptv/disruptions.json
    - server/tests/fixtures/ptv/stops_location.json
key-decisions:
  - "Rate guard counts attempts (including ones that later fail) in a 60 s sliding window; the 61st raises rate_guard with no HTTP"
  - "Disruptions are de-duplicated by id across categories"
  - "Cancelled = run.status lower-cased == 'cancelled' (assumption A5, to confirm on first real call)"
requirements-completed: [TRAN-02, TRAN-03, TRAN-04]
duration: ~25 min
completed: 2026-11-15
---

# Phase 3 Plan 06: PTV client Summary

Signed, rate-guarded PTV Timetable v3 client whose failures cannot leak devid, key, signature or URL, plus tolerant parsers into vehicle-identity-free records, tested on schema-derived fixtures.

## Tasks

1. Signing, client, safe errors: commit 7a39a0c (also carries model.py, since the client imports it).
2. Fixtures and parser tests: commit e7e8422.

## Verification

- `uv run pytest server/tests/test_ptv_signing.py server/tests/test_ptv_client.py -q`: 23 passed.
- `ruff check` and `ruff format --check` on the four Python files: clean.
- Acceptance greps: vector 6F409F87... present; D5474F34 absent; no `params=`, no `log.`/`getLogger` in ptv_client.py; `from None` present; `vehicle_descriptor` only in comments in model.py; every fixture JSON labelled.
- Full `uv run pytest -q` / `ruff check server`: see note below.

## Deviations from Plan

- [Rule 3] model.py was committed with Task 1 rather than Task 2 because ptv_client imports it. Content is unchanged.
- ruff S112 (try/except/continue) is suppressed with `# noqa: BLE001, S112` on the deliberate tolerant per-row skips in model.py.
- The httpx-WARNING assertion imports `shinigami.main` so it checks the real setting.

## Known Stubs

None.

## Threat Flags

None. All keys and devid in code and tests are the FAKE values; no real PTV call was made.

## Notes

Manual smoke checks after the key arrives (unverified assumptions): estimated null means scheduled-only, `expand` accepts names, cancelled status string, signing against the live server.

## Self-Check: PASSED (files exist, commits 7a39a0c and e7e8422 present)
