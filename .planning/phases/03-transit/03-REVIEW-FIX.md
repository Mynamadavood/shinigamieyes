---
phase: 03-transit
fixed_at: 2026-11-18
review_path: .planning/phases/03-transit/03-REVIEW.md
fix_scope: critical_warning
findings_in_scope: 23
fixed: 23
skipped: 0
iteration: 1
status: all_fixed
---

# Phase 3: Code Review Fix Report

Merged from the server/deploy fixer (11 findings) and the web fixer (12 findings). All 23 critical and warning findings are fixed, each in its own commit with a regression test; the 15 IN-* findings are left open.

Checks after both fixers: `uv run pytest -q` 313 passed, 1 skipped; `ruff check server` clean; web 430 tests passed; `npm run build` ok; `bash -n` on all deploy scripts.

# Part 1: Server and deploy

# Phase 3: Code Review Fix Report (server and deploy)

**Source review:** .planning/phases/03-transit/03-REVIEW.md (Part 1)
**Scope:** CR-S1, WR-S1 to WR-S10 (David chose "Critical + warnings"). IN-S* findings were left alone. Nothing under `web/` was touched.

**Summary:**
- In scope: 11
- Fixed: 11 (each in its own commit, each with a regression test)
- Skipped or won't-fix: 0

**Final checks:** `uv run pytest -q` gives 313 passed, 1 skipped. `uv run ruff check server` passes. `bash -n` passes on `deploy/deploy.sh` and `deploy/refresh-transit.sh`.

**Locked decisions kept:**
- D-17: red only for a stopped service. WR-S5 makes this stricter.
- D-04/D-21: the Home and camera-off gate is unchanged.
- PLAT-04: `query()` still makes no upstream call. Nudges only flag stop ids and call `runtime.nudge`.
- No raw run or vehicle ids in payloads. WR-S7 enforces this.

## CR-S1: Pattern cache grows without bound

- **Status:** fixed
- **Commit:** a41b7db
- **Changed:**
  - New `Store.prune_layers(provider_id, prefix, cutoff)`. It deletes matching rows from SQLite and from the in-memory dict. It uses a literal `substr` prefix match, not `LIKE`.
  - `TransitVehiclesProvider.refresh` prunes `transit/pat:*` older than `PATTERN_KEEP_S` (2 x ETA horizon = 1 h) at the start of every cycle. It also does this when the watch set is empty, so the cache drains while idle.
- **Tests:**
  - `test_store.py::test_prune_layers_by_prefix_and_age`
  - `test_transit_vehicles.py::test_pattern_cache_stays_bounded_over_many_runs`: 400 cycles with new run refs each time stay bounded on disk and in RAM, and drain once idle.

## WR-S1: Poll loop ignores the single-flight guard

- **Status:** fixed
- **Commit:** 58b5976
- **Changed:**
  - `Runtime._refreshing` is replaced by `_running: dict[str, Task]`. Poll and nudge both register through `_start_refresh`.
  - The poll tick waits for an in-flight nudge (`_wait_idle`) and then runs its own full sweep. It never runs beside the nudge.
  - A done callback clears the registration only if it is still the registered task.
  - `stop()` also cancels running refreshes.
- **Test:** `test_runtime.py::test_poll_waits_for_inflight_nudge_and_never_overlaps` (max concurrency 1).

## WR-S2: First-open nudge lost while a poll runs

- **Status:** fixed
- **Commit:** 3c1de84
- **Changed:**
  - A nudge that arrives during a refresh is now marked pending. It runs once when that refresh ends.
  - A nudge inside the 10 s gap is deferred with `call_later` to the end of the gap instead of being dropped.
  - `stop()` disarms pending and deferred nudges (`_stopping` flag).
  - The departures query now also nudges for a newly watched stop whose cache is older than `STALE_AFTER_S`. This covers revisits.
- **Tests:**
  - `test_runtime.py::test_nudge_during_refresh_runs_once_after_it`
  - `test_runtime.py::test_nudge_inside_min_gap_is_deferred_not_dropped`
  - `test_runtime.py::test_stop_does_not_rearm_pending_nudge`
  - `test_transit_poll.py::test_revisit_with_old_cache_nudges`

## WR-S3: Nudges trip the 60/min guard and back off for 30 min

- **Status:** fixed
- **Commit:** 0d1ad9c
- **Changed:**
  - New `Provider.nudge_refresh()`; by default it runs the full refresh. The departures query records only the stops that need it (new, with no cache or an old one) through `TransitService.want_nudge`. The departures `nudge_refresh` fetches just those stops.
  - A `PtvError("rate_guard")` (matched on `exc.kind`) keeps the normal poll cadence and no longer counts as a failure.
  - New `ProviderMeta.backoff_cap_s`. Departures and vehicles cap at 300 s; the other providers keep 1800 s.
  - A nudge that actually fetched resets the poll backoff and wakes a poll loop that is sleeping in backoff, which then resumes the normal interval.
- **Tests:**
  - `test_runtime.py::test_rate_guard_rejection_does_not_back_off`
  - `test_runtime.py::test_per_provider_backoff_cap`
  - `test_runtime.py::test_successful_nudge_ends_poll_backoff`
  - `test_transit_poll.py::test_nudge_fetches_only_new_uncached_stops`

## WR-S4: Untimed PTV positions shown at any age

- **Status:** fixed
- **Commit:** 71dc0c8
- **Changed:**
  - The vehicles query passes each departures row's `fetched_at` to the sources.
  - A real position with no timestamp takes that time as its age.
  - A position whose age is unknown is never shown, and `select_vehicles` drops `pos_ts=None`.
- **Tests:**
  - `test_transit_vehicles.py::test_position_without_timestamp_ages_by_cache_fetch_time`
  - `test_transit_vehicles.py::test_query_drops_untimed_position_from_hours_old_cache`

## WR-S5: Detours and facility closures classified red (D-17)

- **Status:** fixed
- **Commit:** f54dbec
- **Changed:**
  - `severity.py`: a closure now counts only when it names a stop, station, line or route.
  - Detour, diversion and facility notices (lift, escalator, car park, parking, toilet and similar) stay at 0 unless buses replace the service.
  - Hedged cancellations ("may be", "some services" and similar) stay at 0.
  - `RED_PATTERNS` is still exported.
- **Test:** new cases in `test_transit_disruptions.py::test_classify_table`:
  - "Detour due to road closure": 0
  - "Lift closure": 0
  - "Lift at ... Station closed": 0
  - "Car park closed": 0
  - "Some services may be cancelled": 0
  - "Road closure": 0
  - "stop closure", "Station closed", "Detour: buses replace trams", "No trams" and "Trains cancelled": 3

## WR-S6: max_bytes checked only after the full download

- **Status:** fixed
- **Commit:** d73e017
- **Changed:**
  - `PtvClient` streams the response.
  - It rejects a declared `Content-Length` over the cap before reading.
  - It aborts as soon as the decoded bytes pass `max_bytes`. Because the decoded bytes are counted, this also stops a gzip bomb.
  - Error kinds and the `from None` behaviour are unchanged.
- **Tests:**
  - `test_ptv_client.py::test_oversized_body_is_aborted_while_streaming`: it stops after about 21 of 100 chunks.
  - `test_declared_length_over_cap_rejected_before_reading`
  - `test_gzip_bomb_counts_decoded_bytes`

## WR-S7: Raw run_ref in departure item ids

- **Status:** fixed
- **Commit:** b142b9f
- **Changed:**
  - Departure ids are now `dep:{stop_id}:{run_key(run_ref)}`, the same opaque key that vehicle markers use.
  - The web client only depends on the `dep:` prefix; I checked with a grep and did not edit anything.
- **Test:** `test_transit_poll.py::test_refresh_caches_and_query_serves` now asserts the hashed ids and that neither `R-T1` nor `run_ref` appears in the layer.

## WR-S8: Weekly transit job can hang deploy.sh

- **Status:** fixed
- **Commit:** 61dfd95
- **Changed:**
  - `refresh-transit.sh` curl is now https-only, including redirects (`--proto '=https' --proto-redir '=https'`). It also has `--connect-timeout 20 --max-time 1200 --speed-limit 10240 --speed-time 60`.
  - `shinigami-transit.service` gets `TimeoutStartSec=30min`.
  - `deploy.sh` wraps the first-build start in `timeout 35m`.
- **Test:** new `server/tests/test_deploy_units.py`. These are static checks on the curl flags, the unit timeout and the bounded wait.

## WR-S9: deploy.sh runs its pre-pull copy

- **Status:** fixed
- **Commit:** 6ad4d7f
- **Changed:**
  - `deploy.sh` hashes itself before `git pull --ff-only`.
  - If the hash changed, it runs `SHINIGAMI_DEPLOY_REEXEC=1 exec bash /opt/shinigami/deploy/deploy.sh "$@"` once. The env flag prevents a loop.
  - The re-exec logic is in the new copy, so the first deploy that pulls this commit still runs its old script to the end. The re-exec takes effect from the next script change on.
- **Tests:**
  - `bash -n` passes.
  - `test_deploy_units.py::test_deploy_reexecs_itself_once_after_pull` checks the order: hash, then pull, then guard, then exec, then build.
  - `test_deploy_scripts_parse` runs `bash -n` when bash is available.

## WR-S10: ts() reads naive ISO strings as server-local time

- **Status:** fixed
- **Commit:** 674a273
- **Changed:**
  - A string without an offset is now read as UTC.
  - `OverflowError` and `OSError` are caught, so a bad date gives None for that one field.
  - Before this fix, a naive year-1 date raised `OSError` on this machine, and that dropped the whole disruption row.
- **Tests:**
  - `test_ptv_client.py::test_ts_naive_strings_are_utc_whatever_the_server_tz`
  - `test_ts_bad_and_extreme_dates_never_raise`
  - `test_disruption_with_extreme_date_is_kept`

---

_Fixed: 2026-11-18_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

# Part 2: Web

# Phase 3: Code Review Fix Report (web)

**Source review:** `.planning/phases/03-transit/03-REVIEW.md` (Part 2: Web)
**Scope:** CR-W1 and WR-W1 to WR-W11. The IN-W* findings were left alone, as instructed.
**Iteration:** 1

**Summary**
- Findings in scope: 12
- Fixed: 12 (one atomic commit each, each with a regression test)
- Skipped / won't-fix: 0
- `npm --prefix web test -- --run`: 35 files, 430 tests passed
- `npm --prefix web run build`: passed

All edits are in `web/` only. The CSP rules still hold: no `innerHTML`, no inline `style=`, and dynamic values go through CSSOM `style.setProperty`. No new packages.

These locked decisions are unchanged:
- D-08 30 s catch grace
- D-09 single red leave-now row
- zero-padded countdowns
- D-13 label priority
- Home and camera-off places get no transit UI

## Fixed Issues

### CR-W1: Edge pointers never render: `hidden()` is always true

**Status:** fixed: needs a check on the iPhone
**Commit:** b18f349
**Files:** `web/src/map/map.ts`, `web/src/map/map.test.ts`

**What changed**
- `hidden()` now matches only a visible backdrop: `.sheet-backdrop:not([hidden])`.
- A `MutationObserver` on `document.body` (subtree, `attributeFilter: ["hidden"]`) calls `pointers.recompute()` whenever a `.sheet-backdrop` toggles. Opening or closing a sheet now hides or restores the pointers without waiting for a map move. The observer is disconnected in `destroy()`.

**Test:** the map test now builds the real `LocationSheet` and `DisruptionSheet`, so both backdrops are in the DOM and hidden for the whole test. It calls `open()` and `close()` on each sheet and checks that the pointers hide and come back with no map event. The test fails against the old selector.

### WR-W1: Card countdowns start from the phone clock

**Status:** fixed
**Commit:** 0d80efc
**Files:** `web/src/map/tags.ts`, `web/src/map/card.ts`, `web/src/map/tags.test.ts`

**What changed**
- `TagLayer.select()` passes `nowMs()` instead of `Date.now()`.
- `depLine` takes a `now` argument, which `render()` gets from `nowMs()`.

**Test:** with `setOffset(+10 min)`, a departure that leaves in 60 s with a 120 s walk must open dimmed (`missed`). On the phone clock it opened bright, and the test fails against the old code.

### WR-W2: An open stop card never re-evaluates "missed" or departed lines

**Status:** fixed
**Commit:** 948822c
**Files:** `web/src/map/card.ts`, `web/src/map/transit-card.ts`, `web/src/styles/tags.css`, `web/src/map/card.test.ts`, `web/src/map/transit-card.test.ts`

**What changed**
- `CardLine` has two new fields:
  - `missAtMs` = departure − walk + 30 s grace. This is the same D-08 rule as before, rewritten as a time.
  - `goneAtMs` = departure + 15 s.
- On its existing 1 s tick, `Card` now:
  - adds `missed` and switches the note to "too late"
  - hides departed lines
  - hides a group, with its head, once all of its lines have gone
- `replace()` keeps `.card-sections` `scrollTop`, so a busy stop card no longer jumps to the top on every frame.
- New CSS: `.card-dep[hidden], .card-dep-group[hidden] { display: none; }`.

**Tests:**
- A card tick test checks that a line dims at `missAtMs`, a line hides at `goneAtMs`, and the group hides once its last line has gone.
- A replace test checks that the scroll position is kept.
- A view-model test checks the `missAtMs` and `goneAtMs` values.

### WR-W3: Labels on countdown lines are dropped

**Status:** fixed: needs a check on the iPhone (looks)
**Commit:** 01e7f0a
**Files:** `web/src/map/card.ts`, `web/src/map/transit-card.ts`, `web/src/styles/tags.css`, `web/src/map/transit-card.test.ts`

**What changed**
- A countdown line with `text` now renders a `.dep-label` span before the `.dep-count`. The alert end now reads "ends in 05:12".
- The vehicle section no longer has a `head`, because its line now carries the "<stop> in" label and the head would repeat it.
- Label colours:
  - dim by default
  - normal text colour on the vehicle line
  - on-red inside a service-stopping alert

**Tests:** DOM tests render a real `Card`:
- "ends in" appears just before the countdown.
- The vehicle line shows "Bourke St Mall in" and there is no duplicate head.
- Plain departure lines get no label.

### WR-W4: Vehicle fade-out never shows

**Status:** fixed: needs a check on the iPhone (jsdom cannot run the CSS cascade)
**Commit:** f7e84d3
**Files:** `web/src/styles/tags.css`, `web/src/map/map-css.test.ts`

**What changed:** the `.map-tag` entry animation now uses `linear backwards` instead of `linear both`. Its end value (opacity 1) no longer stays after the animation ends, so `.map-tag.vehicle.fading { opacity: var(--o-fade) }` and its 400 ms transition now apply.

**Test:** a CSS regression test, in the style of the existing `map-css.test.ts`, checks two things: the `.map-tag` animation does not use `both`/`forwards`, and the fading rule is still there.

### WR-W5: Edge-pointer direction is wrong under the 60° follow pitch

**Status:** fixed: needs a check on the iPhone
**Commit:** 617535a
**Files:** `web/src/map/edge-pointers.ts`, `web/src/map/edge-pointers.test.ts`

**What changed**
- The ray now starts at `map.project(getCenter())`, which is the padded viewport centre, clamped into the clamp rect. This is the same point the bearing is measured from.
- The arrow angle comes from the projected stop: one `project` call per pointer, at most `MAX_POINTERS`, reusing the projection from the on-screen test where there is one.
- New helpers `projectedAngle()` and `angleDiff()`. A projection that is not finite, or more than 90° away from the geographic bearing (a point behind the camera projects mirrored), falls back to the bearing.

**Tests:** these use a fake pitched map that squeezes the forward axis, puts the centre at y 300, and mirrors points behind the camera:
- A stop to the north-east points at 63° (the projected direction), where the old code gave about 38°.
- A point behind the camera falls back to the geographic bearing.
- A stop due east sits on the projected centre's y.

Two of these tests fail against the old code.

### WR-W6: Red within-30 m camera labels can be demoted

**Status:** fixed
**Commit:** d88238f
**Files:** `web/src/map/tags.ts`, `web/src/map/tags.test.ts`

**What changed**
- In `assignTags`, red cameras (`red.has(c.id)`) now skip the overlap test, the same way stops do. D-13 says red cameras within 30 m are always labelled.
- The existing test "demotes an overlapping lower-ranked label" used two cameras within 30 m, so it contradicted D-13. It now uses cameras at 40 m and 50 m.

**Test:** a red camera under a stop box and another under a vehicle box both stay labelled. A camera at 60 m that overlaps is still demoted.

### WR-W7: The vehicle card is not refreshed when the ETA changes without a move

**Status:** fixed
**Commit:** 7353887
**Files:** `web/src/map/tags.ts`, `web/src/map/tags.test.ts`

**What changed**
- `syncVehicle` now returns whether the vehicle moved.
- In `reconcile`, when the selected vehicle's item object changed but it did not move, the open card is re-rendered with `vehicleCardContent(item, nowMs())`. A moveend reconcile with the same item does not re-render.

**Test:** the same position with a new `eta_ts` and `eta_live: false` re-renders the card with the new target and "SCHED". A reconcile with the same item does not re-render.

### WR-W8: Vehicle aria-label is rewritten every second

**Status:** fixed: needs a check on the iPhone (VoiceOver)
**Commit:** daa542e
**Files:** `web/src/map/tags.ts`, `web/src/map/tags.test.ts`

**What changed:** `applyVehicleLook` writes the aria-label only when one of these changes:
- the item object
- the est or fading state
- the minute

This follows the `NextList` `labelMinute` pattern. The label text has not changed.

**Test:** no aria-label writes over 5 s of ticks, one write after the minute changes, and an immediate update when a new ETA arrives.

### WR-W9: Edge-pointer recompute forces layout on every map-move frame

**Status:** fixed
**Commit:** 4cf1b2a
**Files:** `web/src/map/edge-pointers.ts`, `web/src/map/edge-pointers.test.ts`, `web/src/map/map.ts`

**What changed**
- `EdgePointers` caches `{ clampRect, avoid, hidden }`. The rAF-throttled `move` path reuses the cache.
- Every other recompute reads the layout fresh. That covers:
  - `moveend`
  - `update()`
  - window `resize`
  - a sheet toggle (from CR-W1)
  - the recenter button showing or hiding (`showRecenter` now notifies only when the state actually changes)
  - a size change of `.readouts` or `.drawer`, through a `ResizeObserver` (guarded, and disconnected in `destroy()`)
- The pointer `aria-label` is written only when it differs. `offsetWidth` is already read only when a pointer is first created or revealed.

**Test:** five `move` frames make no clamp, avoid or hidden calls and no aria-label writes. `moveend` reads each of them once.

### WR-W10: The disruption sheet is a frozen snapshot and survives a location change

**Status:** fixed
**Commit:** 762af41
**Files:** `web/src/ui/disruption-sheet.ts`, `web/src/ui/disruption-sheet.test.ts`, `web/src/app.ts`, `web/src/app.test.ts`, `web/src/styles/hud.css`

**What changed**
- New `DisruptionSheet.update(layer)`. It does nothing while the sheet is closed or when the layer object is the same. `app.ts` calls it from `renderRows()` while the sheet is open, so it follows stream frames the same way the corner readout does.
- `disruptionRows()` drops items whose `to_ts` (or `target_ts`) has passed.
- The sheet's own tick re-renders when a countdown reaches its end, so ended disruptions leave instead of sitting at 00:00.
- An empty list now shows "No current disruptions on your routes."
- `setLocationParams` closes the sheet when the location identity changes. A GPS move inside "gps" does not count as a change.

**Tests:**
- Sheet unit tests cover: following a new layer while open, ignoring updates while closed, not re-rendering for the same layer, the empty state, and an ended disruption leaving on the tick.
- An app test checks that a stream frame clearing a disruption updates the open sheet, and that switching to a saved place closes it.

### WR-W11: The client privacy backstop depends on server or async state at cold start

**Status:** fixed: needs human check of the privacy logic
**Commit:** cc7b8cf
**Files:** `web/src/app.ts`, `web/src/app.test.ts`

**What changed**
- `camerasOff(key)` fails closed. Any `place=` key counts as camera-off, and `transit_*` and `cameras_*` are stripped, unless the places list (live `/api/places` or its IndexedDB copy) contains that place with `cameras: true`. A `cameras: true` stored on the saved pin is deliberately not trusted on its own.
- `noCameraPlaces` still forces camera-off.
- The cached-adoption path uses `camerasOff(restoredKey)` instead of `savedPin?.cameras === false`.
- When `loadPlaces` resolves:
  - If the place is still camera-off, any exact layers are stripped and the profile is re-saved.
  - If the list confirms the place has cameras and it had been held closed, the app refetches to get the held-back layers.

**Tests:**
- Fail-closed case: a legacy saved pin (no `cameras` flag), a cached profile with transit, a server response with transit (simulated regression), a transit stream frame, and a places list that never arrives. No transit is rendered, and no `saveProfile` call contains `transit_*` or `cameras_*`.
- Confirmation case: with the pin storing `cameras: true`, nothing shows until the places list confirms; after that the app refetches and transit renders.

Both tests fail against the old logic.

**Trade-off:** a camera-enabled saved place shows no transit or cameras until the places list arrives. Offline, the list comes from IndexedDB, so this only matters on a first-ever open with no stored list. The first fetch in that window also saves a stripped profile; the refetch after confirmation overwrites it.

## Skipped Issues

None.

## Notes

- The other fixer committed server-side changes (CR-S*/WR-S*) at the same time. Every web commit was made with explicit `git commit -- <paths>` so only its own `web/` files were included. `server/` and `deploy/` were never touched.
- Line endings: the edited files were written with LF. Git warned it will convert them to CRLF in the working copy, but the content is unchanged.

---

_Fixed: 2026-11-18_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
