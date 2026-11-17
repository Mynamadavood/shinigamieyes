---
phase: 03-transit
reviewed: 2026-11-17
depth: standard
diff_base: d1afb34
files_reviewed: 78
files_reviewed_list:
  - .env.example
  - deploy/deploy.sh
  - deploy/refresh-transit.sh
  - deploy/shinigami-transit.service
  - deploy/shinigami-transit.timer
  - deploy/shinigami.service
  - deploy/verify.sh
  - scripts/ptv_smoke.py
  - server/shinigami/api/health.py
  - server/shinigami/api/stream.py
  - server/shinigami/assemble.py
  - server/shinigami/data/refresh_transit.py
  - server/shinigami/main.py
  - server/shinigami/providers/transit.py
  - server/shinigami/runtime.py
  - server/shinigami/settings.py
  - server/shinigami/transit/__init__.py
  - server/shinigami/transit/model.py
  - server/shinigami/transit/ptv_client.py
  - server/shinigami/transit/service.py
  - server/shinigami/transit/severity.py
  - server/shinigami/transit/smoke.py
  - server/shinigami/transit/sources.py
  - server/shinigami/transit/store.py
  - server/shinigami/transit/vehicles.py
  - server/shinigami/transit/watch.py
  - server/tests/conftest.py
  - server/tests/fixtures/ptv/README.md
  - server/tests/fixtures/ptv/departures_bus.json
  - server/tests/fixtures/ptv/departures_train.json
  - server/tests/fixtures/ptv/departures_tram.json
  - server/tests/fixtures/ptv/disruptions.json
  - server/tests/fixtures/ptv/pattern_tram.json
  - server/tests/fixtures/ptv/stops_location.json
  - server/tests/gtfs_fixture.py
  - server/tests/test_health.py
  - server/tests/test_nologging.py
  - server/tests/test_profile_readonly.py
  - server/tests/test_ptv_client.py
  - server/tests/test_ptv_signing.py
  - server/tests/test_ptv_smoke.py
  - server/tests/test_refresh_transit.py
  - server/tests/test_runtime.py
  - server/tests/test_stream.py
  - server/tests/test_transit_disruptions.py
  - server/tests/test_transit_poll.py
  - server/tests/test_transit_profile.py
  - server/tests/test_transit_store.py
  - server/tests/test_transit_vehicles.py
  - web/public/icons.svg
  - web/src/app.test.ts
  - web/src/app.ts
  - web/src/map/card.test.ts
  - web/src/map/card.ts
  - web/src/map/edge-pointers.test.ts
  - web/src/map/edge-pointers.ts
  - web/src/map/map.test.ts
  - web/src/map/map.ts
  - web/src/map/tags.test.ts
  - web/src/map/tags.ts
  - web/src/map/transit-card.test.ts
  - web/src/map/transit-card.ts
  - web/src/map/types.ts
  - web/src/model.test.ts
  - web/src/model.ts
  - web/src/styles/app.css
  - web/src/styles/hud.css
  - web/src/styles/tags.css
  - web/src/styles/tokens.css
  - web/src/transit.test.ts
  - web/src/transit.ts
  - web/src/ui/disruption-sheet.test.ts
  - web/src/ui/disruption-sheet.ts
  - web/src/ui/next-list.test.ts
  - web/src/ui/next-list.ts
  - web/src/ui/readouts.test.ts
  - web/src/ui/readouts.ts
  - web/src/ui/shell.ts
findings:
  critical: 2
  warning: 21
  info: 15
  total: 38
status: issues_found
---

# Phase 3: Code Review Report

Merged from two parallel reviews: server and deploy (IDs ending `-S`, 1 critical / 10 warning / 8 info) and web (IDs ending `-W`, 1 critical / 11 warning / 7 info).

Both reviews confirm the privacy gate (no transit for Home or camera-off places), no PTV secret leaks, and no upstream call in the `/api/profile` path. D-08 (30 s grace) and D-09 (single red row) work as built and David accepted both.

# Part 1: Server and deploy

# Phase 3: Code Review Report (server + deploy)

**Reviewed:** 2026-11-17T09:43:00Z
**Depth:** standard
**Files Reviewed:** 49
**Status:** issues_found

## Summary

I reviewed the Phase 3 transit server, PTV client, runtime nudge, SSE touch path, refresh job and deploy units against D-01..D-24 and RESEARCH Security/Pitfalls.

**Privacy gate.** The Home / `cameras = false` gate holds on every path I traced:
- `assemble_profile` and the SSE `touch` handler share `exact_allowed`.
- The watch set and nudges are only reached from a provider `query`, and that never runs for a gated pin.
- `places.py` forces Home to cameras off.

**Secrets.** Secret handling is sound:
- `PtvError` carries a kind only, raised `from None`.
- The httpx logger is pinned to WARNING.
- Health exposes only state strings.
- Fixtures are synthetic.
- The smoke script prints counts only.

**PLAT-04.** It holds: `/api/profile` does only cache reads and a thread-safe `call_soon_threadsafe` nudge.

**Main defects:**
- **Unbounded growth.** The per-run pattern cache grows without limit, both in memory and in SQLite.
- **Runtime single-flight.** The single-flight guard is not enforced by the poll loop. A nudge can be lost permanently.
- **Rate budget.** The nudge plus backoff design can push the self-imposed 60/min budget over and then back off departures for up to 30 minutes.
- **Smaller issues.** Correctness and robustness gaps in severity classification, vehicle position aging, response-size limiting and the systemd job timeout.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-S1: Pattern cache (`pat:{run_key}`) grows without bound in RAM and SQLite

**File:** `server/shinigami/providers/transit.py:578-580` (write), `server/shinigami/store.py:66-75` (never evicted)
**Issue:** Every vehicles refresh writes `ctx.store.put_layer("transit", f"pat:{key}", ...)` with a new key per run. PTV run refs are distinct per trip and service day, so the key space never repeats.

`Store.put_layer` keeps every row forever in two places:
- the in-memory `self._layers` dict;
- the `layer_cache` SQLite table.

Nothing prunes either one. That differs from `geocode_cache`, which has TTL and row caps.

**Scale:** up to 4 patterns per 30 s while the watch set is active, which is about 480/hour of use. Each payload is a full stopping pattern (tens of stops x 4 fields, roughly 10-25 KB as Python dicts). A few hours of daily use therefore adds tens of MB per week to the uvicorn process, which is never restarted except on deploy, and to the SQLite file. This breaches the "no unbounded growth" requirement on the RAM-constrained CT.

`dep:{stop_id}` rows also never expire, but they are bounded by the stop count. Departures for every stop ever visited stay resident.

**Fix:** Prune pattern rows by age. Options: add a `delete_layers_older_than(provider_id, prefix, cutoff)` method to `Store`, called from `TransitVehiclesProvider.refresh`, or keep patterns in a bounded in-process LRU instead of the persistent store:
```python
# store.py
def prune_layers(self, provider_id: str, prefix: str, cutoff: float) -> None:
    with self._lock:
        db = self._db()
        db.execute("DELETE FROM layer_cache WHERE provider_id=? AND cell LIKE ? AND fetched_at < ?",
                   (provider_id, prefix + "%", cutoff))
        db.commit()
        for k in [k for k, (_, f) in self._layers.items()
                  if k[0] == provider_id and k[1].startswith(prefix) and f < cutoff]:
            del self._layers[k]

# TransitVehiclesProvider.refresh, after the loop
ctx.store.prune_layers("transit", "pat:", now - 2 * ETA_HORIZON_S)
```
Add a test that runs N refresh cycles with distinct run refs and asserts the row count stays bounded.

## Warnings

### WR-S1: Runtime single-flight is not enforced by the poll loop; concurrent refreshes and a cleared flag

**File:** `server/shinigami/runtime.py:107-112`, `145-168`
**Issue:** `_poll_loop` does `self._refreshing.add(id)` and later `discard(id)` without first checking whether a nudge is already running. This causes three problems:
1. If a nudge is in flight when the poll timer fires, both run `p.refresh` concurrently. For departures that means two sequential sweeps over all watched stops, which doubles the PTV calls.
2. Whichever finishes first calls `discard`, which clears the other's flag while it is still running. A third refresh (another nudge after the 10 s gap) can then start.
3. Both sweeps capture `now` before their awaits, so an earlier-started sweep that finishes later overwrites fresher `dep:*` rows with an older `fetched_at`.

**Fix:** Use one guard for both paths and skip the poll tick, or await the in-flight task, if one is running. For example, keep `self._running: dict[str, asyncio.Task]`. In `_poll_loop`, if `id in self._running`, `await` that task instead of starting a new one. Otherwise create the task, register it, and remove it in `finally` only if it is still the registered task.

### WR-S2: D-23 first-open nudge is silently lost while a poll is running, and never retried

**File:** `server/shinigami/providers/transit.py:189-195`, `server/shinigami/runtime.py:145-153`
**Issue:** `query` nudges only for stops that `watch.touch` reports as *new* and that have no cache. `_start_nudge` drops the request in two cases:
- the provider is in `_refreshing` (a poll sweep is running, up to about 6 x PTV latency per 30 s);
- another nudge happened within 10 s (for example, at a different spot).

In both cases the stop is already in the watch set, so the next query does not see it as new and never nudges again. The poll sweep that was running took its `watch.active()` snapshot before the touch. So the first departures arrive only on the following poll (up to about 30 s later, or much longer under WR-S3 backoff), which is exactly what D-23 forbids.

A related gap: a revisited stop whose watch entry has expired but whose cache is hours old does not nudge either (`cached[i] is None` is false), so it shows a stale list until the next poll.

**Fix:**
- Make the nudge pending rather than dropped: set `self._pending.add(id)` when it is skipped, and run one more refresh when the current one finishes.
- Treat "new and cache older than STALE_AFTER_S" as nudge-worthy, not only "new and uncached".

### WR-S3: Nudges refetch every watched stop and can trip the 60/min rate guard, which then backs departures off for up to 30 min

**File:** `server/shinigami/providers/transit.py:270-305`, `server/shinigami/runtime.py:118-121`, `server/shinigami/transit/ptv_client.py:72-78`
**Issue:** A departures nudge runs the full `refresh`, which fetches all active refs (up to 6), not just the new ones.

**Worst case while moving through new stops** (train, tram or car with GPS updates), with nudges every 10 s:
| Source | Calls/min |
|---|---|
| Departures nudges (6 x 6) | 36 |
| Departures poll (2 x 6) | 12 |
| Patterns (2 x 4) | 8 |
| Disruption nudges (whole network, every 10 s while `last_new_refs` intersects) | up to 6 |
| **Total** | **about 62** |

That exceeds the client's 60/min guard. When the guard trips mid-sweep, every remaining ref fails with `rate_guard`. If no ref succeeded, `refresh` raises and the poll loop applies exponential backoff (30 s, 60 s, ... capped at 1800 s). After a few such sweeps, departures stop updating for many minutes, even after PTV is healthy, and a self-inflicted guard rejection counts the same as an upstream outage. The same cap applies to genuine short PTV blips, so a 5-minute outage can leave the HUD on a 16-30 minute-old list.

**Fix:**
- Have the nudge fetch only the refs that are new or uncached, for example `refresh(ctx, only=new_refs)` or a separate `refresh_refs`.
- Do not count `PtvError("rate_guard")` as a failure for backoff purposes.
- For `transit_departures`, cap backoff at a few minutes (per-provider `backoff_cap_s` in `ProviderMeta`).
- Reset backoff after a successful nudge.

### WR-S4: PTV vehicle positions without a timestamp are shown regardless of age

**File:** `server/shinigami/transit/vehicles.py:102-111`, `144-145`; `server/shinigami/transit/model.py:383-386`
**Issue:** `RunPosition.ts` is `None` whenever PTV omits or malforms `datetime_utc`. `select_vehicles` skips the age check when `pos_ts is None`, and `TransitVehiclesProvider.query` reads `dep:*` caches of any age.

Example: after the watch set drains and David returns hours later, a cached departure whose ETA still falls in `[now, now+30 min]` places a "ptv" (real-position) marker at an hours-old location until the next refresh. A bus departure scheduled 20 minutes later than the cached sweep is enough to do this. The marker outranks estimates because of the sort key.

**Fix:** Fall back to the cache's `fetched_at` when the position has no timestamp. Pass it into the cache payload, or have `query` drop positions when `now - oldest > POS_MAX_AGE_S`:
```python
pos_ts = pos.get("ts") if pos.get("ts") is not None else payload_fetched_at
```

### WR-S5: Disruption classifier turns detours, road closures and lift or car-park closures red (violates D-17)

**File:** `server/shinigami/transit/severity.py:7-18`
**Issue:** `"closed"`/`"closure"` match anywhere in `dtype + title`. Common PTV wording such as these all classify as severity 3 ("service stopped"):
- "Route 246: Detour due to road closure"
- "Lift closure at Richmond"
- "Car park closed"

D-17 and D-15 say detours and lift-out notices stay white or blue with only a warning mark. `"cancel"` similarly matches "Some services may be cancelled" on partial-delay notices. The result is red overload (RESEARCH Pitfall 7).

**Fix:** Exclude detour, diversion and facility contexts before matching, and anchor closure to stops or stations:
```python
NOT_RED = ("detour", "diversion", "divert", "lift", "escalator", "car park", "toilet")
if any(p in head for p in NOT_RED): return 0
RED_PATTERNS = ("suspend", "stop closed", "station closed", "stop closure", "station closure",
                "no trams", "no trains", "not running", "replacement bus", "buses replac")
```
Add fixture cases for "Detour due to road closure" (expect 0) and "Lift closure" (expect 0).

### WR-S6: `max_bytes` does not bound memory: the whole body is downloaded before the size check

**File:** `server/shinigami/transit/ptv_client.py:84-96`
**Issue:** `await self._http.get(url)` reads and decompresses the full response into `r.content`, and only then compares it with `max_bytes`. A misbehaving upstream or proxy (or a gzip bomb, since httpx decompresses transparently) is fully buffered in the single uvicorn process before `too_large` is raised. The guard gives no protection.

**Fix:** Stream the response and abort early:
```python
async with self._sem:
    async with self._http.stream("GET", url, timeout=self._timeout_s) as r:
        ... status checks ...
        buf = bytearray()
        async for chunk in r.aiter_bytes():
            buf += chunk
            if len(buf) > self._max_bytes:
                raise PtvError("too_large") from None
js = json.loads(buf)
```

### WR-S7: Raw PTV `run_ref` is exposed in departure item ids, which defeats the vehicle-key hashing

**File:** `server/shinigami/providers/transit.py:224` (`item_id = f"dep:{s.id}:{d['run_ref']}"`), `server/shinigami/transit/vehicles.py:43-44`
**Issue:**
- `vehicles.py` documents "no raw run ref ... is ever carried" and hashes it into `veh:{sha1[:10]}`.
- `transit_departures` items, by contrast, ship the raw `run_ref` in `id` to the phone, the SSE stream and the device IndexedDB cache.

Anyone holding a profile can recompute `sha1(run_ref)[:10]` and join each vehicle marker to its raw run. A run is a timetabled trip, not a person, so the impact is low. Still, it contradicts the stated "no raw run/vehicle ids in payloads" rule and makes the hashing cosmetic.

**Fix:** Use the same opaque key for departures, `item_id = f"dep:{s.id}:{run_key(d['run_ref'])}"`. If the hash must not be linkable, use a keyed HMAC with a per-process secret. Check that the web client does not depend on the raw form; it uses only the `dep:` prefix in tests.

### WR-S8: Weekly transit job has no download timeout and no unit start timeout, so `deploy.sh` can hang indefinitely

**File:** `deploy/refresh-transit.sh:16-18`, `deploy/shinigami-transit.service:5-7`, `deploy/deploy.sh:63-69`
**Issue:**
- `curl -fL --retry 3` has no `--connect-timeout`, `--max-time` or `--speed-limit/--speed-time`.
- The unit is `Type=oneshot` with no `TimeoutStartSec=`, and the oneshot default is infinity.
- On first deploy, `deploy.sh` runs `systemctl start shinigami-transit.service` synchronously.

A stalled TCP transfer from `data.ptv.vic.gov.au` therefore blocks the deploy forever, before `systemctl restart shinigami`, so the new code never starts. `-L` also follows redirects to any scheme or host.

**Fix:**
```bash
curl -fL --proto '=https' --proto-redir '=https' --connect-timeout 20 --max-time 1200 \
  --speed-limit 10240 --speed-time 60 --max-filesize 1073741824 --retry 3 ...
```
Also add `TimeoutStartSec=30min` to `shinigami-transit.service`, and in `deploy.sh` use `timeout 35m systemctl start ...` or start it with `--no-block` and let the 300 s store reload pick up the file.

### WR-S9: `deploy.sh` keeps executing its pre-pull copy after `git pull` (already known; recorded once)

**File:** `deploy/deploy.sh:26`
**Issue:** `git pull --ff-only` replaces `deploy/deploy.sh` with a new file (new inode). Bash keeps reading the old one. Any deploy-script change, such as the new transit unit loop and first-build block in this phase, only takes effect on the second run. The first run can therefore restart the app without installing or enabling the new units.
**Fix:** After the pull, re-exec once if the script changed:
```bash
before=$(sha256sum deploy/deploy.sh)
git pull --ff-only
if [ -z "${SHINIGAMI_REEXEC:-}" ] && [ "$(sha256sum deploy/deploy.sh)" != "$before" ]; then
  SHINIGAMI_REEXEC=1 exec bash /opt/shinigami/deploy/deploy.sh "$@"
fi
```

### WR-S10: `ts()` interprets naive ISO strings as server-local time

**File:** `server/shinigami/transit/model.py:321-328`
**Issue:** `datetime.fromisoformat(s).timestamp()` treats a string without an offset as local time. All PTV `*_utc` fields are documented UTC, but `last_updated`/`from_date`/`to_date` and future GTFS-R adapters may omit `Z`. On a CT with `TZ=Australia/Melbourne` (or after a host TZ change), every such timestamp is shifted by 10-11 h. Countdowns, disruption expiry (`to_ts < now`) and the Planned 24 h window then silently go wrong. The tests pass only because the fixtures all carry `Z`.

`OverflowError`/`OSError` from extreme dates such as `0001-01-01` are also not caught here. They escape to the per-row `except Exception` in `parse_disruptions`, which then drops the whole disruption instead of only the date.

**Fix:**
```python
dt = datetime.fromisoformat(s)
if dt.tzinfo is None:
    dt = dt.replace(tzinfo=timezone.utc)
return dt.timestamp()
# and catch (ValueError, TypeError, OverflowError, OSError)
```

## Info

### IN-S1: Direction group labels "a"/"b" are relative to whichever run is soonest and flip between polls

**File:** `server/shinigami/transit/sources.py:82-89`
**Issue:** `ref_bearing` is taken from the soonest run. When the soonest service switches sides, every row's group changes from `{stop}:a` to `{stop}:b`, so client row identity and any per-group animation churn. Runs with no known final stop fall back to `r{route}:{dir}`, which splits one physical direction into two groups.
**Fix:** Anchor "a" to a fixed bearing, for example the half-plane with bearing in [0, 180), or fall back to `direction_id` before using `r{route}:{dir}`.

### IN-S2: `run_ref` from PTV is interpolated unescaped into a signed URL path

**File:** `server/shinigami/transit/ptv_client.py:123-128`
**Issue:** Upstream-controlled `run_ref` is placed into `/v3/pattern/run/{run_ref}/...` without validation. A value containing `/`, `?`, `#` or `&` would change the path or query and the signed message.
**Fix:** Validate it with `re.fullmatch(r"[A-Za-z0-9_-]{1,64}", run_ref)` and raise `PtvError("bad_ref")` otherwise.

### IN-S3: Hidden ordering coupling via `TransitService.last_new_refs`

**File:** `server/shinigami/providers/transit.py:187`, `340-345`
**Issue:** The disruptions nudge depends on the departures `query` having run immediately before it in the same `assemble_profile` pass, which relies on provider list order in `main.py`. The value is global shared state, so with two open streams at different spots one overwrites the other.
**Fix:** Have the departures provider nudge `transit_disruptions` itself when it nudges departures, and drop `last_new_refs`.

### IN-S4: Two concurrent viewers at different spots thrash the 6-stop watch set

**File:** `server/shinigami/transit/watch.py:36-53`
**Issue:** Up to 5 stops per location against a cap of 6. Each touch from one stream evicts the other stream's stops, which then become "new" again on the next touch and trigger nudges every 10 s. This is unlikely for a single user (phone plus desktop), but it compounds WR-S3.
**Fix:** Raise `max_stops` to about 12, or do not report stops as "new" if they were evicted within the TTL.

### IN-S5: Old cached `dep:*` rows can crash the departures layer after a schema change

**File:** `server/shinigami/providers/transit.py:216`
**Issue:** `Departure(**{**d, ...})` and `d["..."]` lookups raise `TypeError`/`KeyError` if a persisted row predates a field addition or removal. The whole layer then becomes `error` until every nearby stop is refreshed.
**Fix:** Store a `schema` version in the payload and treat a mismatch as a cache miss. Alternatively, wrap each stop's `_stop_items` in try/except and skip it.

### IN-S6: Disruption items can have an empty name

**File:** `server/shinigami/providers/transit.py:383-389`
**Issue:** `title = (d.get("title") or "")[:160]` is used as `Item.name`. An untitled PTV disruption renders as a blank row, which breaks the "everything gets a name" rule.
**Fix:** Fall back to `dtype` or "Service disruption".

### IN-S7: `TransitService.creds()` is a public accessor for the PTV secret

**File:** `server/shinigami/transit/service.py:32-33`
**Issue:** Nothing outside `attach_http` needs it. A public method makes it easy for future code (debug endpoints, health) to surface the key.
**Fix:** Remove it, or rename it to `_creds_for_client` and keep its use inside `attach_http`.

### IN-S8: Departures `refresh` timestamps every stop with the sweep start time

**File:** `server/shinigami/providers/transit.py:271`, `295`
**Issue:** `now` is captured before sequential awaits (up to 6 x 10 s timeout). The last stop's `fetched_at` can be up to about 60 s earlier than its real fetch, so it is shown "stale" sooner than warranted. Combined with WR-S1, it also lets an older sweep overwrite a newer one.
**Fix:** Use `ctx.clock()` per stop when calling `put_layer`.

---

_Reviewed: 2026-11-17T09:43:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

# Part 2: Web

# Phase 3: Code Review Report (web)

**Reviewed:** 2026-11-17
**Depth:** standard
**Files Reviewed:** 29
**Status:** issues_found

## Summary

I reviewed the Phase 3 transit web changes (d1afb34..HEAD) with privacy first, then CSP/XSS, correctness, iPhone performance and accessibility.

**Privacy:** the main Home / camera-off paths hold.
- `stripExactLayers` removes both `cameras_*` and `transit_*` on the fetch path, the stream path, the debounced IndexedDB save and the cached-profile adoption.
- The map, tag layer, edge pointers, card context and disruption readout all read the stripped profile.
- Switching to Home clears tags, pointers and any open tag card.
- One defence-in-depth gap remains (WR-W11): it only matters if the server also fails.

**CSP/XSS:** clean. All PTV text goes through `textContent` or `setAttribute("aria-label")`. There is no `innerHTML`, no `style=` attribute and no outbound link. Inline layout uses CSSOM `style.setProperty`, which `style-src 'self'` allows. Icon hrefs only come from fixed lists of names.

**Main defect:** the edge pointers (D-14) can never appear in the real app. They are hidden whenever a `.sheet-backdrop` element exists, and both sheets keep theirs in the DOM for the whole session. The test fakes a sheet that is added and removed, so it does not catch this.

Other problems:
- The card's first countdown uses the phone clock instead of the server-corrected clock.
- Stop cards do not re-dim departures as time passes between frames.
- Countdown-line labels are dropped ("ends in" shows as a bare countdown).
- The vehicle fade never shows because the tag entry animation overrides it.
- Edge-pointer direction is wrong at the 60° follow pitch.
- Several layout reads run on every frame during map moves.

The D-08 30 s grace and the D-09 single red row work as built and as accepted. They are not flagged.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-W1: Edge pointers never render: `hidden()` is always true

**File:** `web/src/map/map.ts:373` (with `web/src/ui/disruption-sheet.ts:117-136`, `web/src/ui/location-sheet.ts:38-55`)
**Issue:** `hidden: () => document.querySelector(".sheet-backdrop") !== null`.
- `LocationSheet` and `DisruptionSheet` each create their `.sheet-backdrop` once in the constructor and append it for good. Both are built in `boot()` before the map loads.
- Closing a sheet only sets `backdrop.hidden = true`; the element stays in the DOM.
- So `querySelector` always finds an element, and `EdgePointers.recompute()` always goes to `removeAll()`.
- Result: D-14 / TRAN-01 edge pointers never show.
- `map.test.ts:770-781` hides the bug: it appends a fake `.sheet-backdrop` and then removes it, which is not how the real sheets behave.
- The UAT note "edge pointers bring the stop back" probably came from the drawer row's `focusStop` path. Re-check it on the device.

A second problem: even with a correct selector, `recompute()` only runs on map `move`/`moveend`, `update()` and `resize`. Opening or closing a sheet does not hide or restore the pointers until the map next moves.
**Fix:**
```ts
hidden: () => document.querySelector(".sheet-backdrop:not([hidden])") !== null,
```
Also call `pointers.recompute()` when either sheet opens or closes, for example through an `onToggle` callback or a `MutationObserver` on the two backdrops' `hidden` attribute. Change the map test to construct the real `LocationSheet` / `DisruptionSheet` and toggle `open()` / `close()`.

## Warnings

### WR-W1: Card countdowns start from the phone clock, then tick on the server clock

**File:** `web/src/map/tags.ts:681`, `web/src/map/card.ts:142`
**Issue:**
- `TagLayer.select()` builds the card content with `Date.now()`. Every other path, including `setCardContext` and `moveVehicle`, uses `nowMs()` (the server-offset clock).
- `depLine` also sets its first countdown text from `Date.now()`.
- `Card.tick` then uses `nowMs()` from `startTicker`.

With a skewed phone clock, the first frame shows a different value that jumps one second later. The stop card's catchable/`missed` check (`line()`) and the `DEPARTED_MS` filter also use the wrong clock, so the card's dimming can disagree with the drawer row, which uses `nowMs()`.
**Fix:** use `nowMs()` in `select()` (`desc.cardContent(..., nowMs())`). In `depLine`, take a `now` argument passed from `render()`, which gets it from `nowMs()`, instead of calling `Date.now()`.

### WR-W2: An open stop card never re-evaluates "missed" or departed lines between data frames

**File:** `web/src/map/card.ts:290-297`, `web/src/map/transit-card.ts:126-145,160-165`
**Issue:**
- `Card.tick` only rewrites the countdown text.
- The `missed` class (D-08 dimming) and the `DEPARTED_MS` drop are computed once, when the content is built.
- The content is only rebuilt when `setCardContext` sees a new departures or disruptions layer object.

So between polls, or indefinitely while off-grid or stale, a departure that has become uncatchable stays bright. A departed service stays listed at `00:00` (the countdown is clamped by `Math.max(0, …)`) until the next frame.

Also, every new departures frame calls `card.replace()`, which runs `replaceChildren()`. That resets the scroll position of a scrolled `.card-sections.scroll` block, so a busy stop card jumps back to the top about every 30 s.
**Fix:** give `CardLine` an optional `missAtMs` (target minus walk minus grace) and `goneAtMs`, and toggle `missed` / hide the line in `Card.tick`. Or re-run `stopCardContent` from the tag layer's 1 s tick while a stop card is open. Keep `sectionsEl.scrollTop` across `replace()`.

### WR-W3: Labels on countdown lines are dropped ("ends in", vehicle "<stop> in")

**File:** `web/src/map/card.ts:123-167`, `web/src/map/transit-card.ts:101-105,248`
**Issue:** `depLine` renders `line.text` only when there is no countdown (`countTargetMs === undefined && countText === undefined`). `alertSection` pushes `{ text: "ends in", countTargetMs }`, so the alert-end line shows a bare `05:12` under the alert title with no "ends in" label. That breaks the "name and countdown" rule and is confusing next to departure countdowns.

The vehicle line `{ text: "<stop> in", countTargetMs }` loses its text the same way; there the section head happens to repeat it. `transit-card.test.ts:157` only checks the view-model, never the rendered DOM.
**Fix:** in the countdown branch of `depLine`, add `if (line.text) { const l = document.createElement("span"); l.className = "dep-label"; l.textContent = line.text; el.insertBefore(l, count); }`. Add a DOM test asserting that the "ends in" text appears in the card.

### WR-W4: Vehicle fade-out (stale position) never shows

**File:** `web/src/styles/tags.css:13,94` and the new `.map-tag.vehicle.fading` rule
**Issue:**
- `.map-tag` has `animation: tag-in … linear both`, and the `tag-in` keyframes end at `opacity: 1`.
- With `fill-mode: both`, the animated value stays after the animation ends, and animation values beat normal author declarations.
- So `.map-tag.vehicle.fading { opacity: var(--o-fade) }` (and the 400 ms opacity transition) never takes effect, except for reduced-motion users, where the animation is `none`.

A vehicle whose position is 2–3 minutes old looks exactly like a live one until it disappears at 180 s. That defeats the staleness cue in the discretion notes ("older than about 2 minutes fades out"). jsdom tests cannot catch it.
**Fix:** use `animation-fill-mode: backwards` for `tag-in`, or put the fade on an inner wrapper. For example: `.map-tag.vehicle.fading .tag-icon, .map-tag.vehicle.fading .veh-badge { opacity: var(--o-fade); }`.

### WR-W5: Edge-pointer direction is wrong under the 60° follow pitch, and the ray origin differs from the bearing origin

**File:** `web/src/map/edge-pointers.ts:213-218`
**Issue:**
- The arrow angle is the geographic bearing from `map.getCenter()` minus the map bearing.
- At `FOLLOW.pitch = 60` (`view.ts:7`), the screen direction to a ground point is not its geographic bearing: perspective squeezes the forward axis.
- So a stop 45° right-forward projects at roughly 60–65° on screen. The chip lands on the wrong part of the edge and the arrow points away from where the stop really comes into view.
- The ray also starts at the clamp-rect centre (between the readouts bottom and the drawer top). That is not the screen point of `getCenter()`, which sits in the padded viewport centre (bottom padding 144).

The hysteresis is correct. The problem is only where the pointer is placed and which way it points.
**Fix:** for stops in front of the camera, use `map.project(lngLat)` and take the angle from `(cx, cy)` to the projected point. Fall back to the bearing method only when projection is not usable (behind the horizon). Alternatively take `cx, cy` from `map.project(getCenter())` so both origins match.

### WR-W6: Red within-30 m camera labels can be demoted by stop and vehicle boxes (D-13)

**File:** `web/src/map/tags.ts:107-123`
**Issue:** D-13 says "Cameras keep their red-within-30 m labels". In `assignTags`, red cameras skip the cap but still go through the overlap test, now against the stop boxes (40 px tall) and the vehicle boxes, which use the full 176 px label width even though a vehicle badge is about 24–48 px wide. A CCTV within 30 m of a stop at an intersection, which is common, gets demoted to a compact icon. Vehicles gliding past a near camera make its red label flicker on each reconcile.
**Fix:** exempt `red.has(c.id)` from the overlap test, as stops are exempt. At minimum, use a vehicle-sized box (badge width) for `prio === 1` in the collision check.

### WR-W7: The vehicle card is not refreshed when the ETA or destination changes without the vehicle moving

**File:** `web/src/map/tags.ts:545-553,566-569`
**Issue:** `syncVehicle` returns early when the coordinates are unchanged. Only `moveVehicle` calls `card.replace` for a selected vehicle. If an estimated tram or a stationary bus gets a new `eta_ts` / `eta_live` / `heading_stop_name` at the same position, the open card keeps counting down to the old ETA target and shows the old LIVE/SCHED value.
**Fix:** in `reconcile`, after updating `e.item`, call `card.replace(vehicleCardContent(e.item, nowMs()))` when `id === selectedId` and the item object changed, regardless of movement.

### WR-W8: Vehicle aria-label is rewritten every second

**File:** `web/src/map/tags.ts:541,610-618`
**Issue:** the 1 s ageing ticker calls `applyVehicleLook`, which does `setAttribute("aria-label", vehSpoken(...))`. That text contains a seconds countdown, so the label changes every second. VoiceOver can re-announce a focused element whose label changes, and it churns attributes on up to 8 markers each second. `NextList` and `Readouts` deliberately limit label updates to once a minute (`labelMinute`, `ARIA_REFRESH_MS`). This breaks that pattern.
**Fix:** only change the aria-label when the minute changes (or the est/fade state changes), as `NextList` does. Or leave the countdown out of the marker label, since the card carries it.

### WR-W9: Edge-pointer recompute forces layout on every map-move frame

**File:** `web/src/map/edge-pointers.ts:151-157,182-237`, `web/src/map/map.ts:355-368,375-380`
**Issue:** on every `move` frame (all pans, and every follow-mode GPS ease), `recompute()` does all of the following:
- `clampRect()`: `getComputedStyle(safeProbe)`, plus `getBoundingClientRect()` on `.readouts` and `.drawer`
- `avoid()`: `querySelector` plus `getBoundingClientRect()` on `.recenter`
- `hidden()`: `querySelector`
- per pointer: CSS var writes and `setAttribute("aria-label")`
- `offsetWidth` in `ensure` / `reveal`

The reads come after last frame's style writes, so each frame forces a synchronous style and layout recalculation on top of MapLibre's frame. That costs real frame time and battery on iPhone. The aria-label is also rewritten every frame even when it has not changed.
**Fix:** cache the clamp rect and safe-area insets. Refresh them on `resize`, on drawer state change and on sheet toggle, not per frame. Write `aria-label` only when it differs, as `distEl` already does.

### WR-W10: The disruption sheet is a frozen snapshot and survives a location change

**File:** `web/src/ui/disruption-sheet.ts:147-154`, `web/src/app.ts:146-148`
**Issue:**
- `open()` renders the layer it was given once.
- Later stream frames are never reflected: a cleared or added disruption does not show, and ended disruptions keep ticking at `00:00`.
- If David switches place while the sheet is open, it keeps listing the previous place's alerts under "YOUR ROUTES".
- Ended items are not filtered: `disruptionItems` ignores `target_ts <= now`.
- The corner readout, rendered every tick, can then disagree with the open sheet.
**Fix:** add `DisruptionSheet.update(layer)` and call it from `render()` while `isOpen()`. Close the sheet in `handle.setLocationParams` when the location identity changes. Drop items whose `to_ts` has passed.

### WR-W11: The client privacy backstop depends on the server or async state at cold start

**File:** `web/src/app.ts:184-191,296,343-345`
**Issue:** this is defence in depth only; the server rule is the main guard. For a camera-off place, `camerasOff(key)` is true only through one of:
- `noCameraPlaces`, which is filled only when the server already omitted every exact layer, so a server regression that sends `transit_*` for Home never adds Home to it
- `loc.state().pin.cameras === false`, which is undefined for a pin saved in location state before `cameras` was stored
- `places`, which is loaded asynchronously and is often still empty when the first `refetch()` resolves

The cached-adoption path checks only `savedPin?.cameras === false`. So if the server regressed and sent `transit_*` for Home on a cold open with legacy saved state, the first fetch would render Home's stops and distances, and `saveProfile` would write them to IndexedDB, before the places list arrives.
**Fix:** fail closed for pins.
- Treat a `place=` key as camera-off until its `cameras` flag is known to be `true` from `pin.cameras` or `places`.
- Re-strip and re-save the current profile when `loadPlaces` resolves.
- Use the same `camerasOff(restoredKey)` check on the cached-adoption path.

## Info

### IN-W1: Warning glyph renders as a solid triangle with no exclamation mark

**File:** `web/public/icons.svg` (`#warn`), `web/src/styles/tags.css` (`.dep-warn`, `.tag-warn svg`)
**Issue:** `#warn` draws the "!" as stroke-only paths (`M12 9v5M12 17v2`). `.dep-warn` and `.tag-warn svg` set `fill: currentColor` and, for tags, `stroke: none`. The triangle is filled in the same colour as the mark, so the "!" cannot be seen.
**Fix:** give the "!" its own contrasting fill/stroke in the symbol (for example a stroke set to the panel colour), or use outline styling consistently, as `.row-warn` does.

### IN-W2: The rules for "red" and "real disruption item" differ between modules

**File:** `web/src/model.ts:218-222,242`, `web/src/map/transit-card.ts:55-59,93`, `web/src/ui/readouts.ts:40`, `web/src/ui/disruption-sheet.ts:33-40`
**Issue:**
- Red means `severity === 3` in `model.ts` and `transit-card.ts`, but `severity >= 3 || service_stopped` in `readouts.ts` and `disruption-sheet.ts`.
- `transit-card` also excludes `detail.none` items; the other modules do not.

These agree with today's server output, but they will drift apart.
**Fix:** export one `isServiceStopping(item)` and one `disruptionItems(layer)` from `transit.ts` and use them everywhere.

### IN-W3: The drawer and the stop card use different walk times for the same stop under GPS

**File:** `web/src/model.ts:164-165`, `web/src/map/tags.ts:445-446`
**Issue:** drawer rows use the server's `walk_s`, measured from the request location. The card uses `walkSecondsFor(haversine)` from the current client fix. After a short walk the two can disagree about whether a departure is catchable.
**Fix:** prefer the client value for both, or pass the same `walkS` into `transitRows`.

### IN-W4: An edge pointer's width is measured once

**File:** `web/src/map/edge-pointers.ts:312-313`
**Issue:** `w` is cached when the pointer is created. When the distance text changes width (for example `950 m` to `1.2 km`), right-edge placement (`rect.right - w`) and the overlap checks use a stale width.
**Fix:** re-measure when `distEl` text changes.

### IN-W5: The vehicle card's "Position · N s ago" is static

**File:** `web/src/map/transit-card.ts:243`
**Issue:** the age is computed once per render and only refreshes when the vehicle moves.
**Fix:** render it as a ticking value, or refresh it from the ageing tick.

### IN-W6: Dead parameters and options

**File:** `web/src/ui/disruption-sheet.ts:115` (`_opts.reducedMotion` unused), `web/src/map/tags.ts:546` (`void now`)
**Fix:** remove them, or use `reducedMotion` for the sheet transition.

### IN-W7: A drawer row tap collapses the drawer even when `focusStop` fails

**File:** `web/src/app.ts:155-158`
**Issue:** if the map has not loaded yet, or the stop is not in `lastStopItems`, the drawer collapses and nothing else happens.
**Fix:** collapse only when `mapHandle?.focusStop(row.stopId)` returns true.

---

_Reviewed: 2026-11-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
