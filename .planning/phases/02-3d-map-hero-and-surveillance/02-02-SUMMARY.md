---
phase: 02-3d-map-hero-and-surveillance
plan: 02
subsystem: web-client
tags: [pwa, indexeddb, geolocation, sse, robustness]
requires: []
provides:
  - withTimeout helper (web/src/timeout.ts)
  - HttpError from fetchProfile
  - LocationState.lastFix with GPS accuracy (for the map accuracy ring)
  - IDB_TIMEOUT_MS and deriveListState exports in app.ts
affects: [02-03, 02-08, 02-09]
tech-stack:
  added: []
  patterns: [IDB reads raced against 300 ms, profile keyed by request params, derived list state]
key-files:
  created: [web/src/timeout.ts, web/src/timeout.test.ts, web/src/app.test.ts]
  modified: [web/src/app.ts, web/src/location.ts, web/src/net.ts, web/src/ui/next-list.ts, web/src/location.test.ts, web/src/net.test.ts, web/src/ui/next-list.test.ts]
decisions:
  - "Cached read and loc.start() share a single 300 ms budget so the first request starts within ~300 ms, not 600"
  - "A cached profile is keyed by a sentinel adopted by the first location params (or first stream layer), so cached-profile SSE updates still apply"
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 2 Plan 02: Boot hardening Summary

The HUD now boots cached-first without ever waiting on IndexedDB, ties profiles and stream frames to their location, derives list state every tick, and stops mislabelling GPS timeouts and HTTP errors.

## Commits
- 9698334: GPS error classification, lastFix accuracy, withTimeout (Task 1)
- d2241ac: boot budget, profileKey guard, deriveListState, HttpError, idempotent NextList.setState (Task 2)

## 01-REVIEW items closed
WR-03, WR-04, WR-06, WR-07, WR-08 (all with tests). WR-02, WR-05 and the IN items remain open (not in this plan).

## Deviations from Plan
- **[Rule 1 - Bug] Shared 300 ms budget.** Wrapping both the cached read and `loc.start()` at 300 ms each would delay the first request to ~600 ms under a hung IDB; `loc.start()` now gets only the remaining budget.
- **[Rule 1 - Bug] Cached-profile key sentinel.** A plain `profileKey` guard broke the existing offgrid test (SSE layers on a cached profile got dropped as location mismatches). The cached profile now carries a sentinel key adopted by the first params/layer.
- **[Rule 1 - Bug] NextList lastState sync.** `update()` with rows clears the state block, so it also records `lastState = "ready"`; otherwise the idempotence early-return would suppress "empty" re-display after rows expire.
- Existing location test "GPS denied/unavailable/timeout" split to reflect WR-08 semantics (only code 1 is off).

## Verification
`npm --prefix web test -- --run` 127 passed; `npm --prefix web run build` passes; `uv run pytest -q` 98 passed.

## Known Stubs
None.

## Self-Check: PASSED
