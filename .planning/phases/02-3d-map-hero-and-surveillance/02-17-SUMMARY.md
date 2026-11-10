---
phase: 02-3d-map-hero-and-surveillance
plan: 17
subsystem: web-map-hud
tags: [tags, card, gap-closure, a11y]
requires: ["02-15", "02-16"]
provides: [labelSide, placeCard-avoidance, guard-spoken-type]
affects: [web/src/map/tags.ts, web/src/map/card.ts, web/src/styles/tags.css]
key-files:
  modified:
    - web/src/map/tags.ts
    - web/src/map/tags.test.ts
    - web/src/styles/tags.css
    - web/src/map/card.ts
    - web/src/map/card.test.ts
decisions:
  - "Label flips left only when right clips and left fits (EDGE 16); width falls back to 144 px"
  - "Card scores right/left/above/below by covered tag rects; ties go to previous side then fixed order"
requirements: [HUD-04, HUD-05, SURV-01]
completed: 2026-11-10
---

# Phase 2 Plan 17: Tag label flip and card avoidance Summary

Tag labels flip to the left of the icon at the right screen edge, the info card chooses the side covering the fewest other tags (with a new "below" side), and guard posts are announced as "Guard post".

## Tasks

1. Label flip: pure `labelSide()`, `flip` class set in reconcile (full tags only), `.map-tag.flip .tag-label` CSS rule, optional `viewportWidth` dep, `spokenType("guard")` = "Guard post". Commit 667d132.
2. Card avoidance: `placeCard(..., avoid, prefer)` with four candidate sides and overlap scoring; `Card.place` collects other tags' icon and visible label rects, remembers the chosen side per anchor. leader.ts untouched. Commit 66f7e20.

## Verification

- web tests: 31 files, 261 tests pass; build OK; pytest 129 passed, 1 skipped; ruff clean.
- No innerHTML or style attribute strings in tags.ts/card.ts.

## Deviations from Plan

None. Test geometry in card.test.ts was adjusted during authoring so left-side candidates fit the viewport.

## Self-Check: PASSED
