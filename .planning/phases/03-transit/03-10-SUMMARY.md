---
phase: 03-transit
plan: 10
subsystem: web-map
tags: [transit, stop-card, departures, ticker, TRAN-02]
requires: ["03-03", "03-07", "03-08"]
provides: [CardContent.sections, Card.replace, depLines, stop card departures]
affects: [03-11, 03-13]
key-files:
  modified: [web/src/map/card.ts, web/src/map/card.test.ts, web/src/map/transit-card.ts, web/src/map/transit-card.test.ts, web/src/map/tags.ts, web/src/map/tags.test.ts, web/src/styles/tags.css]
decisions:
  - "Card ticker floors the remaining seconds like fmtCountdown, so a tick 5 ms after the second boundary shows N-1 immediately"
  - "Alerts and per-line warn glyphs are not built here (not in this plan's tasks); CardLine.warn is supported by the card renderer"
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 3 Plan 10: Stop card departures Summary

The stop card now lists the next 2 departures per route and direction (8 lines max) with LIVE/SCHED marks, delay and platform notes, dimmed "too late" lines, CANCELLED chips, explicit loading / no-key / unavailable / empty / stale states, per-second ticking countdowns and in-place refresh when new departures arrive.

## Tasks

1. Card sections: commit 7742674. `CardLine`, `CardSection`, `CardContent.sections`, `Card.replace()`, ticker started only while a card with countdown lines is open (text-node updates, targets kept in a WeakMap), scroll cap via `style.setProperty("--card-max-h")` plus a `scroll` class on `.card-sections`, CSS in `tags.css`.
2. Departures, states, refresh: commit efdb1f7. `depLines`, `MAX_CARD_LINES = 8`, `PER_GROUP = 2`, `stopCardContent` sections; `TagLayer.setCardContext` calls `card.replace` only when the open card belongs to a `transit_stops` tag, using `nowMs()` from `../clock`.

## Verification

- `npm --prefix web test -- --run src/map/card.test.ts`: 22 passed.
- `npm --prefix web test -- --run src/map`: 13 files, all passed after one test fix (see deviations).
- Full `npm --prefix web test -- --run`: 34 files, 371 tests passed.
- `npm --prefix web run build`: exit 0 (35 precache entries). `tsc --noEmit`: no output.
- Grep gates: no `innerHTML`, `setAttribute("style"` or `dataset.` in card.ts or transit-card.ts; `MAX_CARD_LINES = 8` and `PER_GROUP = 2` both present.

## Deviations from Plan

- The `scroll` class and `--card-max-h` are set on the `.card-sections` block (the scrolling element), not the card root; the plan's CSS rule is applied to `.card-sections.scroll`.
- `depLines` takes a 4th optional `walkS` argument (defaults to `detail.walk_s`) so the tag's live walk seconds drive the catchable rule.
- Departures that left more than 15 s ago are not listed.
- One of my own new tests first used the wrong walk source; fixed in the test before the commit of task 2.

## Known Stubs / not done

- No disruption alerts block and no per-line warn glyph from `disruption_ids` (not required by this plan's behaviours); the renderer already supports `warn`.
- The `card transit` class and `--card-w-wide` (240 px) width from UI-SPEC are not applied; not in this plan's tasks.

## Self-Check: PASSED
