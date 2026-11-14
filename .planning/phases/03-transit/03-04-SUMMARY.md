---
phase: 03-transit
plan: 04
subsystem: web
tags: [transit, drawer, privacy-backstop]
requires: []
provides: [transitRows, transitStatusText, isExactLayer, stripExactLayers]
affects: [web/src/model.ts, web/src/app.ts]
key-files:
  modified:
    - web/src/model.ts
    - web/src/model.test.ts
    - web/src/ui/next-list.ts
    - web/src/ui/next-list.test.ts
    - web/src/ui/readouts.ts
    - web/src/ui/readouts.test.ts
    - web/src/styles/app.css
    - web/src/app.ts
    - web/src/app.test.ts
decisions:
  - Transit rows are appended after generic rows so null-target rows sort last
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 3 Plan 04: Transit drawer scaffolding and Home backstop Summary

Drawer "none nearby" and Departures status rows (never red, never in corner readouts), plus a client strip of `transit_*` layers for camera-off places alongside `cameras_*`.

## Tasks

1. Transit drawer model (commit 329c85c): generic loop skips `transit_*`; `transitRows()` and `transitStatusText()` added; RowVM gained `transit`, `none`, `stopId`; `cornerRows` ignores transit rows; NextList toggles `transit`/`none` classes; dim CSS for none rows (no red). Returns [] when `transit_stops` is absent (Home).
2. Client backstop (commit c737c74): `isCameraLayer`/`stripCameraLayers` renamed to `isExactLayer`/`stripExactLayers`, covering cached, fetch, stream and save paths. New app tests for strip, cached camera-off pin, stream frames not applied or saved, GPS frames applied.

## Verification

- model/next-list/readouts tests: 30 passed. app + offgrid tests: 31 passed. `tsc --noEmit` clean.
- `npm run build`: first run failed with ENOENT on `dist/sw.mjs` (dist race with concurrent executors); retry exited 0.
- Full web test run not executed (only plan-owned files, per parallel-run rules).

## Deviations from Plan

None in behaviour. Note: app.test.ts had no existing WR-W5 camera tests, so the new tests were added fresh with idb-keyval/store mocks.

## Known Stubs

None.

## Self-Check: PASSED
