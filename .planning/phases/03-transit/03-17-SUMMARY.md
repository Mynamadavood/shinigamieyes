---
phase: 03-transit
plan: 17
subsystem: transit
tags: [ptv, vehicles, interpolation, fastapi]
requires: [03-09, 03-14]
provides:
  - transit_vehicles polled layer (30 s) served per phone for trams and buses heading to its shown stops
  - VehicleSource Protocol, PtvRunPositionSource, PtvInterpolatedSource, interpolate(), select_vehicles()
  - cache cells layer_cache("transit", "pat:{sha1(run_ref)[:10]}") = {"stops": [PatternStop dicts]}
affects: [03-18]
key-files:
  created: [server/shinigami/transit/vehicles.py, server/tests/test_transit_vehicles.py]
  modified: [server/shinigami/providers/transit.py, server/shinigami/main.py]
requirements-completed: [TRAN-03]
completed: 2026-11-15
---

# Phase 3 Plan 17: Approaching vehicles (server) Summary

Trams and buses heading to David's shown stops, from real PTV bus positions or a labelled estimate interpolated along the run's stopping pattern, behind a replaceable `VehicleSource` seam.

## Tasks
1. Vehicle sources, interpolation, selection (commit d6e5699): `vehicles.py`, constants `MAX_VEHICLES=8`, `HEADING_RADIUS_M=2000`, `POS_MAX_AGE_S=180`, `ETA_HORIZON_S=1800`, `PATTERN_RUNS_PER_CYCLE=4`, `PATTERN_TTL_S=60`.
2. `TransitVehiclesProvider`, pattern fetch budget, wiring, Home tests (commit db26e5b).

## Behaviour notes
- `query` reads caches only; `refresh` calls `PtvClient.pattern` for at most 4 runs per cycle (soonest per route-direction, tram/bus, no real position, eta within 20 min, pattern cell younger than 60 s skipped), only while the watch set is non-empty.
- Real positions win over estimates for the same run key; the item key is `veh:{sha1(run_ref)[:10]}`; no run ref, bearing, descriptor or operator reaches the layer (JSON scan test).
- `TransitDeparturesProvider.refresh` now publishes `{"type":"touch","provider":"transit_vehicles"}` on success.
- Refresh raises only when every attempted pattern call failed; logs carry provider, exception class and kind only.
- Position with no timestamp (`pos_ts None`) is kept rather than dropped (age cannot be judged); estimates carry `pos_ts = now`.
- Tram position estimates are UNVERIFIED against real PTV data until David adds the key (D-24); fixtures are schema-derived, respx only, no real PTV call.

## Verification (exact)
- `uv run pytest -q` (in server): 277 passed, 1 skipped (incl. 28 tests in test_transit_vehicles.py).
- `uv run ruff check .` (in server): all checks passed.
- Home and `cameras = false` tests (parametrized) assert, with all four transit providers registered and a FAKE key: no `transit_` key in the profile JSON, no `transit_` frame after published touches for all four provider ids, empty watch set, empty `FakeRuntime.nudges`, respx call count 0. A positive-control stream test on a normal place confirms transit frames are visible to that harness.
- `GET /api/profile` with all four providers: respx call count 0.
- Acceptance greps: constants, `class VehicleSource(Protocol)`, `TransitVehiclesProvider(transit)`, `"provider": "transit_vehicles"` present; no pyproj/easting/northing in vehicles.py.

## Deviations from Plan
- Cache callable convention: `cache(int)` returns a stop's departures payload, `cache(str)` returns the pattern cell by run key (the plan's `Callable[[int], dict|None]` could not also carry pattern reads). Documented in vehicles.py.
- `server/shinigami/transit/service.py` (listed in files_modified) needed no change.
- No edits were needed in test_profile_readonly.py or test_stream.py (the vehicles query does not nudge; test_stream follows registered providers).
- Instructed formatting of providers/transit.py: `ruff format` produced no git-visible diff (line-ending only under autocrlf), so no separate style commit exists. store.py left alone. New code in providers/transit.py and main.py is ruff-formatted; main.py import order fixed with `ruff check --fix` on that file only.
- Unrelated uncommitted `server/tests/test_refresh_transit.py` and web files belong to others and were not touched.

## Known Stubs
None.

## Threat Flags
None. Only run refs go to PTV (pattern); the phone gets hashed keys, positions and countdowns.

## Self-Check: PASSED (vehicles.py, test file, commits d6e5699 and db26e5b present)
