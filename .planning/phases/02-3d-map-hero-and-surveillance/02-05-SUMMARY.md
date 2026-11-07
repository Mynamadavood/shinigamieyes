---
phase: 02-3d-map-hero-and-surveillance
plan: 05
subsystem: data
tags: [osm, osmium, cameras, systemd]
requires: [02-01]
provides: [cameras.json contract builder, weekly refresh unit]
key-files:
  created:
    - server/shinigami/data/__init__.py
    - server/shinigami/data/refresh_cameras.py
    - server/tests/fixtures/enforcement.osm
    - server/tests/test_refresh_cameras.py
    - deploy/refresh-data.sh
    - deploy/shinigami-data.service
    - deploy/shinigami-data.timer
  modified:
    - deploy/deploy.sh
requirements: [SURV-01, SURV-02]
completed: 2026-11-07
---

# Phase 2 Plan 05: Camera dataset Summary

Offline OSM-to-cameras.json job (pyosmium, three passes incl. enforcement relations) with privacy filters, run weekly by a sandboxed systemd timer.

## PROVISIONAL decision 2 (David to confirm in 02-14)
`surveillance:type=guard` nodes are excluded entirely; `operator` is kept only when `operator:type` is public/government or the name matches a public-body pattern (Council, City of, Shire, Department, Government, Victoria Police, VicRoads, PTV, Metro Trains, Yarra Trams, V/Line); otherwise dropped. To flip it, edit `public_operator` / the guard check in `refresh_cameras.py`.

## Commits
- fdf9ac6: transform job, fixture, tests
- ef21c1d: refresh-data.sh, data service/timer, deploy.sh wiring

## Verification
- test_refresh_cameras.py: 12 passed, end-to-end test ran (osmium importable, not skipped).
- `bash -n` passes on refresh-data.sh and deploy.sh.
- Full suite: 115 passed, 2 failed in server/tests/test_tiles.py (plan 02-04's parallel work, out of scope; not touched).

## Deviations
- Test expectation: direction "SSW" (202.5 deg) rounds to "south" (banker's rounding on the 45-degree bucket), which the plan allowed ("south" or "south-west").
- Fixture uses "Joes Pizza" (no apostrophe) to avoid shell quoting issues.
- Real Geofabrik PBF not downloaded (per instructions); real run is David's step in 02-06.

## Known Stubs
None.

## Self-Check: PASSED
