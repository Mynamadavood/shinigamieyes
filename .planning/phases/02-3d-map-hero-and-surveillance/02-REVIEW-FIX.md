---
phase: 02-3d-map-hero-and-surveillance
fixed_at: 2026-11-11T00:00:00Z
review_path: .planning/phases/02-3d-map-hero-and-surveillance/02-REVIEW.md
iteration: 1
scope: critical + warning (CR-S1..2, WR-S1..10, CR-W1, WR-W1..8)
findings_in_scope: 21
fixed: 20
skipped: 1
status: all_fixed
---

# Phase 02: Code Review Fix Report

20 of 21 findings fixed; WR-S3 is won't-fix (accepted risk, comment only: David chose cameras for non-Home saved places). IN-* items left open.
Leftover suburb label in web/src/ui/location-sheet.test.ts removed by the orchestrator (WR-S9 follow-up).
Final checks: server pytest 140 passed / 1 skipped, ruff clean; web vitest 278 passed, tsc clean, build clean.

# Part 1: server and deploy

# Phase 02: Code Review Fix Report (server + deploy half)

**Fixed at:** 2026-11-11
**Source review:** .planning/phases/02-3d-map-hero-and-surveillance/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 12
- Fixed: 11
- Skipped: 1 (WR-S3, won't fix: accepted risk; a code comment was added)

**Verification after all fixes:** `cd server && uv run pytest -q` gives 140 passed, 1 skipped (the Windows-only skip in test_tiles). The baseline was 129 passed, 1 skipped. `uv run ruff check .` reports all checks passed. `bash -n deploy/verify.sh` passes, and verify.sh has no CR or NUL bytes.

## Fixed Issues

### CR-S1: "near {label}" GPS label lets any client find Home's exact coordinates

**Files modified:** `server/shinigami/api/profile.py`, `server/tests/test_places.py`
**Commit:** 82e86b6 (extended in 703c2a5 to also skip `is_home` places)
**Status:** fixed: requires human verification (logic change)
**Applied fix:** The GPS label loop now skips any place with `cameras = false`, `home = true`, or a home-like id or label (it reuses `is_home_like` from places.py). Home can never be named in a GPS label, so the label no longer answers "is this point within 2 km of Home?". `test_gps_label_near_and_far` now asserts "near Melbourne CBD" beside the CBD. The new `test_gps_label_never_names_home` checks that points on and beside Home return "current location".

### CR-S2: Operator contact filter misses Australian phone formats

**Files modified:** `server/shinigami/data/refresh_cameras.py`, `server/tests/test_refresh_cameras.py`
**Commit:** 5ee6e3e
**Status:** fixed: requires human verification (regex change)
**Applied fix:** A new `looks_like_contact()` catches four kinds of contact detail:
- emails and URLs (`@`, `http(s):`, `www.`);
- bare domains, including multi-label ones such as `example.com.au` and `facebook.com/x`, for the com, net, org, au, io, co, biz, info, me, nz and uk TLDs;
- any run of 6 or more digits;
- phone numbers. Spaces, dots, dashes and brackets are stripped first, then the value is rejected if it has 8 or more digits or a leading `+`.

Tests cover `0412 345 678`, `J Smith 0412 345 678`, `03 9123 4567`, `+61 3 9123 4567`, `(03) 9123-4567`, `1300 123 456`, `03.9123.4567`, `example.com.au`, `facebook.com/joesmith` and an email. They also check that ordinary operators such as `7-Eleven` and `Metro Trains` are still kept.

### WR-S1: Home detection works only on names

**Files modified:** `server/shinigami/places.py`, `server/shinigami/api/profile.py`, `server/tests/test_places.py`, `deploy/places.example.toml`
**Commit:** 703c2a5
**Status:** fixed: requires human verification
**Applied fix:**
- New `is_home = true` flag in places.toml, plus a `Place.home` field. A place is home if `is_home` is true, its id is `home`, or its label starts with "home".
- Home places never get cameras, even when `cameras = true` is set.
- A non-boolean `is_home` value counts as home (fail closed).
- Places that are not home keep the default `cameras = true`, so the current places.toml behaves exactly as before.
- The rule is documented in places.example.toml. Tests cover `is_home = true` overriding `cameras = true`, a non-boolean `is_home`, and `is_home = false`.

### WR-S2: assemble passes exact pin coordinates to every non-camera provider

**Files modified:** `server/shinigami/assemble.py`, `server/tests/test_places.py`
**Commit:** d38ae59
**Applied fix:** For `location.source == "pin"`, providers without `exact_location_only` now get the 0.1-degree cell centre. Only allowed exact providers, which means the camera providers at camera-enabled public places, get the true point. `request_cell` reuses the same cell. The sun and UV providers already snap, so nothing changes for them; the sun test for Monash's cell still passes. The new `test_pin_non_exact_providers_get_cell_centre` covers three cases:
- the Home pin;
- the CBD pin;
- live GPS, which keeps the exact point.

### WR-S4: `direction=nan` / `inf` crashes the weekly refresh

**Files modified:** `server/shinigami/data/refresh_cameras.py`, `server/tests/test_refresh_cameras.py`
**Commit:** 5cdede6
**Applied fix:** `direction_words` returns None for any value that is not finite (`math.isfinite`). Record building in the osmium node handler is now wrapped in a try/except: a bad node is counted and skipped, and the skip count is printed (no coordinates). Tests cover `nan`, `inf`, `-inf` and `NaN;90`, plus a CCTV record that has a `nan` direction.

### WR-S5: Weekly refresh overwrites a good cameras.json with no size check

**Files modified:** `server/shinigami/data/refresh_cameras.py`, `server/tests/test_refresh_cameras.py`
**Commit:** 6f84fc1
**Applied fix:** `main()` refuses to write when the new dataset has 0 records or fewer than 50% of the existing file's records. In that case it keeps the old file, prints `REFUSED: new=N old=M`, and returns 1. `refresh-data.sh` runs under `set -e`, so systemd records the failure. A new `--force` flag overrides the check. `test_refuses_to_shrink_dataset` covers:
- an empty first run;
- empty and shrunk replacements;
- an acceptable smaller replacement;
- `--force`.

The PBF md5 check suggested in the review was not added.

### WR-S6: Transient tile failures return the same 204 as a genuinely missing tile

**Files modified:** `server/shinigami/tiles.py`, `server/shinigami/api/tiles.py`, `server/tests/test_tiles.py`, `server/tests/test_health.py`
**Commit:** 8e350f8
**Applied fix:**
- `TileStore.get()` now raises a new `TileUnavailable` exception when the store is not `ok` or a read raises. It returns None only for a genuinely absent tile.
- The tile route answers `TileUnavailable` with 503 and `Cache-Control: no-store`. A real absent tile still gets 204 with `max-age=86400`.
- `TileStore._close()` no longer closes the old file on reload. It drops the references, so in-flight readers finish and refcounting then closes the handle. This removes the "I/O operation on closed file" race.
- Tests: missing and unsupported stores now expect 503/no-store, and a new test covers a read error.
- The service worker caches only 200 responses, so a 503 is never stored.

### WR-S7: Places file path not pinned in the unit

**Files modified:** `deploy/shinigami.service`, `deploy/verify.sh`
**Commit:** 7ccece3
**Applied fix:**
- Added `Environment=SHINIGAMI_PLACES_PATH=/etc/shinigami/places.toml` to the unit. The settings read `places_path` through the `SHINIGAMI_` prefix.
- In `verify.sh --local`, `place_no_cameras` now FAILs (instead of SKIPping) when `/etc/shinigami/places.toml` exists but `/api/places` is empty.

### WR-S8: verify `cameras_layers` passes when the camera dataset is missing

**Files modified:** `server/shinigami/api/health.py`, `server/shinigami/cameras_store.py`, `server/tests/test_health.py`, `deploy/verify.sh`
**Commit:** 4834534
**Applied fix:**
- `/api/health` now includes `"cameras": {"loaded": bool, "count": int, "age_days": int|null}`. It carries no coordinates, and `CameraStore` keeps `count`.
- verify.sh has a new `cameras_loaded` check. It FAILs when the field is missing, when `loaded` is not true, when there is no build time, or when the data is more than 14 days old.
- Tests cover the empty default and a loaded dataset (including a no-coordinates assertion).

### WR-S9: Home's suburb and near-home test coordinates are committed to git

**Files modified:** `deploy/places.example.toml`, `server/tests/test_places.py`
**Commit:** 6d8c719
**Applied fix:**
- The Home label in the example and the tests is now plain "Home".
- The test Home coordinates are now an obviously fictional point in open sea, far from Melbourne, and still off the 0.1-degree cell centre.
- The old values were replaced. No other server, deploy or scripts file contained them.

### WR-S10: Place ids are not checked against the API pattern

**Files modified:** `server/shinigami/places.py`, `server/tests/test_places.py`
**Commit:** 8c44555
**Applied fix:** `load_places` now requires the id to fully match `[a-z0-9_-]{1,32}`, the same rule `/api/profile?place=` uses. It skips invalid ids and logs only the id (truncated to 40 characters), never the coordinates. The label check suggested in the review was not added, so labels in the live places.toml cannot be rejected unexpectedly.

## Skipped Issues

### WR-S3: Pin "lat/lon: null" can be undone from camera geom + distance_m

**File:** `server/shinigami/providers/cameras.py:51`
**Reason:** Won't fix: accepted risk. David chose to show cameras at public saved places. Behaviour is unchanged. A code comment (commit 94bc95d) records the accepted risk and notes that the real protection is that Home and `is_home` places never reach the camera providers (WR-S1 and WR-S2).
**Original issue:** For camera-enabled pins, exact camera geoms plus `distance_m` let a client trilaterate the place.

## Notes for the orchestrator

- **Deploy impact:**
  - The unit file changed, so the next deploy must reinstall it and run `systemctl daemon-reload`.
  - `verify.sh --local` now FAILs if the camera dataset is not loaded or is more than 14 days old.
  - Tiles missing or unsupported on the server now return 503 instead of 204.
- **Outside this fixer's scope:**
  - `web/src/ui/location-sheet.test.ts` still contains the suburb label (owned by the web fixer).
  - Several `.planning/` documents still contain the suburb, and one also contains the old test coordinates.
  - Git history still holds the old values. Whether a rewrite is worth it depends on whether they were real.
- IN-* items were left alone as instructed.

---

_Fixed: 2026-11-11_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_


# Part 2: web

# Phase 02: Code Review Fix Report (web half)

**Fixed at:** 2026-11-11
**Source review:** .planning/phases/02-3d-map-hero-and-surveillance/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (CR-W1, WR-W1..WR-W8; IN-W* left alone as instructed)
- Fixed: 9
- Skipped: 0
- Only `web/` was touched.

**Verification after all fixes:** `npx vitest run`: 31 files, 278 tests passed. `npx tsc --noEmit`: clean. `npm run build`: passes (35 precache entries).

## Fixed Issues

### CR-W1: Accuracy-ring updates are lost whenever tiles or the ring source are loading

**Files modified:** `web/src/map/map.ts`, `web/src/map/map.test.ts`
**Commit:** df83b47
**Applied fix:** Ring updates no longer depend on `isStyleLoaded()`. They are queued only until the first `style.load` / `load` event. After that, or once the `me-acc` source exists, they always apply. The FakeMap in the test now tracks sources and layers, so the ring path after load really runs. New tests cover: queued until load, then applied; an update after load while `isStyleLoaded()` is false (tiles loading) still moves the ring; switching to search removes the ring layer.

### WR-W1: The cold-open hero hides the cached profile for 1.3 to 1.5 s

**Files modified:** `web/src/ui/hero.ts`, `web/src/ui/hero.test.ts`, `web/src/app.ts`
**Commit:** 5788f91
**Applied fix:** Kept as a minimal change; the hero design is not altered. `HeroHandle` gains `shortenTo(ms)`, which ends the hero within `ms` (fade included) and never makes it longer. When boot adopts a cached profile, it calls `hero.shortenTo(CACHED_HERO_MS = 600)`. The hero then covers the cached HUD for at most 600 ms after the cached paint, so it is gone under about 900 ms from boot. The full 1500 ms sequence still plays when nothing is cached. Reduced motion is unchanged: no fade, just an earlier end. Note: when shortened, the 1500 ms CSS eye animation is cut part-way. David may want to confirm this on the device.

### WR-W2: `TagLayer.clearAll()` closes any open card on unrelated updates

**Files modified:** `web/src/map/tags.ts`, `web/src/map/map.ts`, `web/src/map/map.test.ts`
**Commit:** 9028d7a
**Applied fix:**
- `clearAll()` closes the shared Card only when a tag owns it (`selectedId !== null`).
- `setProfile` now calls `tags.update` only when the camera layer objects actually change, compared by reference. `applyLayer` copies the other layers' references, so a frame for another layer never touches the tags.
- When camera layers are absent, the tags are still cleared (for example on a switch to Home). That case is a camera change, and the tags it removes are stale.
- Tests: the YOU card survives a camera-less update, and an open tag card survives a frame for another layer.

### WR-W3: Pin view uses whatever profile is loaded; same-cell pin switches never re-frame

**Files modified:** `web/src/map/view.ts`, `web/src/map/types.ts`, `web/src/map/map.ts`, `web/src/map/view.test.ts`, `web/src/map/map.test.ts`
**Commit:** 73c1bc2
**Applied fix:**
- `mapViewFor` returns `none` unless `profile.location.place_id === pin.id`.
- The pin `MapView` now carries `placeId`. The pin key in `setView` is `placeId|cell`, so a switch to another place in the same cell resets `pinFramed` and re-frames.
- Tests: another place's profile gives `none`, and an A→B switch within one cell triggers a second `fitBounds`.

**Status: fixed: requires human verification** (logic change).

### WR-W4: The cached profile is adopted for whatever location is restored

**Files modified:** `web/src/store.ts`, `web/src/store.test.ts`, `web/src/location.ts`, `web/src/app.ts`, `web/src/app.test.ts`, `web/src/offgrid.test.ts`
**Commit:** bffd897
**Applied fix:**
- **Storage:** `saveProfile(p, key)` now stores `{v: 2, key, profile}`. `loadCachedProfile()` returns `{profile, key}`. Legacy bare records come back as `key: null`.
- **Restored location:** a new `loadSavedState()` export reads the restored location state. Boot runs it in the same 300 ms IndexedDB read as the cached profile.
- **Adoption rule:** the cached profile is adopted only when `locationIdentity(cached key)` equals `locationIdentity(restored params)`:
  - pins: `pin:<place_id>`
  - search: `search:<lat>,<lon>`
  - GPS: `gps`. This lets a moved GPS fix still show the cache as "previous location", which matters most when off-grid.
  - no location: `none`
- **Legacy records:** matched from `profile.location`. A legacy search profile is never adopted.
- **Merging:** the `CACHED_KEY` swap hack is removed. `profileKey` is the exact key the profile was fetched for, and stream frames merge only while it equals the current params. Otherwise the client refetches.
- **Tests:** a cached profile for place A under a restored pin B shows nothing; the same profile under pin A shows. A store round-trip test covers the key, including legacy records.

**Status: fixed: requires human verification** (logic change).

### WR-W5: No client-side guard against camera layers for Home

**Files modified:** `web/src/app.ts`, `web/src/location.ts`, `web/src/map/map.ts`, `web/src/offgrid.test.ts`
**Commit:** 097eabb
**Applied fix:**
- **When a place counts as camera-off:** `camerasOff(key)` is true for a pin place in any of these cases:
  - the places list says `cameras: false`;
  - the pin restored in the location state says `cameras: false`. `usePlace` now keeps the flag on the pin, so a cold open offline knows too;
  - a fetched profile for that place came back with no camera layers.
- **What happens for such a place:**
  - Camera layers are stripped from fetched profiles before they are rendered and before `saveProfile`.
  - The debounced re-save also strips them.
  - Camera SSE frames are ignored.
  - A matching cached profile is stripped on adoption when the restored pin is `cameras: false`.
- **Comments:** they record that the risk is accepted for camera-enabled (public) places. The misleading "never receives the place coordinates" comment in map.ts is corrected.
- **Test:** a Home pin whose server response wrongly includes `cameras_cctv` stores only `sun`, both after the fetch and after a camera SSE frame plus the save debounce.

### WR-W6: `loadPlaces` persists the raw `/api/places` body

**Files modified:** `web/src/location.ts`, `web/src/location.test.ts`, `web/src/app.ts`
**Commit:** b7ec20c
**Applied fix:**
- New `sanitizePlaces()`: it requires an array and keeps only entries with `id: string`, `label: string` and `cameras: boolean`. It copies just those three fields; extra fields such as lat/lon are dropped.
- A non-array body throws inside `loadPlaces` and falls back to the cache. The cache read is sanitized too.
- `app.ts` adds a `.catch` to the `loadPlaces().then()` chain.
- `PlaceRef` gains an optional `cameras`.
- Tests: projection and dropping malformed entries, and a non-array body falling back to the cache.
- Note: a place-list cache written before this change (no `cameras` field) is dropped by the sanitizer until the next successful fetch.

### WR-W7: A 422 or network error for a superseded request still changes the mode or sets off-grid

**Files modified:** `web/src/app.ts`, `web/src/app.test.ts`
**Commit:** fde43fe
**Applied fix:** The `catch` in `refetch` returns early when `paramKey(params) !== key`. Only the current request can call `useGps()` or `markOffgrid()`, and `finally` still drains the queued request. The new test fails without the fix: a network error from the superseded pin-A request while pin B is in flight leaves the banner hidden.

### WR-W8: A restored `lastFix` draws the "YOU" figure at a stale position as if live

**Files modified:** `web/src/location.ts`, `web/src/location.test.ts`
**Commit:** e35f5d7
**Applied fix:**
- New constant `LIVE_FIX_MAX_AGE_MS = 2 * 60_000`.
- On `start()`, a restored `lastFix` older than this is dropped. `lastAccepted` is kept, so the cached fetch still works.
- With no `lastFix`, `mapViewFor` gives no figure, no accuracy ring and no "GPS · accuracy" card until a new fix arrives. The strip already reads "locating..." or "previous location".
- Test: a fix older than the limit is dropped, and one under it is kept.

---

_Fixed: 2026-11-11_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
