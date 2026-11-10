---
phase: 02-3d-map-hero-and-surveillance
plan: 15
subsystem: server+web
tags: [cameras, saved-places, privacy, gap-closure]
requires: []
provides:
  - Place.cameras flag (fail closed for Home)
  - exact_ok gate in assemble_profile
  - server-distance tag origin for pin views
affects: [verify.sh]
key-files:
  modified:
    - server/shinigami/places.py
    - server/shinigami/api/places.py
    - server/shinigami/assemble.py
    - server/shinigami/api/profile.py
    - server/shinigami/api/stream.py
    - server/tests/test_places.py
    - deploy/places.example.toml
    - deploy/verify.sh
    - web/src/map/tags.ts
    - web/src/map/map.ts
    - web/src/ui/readouts.ts
    - web/src/map/tags.test.ts
    - web/src/map/map.test.ts
    - web/src/ui/readouts.test.ts
decisions:
  - Home (id home or label starting Home) is always camera-free, even with cameras = true or no flag
  - Pin profiles keep lat/lon null; distances come from detail.distance_m
metrics:
  tasks: 3
  completed: 2026-11-10
---

# Phase 2 Plan 15: Saved places show cameras, Home never does

Per-place `cameras` flag (default true, forced false for Home, non-bool fails closed) feeds an `exact_ok` gate in `assemble_profile` (default False); pin views rank and colour camera tags from the server's `detail.distance_m`, and verify.sh checks both camera-free and camera places.

## Commits
- bfa4393 feat: server flag, gate, /api/places cameras boolean, tests, example toml
- 79ff52f feat: client pin-view tags, one-time CCTV framing, readout rule, tests
- 31b2ea1 chore: verify.sh place_no_cameras / place_cameras

## Tests
pytest 129 passed, 1 skipped (osmium); ruff clean; web 247 passed; web build OK; `bash -n deploy/verify.sh` OK (live run is plan 02-18).

## Deviations
- [Rule 3] Fixed a pre-existing ruff I001 import-order error in server/tests/test_places.py so `ruff check` exits 0.
- Pin framing uses `map.fitBounds(..., {duration: 0})` under reduced motion instead of a literal `jumpTo` (equivalent instant move; avoids computing a camera by hand).
- tags.test.ts TagLayer test uses a stub map; the pin-view behaviour is also covered in map.test.ts.

## Known Stubs
None.

## Self-Check: PASSED
