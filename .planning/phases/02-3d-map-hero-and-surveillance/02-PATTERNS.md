# Phase 2: 3D Map, Hero and Surveillance - Pattern Map

**Mapped:** 2026-11-07
**Files analyzed:** 38 new/modified
**Analogs found:** 31 / 38 (7 have no in-repo analog; use RESEARCH.md patterns)

Conventions observed in the repo: Python 3.12, 4-space, module docstrings, sync read-only providers, pydantic frozen models, pytest with `client`/`settings`/`frozen_now` fixtures (`server/tests/conftest.py`). Web: vanilla TS classes with `document.createElement`, `textContent` only (no innerHTML/inline style: CSP `style-src 'self'`), `export class X { constructor(private host: HTMLElement) }`, pure functions split from DOM for vitest/happy-dom, `vi.useFakeTimers()`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `server/shinigami/providers/cameras.py` | provider (computed) | request-response, in-memory read | `server/shinigami/providers/sun.py` | exact |
| `server/shinigami/cameras_store.py` | service/store | file-I/O at startup, mtime reload | `server/shinigami/store.py` (lazy file store) + `places.py` (`load_places`) | role-match |
| `server/shinigami/data/refresh_cameras.py` | offline job | batch/transform | `scripts/make_icons.py` | partial |
| `server/shinigami/api/tiles.py` | route | request-response (binary) | `server/shinigami/api/health.py` / `profile.py` | role-match |
| `server/shinigami/tiles.py` | service | file-I/O (mmap) | `server/shinigami/store.py` | partial |
| `server/shinigami/main.py` (modify) | config/app factory | wiring | itself | exact |
| `server/shinigami/settings.py` (modify) | config | - | itself | exact |
| `server/shinigami/api/profile.py` (modify, privacy: no cameras for `place=`) | route | request-response | itself | exact |
| `server/shinigami/api/health.py` (modify, `tiles` field) | route | request-response | itself | exact |
| `server/tests/test_cameras.py`, `test_refresh_cameras.py`, `test_tiles.py` | test | - | `server/tests/test_sun.py`, `test_health.py` | exact |
| `deploy/refresh-tiles.sh`, `refresh-data.sh`, `install-pmtiles.sh`, `shinigami-data.service/.timer` | config/ops | batch | `deploy/shinigami.service`, `deploy/deploy.sh`, `deploy/verify.sh` | role-match |
| `deploy/verify.sh` (modify) | ops test | - | itself (`check`, `http_code`) | exact |
| `web/src/ui/shell.ts` (modify) | component | layout | itself | exact |
| `web/src/app.ts` (modify: WR-04/06/07/08, map hook) | controller | event-driven | itself | exact |
| `web/src/model.ts` (modify `selectVisible` excludes `geom !== null`) | utility | transform | itself | exact |
| `web/src/ui/drawer.ts` (+css) | component | event-driven (gesture) | `web/src/ui/location-sheet.ts` | role-match |
| `web/src/ui/readouts.ts` | component | event-driven (ticker) | `web/src/ui/location-strip.ts`, `offgrid-banner.ts` | role-match |
| `web/src/ui/hero.ts` + `hero.css` | component | event-driven (timers) | `web/src/ui/offgrid-banner.ts` (timer/fade) | role-match |
| `web/src/map/map.ts` | controller | event-driven | `web/src/app.ts` | partial |
| `web/src/map/style.ts` | utility (pure) | transform | `web/src/format.ts` (pure fn, tested) | partial |
| `web/src/map/tags.ts`, `card.ts`, `leader.ts`, `longpress.ts`, `buildings.ts`, `accuracy-ring.ts`, `marker-figure.ts`, `pin.ts` | component/utility | event-driven | `web/src/ui/next-list.ts` (class w/ DOM) + `ticker.ts` | partial |
| `web/src/sw.ts` (modify: CacheFirst /tiles /glyphs) | config | request-response | itself | exact |
| `web/vite.config.ts` (modify globs: pbf, svg; proxy /tiles) | config | - | itself | exact |
| `web/src/*.test.ts` for new modules | test | - | `web/src/ui/next-list.test.ts` | exact |
| `web/public/icons.svg`, `web/public/glyphs/**` | asset | - | `scripts/make_icons.py` (generated assets) | none |

## Pattern Assignments

### `server/shinigami/providers/cameras.py` (provider, computed, in-memory)

**Analog:** `server/shinigami/providers/sun.py` (and contract in `providers/base.py`)

**Imports / meta pattern** (sun.py lines 3-11, 61-68):
```python
from shinigami.geo import snap_cell
from shinigami.providers.base import Provider, ProviderContext, ProviderMeta
from shinigami.schema import Item, Layer

class SunProvider(Provider):
    meta = ProviderMeta(id="sun", tier="computed", ttl_s=3600, stale_after_s=None,
                        attribution="Computed locally (astral)")
```
**query() shape** (sun.py 70-81): returns `Layer(id=..., status="fresh", rev=int(now), as_of=now, attribution=..., items=[...])`. `Provider.query` is SYNC and must never do I/O (base.py docstring); file read happens in the store at startup/mtime reload, not here.

**Item construction** (sun.py 42-55): copy field set exactly (`id, layer, group, name, verb, target_ts, kind, severity, detail, fetched_at, stale_after_s, computed=True`). For cameras: `kind="infrastructure"`, `target_ts=None`, `stale_after_s=None`, `geom={"type":"Point","coordinates":[lon,lat]}` (schema.py line 26 slot), `detail` with only present keys.

**Distance filter:** reuse `from shinigami.geo import haversine_m` (geo.py 9-14); lat-bucket prefilter then haversine. Two providers/layers: `cameras_cctv` (150 m), `cameras_road` (1000 m).

**Privacy deviation from sun.py:** sun snaps to the 0.1 degree cell for pinned places (sun.py 71-73). Cameras must instead be exact-point for gps/search, and return an empty layer (no items, no distance_m) when the request is a `place=` pin. The provider only receives `(lat, lon)`, so the pin signal must be passed via `ctx` or `assemble_profile` must skip camera providers when `location.source == "pin"` (modify `assemble.py` line 21 loop; `location` is already in scope). Planner decides; contract test in `test_profile_readonly.py`.

**Error handling:** none inside provider; `assemble.py` 22-35 already converts exceptions to `status="error"` layers. Missing/unparsable data file -> `status="pending"` layer.

---

### `server/shinigami/cameras_store.py` (service, file-I/O)

**Analog:** `server/shinigami/store.py` (lazy: "no file I/O until first use", constructed in `main.py` line 39 `Store(settings.db_path)`, closed in lifespan line 63) and `places.py` `load_places(settings.places_path)` (main.py line 69).

Copy: construct in `create_app` from a `settings.*_path`, hang on `app.state`/`ctx`, tolerate a missing file (places.toml may not exist; `deploy/places.example.toml`). Add `settings.cameras_path: Path = REPO_ROOT / "var" / "cameras.json"` beside `db_path`/`places_path` (settings.py lines 16-17; prod via `SHINIGAMI_CAMERAS_PATH=/var/lib/shinigami/data/cameras.json`).

---

### `server/shinigami/api/tiles.py` + `server/shinigami/tiles.py` (route + reader wrapper)

**Analog:** `server/shinigami/api/health.py` for router shape; `main.py` for registration.

**Router pattern** (health.py 6-17):
```python
from fastapi import APIRouter, Query, Request
router = APIRouter()

@router.get("/api/health")
async def health(request: Request) -> dict:
    settings = request.app.state.settings
    return {"status": "ok", "version": settings.version, "server_time": time.time()}
```
Use a sync `def` route (threadpool) for the mmap reader per RESEARCH Pattern 1; type path params `z: int = Path(ge=0, le=15)`. Access state via `request.app.state.<x>` as profile.py 64 does.

**Registration** (main.py 89-94): `app.include_router(tiles.router)` before the `StaticFiles` mount at line 96-97, add to the import on line 11. Cache headers: `headers_mw` (main.py 71-87) only handles `/api/`, `/assets/`, `NO_CACHE_PATHS`; set immutable headers on the Response itself in the tile route (do not extend no-store). `--no-access-log` is already in `deploy/shinigami.service` ExecStart (tile URLs encode location): do not add logging in the route.

**Health extension** (health.py 17): add `"tiles": "ok|missing|unsupported"`.

**CSP:** main.py 25-29 stays unchanged (RESEARCH: no `blob:`); `test_health.py::test_security_headers` (lines 18-24) is the place to add assertions that CSP lacks `blob:` and third-party hosts.

---

### `server/shinigami/data/refresh_cameras.py` (offline batch job)

**Analog:** `scripts/make_icons.py` (standalone generator script, not imported by the app). No in-repo pyosmium analog; use RESEARCH "Camera Data Pipeline". Keep `osmium` import confined to this module (data dependency group). Output atomic (`tmp` then `os.replace`). No coordinates in logs (project rule seen in `assemble.py` line 25 comment and `main.py` line 22).

---

### `server/tests/test_cameras.py`, `test_refresh_cameras.py`, `test_tiles.py`

**Analog:** `server/tests/test_sun.py` (pure-function tests with `frozen_now`, lines 1-40) and `test_health.py` (route tests via `client`, `settings`, `create_app(settings)` + `httpx.ASGITransport`, lines 27-38).

```python
async def test_static_cache_headers(settings):
    app = create_app(settings)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        assert "immutable" in (await c.get("/assets/app-abc.js")).headers["cache-control"]
```
Fixtures (`conftest.py` 15-40): `settings` builds `Settings(static_dir=tmp_path/..., db_path=..., places_path=...)`; add `cameras_path`/`tiles_path` there. `app = create_app(settings, start_runtime=False)`. Fixtures for OSM go in `server/tests/fixtures/` (existing: `uvvalues.xml`).

---

### `deploy/*` new scripts/units

**Analog:** `deploy/shinigami.service` (sandbox block, `StateDirectory=shinigami`, `ReadWritePaths` needed for the data job since `ProtectSystem=strict`), `deploy/deploy.sh` (root-owned `/opt/shinigami`, `lock_down`), `deploy/verify.sh`.

verify.sh helpers to extend (lines 16-26): `pass/fail/skip`, `check <name> <cmd>`, `http_code <url>`. Add tile probe (`/tiles/15/x/y.mvt` 200 or 204), glyph `0-255.pbf` probe, no-external-host grep of `web/dist`, CSP has no `blob:`. Keep the "later endpoints SKIP while 404" convention (header comment line 6).

---

### `web/src/ui/shell.ts` (modify: map canvas + overlay HUD + drawer)

**Analog:** itself (lines 1-31). Slot-interface pattern:
```ts
export interface ShellSlots { titleBar; bannerSlot; locationSlot; listHost; footer }
function el(tag: string, cls: string, text?: string): HTMLElement { ... }
export function mountShell(root: HTMLElement): ShellSlots { ... root.replaceChildren(...); return {...}; }
```
Extend `ShellSlots` with `mapHost`, `hudCorners`, `drawer`, `hero` hosts; keep `listHost` for `NextList` (it moves inside the drawer unchanged, D-05). Use `el()` + class names only, no `style=`.

---

### `web/src/ui/drawer.ts` (component, gesture)

**Analog:** `web/src/ui/location-sheet.ts` (class with `backdrop`/`sheet` elements created with `document.createElement`, open/close, handlers interface `SheetHandlers`, exported copy constants, imports its own css `import "../styles/location.css"`).
Pattern to copy: `import "../styles/<x>.css"` at the top, exported pure constants, handlers passed via constructor. Make snap math a pure exported function (RESEARCH: "Drawer snap math, flick threshold" unit test), DOM class thin. Pointer events with CSS custom property via `el.style.setProperty` (CSP-safe).

---

### `web/src/ui/readouts.ts` (HUD corner readouts + camera count)

**Analog:** `web/src/ui/offgrid-banner.ts` (class bound to a slot; `refresh()` called each ticker tick; `role="status"`, `aria-live`) and `LocationStrip` (`strip.set(StripText)` in app.ts 98).

**Ticker-driven pattern** (app.ts 126-130):
```ts
startTicker((now) => {
  list.update(selectVisible(profile, now), now);
  banner.refresh();
  renderFooter(now);
});
```
Add `readouts.update(profile, now)` here. Countdown text from `format.ts` `fmtCountdown`; rows for sun/UV come from `selectVisible` RowVM (`model.ts` 27-67) so the maths stays shared (D-09). Camera count copy per D-16: `N mapped cameras · 150 m · not exhaustive`; never imply "none".

---

### `web/src/ui/hero.ts` + `hero.css`

**Analog:** `web/src/ui/offgrid-banner.ts` for timer/fade handling:
```ts
private fade: ReturnType<typeof setTimeout> | undefined;
...
if (this.fade !== undefined) clearTimeout(this.fade);
this.root.classList.add("clearing");
this.fade = setTimeout(() => { this.root.hidden = true; this.root.classList.remove("clearing"); }, FADE_MS);
```
and `next-list.ts` 21-26 for `reducedMotion()` helper:
```ts
function reducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
```
Copy both. Hero test style: `vi.useFakeTimers()` as in `next-list.test.ts` 16-26. Title bar markup: reuse `title-bar` / `close-box` from `shell.ts` 17-21. Tokens: `--c-red`, `--c-bg`, `--f-title` (tokens.css). Hard 1500 ms cap; no new inline styles.

---

### `web/src/app.ts` (modify)

**Analog:** itself. Key insertion points:
- Cached-first read, lines 112-119: wrap `Promise.all([loadProfile(), loadLastSync()])` and `await loc.start()` (line 123) in a ~300 ms race (WR-06). IDB wrappers in `store.ts` already swallow errors but do not time out.
- Params key guard, lines 139-146 (`paramKey(params) !== key` return): extend WR-04 by tagging `profile` with its params key and ignoring `onLayer` frames (line 186-194) from another key.
- Map start: after hero first paint, `void import("./map/map")` then feed `profile` + `loc.state()`; long-press pin must call the existing `loc.useSearch(r)` (location.ts line 31, wired through `sheet`'s `onSearch` at app.ts 80) with `label: "Dropped pin"`.
- `list.setState(...)` usage (154, 158) is the drawer empty/loading state source for WR-07.
- `BootDeps` (19-24) is the DI seam for tests; add `mapLoader?` there so tests avoid WebGL (`vi.mock("maplibre-gl")`).

---

### `web/src/model.ts` (modify `selectVisible`)

**Analog:** itself, lines 31-41. The loop currently keeps any item with `target_ts === null`:
```ts
for (const item of layer.items) {
  if (item.target_ts !== null && item.target_ts * 1000 <= nowMs) continue;
```
Add `if (item.geom) continue;` (and filter camera summary items) at the top of the inner loop; extend `model.test.ts`. Tag/map code reads positioned items from `profile.layers` separately.

---

### `web/src/map/*` (map.ts, style.ts, tags.ts, card.ts, longpress.ts, ...)

**No in-repo map analog.** Use RESEARCH Patterns 3-8 and the "Tag budget" code example. Repo conventions to mirror:
- Pure logic exported separately from DOM class (see `format.ts`/`freshness.ts`/`clock.ts` each with a sibling `*.test.ts`).
- Class + `document.createElement` + `textContent` (`next-list.ts` 36-52).
- Colours from tokens: `style.ts` takes a tokens object read from `getComputedStyle(document.documentElement).getPropertyValue("--c-red")` etc. (tokens.css 2-10); never hard-code hex duplicates in TS.
- Worker under Vite: `setWorkerUrl(workerUrl)` per RESEARCH Pattern 4.
- Haversine on client: reuse exported `haversineM` from `web/src/location.ts` line 41 (already imported in app.ts line 6).

---

### `web/src/sw.ts` (modify)

**Analog:** itself (full file shown, 16 lines). Add after line 11, same Workbox style:
```ts
import { NavigationRoute, registerRoute } from "workbox-routing";
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [new RegExp("^/api/")] }),
);
```
Extend `denylist` to `[/^\/api\//, /^\/tiles\//, /^\/glyphs\//]` and add `registerRoute(({url}) => url.pathname.startsWith("/tiles/"), new CacheFirst({cacheName:"tiles-v1", plugins:[CacheableResponsePlugin({statuses:[200]}), ExpirationPlugin({...})]}))`. Move route config to an importable module so a unit test can assert it (RESEARCH validation row "sw").

### `web/vite.config.ts` (modify)
**Analog:** itself line 14: `globPatterns: ["**/*.{js,css,html,woff2,png,webmanifest}"]` -> add `pbf,svg`. Dev proxy line 18: add `"/tiles"` (and `/glyphs` is static from `public/`) next to `"/api"`.

---

### Web tests (`hero`, `drawer`, `tags`, `card`, `longpress`, `style`, `sw`, `model`)

**Analog:** `web/src/ui/next-list.test.ts` lines 1-30:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = ""; host = document.createElement("div"); document.body.append(host); ... });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
```
Fixture builder style (`vm(p: Partial<RowVM> & {id})`) is the template for tag/candidate builders. happy-dom has no WebGL: mock `maplibre-gl`.

## Shared Patterns

### No I/O in the profile path
**Source:** `server/shinigami/providers/base.py` (docstring lines 1-6), `assemble.py` lines 19-35.
**Apply to:** camera provider, tiles wrapper. Reads happen at startup or mtime reload; `query()` stays sync.

### Provider failure isolation
**Source:** `server/shinigami/assemble.py` lines 22-35 (log provider id + exception type only, never coordinates).
**Apply to:** every new provider/route log line.

### Privacy: preset coordinates never reach the client
**Source:** `server/shinigami/api/profile.py` lines 28-35 (`place=` returns `lat=None, lon=None`) and `providers/sun.py` lines 71-73 (cell snap).
**Apply to:** cameras provider (no layer/distances for `place=`), map centring for pins (0.1 degree cell centre), tests in `test_profile_readonly.py`.

### CSP-safe DOM
**Source:** `server/shinigami/main.py` lines 25-29 (`style-src 'self'`) plus every existing UI class (`textContent`, classList, `setAttribute("role"...)`).
**Apply to:** all new web UI: no `innerHTML`, no `setAttribute("style")`, no `style=`; use classes and `style.setProperty`.

### Ticker-driven countdown refresh
**Source:** `web/src/app.ts` lines 126-130, `ticker.ts`, `clock.ts` (`nowMs()`), `format.ts`.
**Apply to:** readouts, drawer collapsed summary.

### Offline / connectivity
**Source:** `web/src/offgrid.ts` (`createConnectivity`), `web/src/ui/offgrid-banner.ts`; `app.ts` catch block lines 156-159.
**Apply to:** map offline grid state (CSS grid behind transparent canvas; banner unchanged).

### Tokens
**Source:** `web/src/styles/tokens.css` (`--c-red #E0202A`, `--c-blue #5E8AA8`, `--c-frame`, `--c-surface`, `--f-title`, `--f-mono`, spacing `--s-*`).
**Apply to:** hero.css, drawer.css, tags/cards CSS, map `style.ts` colours. Red only for <=30 m cameras, selected building, urgent countdowns.

### Settings/env path convention
**Source:** `server/shinigami/settings.py` lines 16-17 (`REPO_ROOT / "var" / ...`, env prefix `SHINIGAMI_`).
**Apply to:** `cameras_path`, `tiles_path` (prod under `/var/lib/shinigami`, the only service-writable dir per `deploy/shinigami.service`).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `web/src/map/map.ts`, `style.ts`, `buildings.ts`, `accuracy-ring.ts` | controller/utility | WebGL map | No map code yet; follow RESEARCH Patterns 3, 4, 6, 8 |
| `web/src/map/tags.ts`, `card.ts`, `leader.ts` | component | projection/collision | New; follow RESEARCH Pattern 5 + tag budget sketch |
| `web/src/map/longpress.ts` | utility | gesture state machine | No gesture code; RESEARCH Pattern 7 |
| `web/src/ui/drawer.ts` gesture handling | component | pointer events | Only `location-sheet.ts` (modal, no drag); use for structure only |
| `server/shinigami/data/refresh_cameras.py` | job | OSM transform | No OSM/pyosmium code; RESEARCH pipeline section |
| `server/shinigami/tiles.py` | service | PMTiles mmap | No binary file reader; RESEARCH Pattern 1 |
| `web/public/icons.svg`, `glyphs/**`, hero SVG | asset | - | No SVG sprite or glyph assets yet (only PNG icons made by `scripts/make_icons.py`) |

## Metadata

**Analog search scope:** `server/shinigami/**`, `server/tests/**`, `web/src/**`, `deploy/*`, `web/vite.config.ts`, `scripts/`
**Files scanned:** ~75 tracked (read ~20 in full or part)
**Pattern extraction date:** 2026-11-07
**Notes for planner:** `selectVisible` leak (D-14) and `assemble.py` pin-source skip are the two existing-code changes that carry correctness/privacy risk; fix WR-04/06/07/08 in `app.ts` before cameras ship (RESEARCH Pitfall 10).
