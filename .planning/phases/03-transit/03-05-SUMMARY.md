---
phase: 03-transit
plan: 05
subsystem: api
tags: [transit, fastapi, settings, health, ptv]
requires: [03-01, 03-02]
provides:
  - transit_stops layer in /api/profile and /api/stream (memory only, exact_location_only)
  - TransitService (shared store + PTV state) on app.state.transit
  - optional PTV_DEVID / PTV_KEY SecretStr settings
  - transit block in /api/health
affects: [03-06, 03-09]
tech-stack:
  added: []
  patterns: [computed exact-location provider like cameras, single 300 s reload loop for all stores]
key-files:
  created:
    - server/shinigami/transit/service.py
    - server/shinigami/providers/transit.py
    - server/tests/test_transit_profile.py
  modified:
    - server/shinigami/settings.py
    - server/shinigami/main.py
    - server/shinigami/api/health.py
    - server/tests/conftest.py
    - server/tests/test_health.py
    - server/tests/test_stream.py
key-decisions:
  - "PTV secrets only inside TransitService._creds; repr and health show state strings only"
  - "_reload_cameras generalised to _reload_stores (cameras + transit)"
requirements-completed: [TRAN-01]
duration: ~25 min
completed: 2026-11-15
---

# Phase 3 Plan 05: Transit stops API Summary

Memory-only `transit_stops` layer (nearest train/tram/bus stops with distance and walk time, none items, summary with PTV state) served through profile and stream, gated off Home and camera-off places, with the app fully working with no PTV key.

## Tasks
1. Settings, TransitService, TransitStopsProvider (commit 772399e): settings gained `transit_stops_path`, `ptv_devid`/`ptv_key` (SecretStr, aliases `PTV_*` then `SHINIGAMI_PTV_*`), `populate_by_name=True`. conftest `settings` pins tmp paths and None keys and adds a `transit_store_file` writer fixture.
2. Wiring, health, integration tests (commit 72be5d0): store loaded at startup, provider appended after cameras, shared 300 s reload, `app.state.transit`, health `transit` block. test_stream layer set updated to include `transit_stops`.

## Verification
- `uv run pytest -q` in server: 200 passed, 1 skipped.
- `uv run ruff check .` in server: all checks passed.
- Grep of health.py for `devid|ptv_key|get_secret_value`: no matches.
- Tests cover: GPS profile, non-Home place with real distances and null location, Home and `cameras = false` give no `transit_*` key and no `distance_m`, stream gate for Home vs non-Home, health loaded/missing/no secrets/no coordinates, pending when no file, caplog has no stop names or coordinates, settings repr hides keys.

## Deviations from Plan
None in behaviour. Note: I extended the stream test's expected layer count from 5 to 6 as the set grew. The unrelated uncommitted edit in `server/tests/test_refresh_transit.py` was left untouched.

## Known Stubs
None. `ptv_state` stays "idle"/"no_key" until 03-09 sets "ok"/"error"; `last_live_ts` is None until then (intentional).

## Self-Check: PASSED
Created files exist; commits 772399e and 72be5d0 present.
