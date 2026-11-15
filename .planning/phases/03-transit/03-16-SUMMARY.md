---
phase: 03-transit
plan: 16
subsystem: web-map
tags: [transit, disruptions, stop-card, stop-tag, TRAN-04]
requires: ["03-10", "03-13"]
provides: [stopDisruptions, MAX_CARD_ALERTS, .tag-warn badge, stop card alerts]
key-files:
  modified:
    - web/src/map/transit-card.ts
    - web/src/map/transit-card.test.ts
    - web/src/map/tags.ts
    - web/src/map/tags.test.ts
    - web/src/styles/tags.css
    - web/src/map/card.ts
    - web/src/map/card.test.ts
decisions:
  - "Stop card wide width applied in CSS with .card:has(.card-sections), since only stop cards have sections and card.ts root class is shared"
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 3 Plan 16: Map disruption marks Summary

The stop card now lists up to 2 alerts (service-stopping first, then soonest end) with PTV's title and an `ends in` countdown, marks affected departure lines with a warn glyph, and affected stop tags carry a small `.tag-warn` badge with a spoken suffix.

## What was built

- `transit-card.ts`: `stopDisruptions(stopItem, ctx)` (matches stop id in `stop_ids` or any route_id of that stop's departures in `route_ids`; severity 3 first, then soonest `to_ts`), `MAX_CARD_ALERTS = 2`, `card-alerts` section (`card-alert` + `stop` for severity 3, title trimmed to 120, `card-alert-end` "ends in" with a countdown, `+N more · see disruptions`). Departure lines get `warn` 1 or 3 by route, stop or `disruption_ids`. No links or urls ever enter the card.
- `tags.ts`: `applyBadge` creates/removes `.tag-warn` (class `info` or `stop`, warn glyph via createElementNS) when the departures or disruptions layer reference changes in `setCardContext`, and on reconcile; aria-label gains `, disruption` or `, service stopped`. Cameras never get a badge.
- `tags.css`: `.tag-warn` 16x16 `--c-panel` square overlapping the icon's top-right by 8px (`.tag-icon` made `position: relative`), `--c-text` for info and `--c-red` for stop; alert block styles (red-deep fill only for severity 3, 3-line clamp).
- Wave-3 carry-over: the stop card now uses the UI-SPEC 240 px `--card-w-wide` (`.card:has(.card-sections)`).

## Deviations from Plan

**1. [Rule 3 - Blocking] card.ts dropped the warn glyph on text-only lines**
- Alert lines are text lines; `depLine` returned early for them and ignored `warn`. Added a shared `warnGlyph` helper and a `dep-text-body` span when a text line has `warn`. Added a card.test.ts test. `card.ts` and `card.test.ts` are outside this plan's `files_modified` but no other running executor touched them.
- Commit: e7d3fbb

**2. Wide card class not applied literally.** The `card transit` class is not set on the card root (that needs a card API change); width is applied by CSS `:has(.card-sections)` instead. Only stop cards render sections today. `:has` needs iOS 15.4+. The `transit` class itself is still not applied.

Route and stop ids in disruptions are numbers (as in 03-13 model.ts); matching is numeric.

## Verification

- `npm --prefix web test -- --run src/map/transit-card.test.ts`: 17 passed.
- `npm --prefix web test -- --run src/map`: 13 files, 172 passed.
- Full `npm --prefix web test -- --run`: 35 files, 393 passed.
- `npm --prefix web run build`: exit 0 (35 precache entries).
- Gates: `MAX_CARD_ALERTS = 2` and `see disruptions` in transit-card.ts; `tag-warn` in tags.ts and tags.css; no `innerHTML` or `setAttribute("style"` in tags.ts or transit-card.ts.
- Not verified visually on a device (layout of badge and wide card).

## Commits

- 9bf1f14: alerts and per-line warnings in the stop card
- e7d3fbb: tag badge, wide stop card, alert styling, card.ts glyph fix

## Known Stubs

None.

## Self-Check: PASSED
