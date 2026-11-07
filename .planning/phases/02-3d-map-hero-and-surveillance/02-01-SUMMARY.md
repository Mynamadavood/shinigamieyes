---
phase: 02-3d-map-hero-and-surveillance
plan: 01
subsystem: dependencies
tags: [npm, pypi, maplibre, workbox, pmtiles, osmium, glyphs]
requires: []
provides: [maplibre-gl, workbox-strategies/expiration/cacheable-response, pmtiles (py), osmium (py, data group), glyph ZIP]
affects: [02-05, 02-08]
key-files:
  modified: [web/package.json, web/package-lock.json, pyproject.toml, uv.lock]
metrics:
  completed: 2026-11-07
---

# Phase 2 Plan 01: Package approvals and install Summary

Six Phase 2 packages approved by David and installed once with exact pins; JetBrains Mono glyph ZIP supplied. Suites and build green.

## Approvals (Task 1)

David replied "approved" for all six: npm maplibre-gl 6.16.0, workbox-strategies / workbox-expiration / workbox-cacheable-response 7.4.1; PyPI pmtiles 3.8.1, osmium 4.3.2. Registry checks (read-only) showed official repos (maplibre/maplibre-gl-js, googlechrome/workbox, protomaps/pmtiles, osmcode/pyosmium) and no install/postinstall scripts. Rejected: none.

## Glyphs (Task 2)

David generated glyphs with maplibre.org/font-maker (JetBrains Mono; Noto fallback not needed). File: `var/glyphs/JetBrainsMono-Regular.zip` (gitignored).

**Note for plan 02-08:** the ZIP contains nine weight folders (e.g. `JetBrains Mono Regular/0-255.pbf`), not flat `{range}.pbf` files. Use the Regular folder and extract/flatten it when serving.

## Install (Task 3) - commit ad4eb57

- web: `maplibre-gl` `6.16.0` (exact, dependencies); workbox-strategies/expiration/cacheable-response `^7.4.1` (devDependencies, resolved 7.4.1).
- Python: `pmtiles==3.8.1` in dependencies; `osmium==4.3.2` in `[dependency-groups].data`; `[tool.uv] default-groups = ["dev", "data"]` added.
- **osmium installed fine on the dev PC (Windows, wheel available)**, so `test_refresh_cameras.py` can run locally. It also pulled in requests, urllib3, charset-normalizer transitively.
- Not installed: npm `pmtiles`, `@protomaps/basemaps`, `@playwright/test`.

## Verification

- `uv run python -c "import pmtiles.reader"` and `import osmium` OK
- `uv run pytest -q`: 98 passed (same as before)
- `npm --prefix web test -- --run`: 127 passed, 15 files
- `npm --prefix web run build`: OK

## Deviations from Plan

None. Minor: the workbox packages are recorded with caret (`^7.4.1`), which the acceptance criteria allow.
