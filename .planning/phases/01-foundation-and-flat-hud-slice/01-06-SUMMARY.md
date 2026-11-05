---
phase: 01-foundation-and-flat-hud-slice
plan: 06
subsystem: api
tags: [sqlite, asyncio, arpansa, open-meteo, uv, event-bus]
requires: [01-04]
provides:
  - "Store: SQLite WAL layer_cache + geocode_cache with memory read-through (lazy connect, locked)"
  - "EventBus + Runtime (polled loops with backoff, singleflight request_cell, thread-safe)"
  - "ArpansaUvProvider (layer uv_now, cell global) and UvWindowProvider (layer uv_window, 0.1 degree cell)"
  - "FastAPI lifespan wiring; create_app(settings, start_runtime=True)"
affects: [01-08, 01-10]
tech-stack:
  added: []
  patterns: [background-only upstream I/O, sync read-only query, singleflight per (provider, cell), estimate fallback flagged in detail]
key-files:
  created: [server/shinigami/store.py, server/shinigami/runtime.py, server/shinigami/providers/arpansa.py, server/shinigami/providers/uv_window.py, server/tests/test_store.py, server/tests/test_arpansa.py, server/tests/test_uv_window.py, server/tests/test_runtime.py, server/tests/fixtures/uvvalues.xml, server/tests/fixtures/open_meteo_uv.json]
  modified: [server/shinigami/assemble.py, server/shinigami/main.py, server/tests/conftest.py, server/tests/test_profile_readonly.py]
key-decisions:
  - "Custom asyncio Provider Runtime replaces APScheduler (research SUMMARY conflict #5); stdlib sqlite3 (WAL) instead of aiosqlite; orjson not adopted"
  - "Estimated UV window (sun elevation 20 degrees) is retried after 10 min rather than the 3 h TTL"
  - "Store connects lazily so importing shinigami.main never touches disk"
requirements-completed: [ENV-04, PLAT-04]
duration: ~30 min
completed: 2026-11-05
---

# Phase 1 Plan 06: UV slice, store and runtime Summary

Live ARPANSA UV index and a clear-sky "UV protection starts/until" countdown are fetched only in background tasks, persisted to SQLite, and served read-only by `/api/profile`.

## Tasks

| Task | Result | Commit |
|------|--------|--------|
| 1 Store + ARPANSA provider | 12 tests | 49eb5b0 |
| 2 UV window provider | 9 tests | f15ba78 |
| 3 Runtime, lifespan, assembler triggers | 53 total tests pass | a9523b0 |

## Verification
- `uv run pytest -q`: 53 passed. `uv run ruff check server`: clean.
- Live uvicorn (port 8123, stopped after): first request `uv_now` fresh, `uv_window` pending; ~8 s later `uv_window` fresh with 3 items. Greps: no coordinates/cell in runtime log calls (0), no `await ctx.runtime` in assemble (0).
- Fixtures recorded once from live ARPANSA (BOM confirmed EF BB BF) and Open-Meteo with a generic User-Agent. Melbourne index was 0 at night, so display tests also use a synthetic 6.9 document.

## Deviations from CLAUDE.md stack (intentional)
Custom asyncio Provider Runtime replaces APScheduler (research SUMMARY conflict #5); stdlib sqlite3 instead of aiosqlite; orjson not adopted (plain FastAPI JSON). CLAUDE.md not edited.

## Deviations from Plan
1. **[Rule 1] request_cell is thread-safe**: `/api/profile` is a sync `def` handler running in the threadpool, so `request_cell` uses `call_soon_threadsafe` when called off the loop thread. Singleflight dict is only touched on the loop.
2. **[Rule 2] Store lock + lazy connection**: handlers (threads) and the runtime (loop) share one sqlite connection, so access is under an RLock; connection opens lazily so `app = create_app()` at import creates no files.
3. Estimated layer retry (10 min) added so an Open-Meteo outage does not pin an estimate for 3 h.
4. Interpolated "starts" in the example series falls at ~09:13, not the plan's "~09:20"; test asserts the exact interpolation value.
5. `ProviderContext.http`/`bus`/`store` are created in `create_app` (no I/O) rather than in the lifespan, so tests without lifespan still work; lifespan closes them. RED/GREEN committed together per task.

## Known Stubs
None.

## Threat Flags
None. Only the snapped cell centre is sent to Open-Meteo (asserted in test).

## Self-Check: PASSED
Commits 49eb5b0, f15ba78, a9523b0 and all listed files present.
