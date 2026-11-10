---
phase: 02-3d-map-hero-and-surveillance
plan: 16
subsystem: surveillance
tags: [cameras, osm, privacy, guard-post]
requirements: [SURV-01]
key-files:
  modified:
    - server/shinigami/data/refresh_cameras.py
    - server/shinigami/providers/cameras.py
    - web/src/map/camera-card.ts
    - server/tests/test_refresh_cameras.py
    - server/tests/test_cameras.py
    - server/tests/fixtures/enforcement.osm
    - web/src/map/camera-card.test.ts
metrics:
  completed: 2026-11-10
---

# Phase 2 Plan 16: Guard posts and owner names Summary

Guard posts (k=guard) now flow from the weekly job through the 150 m CCTV layer to a GUARD POST card, and OSM operator names are shown unless the privacy rule (shown_operator) drops them.

## Commits
- 108ce5a: weekly job emits guard posts, shown_operator rule, counts line `cctv= guard= speed= redlight=`
- fe1daf2: provider serves cctv+guard (name `Guard post`), card title GUARD POST

## Deviations from Plan
None. Road-name lookup in build() now keys on speed/redlight explicitly so guard records do not get a road.

## Notes
cameras.json on the CT updates only after the data job re-runs (plan 02-18). The job was not run against live Overpass.
