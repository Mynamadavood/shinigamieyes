---
phase: 02-3d-map-hero-and-surveillance
plan: 07
subsystem: surveillance-cameras
tags: [cameras, privacy, readout]
requires: ["02-03", "02-04", "02-05"]
provides: ["cameras_cctv and cameras_road layers", "ProfileLocation.cell_lat/cell_lon", "camera count readout"]
affects: ["02-10 tags and cards"]
tech-stack:
  added: []
  patterns: ["in-memory lat-bucket index with mtime reload", "ProviderMeta.exact_location_only privacy skip"]
key-files:
  created: [server/shinigami/cameras_store.py, server/shinigami/providers/cameras.py, server/tests/test_cameras.py]
  modified: [server/shinigami/assemble.py, server/shinigami/schema.py, server/shinigami/api/profile.py, server/shinigami/main.py, server/shinigami/settings.py, server/shinigami/providers/base.py, server/tests/conftest.py, server/tests/test_places.py, server/tests/test_stream.py, deploy/shinigami.service, .env.example, web/src/types.ts, web/src/ui/readouts.ts, web/src/ui/readouts.test.ts, web/src/styles/hud.css]
decisions:
  - "PROVISIONAL decision 1 (David confirms in 02-14): no camera layers for place= pins; map centres on 0.1 degree cell"
metrics:
  tasks: 3
  completed: 2026-11-07
---

# Phase 2 Plan 07: Camera layers and count readout Summary

Computed CCTV (150 m) and road-camera (1 km) layers served from an in-memory CameraStore, skipped entirely for saved-place pins, with an honest top-right count readout.

## Commits
- 34ddffe feat(02-07): CameraStore and computed providers
- 8b568a4 feat(02-07): no camera layers for saved places; cell centre
- (web) feat(02-07): camera count readout in the HUD top-right

## PROVISIONAL decision 1 (David to confirm in 02-14)
- `place=` profiles get no `cameras_*` layer (assemble skips providers with `exact_location_only` when `location.source == "pin"`); `ProfileLocation.cell_lat/cell_lon` carry the 0.1 degree cell centre for the map.
- Added copy (not in the approved UI-SPEC table): `Cameras · not shown for saved places`.
- Flip: remove the assemble skip and add a per-place opt-in (comment `PROVISIONAL (02-07, decision 1)` in assemble.py).

## Deviations
1. [Rule 1] test_places.py `HOME` fake coordinate was exactly on a 0.1 degree cell centre (-37.7, 145.09), so exposing cell_lat/cell_lon made the string-leak assertion trip. Moved to (-37.7234, 145.0912), off-centre; the assertion keeps its meaning (exact coordinates never leak).
2. [Rule 3] test_stream.py expected exactly 3 initial layers; updated to 5 (two camera layers, status pending when no dataset).
3. [Rule 3] Added small `.readout-cameras` / `.count-num` / `.count-rest` rules to web/src/styles/hud.css (not in plan's file list) for the readout styling.
4. `ruff format server` reformatted unrelated files; those were reverted, only plan files kept.

## Verification
- `uv run pytest -q`: 124 passed, 1 skipped; `uv run ruff check server`: clean
- `npm --prefix web test -- --run`: 162 passed (an unrelated happy-dom teardown ECONNREFUSED ::1:3000 log appears at teardown; tests pass)
- `npm --prefix web run build`: OK

## Known Stubs
None. Camera layers are `pending` until cameras.json exists (02-05 job output).

## Threat Flags
None beyond the plan's register (T-02-23..27 mitigated as planned).

## Self-Check: PASSED
