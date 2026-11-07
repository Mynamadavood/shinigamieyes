---
phase: 02-3d-map-hero-and-surveillance
plan: 12
subsystem: hero-activation
tags: [hero, svg, css, reduced-motion, hud-03]
requires: ["02-08"]
provides: ["mountHero / shouldPlayHero", "createEyesSvg", "BootDeps.hero", "resetHeroPlayed test hook"]
affects: ["02-14 phone checkpoint"]
tech-stack:
  added: []
  patterns: ["transform/opacity-only keyframes with steps()", "single hard-cap timer", "module-level heroPlayed flag"]
key-files:
  created: [web/src/ui/hero.ts, web/src/ui/hero-art.ts, web/src/ui/hero.test.ts, web/src/styles/hero.css]
  modified: [web/src/app.ts, web/src/app.test.ts]
decisions:
  - "Draw-on uses a translateX mask reveal instead of stroke-dashoffset (dashoffset animates on the main thread, which MapLibre init blocks; RESEARCH Pattern 9 / Pitfall 7)"
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 2 Plan 12: Hero activation Summary

Original blood-red anime-style eyes (DOM/SVG/CSS only, no second GL context) snap open under an "EYES" title bar on every cold open, with a 1500 ms hard cap, tap/close-box skip, and a 700 ms static reduced-motion variant.

## Commits
- 05094c1 feat(02-12): original red-eyes hero art and capped timeline controller
- 20fd7af feat(02-12): play the hero on cold open over real loading

## Draw-on technique change
The UI-SPEC stroke-dashoffset draw-on is replaced by a black `.reveal` rect that slides away with `translateX` (100-300 ms). Everything in hero.css animates only `transform` and `opacity`, so the hero stays smooth while the map chunk initialises.

## Behaviour
- Mounted synchronously right after `mountShell`, before the IndexedDB read; takes no data and is never awaited. The double-rAF map start is unchanged.
- Timers: fade class at 1300 ms, removal at 1500 ms (single hard-cap timer). Skip (button, or title-bar `×`) adds `fading` and removes after 200 ms, never later than 1500 ms. Reduced motion: static open eyes, fade at 500, removed at 700; skip removes at once.
- Single flash: flood at 35% opacity for ~66 ms, none under reduced motion.
- `heroPlayed` is module-level; `shouldPlayHero` also rejects `back_forward` and persisted restores. No hero mount in visibilitychange / pageshow / online handlers.
- Other root children get `aria-hidden` while the hero is up and it is removed at the end.

## Deviations
1. shell.ts was not modified: the existing `.close-box` span is already queryable, so the hero attaches its own click listener (plan listed shell.ts defensively).
2. `app.test.ts`: existing tests that boot with fakes now pass `hero: false` (the WR-06 test keeps the hero on); `resetHeroPlayed()` is exported from app.ts as a test hook and called in `beforeEach`.
3. app.ts contains a literal NUL character inside the `CACHED_KEY` string (pre-existing); edits were made via a byte-safe script and CRLF line endings preserved.

## Verification
- `hero.test.ts`: 8 passed; `app.test.ts` + `offgrid.test.ts`: 23 passed.
- Full suite: 21 files, 168 tests passed (4 happy-dom teardown errors, unrelated); build OK.

## Known Stubs
None.

## Threat Flags
None. T-02-42 (hero never awaited, hard cap, tested with hung map loader), T-02-43 (createElementNS/classes only, no inline style/innerHTML), T-02-44 (single 66 ms 35% flash, none under reduced motion) mitigated.

## Needs David's eyes on the iPhone
- Art quality and the snap/flash feel of the eyes, the 1.5 s length, tap-to-skip, and that the title bar does not jump when "EYES" becomes "SHINIGAMI EYES".
- Turning on Reduce Motion should show static open eyes for ~0.7 s.

## Self-Check: PASSED
