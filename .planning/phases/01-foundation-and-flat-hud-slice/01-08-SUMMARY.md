---
phase: 01-foundation-and-flat-hud-slice
plan: 08
subsystem: live-fill-and-offgrid
tags: [sse, indexeddb, offgrid, pwa, vitest]
requires: [01-06, 01-07]
provides:
  - "GET /api/stream SSE (hello, layer, named ping); shared resolve_location"
  - "store.ts (idb-keyval profile:last, sync:last), net.ts openStream/applyLayer, offgrid.ts connectivity, OffgridBanner, app.ts boot()"
affects: [01-09]
key-files:
  created: [server/shinigami/api/stream.py, server/tests/test_stream.py, web/src/store.ts, web/src/store.test.ts, web/src/net.test.ts, web/src/offgrid.ts, web/src/offgrid.test.ts, web/src/ui/offgrid-banner.ts, web/src/styles/banner.css, web/src/app.ts]
  modified: [server/shinigami/api/profile.py, server/shinigami/main.py, web/src/net.ts, web/src/main.ts]
requirements-completed: [PLAT-03, PLAT-05]
completed: 2026-11-06
---

# Phase 1 Plan 08: Cached-first open, SSE fill-in, OFF-GRID Summary

The app now renders the last profile from IndexedDB before any network call, fills in live over SSE, and shows a persistent red "OFF-GRID · last sync 14m ago" banner (cache kept ticking) when the server is unreachable, clearing on recovery.

## Tasks

| Task | Result | Commit |
|------|--------|--------|
| 1 SSE /api/stream | 6 new server tests, 59 total | 0151ec9 |
| 2 IndexedDB store + stream client | 13 web tests | ea98ad9 |
| 3 OFF-GRID + boot sequence | 8 offgrid tests, 67 web total | a0f0a02 |

## Verification
- `uv run pytest -q`: 59 passed. `uv run ruff check server`: clean.
- `npm --prefix web run test -- --run`: 67 passed (10 files). `npm --prefix web run build`: OK.
- Greps: no `navigator.onLine` anywhere in web/src; `loadProfile` awaited (app.ts line 60) before first `fetchProfile(` (line 80).
- SSE kept (01-03 verified unbuffered through tailscale serve); no polling fallback.
- Not done: manual browser check of stop/start uvicorn with the service worker (acceptance bullet); covered by the fake-timer boot tests instead.

## Deviations from Plan
1. **[Rule 1] Cache-Control on /api/stream**: the headers middleware forced `no-store` on all `/api/*`, overriding the stream's `no-cache`; it now only sets `no-store` when the route has not set its own.
2. **[Rule 2] fetchProfile races its timeout**: besides aborting, it rejects on the abort signal so a fetch implementation ignoring the signal cannot hang the OFF-GRID detection. Also gained an optional `fetchImpl` for tests.
3. `Connectivity` gained `seedSync(ms)` (not in the interface) so the cached sync time shows before any network outcome.
4. No-coordinates-in-logs test filters out the test's own httpx/httpcore client loggers (they log the URL in-process); only server-side loggers are asserted.
5. Bounded queue (100, drop oldest), disconnect polling, unsubscribe in finally, 5 s graceful shutdown all pre-existed or are covered by tests; sse-starlette shutdown grace left at its default 0.
6. RED/GREEN committed together per task.

## Known Stubs
None.

## Threat Flags
None. Banner and rows use textContent only; SSE data parsed with JSON.parse.

## Self-Check: PASSED
Commits 0151ec9, ea98ad9, a0f0a02 and all listed files present.
