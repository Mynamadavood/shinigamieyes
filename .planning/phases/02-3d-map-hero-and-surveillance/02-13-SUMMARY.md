---
phase: 02-3d-map-hero-and-surveillance
plan: 13
subsystem: offline-and-privacy-guards
tags: [service-worker, workbox, csp, hud-10, verify]
requires: ["02-04", "02-07", "02-08"]
provides: ["CacheFirst tile and glyph caches on the phone", "HUD-10 CSP tests", "verify.sh HUD-10 checks"]
affects: ["02-14 device gate"]
tech-stack:
  added: []
  patterns: ["testable route matchers split from sw.ts", "same-origin + status-200-only caching"]
key-files:
  created: [web/src/sw-routes.ts, web/src/sw-routes.test.ts]
  modified: [web/src/sw.ts, server/tests/test_health.py, deploy/verify.sh]
decisions:
  - "Tile cache: 2500 entries, 60 days, purgeOnQuotaError; glyph cache has no expiry"
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 2 Plan 13: Offline tile/glyph cache and HUD-10 guards Summary

Seen tiles and glyphs are cached on the phone (CacheFirst, same-origin, 200 only) and HUD-10 (no third party) is guarded by CSP tests and verify.sh checks.

## Commits
- 969c4d8 feat(02-13): cache seen tiles and glyphs in the service worker
- 457faa9 test(02-13): HUD-10 guards in CSP tests and verify.sh

## What changed
- `sw-routes.ts`: `isTileRequest(url, origin)`, `isGlyphRequest(url, origin)`, `TILE_CACHE=tiles-v1`, `GLYPH_CACHE=glyphs-v1`, `NAV_DENYLIST` (api, tiles, glyphs). `sw.ts` registers both CacheFirst routes and uses the denylist for navigation fallback. Built `dist/sw.js` contains both cache names.
- Glyph precache of the first ranges was already configured in `web/vite.config.ts` (`glyphs/*/0-255.pbf` and `8192-8447.pbf`), so no change there.
- `test_health.py`: CSP has no `blob:`, no http(s) scheme, no `*`, keeps the four 'self' directives; `/tiles/0/0/0.mvt` also carries the CSP.
- `verify.sh` (both modes): `csp_no_blob`, `glyph_0_255` (override `GLYPH_FONT`), `cameras_layers` (public CBD point only), `place_no_cameras` (SKIP with no saved places), `dist_no_cdn_hosts` (CT: `/opt/shinigami/web/dist`; remote: local `web/dist` if built). Earlier 1dad315 fixes untouched.

## Verification
- `bash deploy/verify.sh --remote https://shinigami.tail4c915f.ts.net`: all 19 non-timing checks PASS including the 5 new ones; `profile_p95` was 1043 ms on one run (dev PC over Tailscale, unrelated to this plan; the second run was cut by my shell timeout before p95). `--local` not run (needs the CT).
- Built `web/dist` contains no CDN host.

## Deviations
None. No files outside the plan list were touched.

## Needs David's eyes (02-14)
- Turn Tailscale off after browsing an area: seen tiles should still draw, unseen ones show the grid.
- Web Inspector: confirm no request leaves the tailnet origin.
