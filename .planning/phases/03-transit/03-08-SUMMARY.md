---
phase: 03-transit
plan: 08
subsystem: web-map
tags: [transit, edge-pointers, map-wiring]
requires: ["03-03"]
provides: [stop tags on the live map, D-14 edge pointers, transit card context in map.ts]
affects: [03-10 departure sections]
key-files:
  created: [web/src/map/edge-pointers.ts, web/src/map/edge-pointers.test.ts]
  modified: [web/src/map/map.ts, web/src/map/map.test.ts, web/src/styles/tags.css]
decisions:
  - "isOnScreen takes `pointerShown` (the plan named it `inside`): a shown pointer needs 16 px of margin before it is removed"
  - "EdgePointers deps gained optional onTap, padding and avoid so map.ts can turn follow off, keep the bottom padding and dodge the recenter button"
  - "Safe-area insets are read through a hidden probe element whose padding uses env(), set via CSSOM (env() cannot be read from computed custom properties)"
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 3 Plan 08: Map wiring and edge pointers Summary

Stop tags now render from `transit_stops` on the live map, and stops that are off-screen get blue edge-arrow chips (`Flinders St · 900 m`) that ease the map to the stop and then open its card.

## Tasks

1. EdgePointers and geometry (`screenAngle`, `rayToRect`, `isOnScreen`), CSS: commit c6a2e41.
2. map.ts wiring (TAG_LAYERS, pointers, card context) and tests: commit c7f368b.

## Behaviour

- Geometry: angle from the geographic bearing minus map bearing (not from `project()`), ray from the clamp-rectangle centre, chip placed flush on the hit edge, 36 px slide with reversal, 4 px gap, max 5 nearest, at most 6 projections per recompute, rAF throttle on `move`, recompute on `moveend` and resize.
- Hidden when: sheet backdrop present, clamp rect null or under 144 px, origin null, or no stops (Home has no `transit_stops`, so no pointers).
- Tap: `onTap` (same path as a user pan, so follow turns off and recenter appears), `easeTo({center, padding, duration: 600})` or `jumpTo` under reduced motion, then `tags.openById("stop:...")` after `moveend`.
- map.ts: `CAMERA_LAYERS`/`lastCamLayers` renamed `TAG_LAYERS`/`lastTagLayers`; a separate reference check on departures, disruptions and stops calls `tags.setCardContext` with `ptvState` from the stops summary `detail.ptv`. Pin framing still uses camera items only (comment added).

## Verification

- `npm --prefix web test -- --run src/map`: 13 files, 144 tests passed (15 new in edge-pointers, 7 new in map.test.ts).
- `npm --prefix web run build`: exit 0.
- Grep gates: no `innerHTML` or `setAttribute("style"` in edge-pointers.ts; `MAX_POINTERS = 5` and `HYSTERESIS_PX = 16` present; no `CAMERA_LAYERS`/`lastCamLayers` left in map.ts; no `--c-red` in edge-pointer CSS.
- Full web suite: see the report returned to the orchestrator (the run exceeded the 120 s tool timeout and was run in the background).

## Deviations from Plan

None in behaviour. Test-only: the map.test.ts FakeMap gained `once`, `getCenter`, `getBearing`, `getBounds`. map.ts uses `style.setProperty` on a hidden probe element for safe-area insets (CSSOM, CSP-safe).

## Known Stubs

None.

## Self-Check: PASSED
