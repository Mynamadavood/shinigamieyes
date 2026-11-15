---
phase: 03-transit
plan: 18
subsystem: web-map
tags: [transit, vehicles, markers, glide, TRAN-03]
requires: ["03-11", "03-16"]
provides: [vehicle tag descriptor, vehicleCardContent, MAX_VEHICLES, GLIDE_MS, JUMP_M, FADE_AFTER_S, REMOVE_AFTER_S]
key-files:
  modified:
    - web/src/map/tags.ts
    - web/src/map/tags.test.ts
    - web/src/map/transit-card.ts
    - web/src/map/transit-card.test.ts
    - web/src/styles/tags.css
    - web/src/map/map.ts
    - web/src/map/map.test.ts
decisions:
  - "Vehicles are exempt from the label cap and overlap demotion, so worst case 6 stops + 8 vehicles + 3 red cameras = 17 labelled tags"
  - "The 8 soonest vehicles (by eta) are chosen in reconcile; assignTags also drops any prio-1 candidate beyond 8"
  - "Vehicle card shows `{stop} in` as the section head above the ticking countdown, because card.ts depLine renders only the countdown when countTargetMs is set (text is kept on the line for data consumers)"
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 3 Plan 18: Vehicle markers and card Summary

Trams and buses heading to David's stops now appear as small blue mode icons with a route badge that glide between updates; estimated positions are dashed and `~`-prefixed, old positions fade at 120 s and vanish at 180 s, and tapping one opens a card with its destination, a ticking countdown to the stop it is heading for, LIVE/SCHED and position age.

## What was built

- `tags.ts`: vehicle descriptor (prio 1, icon `veh-tram`/`veh-bus`, class `vehicle`, `est`, `fading`), `div.veh-badge` label (`96` or `~96`), constants `MAX_VEHICLES = 8`, `GLIDE_MS = 1000`, `JUMP_M = 500`, `FADE_AFTER_S = 120`, `REMOVE_AFTER_S = 180`. `reconcile` now moves existing vehicle markers through `marker.setLngLat`: one shared rAF loop interpolates linearly over 1000 ms and ends exactly at the new point; a move over 500 m or `reducedMotion` jumps. An open vehicle card is replaced and re-anchored (`card.update()`) on moves and per glide frame, and closes when the vehicle leaves the payload. A `startTicker` subscription (only while vehicles exist) toggles `fading`, refreshes the aria-label and removes entries at 180 s; already-too-old positions are never rendered. Vehicles never get `near`.
- `transit-card.ts`: `vehicleCardContent(item, nowMs)`: title `TRAM 96` / `BUS 907` (+ ` · EST`), primary `to {destination}`, section with head and line `{short stop} in` + `countTargetMs = eta_ts * 1000`, rows `Arrival LIVE|SCHED` and `Position {N} s ago|{N} min ago|estimated`, caveats `Estimated from arrival times, not GPS.` (est only) and `Source: PTV`. No ids, no "stops away".
- `tags.css`: vehicle rules (24px box, `.veh-badge`, dashed borders and dim glyph for `est`, `fading` opacity with 400 ms transition, none under reduced motion, z-index 2, selected bar). No red tokens.
- `map.ts`: `TAG_LAYERS` includes `transit_vehicles`; `reducedMotion` passed to `TagLayer`; edge pointers still receive stop items only.

## Verification (exact results)

- `npm --prefix web test -- --run`: 35 files, 411 tests passed (src/map alone: 13 files, 190 tests).
- `npm --prefix web run build`: built successfully, PWA precache 35 entries, `dist/sw.js` generated.
- Acceptance greps: the 5 constants print 5 lines; no `c-red` on any vehicle rule; no `innerHTML` or `setAttribute("style"` in tags.ts; no `stops away` in transit-card.ts; `Estimated from arrival times, not GPS.` and `"transit_vehicles"` in map.ts match.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Card `text` on a countdown line is not rendered**
- **Found during:** Task 2
- **Issue:** `card.ts` `depLine` ignores `text` when `countTargetMs` is set, so "Bourke St Mall in" would not show; `card.ts` is outside this plan's files.
- **Fix:** the same string is also set as the section `head`, rendered above the ticking countdown. The line still carries `text` as the plan specified.
- **Commit:** ef2bfb5

**2. [Ordering note] Task 1 commit depends on Task 2 code**
- `tags.ts` imports `vehicleCardContent` from `transit-card.ts` (Task 2 file), so commit 53f1e6e alone does not type-check; HEAD (ef2bfb5) does.

## Known Stubs

None.

## Commits

- 53f1e6e: feat(03-18): vehicle markers with glide, ageing and estimated style
- ef2bfb5: feat(03-18): vehicle card and transit_vehicles map wiring

## Self-Check: PASSED
