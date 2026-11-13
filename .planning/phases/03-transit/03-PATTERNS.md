# Phase 3: Transit - Pattern Map

**Mapped:** 2026-11-13
**Files analyzed:** 27 new/modified (16 server/deploy, 11 web)
**Analogs found:** 25 / 27 (2 partial, 3 have no direct analog and are called out below)

All line numbers refer to the repo at commit e0cc980. No coordinates, keys or places data are quoted.

## File Classification

### Server and deploy

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `server/shinigami/transit/store.py` (TransitStore) | store | file-I/O + in-memory spatial lookup | `server/shinigami/cameras_store.py` | exact |
| `server/shinigami/data/refresh_transit.py` | utility (offline job) | batch / file-I/O | `server/shinigami/data/refresh_cameras.py` | exact |
| `deploy/refresh-transit.sh` + service/timer (or extend `refresh-data.sh`) | config | batch | `deploy/refresh-data.sh`, `shinigami-data.service/.timer` | exact |
| `server/shinigami/providers/transit.py` (4 providers: `transit_stops`, `transit_departures`, `transit_vehicles`, `transit_disruptions`) | provider | computed: request-response; polled: event-driven | `providers/cameras.py` (computed, positioned items) and `providers/arpansa.py` (polled, cache read) | role-match (hybrid) |
| `server/shinigami/transit/ptv_client.py` (signing + PtvClient) | service | request-response (upstream) | `providers/arpansa.py` `refresh()` (shared `ctx.http`) | partial (no signed API exists yet) |
| `server/shinigami/transit/model.py`, `sources.py`, `severity.py`, `watch.py` | model / utility | transform | `providers/arpansa.py` (`parse_arpansa`, `band` pure fns); `schema.py` | partial |
| `server/shinigami/runtime.py` (modify `_publish_layer`) | runtime | event-driven (pub-sub) | itself, lines 80-92 | modify |
| `server/shinigami/api/stream.py` (handle `touch` events) | controller | streaming (SSE) | itself, lines 25-57 | modify |
| `server/shinigami/assemble.py` (extract gate helper) | service | request-response | itself, lines 173-181 | modify |
| `server/shinigami/settings.py` (`ptv_devid`, `ptv_key`, `transit_stops_path`) | config | n/a | itself, lines 9-26 | modify |
| `server/shinigami/main.py` (register providers, store, reload task) | config | n/a | itself, lines 120-170 | modify |
| `server/shinigami/api/health.py` (add `transit` block) | controller | request-response | itself, lines 14-29 (cameras block) | exact |
| `server/tests/test_transit_*.py` + `server/tests/fixtures/ptv/*` | test | n/a | `tests/test_cameras.py`, `tests/test_arpansa.py`, `tests/test_stream.py`, `tests/test_runtime.py` | exact |
| `deploy/verify.sh` (transit checks) | config | request-response | itself, lines 104-160 (cameras checks) | exact |
| manual PTV smoke script (David runs on the CT) | utility | request-response | none in repo | no analog |

### Web

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `web/src/map/tags.ts` (generalise: prio, per-kind icon/type/card, moving markers) | component | event-driven | itself (`TagLayer`) | modify |
| `web/src/map/transit-card.ts` (stop card, vehicle card) | component | transform | `web/src/map/camera-card.ts` | exact |
| `web/src/map/edge-pointers.ts` | component | event-driven (map move) | `tags.ts` (project + debounce) and `leader.ts` | partial |
| `web/src/map/vehicle-marker.ts` | component | event-driven | `tags.ts` `makeEl`, `marker-figure.ts` | partial |
| `web/src/map/map.ts` (watch transit layers, edge pointers wiring) | component | event-driven | itself, lines 25, 345, 453-460 | modify |
| `web/src/model.ts` (transit branch in `selectVisible`) | utility | transform | itself, lines 27-69 | modify |
| `web/src/ui/next-list.ts` (leave-in text, LIVE/SCHED, missed class) | component | event-driven | itself, lines 70-228 | modify |
| `web/src/ui/readouts.ts` (disruption readout, exclude transit rows from `cornerRows`) | component | event-driven | itself, lines 242-334 (camera readout) | exact |
| `web/src/app.ts` (generalise camera-layer backstop to "exact layers") | controller | event-driven | itself, lines 99-105, 163-166, 272, 320-321, 352, 374 | modify |
| `web/public/icons.svg` (+6 symbols) | config (asset) | n/a | itself (`cctv`, `speed-cam` symbols) | exact |
| web tests (`*.test.ts` next to each file) | test | n/a | `camera-card.test.ts`, `next-list.test.ts`, `tags.test.ts` | exact |

## Pattern Assignments

### `server/shinigami/transit/store.py` (store, file-I/O + bucket index)

**Analog:** `server/shinigami/cameras_store.py` (copy structure whole).

**Load / swap / reload** (lines 13-57):
```python
class CameraStore:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self.loaded = False
        self.count = 0
        self.built_at: float | None = None
        self._buckets: dict[int, list[dict]] = {}
        self._mtime: float | None = None

    def _read(self):
        mtime = self.path.stat().st_mtime
        data = json.loads(self.path.read_text(encoding="utf-8"))
        if data.get("version") != 1:
            raise ValueError("unsupported version")
        ...
            buckets.setdefault(math.floor(lat * 100), []).append(rec)

    def load(self) -> bool:
        try:
            built, buckets, mtime = self._read()
        except Exception as exc:  # noqa: BLE001 - missing/corrupt file leaves layers pending
            ...log.info("cameras not loaded: %s", type(exc).__name__)   # class only
            return False
        self.built_at, self._buckets, self._mtime = built, buckets, mtime   # atomic swap
```
**Bucket scan** (lines 59-74): `span = math.ceil(radius_m / 1100) + 1`, iterate `range(centre - span, centre + span + 1)`, `haversine_m` from `shinigami.geo`, sort by distance. For transit use `min` over a stop's poles, keyed per mode, with limits train 1500 / tram 800 / bus 500 (D-03). Index key must still be `floor(lat*100)`; bucket each stop by every pole or by its centroid with an extra-span margin.

**Rules to carry:** logs carry only `type(exc).__name__` (never paths with data, never coordinates); `reload_if_changed()` compares mtime; expose `loaded`, `count`, `built_at` for `/api/health`. Add a version gate (RESEARCH Pitfall 10) and refuse a store whose count dropped below 80% (job side).

---

### `server/shinigami/data/refresh_transit.py` (offline batch job)

**Analog:** `server/shinigami/data/refresh_cameras.py`.

Copy these conventions (module docstring states privacy rules; `from __future__ import annotations`; stdlib only; `argparse` with `--input/--output`; prints counts only):
- Docstring/privacy header (lines 1-9): "output prints counts only, never coordinates".
- Per-record try/except so one bad row cannot stop the weekly run (lines 144-153): `except Exception: skipped[0] += 1; return`, then `print(f"skipped {skipped[0]} malformed nodes")` (line 175).
- Output shape `{"version": 1, "built_at": time.time(), "source": SOURCE, "<records>": [...]}` (line 183).
- Shrink guard (lines 186-193): `MIN_KEEP_RATIO = 0.5` plus `_existing_count(path)` reading the old file and `--force` flag. Use 0.8 for transit per RESEARCH Pitfall 10.
- Write atomically (tmp + rename); `refresh_cameras.main` (from line 196) is the model for arg handling; read it before copying the tail (not excerpted here).

New logic with no analog: streaming `csv.reader` over `stops.txt` / `stop_times.txt` / `trips.txt` / `routes.txt` inside the inner `google_transit.zip` for folders 2/3/4; PTV id from `stop_url` `/stop/<N>/`; filter names containing "Replacement"; direction key `"<route_short_name>:<direction_id>"`. Use RESEARCH Pattern 1 as the spec.

---

### `deploy/refresh-transit.sh` + unit/timer

**Analog:** `deploy/refresh-data.sh` (lines 1-21), `deploy/shinigami-data.service`, `deploy/shinigami-data.timer`.

```bash
set -euo pipefail
if [ "$(id -u)" -eq 0 ]; then echo "FATAL: refuse to run as root" >&2; exit 1; fi
DATA=/var/lib/shinigami
mkdir -p "$DATA/tmp" "$DATA/data"
trap 'rm -f "$PBF"' EXIT
curl -fL --max-filesize 1073741824 --retry 3 -A "ShinigamiEyes-data/1 (private)" -o "$PBF" <url>
/opt/shinigami/.venv/bin/python -m shinigami.data.refresh_cameras --input "$PBF" --output "$DATA/data/cameras.json"
```
Unit hardening to copy verbatim: `User=shinigami`, `MemoryMax=900M`, `ProtectSystem=strict`, `StateDirectory=shinigami`, `NoNewPrivileges`, `PrivateTmp`, etc. Timer: `OnCalendar=Sun ...`, `RandomizedDelaySec=1h`, `Persistent=true` (stagger from the cameras timer). The GTFS zip is 310 MB so raise nothing past the 1 GiB `--max-filesize`; add `-z`/ETag skip and delete extracted inner zips in the trap. Check `deploy/deploy.sh` for where the data units are installed and add the new pair there.

---

### `server/shinigami/providers/transit.py` (four providers)

**Analog A (computed, positioned items, exact-only gate):** `server/shinigami/providers/cameras.py`.

**Imports + meta pattern** (lines 1-13, 87-98):
```python
from shinigami.providers.base import Provider, ProviderContext, ProviderMeta
from shinigami.schema import Item, Layer
...
meta = ProviderMeta(id="cameras_cctv", tier="computed", ttl_s=3600, stale_after_s=None,
                    attribution=ATTRIBUTION, exact_location_only=True)
```
**Pending when store not loaded** (lines 24-32):
```python
if not self.store.loaded:
    return Layer(id=self.layer_id, status="pending", rev=int(now), as_of=None,
                 attribution=ATTRIBUTION, items=[])
```
**Positioned item with distance** (lines 45-60): `Item(id=..., layer=..., group=..., name=..., verb="", target_ts=None, kind="infrastructure", severity=0, detail={..., "distance_m": round(dist)}, geom={"type": "Point", "coordinates": [lon, lat]}, fetched_at=now, stale_after_s=None, computed=True)`. Note GeoJSON order is `[lon, lat]`.
**Summary item** (lines 62-76): `detail={"summary": True, ...}`, `geom=None`. For `transit_stops` use the summary to carry ptv state (`ok`/`no_key`/`error`) and the "none nearby" modes (D-03). The web already skips `detail.summary` items in `selectVisible` and `TagLayer.update`.
**Home gate comment to keep** (lines 39-43): exact providers never reach Home because of `exact_location_only` + `places.py`.

**Analog B (polled, cache-read `query()`, `refresh()` does network):** `server/shinigami/providers/arpansa.py`.

**Refresh writes write-through cache** (lines 51-57):
```python
async def refresh(self, ctx):
    r = await ctx.http.get(URL, timeout=10)
    r.raise_for_status()
    ...
    ctx.store.put_layer("uv_now", "global", {...}, utc_ts)
```
**Query reads cache, pending when empty, stale by age** (lines 59-94): `row = ctx.store.get_layer("uv_now", "global") if ctx.store else None`; `status="stale" if now - ts > STALE_AFTER_S else "fresh"`; `rev=int(ts)`; `as_of=ts`. For transit use `cell="dep:{stop_id}"` per RESEARCH Pattern 3 (`Store.put_layer(provider_id, cell_id, payload, fetched_at)` / `get_layer` in `store.py` lines 46-75).

**Differences the planner must apply (no analog):**
- Departure items must have `geom=None` (else `selectVisible` hides them), `group="{stop}:{direction_id}"`, `target_ts` = estimated else scheduled, `detail{live, scheduled_ts, delay_s, ..., walk_s}`.
- Vehicle items: `kind="transit_vehicle"` (already in `schema.ItemKind` line 4) with Point geom; never include vehicle ids/descriptors.
- Polled providers set `exact_location_only=True` too, and `interval_s=30` (`ProviderMeta.interval_s`, base.py line 24). `query()` stays sync and only records the watch set; it must not call the network.
- Missing key: `refresh()` returns early, layer `pending` plus summary `state="no_key"`; app must boot with both settings absent.

---

### `server/shinigami/transit/ptv_client.py` (signing + HTTP)

**Analog:** `providers/arpansa.py` `refresh()` for use of the shared `ctx.http` client with `timeout=10` and `raise_for_status()`. Signing code comes from RESEARCH "Code Examples" (stdlib `hmac`/`hashlib`; build the final URL once, pass no `params=`). Unit-test with the three FAKE-key vectors in RESEARCH.

**Logging rule (carry from `runtime.py` lines 1-4, 107 and `main.py` lines 111-112):** only provider id and `type(exc).__name__`. `main.py` already sets `logging.getLogger("httpx").setLevel(logging.WARNING)` because httpx INFO logs full URLs; PTV URLs contain devid and signature, so that line is load-bearing. `tests/test_nologging.py` is the pattern for a no-leak assertion: add a PTV equivalent.

---

### `server/shinigami/runtime.py` (modify `_publish_layer`)

**Current code (lines 80-92 and 99-101):**
```python
def _publish_layer(self, provider, cell_id, lat, lon) -> None:
    bus = self.ctx.bus
    if bus is None: return
    layer = provider.query(self.ctx, lat, lon, self.ctx.clock())
    bus.publish({"type": "layer", "provider": provider.meta.id, "cell": cell_id, "layer": layer.model_dump(mode="json")})
...
await p.refresh(self.ctx)
self._publish_layer(p, "global", 0.0, 0.0)
```
**Change (RESEARCH Pitfall 1):** if `provider.meta.exact_location_only`, publish `{"type": "touch", "provider": provider.meta.id}` and skip `query(0,0)`. Keep backoff and logging untouched. Test pattern: `tests/test_runtime.py::test_polled_backoff_then_publish` (line 96), using a stub `Provider` and `EventBus.subscribe()` queue.

---

### `server/shinigami/api/stream.py` (touch handling)

**Current loop (lines 44-55):**
```python
while True:
    if await is_disconnected(): return
    try: ev = await asyncio.wait_for(queue.get(), timeout=POLL_S)
    except TimeoutError: continue
    if ev.get("type") != "layer": continue
    if ev.get("cell") not in ("global", cell_id): continue
    yield ServerSentEvent(event="layer", data=json.dumps(ev["layer"]))
```
**Change:** add a `touch` branch before the `!= "layer"` continue: find the provider by id in `providers`, apply the same gate as `assemble_profile` (`exact_location_only and pin and not exact_ok` -> skip; extract a small shared helper in `assemble.py`), call `provider.query(ctx, lat, lon, ctx.clock())` with the subscriber's server-held lat/lon, yield `ServerSentEvent(event="layer", data=layer.model_dump_json())`. Wrap in try/except logging class only, as `assemble.py` lines 184-194 does. Never log lat/lon (module docstring line 3). `exact_ok` comes from `camera_ok(request, location)` (stream.py line 77; `api/profile.py` lines 69-74).

Tests: extend `tests/test_stream.py::test_event_stream_order_filter_and_unsubscribe` style (publish onto `ctx.bus`, read frames via `gen.__anext__()`); add a Home-pin case asserting no `transit_*` frame and an empty watch set (Pitfall 2). The hard-coded layer set at test line ~38 (`{"sun","uv_now","uv_window","cameras_cctv","cameras_road"}`) will need the four transit ids added.

---

### `server/shinigami/assemble.py` (gate helper)

Existing gate (lines 173-181):
```python
if p.meta.exact_location_only and pin and not exact_ok:
    continue
qlat, qlon = (lat, lon) if (not pin or p.meta.exact_location_only) else (cell.lat, cell.lon)
```
No logic change is needed for Home (D-21 reuses it). Optionally factor the first condition into `def exact_allowed(provider, pin, exact_ok)` and import it in `stream.py`. The per-provider failure fallback (lines 184-194) is the pattern for the touch branch.

---

### `server/shinigami/settings.py` (keys and path)

**Existing:** `model_config = SettingsConfigDict(env_prefix="SHINIGAMI_", env_file=".env", extra="ignore")` (line 12) and `cameras_path: Path = REPO_ROOT / "var" / "cameras.json"` (line 19).
**Add:** `transit_stops_path: Path = REPO_ROOT / "var" / "transit_stops.json"`; `ptv_devid` / `ptv_key` as `SecretStr | None = Field(None, validation_alias=AliasChoices("PTV_DEVID", "SHINIGAMI_PTV_DEVID"))` because D-19 mandates un-prefixed names (prefix would otherwise force `SHINIGAMI_PTV_*`). `.env.example` already lists `# PTV_KEY=` (line 14); add `# PTV_DEVID=` beside it with no value. Tests build `Settings(...)` with explicit paths in `tests/conftest.py` lines 16-23; add `transit_stops_path=tmp_path / "transit_stops.json"` there. Never read or print `.env`.

---

### `server/shinigami/main.py` (wiring)

Pattern to copy (lines 124-132, 134-137, 159-166, 177):
```python
cameras = CameraStore(settings.cameras_path)
cameras.load()  # startup file read, never in the request path
providers = [SunProvider(), ..., CctvCameraProvider(cameras), RoadCameraProvider(cameras)]
async def _reload_cameras():
    while True:
        await asyncio.sleep(300)
        await asyncio.to_thread(cameras.reload_if_changed)
...
reload_task = asyncio.create_task(_reload_cameras()) if start_runtime else None
...
app.state.cameras = cameras
```
Add a `TransitStore`, one shared `TransitService`, the four providers, a second reload task (or generalise `_reload_cameras` to a list of stores), `app.state.transit`. Cancel in the `finally` block like `reload_task` (lines 163-166).

---

### `server/shinigami/api/health.py` (transit block)

Copy lines 18-28: compute `age_days` from `built_at`; return `"transit": {"stops": {"loaded", "count", "age_days"}, "ptv": "no_key"|"ok"|"error", "live_age_s": ...}`. No ids, coordinates, devid, signature (comment WR-S8, line 18).

---

### Server tests and fixtures

**Store/provider tests:** copy `tests/test_cameras.py` lines 1-40: `write(path, ...)` helper emitting `{"version": 1, "built_at": ..., ...}`, `dlat(m)` metre-offset helper, `ctx()` building `ProviderContext(settings=None, clock=lambda: NOW)`, `mk(tmp_path, ...)` asserting `store.load()`. Use a public CBD-style point and synthetic stop records; do not copy real coordinates.
**Contract tests with respx:** copy `tests/test_arpansa.py` (lines 1-60): `FIX = (Path(__file__).parent / "fixtures" / "...").read_bytes()`, `ctx_for(tmp_path, now)` with `Store(tmp_path / "a.db")` and `httpx.AsyncClient()`, `@respx.mock async def test_refresh_and_query(tmp_path)`. Put PTV fixtures under `server/tests/fixtures/ptv/`, each labelled schema-derived (D-24). Add an assertion that the URL received by respx equals the signed message plus `&signature=` (Pitfall 3).
**Fixtures:** `conftest.py` gives `settings`, `app` (`create_app(settings, start_runtime=False)`), `fake_runtime`, `client`, `frozen_now` (epoch 1793858400.0).
**No-leak:** model on `tests/test_nologging.py` and `test_stream.py::test_no_coordinates_logged` (line 148).

---

### `deploy/verify.sh`

Copy the cameras checks (lines 104-122): 404 -> `skip`, non-200 -> `fail`, grep body for layer ids (`'"transit_stops"'` etc.), health age check (`"transit" *: *\{[^}]*\}`, `loaded` true, age <= 14 days), and the Home check at lines 134-150 that fails if a camera-off place's profile body matches `cameras_|distance_m`; extend that regex to `transit_` so Home leaks fail the deploy.

---

### `web/src/map/transit-card.ts` (stop card and vehicle card builders)

**Analog:** `web/src/map/camera-card.ts` (exact structure). Imports `Item` from `../types` and `CardContent` from `./card`.

**Reusable helpers** (lines 1-30): export `fmtDistance`, `spokenDistance`, and private `text(detail, key)` (trims, caps at `MAX_TEXT=80`). Import `fmtDistance`/`spokenDistance` from `./camera-card` rather than duplicating; reuse the `text()` approach for destination, route and alert text.
**Builder shape** (lines 32-61): `export function cameraCardContent(item, distanceM): CardContent` returns `{title, primary, extra?, secondary: [string,string][], caveats: string[]}` (`CardContent` in `card.ts` lines 9-17; also supports `action`). Use `title: "TRAM STOP"`, `primary: "420 m · 6 min walk"`, one `secondary` pair per departure line (cap about 8, 2 per route-direction, D-07), `caveats` such as "Source: Licensed from Public Transport Victoria under CC BY 4.0" and "Estimated position" for `pos_src="est"`.
**Tests:** copy `camera-card.test.ts` lines 1-20 (the `item(group, detail)` factory) and its assertions style: exact `secondary` arrays, a `not.toMatch` privacy check (no vehicle ids).
**Note:** the card text is static today; the countdown in a card needs a ticker re-render (`web/src/ticker.ts` exists) per RESEARCH Pattern 6.3. No analog for a live-updating card.

---

### `web/src/map/tags.ts` (generalise TagLayer)

**Analog:** itself. Specific edit points:
- `TagIcon` union (line 29) and `iconFor(group)` (lines 122-124) are camera-hard-wired: add `"stop-train" | "stop-tram" | "stop-bus" | "veh-*"`, switch on `item.layer`/`item.kind` first.
- `TagCand` (lines 31-38): add `prio: 0 | 1 | 2` (stop, vehicle, camera; D-13).
- `rankTags` (lines 41-45): sort by `prio` first, then existing near-30 m then distance.
- `assignTags` (lines 47-84): the overlap demotion at line 65 must be skipped for `prio === 0` (stops always labelled); red set at lines 54-57 must stay camera-only (`near` class). Existing `BASE_FULL=8` / `MAX_FULL=20` budget is shared (no separate transit budget).
- `reconcile` (lines 222-289): the existing-entry branch only sets position at creation (line 259, `createMarker(el).setLngLat(l.lngLat)`). For vehicles add `if (changed) e.marker.setLngLat(l.lngLat)` in the `e.item = l.item` update area (lines 263-264) and store the new `lngLat`; honour reduced motion (jump). Fade stale vehicles with a CSS class toggle, never an inline `style` attribute (CSP `style-src 'self'`).
- `makeEl` (lines 193-220): uses `createElement` + `textContent` only, `use.setAttribute("href", `/icons.svg#${...}`)`. Keep; add a route-number badge span for vehicles.
- `select` (lines 310-323): replace the hard-coded `cameraCardContent(e.item, e.dist)` with a per-kind dispatch to `transit-card.ts`. Keep `onClose` handling so the shared `Card` is only closed by its owner (lines 300-307).
- `update(items)` (lines 172-181) skips `detail.summary` items and non-Point geoms; keep.
- Distances for pins use `detail.distance_m` via `"server"` origin (lines 234-236); transit stops for saved places follow the same rule (walk time also arrives in `detail.walk_s`).

Tests: `web/src/map/tags.test.ts` has a `TagCand` factory at line 5 (`{ id, x, y, dist, label, icon: "cctv", ...p }`) and item factories at lines 65 and 111; extend with `prio`.

---

### `web/src/map/edge-pointers.ts`

**No direct analog.** Closest: `tags.ts` for `map.project([lon, lat])` (line 240), debounced `moveend` recompute (lines 155-161), the `TagMapLike` interface (lines 95-99) as the testable map seam, and `labelSide()`/`LABEL_EDGE` (lines 17-27) for edge clamping maths. `leader.ts` (not excerpted) is the other geometry helper. Build elements with `createElement` + `textContent`; position/rotate with `el.style.setProperty(...)` (CSSOM, allowed under `style-src 'self'`; `ui/drawer.ts` already does this). Tap calls `map.easeTo` or `jumpTo` when `deps.reducedMotion`, mirroring `map.ts` lines 440-446 (`if (deps.reducedMotion) map.jumpTo(centre); else map.easeTo({ ...centre, duration: EASE_MS })`).

---

### `web/src/map/map.ts` (wiring)

Current trigger (lines 25, 345, 453-460):
```ts
const CAMERA_LAYERS = ["cameras_cctv", "cameras_road"] as const;
let lastCamLayers: unknown[] = [];
const camLayers = CAMERA_LAYERS.map((id) => p?.layers[id]);
const camsChanged = camLayers.some((l, i) => l !== lastCamLayers[i]);
lastCamLayers = camLayers;
if (camsChanged) { ...items...; tags.update(items); }
```
Rename to a `TAG_LAYERS` list including `transit_stops` and `transit_vehicles` (vehicles change often; reference comparison works because `applyLayer` copies references per the comment at lines 450-452). Also feed stops to the edge-pointer module on the same trigger. Note: the pin-framing block after line 460 frames cameras for pins; confirm transit stops for pins are included or excluded deliberately.

---

### `web/src/model.ts` (transit branch in `selectVisible`)

**Current** (lines 27-69): skips `item.geom`; groups by `${item.layer}|${item.group}` keeping min `target_ts`; `urgent` is `0 < ms < 900_000`; `soonestUrgent.redCountdown = true` (lines 64-65); `isFirst` on first timed row.
**Add** a branch for `item.layer === "transit_departures"`: group by `detail.group` (stop:direction); choose the first with `target_ts - walk_s*1000 >= now` (D-08); fall back to the soonest, marked missed; `countdownText = fmtCountdown(departure)`; add RowVM fields (`leaveInText`, `live`, `missed`); `redCountdown = leaveIn <= 0` (D-09); **exclude transit rows from the generic `urgent`/`soonestUrgent` rule** and set `kindTag` to `"tram · LIVE"` style via `kindTag()` (line 22). Extend RowVM (lines 5-18). Tests: `web/src/model.test.ts`.

---

### `web/src/ui/next-list.ts` (row additions)

**Analog:** itself. `create()` (lines 106-122) builds `row-line` l1 `[name, count]` and l2 `[kind, fresh]` via the `span(cls)` helper (lines 82-86). Add a `leave` span after `count` in l1; in `update()` mirror the pattern `if (r.count.textContent !== vm.countdownText) r.count.textContent = vm.countdownText;` (line 203) and `classList.toggle("missed", vm.missed)` beside `stale`/`urgent`/`red-countdown` (lines 207-209). Update the aria-label (line 211). Tests: `ui/next-list.test.ts` has a `vm()` factory (lines 7-13) that must gain the new RowVM fields.

---

### `web/src/ui/readouts.ts` (disruption readout, no hijack)

**Analog:** the camera readout in the same file.
- `cornerRows` (lines 236-240): filter out `item.layer === "transit_departures"` rows before ranking so the two corner slots keep sun/UV (Pitfall 7).
- Add `disruptionCountText(profile)` modelled on `cameraCountText` (lines 242-255): returns `{num, rest}`; pin without a `transit_*` layer returns `"Transit · not shown for saved places"`; `pending`/missing returns "not loaded yet"; count from the layer's non-summary items; hidden at 0.
- `updateCameras` (lines 314-334) is the DOM template: lazily create `root.className = "readout readout-..."`, `count-num`, `count-rest` spans, append to `this.right`, update `textContent` only on change, sync `aria-label`.
- New: a tap handler (readouts have no interactivity today). Open a list via `Card` or a small sheet like `ui/location-sheet.ts`.
Tests: `ui/readouts.test.ts`.

---

### `web/src/app.ts` (Home backstop for transit)

Camera-named helpers to generalise to "exact layers" (`cameras_*` and `transit_*`):
```ts
const isCameraLayer = (id: string): boolean => id.startsWith("cameras_");     // line 99
export function stripCameraLayers(p: Profile): Profile { ... }                // lines 102-106
```
Call sites: lines 163-166 (`camerasOff(key)` / `noCameraPlaces`), 272 (cached profile strip), 320-321 (`noCameraPlaces.add(place)` when no camera layer present for a pin), 352 (save to IndexedDB), 374 (`onLayer` drop, WR-W5). Change the predicate to `id.startsWith("cameras_") || id.startsWith("transit_")`; keep exported names or rename and update `app.test.ts`. Add a vitest that a `transit_stops` layer pushed for a camera-off pin is neither rendered nor stored (mirror the existing WR-W5 test in `app.test.ts`).

---

### `web/public/icons.svg` (sprites)

**Analog:** existing symbols lines 2-19. Pattern: `<symbol id="cctv" viewBox="0 0 24 24">` containing only `<path d="..."/>` (inherits stroke from the root `<svg>`: `stroke="currentColor" stroke-width="2" stroke-linecap="square" shape-rendering="crispEdges"`). Add `stop-train`, `stop-tram`, `stop-bus`, `veh-train`, `veh-tram`, `veh-bus` in the same 24x24 square-cap pixel style, original artwork. `scripts/make_icons.py` is for PWA icons, not this sheet.

---

## Shared Patterns

### Fail-closed Home / exact-location gate
**Source:** `server/shinigami/assemble.py` lines 173-181; `server/shinigami/api/profile.py` lines 69-74 (`camera_ok`); `server/shinigami/places.py` lines 29-30 and 66-82 (`Place.cameras`, `Place.home`, home-like detection forces cameras off).
**Apply to:** all four transit providers (`exact_location_only=True`), the stream `touch` branch, `deploy/verify.sh`, and the web backstop in `app.ts`. D-21: no separate transit flag.

### Privacy in logs
**Source:** `runtime.py` module docstring and line 107; `stream.py` docstring; `main.py` lines 111-112.
```python
log.warning("refresh failed provider=%s err=%s", p.meta.id, type(exc).__name__)
```
**Apply to:** `ptv_client.py`, `transit.py`, `stream.py`, `refresh_transit.py` (counts only). Never log URLs, stop ids tied to a request, devid, signature or `str(exc)`.

### Item/Layer contract
**Source:** `server/shinigami/schema.py` lines 251-296 (frozen `Item`, `Layer`, `ItemKind` includes `transit_vehicle`, no person kinds; `severity` 0-3). Mirrored by `web/src/types.ts` (lines 1-60 of the excerpt read). Layer status values: `fresh|stale|pending|error|out_of_coverage`.
**Apply to:** every new provider. Use `severity=3` only for D-17 service-stopping disruptions.

### Query is sync and network-free; refresh does the network
**Source:** `server/shinigami/providers/base.py` lines 1-6, 39-50.
**Apply to:** all providers. D-23 first-open nudge goes via a `ctx.runtime` hook, fire-and-forget (like `assemble.py` lines 196-205 `ctx.runtime.request_cell(...)` in try/except), never awaited in the request path. Tests use `FakeRuntime` from `tests/conftest.py`.

### Polled-loop backoff
**Source:** `runtime.py` lines 95-110 (30 s doubling to 1800 s, jitter 10%). Raise on 429/5xx from the PTV client so the backoff applies; add a small rate guard (about 60 calls/min, 4 in flight) inside the client.

### Web DOM safety
**Source:** `tags.ts` `makeEl` (lines 193-220), `next-list.ts` `create()`.
No `innerHTML`, `createElement` + `textContent` only, CSSOM `style.setProperty` not `style=` attributes, icons via `<use href="/icons.svg#id">`, aria-labels set via `setAttribute`.

### Countdown and stale behaviour
**Source:** `web/src/format.ts` (`fmtCountdown`), `web/src/freshness.ts` (`isStale`, `ageTag`), `model.ts` line 45, `next-list.ts` expiry (lines 180-184, 221-226). Reuse; the server sends absolute `target_ts` epoch seconds.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Manual PTV smoke script | utility | request-response | No manual live-probe script exists. Closest style: `deploy/verify.sh` pass/fail/skip helpers. Must print status and shapes only, never URLs, ids or key material (D-24). |
| `web/src/map/edge-pointers.ts` | component | event-driven | No screen-edge indicator exists; borrow geometry helpers noted above. |
| Moving vehicle markers (animation/lerp) | component | event-driven | `TagLayer` never moves markers after creation; new `setLngLat` on update, optional rAF lerp with `prefers-reduced-motion` fallback (`map.ts` reducedMotion dep). |
| Live-ticking card content | component | event-driven | `Card` content is static text today; needs re-render on a 1 s ticker (see `web/src/ticker.ts`). |
| PTV signing / tolerant pydantic parse | service | request-response | No signed upstream or pydantic-parsed upstream exists; use RESEARCH Code Examples. |

## Metadata

**Analog search scope:** `server/shinigami/**`, `server/tests/**`, `deploy/**`, `web/src/**`, `web/public/icons.svg`
**Files read:** `providers/base.py`, `providers/cameras.py`, `providers/arpansa.py`, `cameras_store.py`, `runtime.py`, `assemble.py`, `api/stream.py`, `api/health.py`, `main.py`, `settings.py`, `schema.py`, `data/refresh_cameras.py` (lines 1-200), `store.py` (signatures), `places.py` (excerpts), `tests/conftest.py`, `tests/test_cameras.py` (head), `tests/test_arpansa.py` (head), `tests/test_stream.py` (head), `deploy/refresh-data.sh`, `shinigami-data.service/.timer`, `deploy/verify.sh` (grep), `web/src/map/tags.ts`, `camera-card.ts`, `card.ts` (head), `map.ts` (excerpts), `model.ts`, `ui/next-list.ts`, `ui/readouts.ts`, `types.ts`, `app.ts` (excerpts), `icons.svg` (head)
**Not read (deliberately):** `.env`, `places.toml`, real coordinates in tests/config
**Pattern extraction date:** 2026-11-13
