---
phase: 02-3d-map-hero-and-surveillance
plan: 09
subsystem: web-map
tags: [maplibre, markers, accuracy-ring, follow, recenter, icons]
requires: [02-07, 02-08]
provides:
  - original SVG icon sprite (cctv, speed-cam, redlight-cam, building, recenter, pin)
  - red figure marker, blue pin marker, GPS accuracy ring
  - follow/recenter state machine and recenter button
  - area-level saved-place view (PIN_AREA_ZOOM = 12)
key-files:
  created:
    - web/public/icons.svg
    - web/src/map/marker-figure.ts
    - web/src/map/accuracy-ring.ts
    - web/src/map/accuracy-ring.test.ts
    - web/src/map/follow.ts
    - web/src/map/follow.test.ts
  modified:
    - web/src/map/view.ts
    - web/src/map/view.test.ts
    - web/src/map/map.ts
    - web/src/map/map.test.ts
    - web/src/styles/map.css
requirements-completed: [HUD-04]
duration: ~25 min
completed: 2026-11-07
---

# Phase 2 Plan 09: Position marker, pin, follow and recenter Summary

Original red suited-figure marker with accuracy ring (hidden at 10 m or less), blue pin for search, follow-me camera with a recenter button, and an area-level view for saved places using only the 0.1 degree cell centre.

## Commits
- ee55ea8: icons.svg, marker-figure.ts, accuracy-ring.ts (+ test)
- 5e7ecd4: follow.ts, view.ts pin case, map.ts wiring, map.css, tests

## Behaviour
- gps view: figure marker (aria-label updated with accuracy) plus ring; search view: blue pin, no figure; pin (saved place) view: no marker, jumpTo cell centre at zoom 12 pitch 0 (CR-02, T-02-33).
- Follow starts on; first fix or a change of source jumps to full framing (zoom 17, pitch 60, bearing 0) and re-enables follow; later fixes ease centre-only (400 ms). User gestures (events carrying `originalEvent`) turn follow off and show the 48 px recenter button; click flies back (600 ms) or jumps under reduced motion.
- Ring syncs on each gps view (deferred until style load), radius updated on zoom throttled by requestAnimationFrame; no animation.
- DOM built only with createElement / createElementNS; sprite referenced as same-origin `/icons.svg#recenter`.

## Deviations from Plan
- [Rule 3] Added `as const` to the gesture event list in map.ts for the type check.
- map.test.ts fake Map gained `flyTo`/`isStyleLoaded` and a fake `Marker`; existing assertions unchanged.
- `.recenter` CSS uses `var(--sp-md, 16px)` fallback because no `--sp-md` token exists.
- Recenter on a saved-place (pin) view flies to the area view (no precise point exists).

## Verification
- `npm --prefix web test -- --run src/map`: 5 files, 35 tests pass.
- Full web suite: 13 files, 118 tests pass; 12 vitest "Timeout waiting for worker" errors were reported (machine load from parallel executors), not test failures.
- `npm --prefix web run build` (tsc + vite): passes.

## Needs David's eyes on the iPhone
- Figure silhouette readability at 32 px, pin look, ring size at various zooms.
- Recenter button position above the drawer, and that pan/pinch/rotate/pitch reveal it.
- Saved place sits at area level with no marker.

## Known Stubs
None.

## Self-Check: PASSED
