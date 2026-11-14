---
phase: 03-transit
plan: 03
subsystem: web-map
tags: [transit, tags, sprites, stop-card]
requires: []
provides: [stop tags on the map, stop card header, transit helpers, 7 sprites, transit tokens]
affects: [03-08 map wiring, 03-10 departure sections]
key-files:
  created: [web/src/transit.ts, web/src/transit.test.ts, web/src/map/transit-card.ts, web/src/map/transit-card.test.ts]
  modified: [web/public/icons.svg, web/src/styles/tokens.css, web/src/styles/tags.css, web/src/map/tags.ts, web/src/map/tags.test.ts]
decisions:
  - "TagLayer picks a per-kind descriptor (camera or stop) via descFor(item); only layer transit_stops is a stop"
  - "Stops are always in `full`; red cameras within 30 m bypass the label cap"
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 3 Plan 03: Stop tags and stop card Summary

Transit stops render as always-labelled 40px blue tags (glyph, short name, `{distance} · {N} min`) with a tappable stop card, via a priority-aware TagLayer that leaves camera behaviour unchanged.

## Tasks

1. Helpers, sprites, tokens: commit 50c11d3.
2. TagLayer generalisation and stop card: commit a0d31d6.

## Verification

- `npm test -- --run` on the four own test files: 37 passed. Full web suite: 303 passed (run after both commits).
- `npm run build`: exit 0.
- Grep gates: no innerHTML or setAttribute("style") in tags.ts or transit-card.ts; no red token in stop CSS rules; 7 new symbols, no veh-train; `--tag-stop: 40px` present.
- vitest flaked twice under load (no tests, errors) and passed on re-run.

## Deviations from Plan

None in behaviour. Red-camera cap bypass implemented as "continue" rather than "break" in the label loop (equivalent for existing tests).

## Notes

- `TagCand.prio` is now required; the tags test factory defaults it to 2.
- Vehicle prio (1) and `veh-*` sprites exist but no vehicle descriptor yet; plan 03-08 and later wire them.
- `stopCardContent` ignores ctx and nowMs for now (departure sections come from plan 03-10).

## Self-Check: PASSED
