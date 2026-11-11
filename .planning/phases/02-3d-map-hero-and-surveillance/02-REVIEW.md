---
phase: 02-3d-map-hero-and-surveillance
reviewed: 2026-11-11T00:00:00Z
depth: standard
files_reviewed: 90
files_reviewed_list:
  - deploy/deploy.sh
  - deploy/install-pmtiles.sh
  - deploy/places.example.toml
  - deploy/refresh-data.sh
  - deploy/refresh-tiles.sh
  - deploy/shinigami-data.service
  - deploy/shinigami-data.timer
  - deploy/shinigami.service
  - deploy/verify.sh
  - scripts/dev-tiles.sh
  - server/shinigami/api/health.py
  - server/shinigami/api/places.py
  - server/shinigami/api/profile.py
  - server/shinigami/api/stream.py
  - server/shinigami/api/tiles.py
  - server/shinigami/assemble.py
  - server/shinigami/cameras_store.py
  - server/shinigami/data/__init__.py
  - server/shinigami/data/refresh_cameras.py
  - server/shinigami/main.py
  - server/shinigami/places.py
  - server/shinigami/providers/base.py
  - server/shinigami/providers/cameras.py
  - server/shinigami/schema.py
  - server/shinigami/settings.py
  - server/shinigami/tiles.py
  - server/tests/conftest.py
  - server/tests/test_cameras.py
  - server/tests/test_health.py
  - server/tests/test_places.py
  - server/tests/test_refresh_cameras.py
  - server/tests/test_stream.py
  - server/tests/test_tiles.py
  - web/package.json
  - web/public/icons.svg
  - web/src/app.test.ts
  - web/src/app.ts
  - web/src/location.test.ts
  - web/src/location.ts
  - web/src/map/accuracy-ring.test.ts
  - web/src/map/accuracy-ring.ts
  - web/src/map/buildings.test.ts
  - web/src/map/buildings.ts
  - web/src/map/camera-card.test.ts
  - web/src/map/camera-card.ts
  - web/src/map/card.test.ts
  - web/src/map/card.ts
  - web/src/map/follow.test.ts
  - web/src/map/follow.ts
  - web/src/map/leader.ts
  - web/src/map/longpress.test.ts
  - web/src/map/longpress.ts
  - web/src/map/map.test.ts
  - web/src/map/map.ts
  - web/src/map/marker-figure.ts
  - web/src/map/style.test.ts
  - web/src/map/style.ts
  - web/src/map/tags.test.ts
  - web/src/map/tags.ts
  - web/src/map/types.ts
  - web/src/map/view.test.ts
  - web/src/map/view.ts
  - web/src/model.test.ts
  - web/src/model.ts
  - web/src/net.test.ts
  - web/src/net.ts
  - web/src/styles/app.css
  - web/src/styles/hero.css
  - web/src/styles/hud.css
  - web/src/styles/map.css
  - web/src/styles/tags.css
  - web/src/styles/tokens.css
  - web/src/sw-routes.test.ts
  - web/src/sw-routes.ts
  - web/src/sw.ts
  - web/src/timeout.test.ts
  - web/src/timeout.ts
  - web/src/types.ts
  - web/src/ui/drawer.test.ts
  - web/src/ui/drawer.ts
  - web/src/ui/hero-art.ts
  - web/src/ui/hero.test.ts
  - web/src/ui/hero.ts
  - web/src/ui/next-list.test.ts
  - web/src/ui/next-list.ts
  - web/src/ui/readouts.test.ts
  - web/src/ui/readouts.ts
  - web/src/ui/shell.test.ts
  - web/src/ui/shell.ts
  - web/vite.config.ts
findings:
  critical: 3
  warning: 18
  info: 13
  total: 34
status: issues_found
---

# Phase 2 Code Review

Run as two parallel reviewers: server and deploy (IDs `-S`), web (IDs `-W`). Both halves follow.

# Part 1: server and deploy

# Phase 02: Code Review Report (server + deploy half)

**Reviewed:** 2026-11-11T00:00:00Z
**Depth:** standard
**Files Reviewed:** 34
**Status:** issues_found

## Summary

I reviewed the Phase 02 server, data-job, deploy and test files against the project's privacy rules:

- Home coordinates never reach git, logs, payloads or test output.
- `/api/places` returns no coordinates, and pin profiles return null lat/lon.
- Home never gets camera layers.
- No person-identifying data is shown.
- No upstream calls happen in the request path, and only one uvicorn worker runs.

Most of the obvious parts hold up. The places API and pin `ProfileLocation` contain no coordinates. Camera providers are gated by `exact_location_only` + `camera_ok`. The SSE bus never carries camera layers (they are `computed`, never published). Logs carry ids and exception types only. The request path does no network I/O.

There are two blockers:

1. **Home location oracle.** The "near {place}" label on GPS profiles is a sharp 2 km yes/no test. Any client can query it to recover the exact coordinates of Home.
2. **Operator contact filter misses common Australian phone formats.** Contact details in `operator` still reach the payload.

The warnings cover:

- Home detection works only on names.
- Exact pin coordinates are handed to every non-camera provider.
- Pin lat/lon can be reconstructed from camera `distance_m`.
- A `NaN` direction tag crashes the weekly refresh.
- The refresh has no floor on dataset size.
- Transient tile failures are cached as "absent" for a day.
- The places path is not pinned in the unit.
- The verify script cannot tell real camera layers from pending ones.
- A suburb and near-home test coordinates are committed to git.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-S1: "near {label}" GPS label lets any client find Home's exact coordinates

**File:** `server/shinigami/api/profile.py:54-59`
**Issue:** For `src=gps` (the default), the server checks the caller-supplied `lat`/`lon` against every saved place, Home included. It returns `"near Home (...)"` if and only if `haversine_m(...) <= 2000`. The client controls `lat`/`lon` freely (`ge=-90, le=90`, 5+ decimals), so the response is a precise yes/no test for "is this point within 2 km of Home?":

- Binary-search along a few rays to find 3 points on the 2000 m boundary. That takes about 20 requests per ray.
- Those 3 points pin Home to the metre.

The "nearest place wins" rule adds more boundaries to search against. This breaks the rule that Home's coordinates must never reach client payloads. The pin path carefully nulls lat/lon and drops camera layers, and this label path undoes that. Any device on the tailnet, or a script on the phone, can run the search. `test_gps_label_near_and_far` (tests/test_places.py:133-138) locks this behaviour in.
**Fix:** Never match camera-off / home-like places in the label (they are exactly the places whose location is secret). Optionally also snap the input before comparing, so any remaining boundary is only accurate to the grid:
```python
for p in request.app.state.places.values():
    if not p.cameras:          # home-like / camera-off places are never matched
        continue
    d = haversine_m(lat, lon, p.lat, p.lon)
    ...
```
Then change the test so it asserts Home is never named in a GPS label.

### CR-S2: Operator contact filter misses Australian phone formats, so contact details reach the payload

**File:** `server/shinigami/data/refresh_cameras.py:28, 52-60`
**Issue:** `_CONTACT_RE = r"@|https?:|www\.|\d{6,}"` only catches 6 or more digits in a row. Common AU formats split the digits into groups of at most 4, so none of these match:

- `0412 345 678`
- `03 9123 4567`
- `+61 3 9123 4567`
- `(03) 9123-4567`
- `1300 123 456`

An `operator` value like `"J Smith 0412 345 678"` therefore goes into cameras.json, then `detail.operator` in `/api/profile`. Likewise `facebook.com/joesmith` (no `www.`/`http`) passes. The keep-the-operator rule also lets plain personal names through whenever the node has no `operator:type`, `building` or `addr:housenumber` tag. That is the usual case for standalone surveillance nodes on a pole or wall. Showing a private person's name or phone number breaks the "nothing that identifies people" rule. The test (`test_refresh_cameras.py:35`) only checks the unbroken `0412345678` case.
**Fix:** Strip separators before counting digits, and widen the URL check:
```python
_CONTACT_RE = re.compile(r"@|https?:|www\.|\.(com|net|org|au)\b|/", re.IGNORECASE)

def _looks_like_contact(v: str) -> bool:
    digits = re.sub(r"[\s().+-]", "", v)
    return bool(_CONTACT_RE.search(v) or re.search(r"\d{6,}", digits))
```
Add test cases for the spaced, bracketed and `+61` formats. Also consider an allowlist instead: keep the operator only when `operator:type` is government/public/commercial, or the node carries a commercial key.

## Warnings

### WR-S1: Home's no-cameras rule depends on the name; any other place gets cameras by default

**File:** `server/shinigami/places.py:25-26, 55-64`
**Issue:** `is_home_like` only matches `id == "home"` or a label that starts with "home". Any of these entries gets `cameras = True`:

- a residence entered as `id = "base"`, `label = "Bulleen"`, `"Mum's"` or `"Flat"`
- a typo such as `id = "hmoe"`

Its cameras layer then carries exact camera geoms and `distance_m`, which locate the pin (see WR-S3). The module promises "fail closed", but the default is `cameras = True`. That is fail-open for any private place that isn't named home.
**Fix:** Default `cameras` to `False` and require an explicit `cameras = true` for public places (monash, cbd, gym). Keep the home-name override as a second layer. Update `places.example.toml` and the tests to match.

### WR-S2: assemble passes exact pin coordinates to every non-camera provider

**File:** `server/shinigami/assemble.py:26-29`; `server/shinigami/api/profile.py:44`
**Issue:** For `source == "pin"`, `resolve_location` returns Home's exact `p.lat, p.lon`, and `assemble_profile` hands them to every provider whose `exact_location_only` is False. Sun and UV providers happen to snap to the cell today, but nothing enforces it. `exact_location_only` defaults to False, so any future provider that returns `geom`, a distance or a bearing would leak Home's location. That is fail-open by default.
**Fix:** For pins, give non-exact providers the cell centre, and give exact providers the true point only when `exact_ok`:
```python
cell = snap_cell(lat, lon)
plat, plon = (lat, lon) if (location.source != "pin" or (exact_ok and p.meta.exact_location_only)) else (cell.lat, cell.lon)
layer = p.query(ctx, plat, plon, now)
```

### WR-S3: Pin "lat/lon: null" can be undone from camera geom + distance_m

**File:** `server/shinigami/providers/cameras.py:39, 51`
**Issue:** For camera-enabled pins, each camera item carries the camera's exact `geom` and `detail.distance_m` measured from the pin's true coordinates. Three items give an exact fix on the pin. So `lat: null, lon: null` on pin profiles only hides the coordinates on the surface. That is fine for public places, but together with WR-S1 any mis-flagged private place is fully exposed. The rule "pin profiles return location lat/lon as null" is not really met.
**Fix:** For `location.source == "pin"`, measure `distance_m` from the place's snapped cell (or round it to 50 m), or leave it out. At minimum, document that camera-enabled pins reveal their position and enforce WR-S1's opt-in.

### WR-S4: `direction=nan` / `inf` in OSM crashes the whole weekly refresh

**File:** `server/shinigami/data/refresh_cameras.py:38-43`
**Issue:** `float("nan")` and `float("inf")` parse without error, then `round((deg % 360) / 45)` raises `ValueError`/`OverflowError` outside the `try`. The error escapes the osmium handler and aborts `build()`, so one vandal or mistaken tag stops all camera updates until someone notices. The timer unit has no failure alert.
**Fix:**
```python
if not math.isfinite(deg):
    return None
```
Also wrap the per-node record building in a try/except that counts and skips bad nodes.

### WR-S5: Weekly refresh overwrites a good cameras.json with no size check

**File:** `server/shinigami/data/refresh_cameras.py:166-170`; `deploy/refresh-data.sh:20-21`
**Issue:** `main()` always calls `os.replace` with whatever `build()` returned. A truncated or wrong-region PBF that osmium still parses, or a tag-scheme change, writes an empty or tiny dataset. The server then reloads it within 5 minutes and shows "0 cameras" everywhere as `fresh`. Nothing verifies the PBF (Geofabrik publishes `.md5`).
**Fix:** Check the download against `victoria-latest.osm.pbf.md5`. In `main()`, refuse to replace when the new count is below, say, 50% of the existing file's count, unless a `--force` flag is given. Exit non-zero so systemd records the failure.

### WR-S6: Transient tile failures return the same 204 as a genuinely missing tile, cached for a day

**File:** `server/shinigami/api/tiles.py:23-25`; `server/shinigami/tiles.py:99-109`
**Issue:** `TileStore.get()` returns `None` when the store is not `ok`, and also on `ValueError`/`OSError`. The `OSError`/`ValueError` case includes the reload race: another thread's `_open()` calls `_close()` on the file the copied `reader` still uses, so you get "I/O operation on closed file". The route turns every `None` into `204` with `Cache-Control: public, max-age=86400`. The phone and service worker then cache a blank tile for 24 h under the current `?v=build` URL for a tile that really exists.
**Fix:** Separate the cases. Return 204 + cache only when the store is `ok` and the reader returns `None`. On a non-ok status or a read exception, return `503` with `Cache-Control: no-store`. Also, on reload, don't close the old file until in-flight readers finish: keep the old handle and let GC close it, or use reference counting.

### WR-S7: Places file path not pinned in the unit; a missing file silently gives "no places", and verify only SKIPs

**File:** `deploy/shinigami.service:10-13`; `server/shinigami/settings.py:16`; `deploy/verify.sh:126`
**Issue:** The unit pins `SHINIGAMI_TILES_PATH` and `SHINIGAMI_CAMERAS_PATH` but not `SHINIGAMI_PLACES_PATH`. The default is `/opt/shinigami/var/places.toml`, not `/etc/shinigami/places.toml`, so the path depends on `.env` being right. If it isn't, `load_places` logs one warning and returns `[]`. verify then reports `SKIP place_no_cameras "no saved places"` rather than FAIL, so a broken setup that has no Home at all passes deploy. It also invites someone to "fix" it by creating `var/places.toml` in the repo checkout, which sits next to git.
**Fix:** Add `Environment=SHINIGAMI_PLACES_PATH=/etc/shinigami/places.toml` to the unit. In `verify.sh --local`, FAIL when `/etc/shinigami/places.toml` exists but `/api/places` is empty.

### WR-S8: verify `cameras_layers` passes when the camera dataset is missing

**File:** `deploy/verify.sh:103-110`; `server/shinigami/api/health.py:15-22`
**Issue:** The check only greps for the layer ids. With no `cameras.json`, both layers are still present with `status: "pending"`, so the check passes on a CT where the data job never ran or always fails. Health reports tile status but not camera-store status.
**Fix:** Add `"cameras": "ok" | "missing"` (from `app.state.cameras.loaded`) and `built_at` age to `/api/health`. In verify, require `ok` and an age under 14 days (SKIP before the first run only if the file does not exist).

### WR-S9: Home's suburb and near-home test coordinates are committed to git

**File:** `deploy/places.example.toml:7`; `server/tests/test_places.py:14, 19`
**Issue:** The example and test use the label `"Home (Bulleen)"`, which commits Home's suburb to git and sends it in every `/api/places` and GPS "near" payload. The test's "fake" `HOME = (-37.7234, 145.0912)` lies a few km from that suburb. Whether or not it is real, a fake that sits near the true location narrows the search and normalises committing near-home values. The project rule is that Home's location (coordinates included) lives only in `/etc/shinigami/places.toml`.
**Fix:** Use `label = "Home"` in the example and tests. Use clearly fictional test coordinates far from Melbourne, for example `(-10.5, 120.5)`, and keep the off-cell-centre property. Consider rewriting history only if the test values turn out to be real.

### WR-S10: Place ids are not checked against the API pattern

**File:** `server/shinigami/places.py:42-45`; `server/shinigami/api/profile.py:76`
**Issue:** The loader accepts any string id, for example `"Home"`, `"my place"` or a 40-character id. `/api/places` lists it, but `/api/profile?place=` enforces `^[a-z0-9_-]+$`, max 32, so selecting that place always returns 422 and the HUD is stuck on an error. The label has no length or character limit either.
**Fix:** In `load_places`, require `re.fullmatch(r"[a-z0-9_-]{1,32}", pid)` and a label of 1-60 printable characters. Warn using the index, not the raw id.

## Info

### IN-S1: TileStore._open leaks the file handle when the header is unreadable

**File:** `server/shinigami/tiles.py:58-79`
**Issue:** If `Reader(...)`/`reader.header()` raises, the `except` path sets `unsupported` without closing `f`.
**Fix:** Call `f.close()` in the except path (guarded by `"f" in locals()`), or use try/finally.

### IN-S2: The tests' leak checks only look for the exact float string

**File:** `server/tests/test_places.py:91, 117, 233-234`
**Issue:** `str(HOME[0]) not in r.text` misses rounded or re-formatted forms such as `-37.7234000001` or `-37.723`. It would not catch a derived leak like CR-S1 either.
**Fix:** Also assert that no number within 0.01 deg of HOME appears in the payload. Parse the JSON recursively and check every float.

### IN-S3: `camera:type` free text is copied unfiltered

**File:** `server/shinigami/data/refresh_cameras.py:81-82`
**Issue:** Any string is copied into `camera_type` (no allowlist or length limit). Low risk, but it bypasses the contact filter.
**Fix:** Allow only `{"fixed", "dome", "panning"}`.

### IN-S4: `lat = true` in places.toml is accepted as 1.0

**File:** `server/shinigami/places.py:47`
**Issue:** `float(True) == 1.0`, so a boolean typo gives a valid but wrong place.
**Fix:** Reject `bool` values before calling `float()`.

### IN-S5: Every deploy SIGKILLs production and has no rollback

**File:** `deploy/deploy.sh:74`; `deploy/verify.sh:178-185`
**Issue:** `verify.sh --local` always runs the SIGKILL restart test. If any check fails (for example a 24 h-old journald hit), deploy exits 1 with the new code already live.
**Fix:** Make the SIGKILL test opt-in (`--chaos`). Record the previous commit and print a rollback command when verify fails.

### IN-S6: Import-time `app = create_app()` and a cwd-relative `.env`

**File:** `server/shinigami/main.py:130`; `server/shinigami/settings.py:12`
**Issue:** Importing `shinigami.main`, which every test does, builds an app from the default settings. That reads `<repo>/var/places.toml`, `var/cameras.json` and `./.env` from whatever the current directory is. On the dev PC, tests therefore load real local data. In prod, a stray `/opt/shinigami/.env` would be read as well as the EnvironmentFile.
**Fix:** Use uvicorn `--factory shinigami.main:create_app` and drop the module-level app. Set `env_file=None`, since systemd supplies the env.

### IN-S7: Unexpected reader exceptions become 500s

**File:** `server/shinigami/tiles.py:106-109`
**Issue:** Only `ValueError`/`OSError` are caught. A corrupt directory can raise `IndexError`/`struct.error`, which become a 500 from the tile route.
**Fix:** Catch `Exception` there, log the type only (no z/x/y), and return the uncached 503 suggested in WR-S6.

---

_Reviewed: 2026-11-11T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_


# Part 2: web

# Phase 02: Code Review Report (web half)

**Reviewed:** 2026-11-11T09:15:37Z
**Depth:** standard
**Files Reviewed:** 58
**Status:** issues_found

## Summary

I reviewed the web client for phase 02: the boot and cache path, location, net/SSE, the service worker, the MapLibre map, and the HUD UI. I checked it against the project rules: CSP `style-src 'self'`, no innerHTML, no CDN assets, a cached profile on screen in under 1 s, the phone never gets Home's coordinates, and one WebGL context.

**Rules that hold:**
- No `innerHTML`, `insertAdjacentHTML`, `setAttribute("style")` or `cssText` in production code. All inline positioning uses CSSOM (`el.style.x = …` or `style.setProperty`), which `style-src 'self'` allows.
- No runtime CDN or Google Fonts. Fonts come from `@fontsource` and are bundled; `assetsInlineLimit` keeps woff2 files out of `data:` URLs.
- Boot reads IndexedDB under a 300 ms budget, never awaits the map chunk or the hero, and loads the map lazily, two frames after first paint.
- Only one MapLibre `Map` is created, and nothing else creates a GL context.

**Defects found:**
- **Blocker (CR-W1):** the accuracy ring drops updates. `isStyleLoaded()` gating defers them, and the only flush is the one-time `load` event.
- **Pin and cache key bugs:** the map's pin view is not tied to the place the profile belongs to (WR-W3), and the cached profile is adopted for whatever location is restored (WR-W4).
- **Cards closed by data updates:** any camera-less profile or SSE frame closes the open card (WR-W2).
- **Privacy, defence in depth:** saved places can be recovered on the phone from camera positions plus `distance_m` (WR-W5). The places list is also persisted unfiltered (WR-W6).
- **Cold-open hero:** an opaque overlay hides the cached profile for 1.3 to 1.5 s, which conflicts with the under-1 s Core Value (WR-W1).

## Critical Issues

### CR-W1: Accuracy-ring updates are lost whenever tiles or the ring source are loading

**File:** `web/src/map/map.ts:309-320` (with `web/src/map/accuracy-ring.ts:62-122`)

**Issue:** `applyRing` only calls `syncRing` when `map.isStyleLoaded()` is true. Otherwise it stores the view in `ringPending`, and the only thing that flushes `ringPending` is `map.on("load", …)`, which fires once per map lifetime.

In MapLibre 6.16.0, `Map.isStyleLoaded()` returns `Style.loaded()`. That checks `_loaded`, then `_updatedSources`, then `tileManagers[id].loaded()` for every source (`maplibre-gl-dev.mjs:47818-47823`). So it returns **false whenever any tile is loading**, and also while the ring's own GeoJSON source has a worker update in flight (`_workerUpdates.isIdle()`). Both are routine:
- A new GPS fix triggers `easeTo` and tile loads.
- The previous `setData` may still be pending.

After `load`, every `setView` that lands in these windows is deferred and never applied. The result:
- The ring stays at the old position or radius while the figure moves.
- On GPS → search/pin, the ring layer is never removed, so a GPS accuracy ring stays on the map in search mode.

The bug persists until a later `setView` happens to land while everything is idle. `map.test.ts` fakes `isStyleLoaded = () => false` and only tests the `load` flush, so this path is untested.

**Fix:** gate on the style having parsed, not on all sources being idle, and flush on every idle rather than once:
```ts
const styleReady = () => (map as unknown as { style?: { _loaded?: boolean } }).style?._loaded === true;
const applyRing = (v: MapView) => {
  if (!styleReady()) { ringPending = v; return; }
  ringPending = null;
  syncRing(ringMap, v, ringTokens);
};
map.on("load", () => { if (ringPending) applyRing(ringPending); });
map.on("idle", () => { if (ringPending) applyRing(ringPending); }); // belt and braces
```
`addSource`, `addLayer` and `setData` are all legal once the style JSON is loaded. Alternatively, keep a `styleLoaded` flag set in the `load` handler and use that. Add a test where `isStyleLoaded` turns false after `load` and a second view still updates the ring.

## Warnings

### WR-W1: The cold-open hero hides the cached profile for 1.3 to 1.5 s, breaking the under-1 s Core Value

**File:** `web/src/ui/hero.ts:4,96-97` and `web/src/styles/hero.css:1-10`

**Issue:** `.hero` is `position: fixed` from below the title bar to `bottom: 0`, with `background: var(--c-bg)` and `z-index: 20`. That sits above `.hud`, `.map-controls` (5) and `.drawer` (6). It stays fully opaque until `HERO_MS - FADE_MS` = 1300 ms, and is removed at 1500 ms (700 ms with reduced motion).

The cached rows are rendered under it within ~300 ms, but they are not *on screen* until about 1.3 s on every cold open. `app.ts:87` says the hero "cannot delay the cached paint". Technically that is true of the DOM, but the user still cannot see the data. This conflicts with the Core Value: "open the app and a cached profile … is on screen in under a second. If everything else fails, this must work."

**Fix:** either:
- cap the opaque phase below 1 s (for example `HERO_MS = 900`, fade from 700 ms); or
- leave the drawer peek and the readouts uncovered (`bottom: calc(var(--drawer-peek) + env(safe-area-inset-bottom))`, or raise the drawer's z-index above the hero).

If 1.5 s is a deliberate UI-SPEC decision, record it in the spec as an exception to the Core Value.

### WR-W2: `TagLayer.clearAll()` closes any open card (building, YOU, pin) on unrelated profile or SSE updates

**File:** `web/src/map/tags.ts:225-228,300-304`

**Issue:** `reconcile()` calls `clearAll()` whenever the origin is null or there are no located camera items, and `clearAll()` calls `this.deps.card.close()` unconditionally. The `Card` is shared by the building card, the YOU card and the pin card.

`setProfile` → `tags.update(items)` runs on every SSE `layer` frame (`app.ts:303`, `syncMap`) and on every location render. So whenever the current profile has no camera items, the next frame from any layer closes the card the user just opened. That includes:
- out of coverage;
- before the camera store loads;
- a saved place with no cameras;
- Home, where the server omits camera layers.

**Fix:** close the card only if it belongs to a tag:
```ts
private clearAll(): void {
  if (this.selectedId !== null) { this.deps.card.close(); this.selectedId = null; }
  for (const e of this.entries.values()) e.marker.remove();
  this.entries.clear();
}
```

### WR-W3: Pin view uses whatever profile is loaded, not the selected place; same-cell pin switches never re-frame

**File:** `web/src/map/view.ts:17-23`, `web/src/map/map.ts:391-407,447-475`

**Issue:** `mapViewFor` takes `cell_lat`/`cell_lon` from `p.location` without checking that `p.location.place_id === s.pin.id`. When the user switches from pin A to pin B, `renderLocation()` runs immediately with A's profile still loaded:
1. `setView` gets A's cell.
2. `setProfile(A)` frames A's cameras and sets `pinFramed = true`.
3. When B's profile arrives, `setView` compares only `lastPinKey` (the 0.1° cell, about 11 km). Two Melbourne places usually share a cell, so the key is unchanged and `pinFramed` stays true. The map never frames B's cameras and stays on A.
4. Meanwhile `tags.setOrigin("server")` ranks B's tags with distances that, for a moment, belong to A.

**Fix:** in `mapViewFor`, return `{ kind: "none" }` unless `p?.location?.place_id === s.pin.id`. In `setView`, key the pin on the place id (add `placeId` to the pin `MapView`) instead of the cell centre, and reset `pinFramed = false` when the place id changes.

### WR-W4: The cached profile is adopted for whatever location is restored, so it can render or merge under the wrong location

**File:** `web/src/app.ts:120-128,216-221,295-306`

**Issue:** `profileKey = CACHED_KEY` is swapped to the key of the *first* params that arrive (in `setLocationParams`), or to the stream's params (in `onLayer`). It is never checked against the location the cached profile was fetched for.

The two are persisted on different schedules:
- Location state is saved on every change (`location.ts:86-90`).
- The profile is saved only after a successful fetch.

So switching to a pin or search while off-grid leaves IndexedDB holding pin state alongside an older GPS profile. On the next open:
- The GPS profile is shown under the pin's label.
- SSE frames for the pin are merged into it, because the key now matches.
- `scheduleSave()` writes the mixed profile back.

The same happens when `loc.start()` misses its timeout budget. `params` is then null, and the stream opened at line 287 adopts the default-location key for the cached profile.

**Fix:** persist the params key with the profile (`saveProfile({ key: paramKey(params), profile })`). Use it as `profileKey` on restore instead of `CACHED_KEY`. Merge stream frames only when it equals `paramKey(params)`; otherwise keep the cached rows visible but refetch before merging.

### WR-W5: Saved-place coordinates can be recovered on the phone from camera positions plus `distance_m`; no client-side guard for Home

**File:** `web/src/map/tags.ts:234-236`, `web/src/map/map.ts:376-379,447-475` (server: `server/shinigami/providers/cameras.py:39`)

**Issue:** The comment at `map.ts:376-378` says the phone "never receives the place coordinates". For a saved place, though, the client receives and persists (via `saveProfile`):
- each camera's exact `[lon, lat]`;
- its integer distance to the place (`detail.distance_m`).

With three or more cameras, that trilaterates the place to about a metre. `fitBounds` also centres the map on the place's camera cluster. The server currently omits camera layers for Home (`test_home_pin_has_no_camera_layers`), so Home is protected only by the server. The client has no defence in depth: if the server regresses, the client frames, stores and displays it.

**Fix:**
- Server side: bucket `distance_m` (for example to 25 m) or send only a rank/ordinal for pin profiles.
- Client side: in pin mode, ignore any camera layer whose profile `location.lat`/`lon` are null and whose `place_id` is flagged sensitive. Alternatively, strip `distance_m` before `saveProfile` for pin profiles.
- Correct the comment so it matches what the phone can actually derive.

### WR-W6: `loadPlaces` persists the raw `/api/places` body without validation or projection

**File:** `web/src/location.ts:176-194`

**Issue:** The response is cast to `PlaceRef[]` and written to IndexedDB as-is.
- **Privacy:** if the server ever includes `lat`/`lon` (or any other field), the phone stores Home's coordinates permanently. The rule is that the phone must never get or store them, and nothing on the client enforces it.
- **Crash:** a non-array body (an error object, or HTML through a captive portal with 200) reaches `sheet.setPlaces(l)`. Iterating it throws inside `void loadPlaces(...).then(...)` (`app.ts:222`), which becomes an unhandled rejection.

**Fix:**
```ts
const raw = (await res.json()) as unknown;
if (!Array.isArray(raw)) throw new Error("bad places");
const list = raw
  .filter((p): p is { id: unknown; label: unknown } => !!p && typeof p === "object")
  .filter((p) => typeof p.id === "string" && typeof p.label === "string")
  .map((p) => ({ id: p.id as string, label: p.label as string }));
```
Also add `.catch(() => {})` on the `then` in `app.ts:222`.

### WR-W7: A 422 for an already-superseded pin request still forces the user back to GPS

**File:** `web/src/app.ts:251,261-267`

**Issue:** The "location changed mid-flight" guard at line 251 runs only on success. In the `catch`, a 422 for pin A calls `loc.useGps()` whenever the *current* mode is `"pin"`, even if the user has since picked pin B. Likewise, a network failure for a stale request marks the app off-grid.

**Fix:** in the `catch`, start with `if (paramKey(params) !== key) return;` (the `finally` still drains `queued`).

### WR-W8: A restored `lastFix` draws the "YOU" figure at a stale position as if live

**File:** `web/src/location.ts:136-143`, `web/src/map/view.ts:14-16`

**Issue:** `start()` restores the whole saved state, including `lastFix` (possibly days old), and only resets `gps` to `"locating"`. `mapViewFor` builds a `gps` view from `lastFix` without looking at `gps` or its age. On open, the figure and accuracy ring therefore appear at the old location, and the figure card reads "GPS · accuracy N m". This stays true when GPS is denied (`gps: "off"`), where the figure never updates.

Using the last accepted location for the cached *fetch* is intended. Showing it as the live figure is wrong.

**Fix:** drop `lastFix` on restore (`s = { ...saved, lastFix: undefined, gps: "locating" }`), or have `mapViewFor` require `s.gps === "live"` for the figure. Until then it should fall back to a neutral or "previous location" framing.

## Info

### IN-W1: Each mismatched SSE frame triggers a refetch

**File:** `web/src/app.ts:298-300`

**Issue:** While `profileKey` differs from the params, each incoming layer frame calls `refetch()`. The `queued` flag collapses these, but a burst still causes at least one extra full `/api/profile` request after the in-flight one completes.

**Fix:** skip the frame when `inflight` is already true.

### IN-W2: An expiring row and its re-created twin can coexist

**File:** `web/src/ui/next-list.ts:111-115,152-157`

**Issue:** `expire()` leaves the node in the DOM for 1200 ms after removing it from `rows`. If an item with the same id reappears within that window (for example a recomputed countdown), `update()` creates a second node, and both are visible.

**Fix:** keep expiring nodes in a separate map and remove them immediately when the id reappears.

### IN-W3: Existing tag markers never move to updated coordinates

**File:** `web/src/map/tags.ts:256-264`

**Issue:** `setLngLat` is called only on creation. `e.item` is refreshed, but neither `e.lngLat` nor the marker is. If a camera's position changes in the dataset, the tag stays at the old point while the distance uses the new one.

**Fix:** if `e.lngLat` differs from `l.lngLat`, call `e.marker.setLngLat(l.lngLat)` and store the new value.

### IN-W4: The hero's `finish()` removes `aria-hidden` from the app root unconditionally

**File:** `web/src/ui/hero.ts:70`

**Issue:** `mountHero` never sets `aria-hidden` on `root`, but `finish()` removes it anyway. That would clobber the attribute if a modal (for example the location sheet opened by `onGpsOff` during the hero) had set it.

**Fix:** delete line 70.

### IN-W5: The building card's tap anchor does not track programmatic camera moves

**File:** `web/src/map/map.ts:163-170`

**Issue:** The anchor is a fixed 1 px div at the tap's screen point. User drags close the card (through the `pointerdown` capture), but a GPS `easeTo` while the card is open moves the red building away while the card and leader still point at the old screen spot.

**Fix:** store the tap `LngLat`, and on `move` reposition the anchor with `map.project`. Alternatively, close the building card on programmatic `movestart`.

### IN-W6: GPS fixes taken at Home are persisted on the phone

**File:** `web/src/location.ts:71-77,102-106`

**Issue:** `location:state` keeps `lastAccepted` and `lastFix` at five-decimal precision. When David is at Home, these are Home's coordinates, stored in IndexedDB indefinitely. This is the phone's own sensor, not server data, but it sits uneasily with "the phone must never … store Home's coordinates".

**Fix:** consider persisting only `lastAccepted` rounded to the 0.1° cell, or not persisting GPS coordinates at all and relying on the cached profile.

---

_Reviewed: 2026-11-11T09:15:37Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
