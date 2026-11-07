---
phase: 02-3d-map-hero-and-surveillance
plan: 08
subsystem: web-map
tags: [maplibre, protomaps, glyphs, pwa, lazy-load]
requires: ["02-01", "02-03", "02-04"]
provides: [createMap, buildStyle, mapViewFor, same-origin glyphs]
affects: [02-09, 02-10, 02-11, 02-12, 02-13]
key-files:
  created:
    - web/src/map/types.ts
    - web/src/map/style.ts
    - web/src/map/style.test.ts
    - web/src/map/view.ts
    - web/src/map/view.test.ts
    - web/src/map/map.ts
    - web/src/map/map.test.ts
    - web/src/styles/map.css
    - web/public/glyphs/JetBrainsMono-Regular/ (21 PBFs + LICENSE-OFL.txt)
  modified:
    - web/src/app.ts
    - web/src/app.test.ts
    - web/vite.config.ts
requirements: [HUD-04, HUD-10]
completed: 2026-11-07
---

# Phase 2 Plan 08: 3D Map Under the HUD Summary

Token-driven, same-origin Protomaps v4 MapLibre style (pitch 60, zoom 17 follow, extruded buildings from z15), lazily loaded two frames after first paint, with self-hosted JetBrains Mono glyphs.

## Commits
- 292e0f4 Task 1: map contracts, style, view
- 40b8719 Task 2: createMap lifecycle
- b7c79cc Task 3: glyphs, app wiring, vite config

## UI-SPEC deviations (provisional, David confirms in 02-14)
1. Extrusion minzoom 15 (UI-SPEC 14).
2. Extrusion opacity 1 layer-wide (UI-SPEC 0.92).
3. Highlight is colour-only via feature-state `selected`; heights read from `height`/`min_height` (Protomaps v4), not `render_height`.

## Glyphs
JetBrains Mono Regular (David's font-maker ZIP). Only the "JetBrains Mono Regular/" folder was used, flattened. Every range over 64 bytes was committed (21 files, about 566 KB total) plus the forced 0-255 and 8192-8447. Empty ranges are omitted (MapLibre tolerates the 404). Only 0-255 and 8192-8447 are precached; other ranges are left for runtime caching in 02-13.

## Decisions
- Worker: `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` builds to a same-origin asset (`dist/assets/maplibre-gl-worker-*.js`) passed to `setWorkerUrl`. CSP `worker-src 'self'` unchanged, no blob:. Not yet confirmed on a real iPhone.
- Map chunk is 1.06 MB (289 KB gzip), separate from the 29 KB entry; entry contains no `fill-extrusion`.
- Safe-area bottom padding is taken from the measured `.drawer` height (falls back to `--drawer-peek`).
- `setView` in app.ts is only called when the view actually changed (JSON key), so user panning is not undone by unrelated state renders.
- `map-tag` class marks DOM tags for the tap filter; 02-10 must use it.
- Long-press and `onUseGps` are stored in deps but gesture handling is left to 02-11.

## Deviations from Plan
None of Rules 1-4. The inline `#000000` halo was changed to `black` to satisfy the no-hex acceptance grep.

## Verification
- `npm --prefix web test -- --run`: 21 files, 160 tests pass (happy-dom prints AbortError noise at teardown from pending fetches; not a failure).
- `npm --prefix web run build`: green; 28 precache entries.
- Not run: dev check against real tiles (`dev-tiles.sh` extract not produced yet), so no visual verification of the map.

## Known Stubs
`setProfile` stores the profile only; tags consume it in 02-10. `mapViewFor` pin mode returns `none` until 02-09.

## Self-Check: PASSED
