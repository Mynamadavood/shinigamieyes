---
phase: 03-transit
part: server-and-deploy
fixed_at: 2026-11-18
review_path: .planning/phases/03-transit/03-REVIEW.md
iteration: 1
fix_scope: critical_warning
findings_in_scope: 11
fixed: 11
skipped: 0
wont_fix: 0
status: all_fixed
---

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
