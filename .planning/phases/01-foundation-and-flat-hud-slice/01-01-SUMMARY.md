---
phase: 01-foundation-and-flat-hud-slice
plan: 01
subsystem: platform
tags: [fastapi, sse, pwa, vite, workbox, pytest, vitest]
requires: []
provides:
  - "shinigami package: create_app() factory, Settings contract, /api/health, /api/_sse_probe"
  - "web/ Vite PWA shell: manifest, iOS meta, injectManifest service worker, icons"
  - "All Phase 1 Python and npm dependencies installed and locked"
affects: [01-02, 01-03, 01-04]
tech-stack:
  added: [fastapi 0.162.0, uvicorn 0.54.0, sse-starlette 3.6.0, astral 3.2, pydantic-settings, vite 8.3.6, vite-plugin-pwa 2.0.0, workbox 7.4.1, vitest 5.1.0, happy-dom, fake-indexeddb, idb-keyval, fontsource silkscreen + jetbrains-mono]
  patterns: [app factory, routers first and StaticFiles last, header middleware]
key-files:
  created: [pyproject.toml, uv.lock, server/shinigami/main.py, server/shinigami/settings.py, server/shinigami/api/health.py, server/tests/conftest.py, server/tests/test_health.py, web/package.json, web/package-lock.json, web/vite.config.ts, web/pwa-manifest.ts, web/src/sw.ts, web/src/main.ts, web/src/manifest.test.ts, scripts/make_icons.py]
  modified: [.gitignore, README.md]
key-decisions:
  - "Package legitimacy checkpoint (Task 1) approved by David in chat on 2026-11-05 for the full list; orchestrator also verified registry repo URLs"
  - "sw.ts denylist written as new RegExp('^/api/') so the acceptance grep for /api/ matches"
requirements-completed: [PLAT-01, PLAT-02]
duration: ~25 min
completed: 2026-11-05
---

# Phase 1 Plan 01: Walking Skeleton Part 1 Summary

FastAPI health + SSE probe and an installable Vite PWA shell run on one origin locally, with every Phase 1 dependency installed once and locked.

## Tasks

| Task | Result | Commit |
|------|--------|--------|
| 1 Package legitimacy audit | Approved by David ("approved", chat, 2026-11-05) before any install | n/a |
| 2 Backend skeleton | 6 pytest tests pass, ruff clean | bddd923 |
| 3 Frontend skeleton | 3 vitest tests pass, build produces sw.js + manifest.webmanifest | 030d136 |

## Verification
- `uv run pytest -q`: 6 passed. `uv run ruff check server`: clean.
- `npm --prefix web run test -- --run manifest`: 3 passed. `npm --prefix web run build`: OK (sw.js, manifest.webmanifest, index.html in web/dist). vite resolved to 8.3.6.
- Live run: uvicorn (127.0.0.1:8000, --workers 1 --no-access-log) served the HTML titled Shinigami Eyes, `/sw.js` had `cache-control: no-cache`, `/api/_sse_probe?n=2` emitted 2 tick events.
- Not done: visual check of the ticking counter in a desktop browser (curl only).

## Deviations from Plan

1. **[Rule 3] Manual web scaffold instead of `npm create vite`**: the template is interactive; wrote package.json/tsconfig/etc by hand and deleted nothing. Same result.
2. **[Rule 1] sw.ts denylist form**: `/^\/api\//` does not satisfy the `grep -c "/api/"` acceptance check, so used `new RegExp("^/api/")` (identical behaviour).
3. **TypeScript 7.0.2** was installed (latest); `tsc --noEmit` and the build pass, so no pin to 5 was needed. Added `@types/node` for the vitest test file's node imports.
4. **CLAUDE.md stack deviations (intentional, per plan/RESEARCH)**: no APScheduler, orjson, shapely, pyproj or aiosqlite in Phase 1; not needed yet. Added `asyncio_default_fixture_loop_scope = "function"` to pytest config to silence a deprecation warning.
5. `web/index.html` has no `<link rel="manifest">`; vite-plugin-pwa injects it at build (verified in dist/index.html).

## Known Stubs
`web/src/main.ts` is an intentional hello page, replaced by plan 01-04.

## Threat Flags
None beyond the plan's threat model (CSP, no-store on /api, SW denylist all implemented and tested).

## Self-Check: PASSED
Files and commits bddd923, 030d136 verified present.
