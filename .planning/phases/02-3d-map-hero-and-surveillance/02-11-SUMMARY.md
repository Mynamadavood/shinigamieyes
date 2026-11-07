---
phase: 02-3d-map-hero-and-surveillance
plan: 11
subsystem: map-interactions
tags: [longpress, pin, buildings, cards]
requires: ["02-08", "02-09", "02-10"]
provides: ["createLongPress state machine", "BuildingSelector with GeoJSON fallback", "YOUR PIN / YOU / BUILDING cards"]
affects: ["02-14 on-device verification"]
tech-stack:
  added: []
  patterns: ["injectable-timer pure state machine", "feature-state with runtime id detection and GeoJSON overlay fallback"]
key-files:
  created: [web/src/map/longpress.ts, web/src/map/longpress.test.ts, web/src/map/buildings.ts, web/src/map/buildings.test.ts]
  modified: [web/src/map/map.ts, web/src/map/map.test.ts, web/src/styles/map.css]
decisions:
  - "PROVISIONAL decision 3: building highlight is colour-only via feature-state; card title is always BUILDING (Protomaps buildings have no name)"
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 2 Plan 11: Pin drop, pin/YOU cards and building tap Summary

Long-press (500 ms, 10 px tolerance) drops a blue pin via `deps.onLongPress`; the pin and figure open YOUR PIN / YOU cards; tapping a building at zoom 15+ turns it red and opens a BUILDING card.

## Commits
- 32ed4b5 feat(02-11): long-press state machine and building selection
- 1642c56 feat(02-11): wire pin drop, pin/YOU cards and building tap into the map

## Notes
- PROVISIONAL decision 3 applied: colour-only highlight, title always `BUILDING`.
- GeoJSON fallback: implemented and unit-tested (id-less features go to source `building-hot`, layer `buildings-hot`), but not exercised against real tiles. Whether the Protomaps daily build carries feature ids (RESEARCH A3) is still unverified; the selector detects it at runtime. Layer filter in style.ts is unchanged (no promoteId).
- "No height data" and "Set from the map" are rendered as dim caveat rows, because the card's secondary rows always print a "key: " label.
- Ring is a `div.longpress-ring` positioned with `--x/--y` custom properties; reduced motion shows a static ring. Selectors are prefixed `.map-host` so they outrank maplibre-gl.css.
- Touches starting on `.tag, .map-tag, .card, .hud, .drawer, .marker-hit, .recenter, .maplibregl-ctrl` never start the ring.

## Deviations
1. [Rule 3] map.test.ts FakeMap extended (getCanvasContainer, unproject, queryRenderedFeatures, feature-state methods, configurable zoom). It was already in the file list.
2. UI_SELECTOR also includes `.map-tag`, `.marker-hit`, `.recenter`, `.maplibregl-ctrl` beyond the plan's four classes (the real tag class is `map-tag`).
3. Map click also ignores `.marker-hit` targets so marker taps do not immediately close their own card.

## Verification
- `npm --prefix web test -- --run`: 240 passed (31 files)
- `npm --prefix web run build`: OK
- No server changes; no innerHTML or setAttribute("style") in map.ts.

## Known Stubs
None.

## Threat Flags
None. Pin coordinates are never logged.

## Self-Check: PASSED

## Building ids (RESEARCH A3, checked by the orchestrator 2026-11-07)
- Decoded the live z15 CBD tile from /tiles: all 3386 `buildings` features carry an id (1868 unique; parts of one building share it). Max id is well under 2^53.
- So selection takes the `setFeatureState` path; the GeoJSON fallback is a safety net only. A shared id highlights every part of that building, which is the intended look.
