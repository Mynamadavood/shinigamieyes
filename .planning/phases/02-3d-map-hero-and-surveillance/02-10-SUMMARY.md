---
phase: 02-3d-map-hero-and-surveillance
plan: 10
subsystem: web-map
tags: [tags, cards, leader, cameras, budget]
requires: ["02-07", "02-09"]
provides: ["TagLayer (<=60 DOM markers, 20 labels)", "Card + Leader (reusable by 02-11)", "camera card copy"]
affects: ["02-11 building / pin / YOU cards"]
tech-stack:
  added: []
  patterns: ["pure rank/assign/place functions", "moveend-debounced re-rank", "injected marker factory"]
key-files:
  created: [web/src/map/tags.ts, web/src/map/tags.test.ts, web/src/map/card.ts, web/src/map/card.test.ts, web/src/map/leader.ts, web/src/map/camera-card.ts, web/src/map/camera-card.test.ts, web/src/styles/tags.css]
  modified: [web/src/map/map.ts, web/src/map/map.test.ts]
requirements-completed: [HUD-05, SURV-01, SURV-02]
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 2 Plan 10: Camera tags and cards Summary

Camera items from `cameras_cctv` / `cameras_road` now float on the 3D map as icon + label tags under the D-11 budget and D-13 colour rule, and tapping one opens a framed card with a leader line.

## Commits
- 928070e: tags.ts (pure rank/assign), card.ts (placeCard + Card), leader.ts, camera-card.ts, tests
- 4a13821: TagLayer, map.ts wiring, tags.css, map tests

## Behaviour
- Distances are recomputed on the client (haversine) from the gps or search point; saved-place (pin) and none views show no tags.
- Ranking: within 30 m first, then nearest. Red for the 3 nearest within 30 m. At most 60 markers; labelled tags capped at 8 below zoom 17.5 and 20 from 17.5 up; overlapping labels demote to compact; compact clusters capped at 6 per 96 px.
- Re-rank runs on profile/view change and `moveend` (debounced 100 ms); `move` only repositions the open card and leader via rAF.
- Card: role dialog, textContent only, focus in on open and back to the tag on close, closes on Escape, outside pointerdown or canvas click; opening another card replaces it. Card parent is `document.body` (position fixed), safe band from `.readouts` bottom to the drawer height.
- Copy: CCTV card ends "Source: OpenStreetMap" / "Mapped, not exhaustive."; speed and red-light cards end "Source: OpenStreetMap" / "Mapped, not exhaustive." / "Static info only."; no alert phrasing (tested).

## Deviations from Plan
- UI-SPEC amendment applied as planned: speed card source line is `Source: OpenStreetMap` plus `Mapped, not exhaustive.` before `Static info only.`
- [Design choice] Added `BASE_FULL = 8`: the plan gives zoom 17.5 meaning only if fewer labels show below it, so below 17.5 at most 8 tags are labelled and from 17.5 up to `MAX_FULL = 20`.
- `CardContent` gained optional `extra` (second Body line for road, suburb) and `Card.open` opts gained optional `onClose`; both are supersets of the planned contract.
- `TagLayer` takes an injected `createMarker` so tags.ts has no maplibre import (keeps its tests light); map.ts supplies the real `Marker`.
- The "Map tags" `role=group` is set on the markers' parent element (maplibre canvas container) when the first marker is added, since maplibre owns marker placement.
- map.test.ts fake Map gained `project`/`getZoom`, fake Marker now attaches its element to the body; earlier assertions unchanged.

## Verification
- `npm --prefix web test -- --run`: 28 files, 221 tests pass (happy-dom prints AbortError noise at teardown, not failures).
- `npm --prefix web run build`: passes. No server changes, so pytest/ruff not run.
- Greps: no `innerHTML`, no `setAttribute("style"`, no hex literals in tags.css.

## Needs David's eyes on the iPhone
- Tag look at 32/24 px, chip label legibility, red near state within 30 m.
- Card placement beside tags (right/left flip), leader line tracking while panning, safe band between the readouts and the drawer.
- Tap on a tag does not collapse the drawer; tap elsewhere closes the card.
- Tag count and smoothness in a dense CBD area at zoom 17.5+.

## Known Stubs
None.

## Self-Check: PASSED
