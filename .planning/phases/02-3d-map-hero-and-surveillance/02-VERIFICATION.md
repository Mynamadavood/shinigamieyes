---
phase: 02-3d-map-hero-and-surveillance
verified: 2026-11-11T09:45:00Z
status: passed
score: 5/5 roadmap success criteria verified (6/6 requirements satisfied)
overrides_applied: 0
---

# Phase 2: 3D Map, Hero and Surveillance Verification Report

**Phase Goal:** David sees his surroundings as a dark, tilted Watch Dogs-style 3D map with named tags and cards, opened by a red-eyes activation, with nearby cameras shown.
**Verified:** 2026-11-11 (code at HEAD 2cdbf0e, main ahead of origin by 26 commits)
**Status:** passed
**Re-verification:** No. This is the first verification. The earlier gaps were closed through UAT plans 02-15 to 02-18.

**Device evidence used:** Gate 3 in `deploy/UAT-DEVICE.md`, signed GO by David on 2026-11-11 (17 pass, 2 skipped with cover), and `02-UAT.md` (status complete, all 4 gaps closed). These results came from the deployed build: 74acc09, plus 6dc96a0 from the gap re-check.

**Not deployed:** The 26 code-review fix commits (02-REVIEW-FIX.md, including WR-W1) are local only. They have not been pushed, deployed or re-checked on the iPhone. This report checks them at code and test level only. See the "Advisory" section below.

## Goal Achievement

### Observable Truths (roadmap success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | On cold open the blood-red eyes play for 1.5 s or less over real loading, are skippable, and never delay data | VERIFIED | `web/src/ui/hero.ts`: `HERO_MS = 1500` is a hard cap (`endTimer = setTimeout(finish, total)`). `skip()` is wired to the full-screen skip button and the title-bar close box. `shortenTo(ms)` returns early when `elapsed + ms >= total`, so it can only shorten the hero. `app.ts:130` mounts the hero synchronously and never awaits it. The IndexedDB read (300 ms `withTimeout`), the ticker, the map loader (double rAF) and `refetch` do not depend on the hero. `shouldPlayHero` excludes back_forward, persisted and replay. WR-W1 (`CACHED_HERO_MS = 600`, `app.ts:279`) ends the hero about 600 ms after a cached paint, which still meets "≤1.5 s, skippable, never delays data". The full 1.5 s plays when nothing is cached. On device: hero ≤1.5 s, skip and no-replay all pass (Gate 3, 2026-11-10). |
| 2 | Desaturated-blue tilted map with extruded buildings; tiles, fonts and sprites come from David's server with no third-party requests | VERIFIED | `web/src/map/style.ts`: the tiles URL is `${origin}/tiles/{z}/{x}/{y}.mvt?v=`, glyphs are `${origin}/glyphs/...`, and there is no `sprite` key. The `buildings-3d` layer is a `fill-extrusion` at minzoom 15 using `--c-building #1B3A56`, with land `#05070D`. `view.ts` FOLLOW is zoom 17, pitch 60, bearing 0. The server route `/tiles/{z}/{x}/{y}.mvt` (`api/tiles.py`) reads the local PMTiles. Glyph PBFs are in `web/public/glyphs/JetBrainsMono-Regular/`. HUD fonts come from @fontsource and are bundled into the same-origin build. The icons are a local `icons.svg`. The CSP in `main.py:30` is `default-src 'self'` and `connect-src 'self'`, with no blob: and no third-party host. A scratch build at HEAD has no tile, font or CDN host; the only grep hits are the MapLibre enum string `mapbox` and a GitHub URL inside an error message, and neither makes a request. On device: 3D look passes. The Web Inspector check was skipped (no Mac) and is covered by the verify.sh `csp_header`, `dist_no_cdn_hosts` and `dist_no_inline_fonts` checks. |
| 3 | Items appear as floating icon + label tags; tapping one opens an info card | VERIFIED | `map.ts:459` calls `tags.update(items)` with the camera layer items. `tags.ts:172` skips summary items and keeps the positioned ones. `tags.ts:314` calls `card.open(e.el, cameraCardContent(...))`, and `card.ts` places the card, avoiding other tags. Tag names come from `providers/cameras.py` NAMES: Camera, Guard post, Speed camera, Red-light camera. Building, YOU and PIN cards are also wired (`map.ts:169/235/246`). On device: cards, edge-label flip and card avoidance all pass (Gate 3 re-check, 2026-11-11). |
| 4 | Mapped CCTV within about 150 m labelled "mapped, not exhaustive"; fixed speed and red-light cameras as static info only | VERIFIED | `CctvCameraProvider` has `radius_m = 150` and kinds cctv and guard. `RoadCameraProvider` has 1000 m and kinds speed and redlight. Both are `exact_location_only`, read from the in-memory `CameraStore`, and have `target_ts=None` (no countdown or alert). The readout (`readouts.ts:25-26`) shows `N cameras · 150 m · mapped, not exhaustive` and `0 mapped cameras · 150 m · not exhaustive`, and never "no cameras". The card copy (`camera-card.ts`) is CCTV/GUARD POST: "Mapped, not exhaustive."; road cameras: "Static info only." plus "Source: OpenStreetMap", with no alert wording. Home never gets cameras: `places.py` `is_home_like` / `is_home` fails closed, `api/profile.py camera_ok` is shared with `stream.py`, and the `assemble.py` `exact_ok` gate plus client strip (WR-W5) back this up. Non-Home saved places showing cameras was David's decision at Gate 3, so it is not a gap. CT data: `cctv=674 speed=189 redlight=136`. |
| 5 | The map stays smooth on the real iPhone, with tags capped to a budget | VERIFIED | `tags.ts` has `MAX_FULL = 20` labelled, `MAX_TOTAL = 60` rendered (the server also caps at `MAX_ITEMS = 60`), `NEAR_M = 30`, `RED_CAP = 3` and `EXPAND_ZOOM = 17.5`. The map loads after first paint by dynamic import and handles WebGL context loss and no-WebGL (`map.ts:104,177`). On device: CBD walk smoothness passes (Gate 3, 2026-11-10). |

**Score:** 5/5 truths verified

### Plan must-haves (selected, beyond the roadmap criteria)

| Source | Must-have | Status | Evidence |
|--------|-----------|--------|----------|
| 02-02 | Stream frames for another location are never merged | VERIFIED | `app.ts:370` checks `paramKey(params) !== profileKey` |
| 02-04 | 204 outside the extract; health reports tile status | VERIFIED | `api/tiles.py`. WR-S6 now returns 503/no-store when the store is unavailable and keeps 204 for a genuinely absent tile. |
| 02-07 | No network or file read in the request path | VERIFIED | `main.py:53` runs `reload_if_changed` from a background `to_thread` task. The provider reads only `self.store`. |
| 02-08 | Map chunk loads two frames after first paint; no raw error | VERIFIED | `app.ts:222,302`. `startMap` catches errors and leaves the grid. |
| 02-13 | Service worker CacheFirst for tiles and glyphs | VERIFIED | `sw.ts:26-44` registers routes with `isTileRequest` / `isGlyphRequest` |
| 02-15 | Home never gets camera layers; pin lat/lon stay null | VERIFIED | `places.py`, `api/profile.py:60-74`, `assemble.py:19-33` |
| 02-16 | Guard posts appear as `Guard post` / `GUARD POST` | VERIFIED | `providers/cameras.py` NAMES, `camera-card.ts:57` |
| 02-17 | Edge labels flip left; card avoids tags | VERIFIED | Code present. Device re-check passed on 2026-11-11. |

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `web/src/ui/hero.ts`, `hero-art.ts`, `styles/hero.css` | VERIFIED | Substantive and wired in `app.ts` |
| `web/src/map/style.ts`, `map.ts`, `view.ts`, `follow.ts` | VERIFIED | Wired through the dynamic import in `app.ts` |
| `web/src/map/tags.ts`, `card.ts`, `camera-card.ts`, `leader.ts` | VERIFIED | Wired from `map.ts` setProfile |
| `web/src/ui/readouts.ts` | VERIFIED | `readouts.update` is called from the ticker (`renderRows`) |
| `web/public/glyphs/JetBrainsMono-Regular/*.pbf`, `web/public/icons.svg` | VERIFIED | Present |
| `server/shinigami/tiles.py`, `api/tiles.py` | VERIFIED | Router included (`main.py:121`) before the StaticFiles mount |
| `server/shinigami/cameras_store.py`, `providers/cameras.py` | VERIFIED | Registered as providers. Background reload. |
| `server/shinigami/data/refresh_cameras.py`, `deploy/shinigami-data.{service,timer}` | VERIFIED | Weekly job has run on the CT |
| `web/src/sw.ts`, `sw-routes.ts` | VERIFIED | Built through injectManifest (35 precache entries) |
| `deploy/UAT-DEVICE.md` Gate 3 | VERIFIED | Signed GO by David on 2026-11-11 |

### Key Link Verification

| From | To | Status |
|------|----|--------|
| `app.ts` boot | `mountHero` (synchronous, not awaited) | WIRED |
| `app.ts` | `import("./map/map")` after a double rAF | WIRED |
| `style.ts` | `/tiles/{z}/{x}/{y}.mvt?v=` and `/glyphs/` on `origin` | WIRED |
| `main.py` | `tiles.router`, plus a `cameras.reload_if_changed` background task | WIRED |
| `api/profile.py`, `api/stream.py` | `assemble_profile(..., exact_ok=camera_ok(...))` | WIRED |
| `map.ts` setProfile | `tags.update` (camera layers only) | WIRED |
| `TagLayer` select | `card.open(... cameraCardContent ...)` | WIRED |
| `map.ts` setView | `tags.setOrigin("server")` for pin views | WIRED |
| `sw.ts` | `isTileRequest` / `isGlyphRequest` CacheFirst | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| Camera tags and readout | `profile.layers.cameras_cctv/road` | `CameraStore.near` over cameras.json built from the Geofabrik Victoria PBF (674 CCTV, 189 speed and 136 red-light cameras on the CT) | Yes | FLOWING |
| Map tiles | `/tiles/...mvt` | Local `greater-melbourne.pmtiles` (125 MB, status ok) | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Web suite at HEAD | `npx vitest run` | 278 passed | PASS |
| Type check | `npx tsc --noEmit` | exit 0 | PASS |
| Server suite at HEAD | `uv run pytest -q server` | 140 passed, 1 skipped | PASS |
| Build at HEAD, no CDN hosts | `vite build` to scratch, then grep for tile, font and CDN hosts | Only non-request strings matched (MapLibre `mapbox` enum, error-message URL) | PASS |

### Probe Execution

No probes are declared for this phase. `deploy/verify.sh` was run by Claude on the CT and over the tailnet at 74acc09 / 3aec642: local 26/0/0 and remote 22/0/0. It was not re-run at HEAD because the verifier has no SSH access.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| HUD-03 | 02-02, 02-12, 02-14, 02-18 | SATISFIED | Truth 1 |
| HUD-04 | 02-01, 02-03, 02-04, 02-08, 02-09, 02-11, 02-17 | SATISFIED | Truth 2 (look) |
| HUD-05 | 02-03, 02-10, 02-11, 02-15, 02-17 | SATISFIED | Truth 3 |
| HUD-10 | 02-01, 02-04, 02-06, 02-08, 02-13 | SATISFIED | Truth 2 (self-hosting, CSP) |
| SURV-01 | 02-01, 02-02, 02-05, 02-07, 02-10, 02-15, 02-16, 02-17 | SATISFIED | Truth 4 |
| SURV-02 | 02-01, 02-05, 02-06, 02-07, 02-10, 02-15 | SATISFIED | Truth 4 |

All six IDs in REQUIREMENTS.md that map to Phase 2 are claimed by at least one plan, so none are orphaned. The REQUIREMENTS.md checkboxes still read "Pending". The orchestrator should tick them.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| (none) | No TBD, FIXME or XXX in `web/src`, `server/shinigami`, `deploy` or `scripts`. No TODO, HACK or placeholder in non-test sources. | none | none |
| `server/shinigami/providers/cameras.py:43` | WR-S3 accepted-risk comment: camera geoms plus `distance_m` at a camera-enabled public saved place could reveal that place's point | Info | This is David's decision. Home and `is_home` places never reach the providers. |

### Human Verification Required

None outstanding. The device-only criteria (hero timing and skip, 3D look, smoothness, offline, tags and cards) were signed GO by David at Gate 3 on 2026-11-11. The code at HEAD still supports all of them.

### Advisory (non-blocking): review fixes not yet on the device

- The 26 commits from 6dc96a0 to 2cdbf0e (02-REVIEW-FIX.md: CR-S1, CR-S2, WR-S1 to WR-S10, CR-W1, WR-W1 to WR-W8) are local only. They have not been pushed, deployed or re-checked on the iPhone. The device evidence above comes from the build before these fixes.
- WR-W1 changes what David sees: when a cached profile exists, the hero ends about 600 ms after the cached paint, and the 1.5 s eye animation is cut off partway. This still meets criterion 1, which sets 1.5 s as an upper bound. The hero stays skippable and data is never delayed. Whether the cut looks right is a matter of taste, to judge on the device.
- The deploy needs a unit reinstall and `daemon-reload` for WR-S7. `verify.sh --local` now fails if cameras.json is missing or more than 14 days old (WR-S8), and missing tiles now return 503 instead of 204 (WR-S6). After deploy, run `verify.sh --local/--remote` and do a short cold-open check on the phone (hero with and without a cache, Home without cameras, a non-Home place with cameras).

### Gaps Summary

There are no gaps. All five roadmap success criteria and all six requirement IDs are backed by substantive, wired code at HEAD. The web suite (278 tests), the server suite (140 passed, 1 skipped), tsc and the build are all green. The device criteria were signed off by David at Gate 3. The only open item is the advisory above: deploy the review fixes and re-check them on the device.

---

_Verified: 2026-11-11_
_Verifier: Claude (gsd-verifier)_
