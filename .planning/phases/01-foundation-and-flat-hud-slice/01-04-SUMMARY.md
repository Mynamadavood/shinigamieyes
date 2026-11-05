---
phase: 01-foundation-and-flat-hud-slice
plan: 04
subsystem: api
tags: [fastapi, pydantic, astral, provider-contract]
requires: [01-01, 01-03]
provides:
  - "schema.py Item/Layer/Profile/ProfileLocation contract (person-free ItemKind allow-list)"
  - "geo.py haversine_m, snap_cell; providers/base.py Provider contract (sync read-only query)"
  - "SunProvider golden/blue hour boundaries (ENV-07)"
  - "GET /api/profile read-only (PLAT-04)"
affects: [01-05, 01-06]
tech-stack:
  added: []
  patterns: [provider registry on app.state, sync read-only query, absolute target_ts]
key-files:
  created: [server/shinigami/schema.py, server/shinigami/geo.py, server/shinigami/providers/__init__.py, server/shinigami/providers/base.py, server/shinigami/providers/sun.py, server/shinigami/assemble.py, server/shinigami/api/profile.py, server/tests/test_schema.py, server/tests/test_sun.py, server/tests/test_profile_readonly.py, server/tests/test_nologging.py]
  modified: [server/shinigami/main.py]
key-decisions:
  - "Item ids are sun:{group}:{verb}:{local_date}; boundaries from astral querying date-1, date, date+1"
requirements-completed: [ENV-07, PLAT-04]
duration: ~15 min
completed: 2026-11-05
---

# Phase 1 Plan 04: Profile contract and sun slice Summary

Frozen Item/Layer/Profile + Provider contract, astral-based golden/blue hour countdown items, and a read-only `/api/profile` proven network-free and under 50 ms p95.

## Tasks

| Task | Result | Commit |
|------|--------|--------|
| 1 Contract, geo, Provider base, Sun provider | 10 tests pass | 07c2be2 |
| 2 /api/profile, assembler, registry, readonly + nologging tests | 25 total tests pass | 5cd4652 |

## Verification
- `uv run pytest -q`: 25 passed. `uv run ruff check server`: clean.
- Local uvicorn: `curl /api/profile` returned 12 sun items.

## Deviations from Plan
1. **[Rule 1] Test harness**: patching `httpx.AsyncClient.send` would break the in-process test client (itself an AsyncClient), so the no-outbound test patches `AsyncHTTPTransport.handle_async_request`, `HTTPTransport.handle_request` and `socket.socket.connect` inside a `monkeypatch.context()` (socket patch outside the context broke asyncio loop teardown on Windows).
2. **[Rule 1] caplog test** ignores records from the `httpx` logger, which is the test client logging its own request URL, not the app.
3. Added `noqa: BLE001` on the deliberate broad except in assemble.py (provider isolation).
4. RED/GREEN committed together per task rather than as separate test/feat commits.

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
