---
phase: 01-foundation-and-flat-hud-slice
reviewed: 2026-11-06T01:36:11Z
depth: standard
files_reviewed: 48
files_reviewed_list:
  - deploy/deploy.sh
  - deploy/lxc-setup.sh
  - deploy/proxmox-create-lxc.sh
  - deploy/shinigami.service
  - deploy/verify.sh
  - server/shinigami/api/geocode.py
  - server/shinigami/api/health.py
  - server/shinigami/api/places.py
  - server/shinigami/api/profile.py
  - server/shinigami/api/stream.py
  - server/shinigami/api/suggest.py
  - server/shinigami/assemble.py
  - server/shinigami/geo.py
  - server/shinigami/main.py
  - server/shinigami/places.py
  - server/shinigami/providers/arpansa.py
  - server/shinigami/providers/base.py
  - server/shinigami/providers/sun.py
  - server/shinigami/providers/uv_window.py
  - server/shinigami/runtime.py
  - server/shinigami/schema.py
  - server/shinigami/settings.py
  - server/shinigami/store.py
  - web/index.html
  - web/vite.config.ts
  - web/src/app.ts
  - web/src/clock.ts
  - web/src/format.ts
  - web/src/freshness.ts
  - web/src/location-search.ts
  - web/src/location.ts
  - web/src/main.ts
  - web/src/model.ts
  - web/src/net.ts
  - web/src/offgrid.ts
  - web/src/store.ts
  - web/src/sw.ts
  - web/src/ticker.ts
  - web/src/types.ts
  - web/src/ui/location-sheet.ts
  - web/src/ui/location-strip.ts
  - web/src/ui/next-list.ts
  - web/src/ui/offgrid-banner.ts
  - web/src/ui/shell.ts
  - web/src/styles/app.css
  - web/src/styles/banner.css
  - web/src/styles/location.css
  - web/src/styles/tokens.css
findings:
  critical: 2
  warning: 9
  info: 7
  total: 18
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-11-06T01:36:11Z
**Depth:** standard
**Files Reviewed:** 48
**Status:** issues_found

## Summary

I reviewed the FastAPI backend (routers, assembler, providers, runtime, store), the vanilla-TS PWA (boot flow, net/SSE, location state machine, list rendering, service worker) and the Proxmox/LXC deploy scripts. The good parts: logging hygiene (only provider ids and exception class names are logged, httpx is set to WARNING, `--no-access-log`), the CSP, the loopback bind, and textContent-only DOM rendering (I found no XSS sink).

There are two blockers. First, the deploy flow runs git and repo scripts as root inside a tree the service user owns, which gives a straight privilege-escalation path. Second, the "coordinates never leave the server" rule for pinned places is broken: the sun layer for `place=home` returns exact sub-second golden/blue-hour timestamps computed at the precise home coordinates. Because astral is deterministic, those timestamps can be inverted to recover the home location.

The warnings are mostly correctness gaps on the client's "never the slow path / always show something" path:
- Unbounded IndexedDB awaits block first paint.
- Any 4xx/5xx is shown as OFF-GRID.
- Stream layers from a new location get merged into the old location's profile.
- The skeleton or blank list can stick when offline.
- The uv_window fallback stops working after its estimate ages out.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Root executes git and repo scripts inside a service-user-writable tree (privilege escalation)

**File:** `deploy/deploy.sh:9-10, 28-30, 45` (also `deploy/lxc-setup.sh:79, 83`)
**Issue:** `deploy.sh` runs `chown -R shinigami:shinigami /opt/shinigami`, so the service user owns the whole checkout, including `.git/`, `deploy/*.sh` and `deploy/shinigami.service`. Root then:
- runs `git -c safe.directory=/opt/shinigami pull` in that tree. The `safe.directory` override switches off git's CVE-2022-24765 protection, so a planted `.git/hooks/post-merge` or a `core.fsmonitor`/`core.hooksPath` entry in `.git/config` runs as root.
- installs `deploy/shinigami.service` into `/etc/systemd/system`. An attacker can change `User=` or `ExecStart=`.
- runs `bash deploy/verify.sh --local`.

`lxc-setup.sh` likewise runs `bash "$REPO/deploy/deploy.sh"` as root. Anyone who can execute code as `shinigami` (the network-facing uvicorn process) can therefore get root in the CT on the next deploy.
**Fix:** Keep the checkout root-owned. Give the service user only the build outputs, and run git without hooks or config overrides:
```bash
git -c core.hooksPath=/dev/null -c core.fsmonitor=false pull --ff-only   # tree owned by root
install -d -o shinigami -g shinigami .venv web/node_modules web/dist
chown -R shinigami:shinigami .venv web/node_modules web/dist          # build outputs only
```
Alternatively, run `git pull` and the builds as `shinigami` and have root never execute or install files from the tree. In that setup, install the unit from a root-owned copy and verify it against a known hash.

### CR-02: Pinned-place sun timestamps leak the exact home coordinates to the client

**File:** `server/shinigami/providers/sun.py:17, 44` (called via `server/shinigami/api/profile.py:31-35` and `server/shinigami/assemble.py:23`)
**Issue:** For `place=home`, `resolve_location` hides lat/lon in `ProfileLocation`. `SunProvider.query` then computes golden/blue hour at the exact home coordinates and returns `target_ts=when.timestamp()`, a float with microsecond precision, for 8 boundaries per day. The client receives these over `/api/profile` and SSE, and stores them in IndexedDB (`profile:last`). At Melbourne's latitude, 1 s of sunrise/sunset shift is roughly 370 m of longitude. Because astral is deterministic, anyone holding the payload can solve for (lat, lon) to sub-metre precision by fitting the 8+ timestamps. This defeats D-09 / the stated constraint that home coordinates must never reach the client.
**Fix:** For pin sources, compute sun boundaries at a coarsened point and quantise the output:
```python
# profile.py, pin branch
cell = snap_cell(p.lat, p.lon)          # or a 0.02 deg grid
return loc, cell.lat, cell.lon
# sun.py
target_ts=float(int(when.timestamp() // 60 * 60)),  # minute precision is enough for a countdown
```
Apply the same rule to any future provider that emits geometry or precise per-location values for pins.

## Warnings

### WR-01: Every type-ahead prefix and search query is persisted forever on disk

**File:** `server/shinigami/store.py:87-96`, `server/shinigami/api/suggest.py:117`, `server/shinigami/api/geocode.py:105`
**Issue:** `/api/suggest` fires on every debounced keystroke, and each normalised query (`suggest|12 smi`, `suggest|12 smith st`...) is written to `geocode_cache` with a timestamp. Nothing ever expires it. It also sits in an unbounded in-memory dict (`Store._geo`). The result is a timestamped, permanent history of every address David has typed, stored in the SQLite file that vzdump backs up. That conflicts with the "queries must never be logged" rule in spirit, and the cache grows without limit.
**Fix:** Don't persist suggest results at all, or keep them in a size-bounded in-memory LRU with a TTL of minutes. For `/api/geocode`, drop `created_at` or add a retention purge (for example, delete rows older than 30 days at startup). Cap `_geo` with an LRU.

### WR-02: Place ids are not validated against the API pattern, so valid-looking places are unreachable

**File:** `server/shinigami/places.py:34-49` vs `server/shinigami/api/profile.py:59`, `server/shinigami/api/stream.py:64`
**Issue:** `load_places` accepts any string id, but `/api/profile` and `/api/stream` require `^[a-z0-9_-]+$` and `max_length=32`. An id like `Home` or `my place` in `places.toml` is listed by `/api/places`, and the sheet shows it. Picking it then always returns 422, which the client reports as OFF-GRID (see WR-03).
**Fix:** In `load_places`, reject ids that fail `re.fullmatch(r"[a-z0-9_-]{1,32}", pid)` and log a warning (id only).

### WR-03: Any HTTP error is treated as "offgrid"; a stale saved pin produces a permanent error loop

**File:** `web/src/app.ts:156-159`, `web/src/net.ts:21`, `web/src/location.ts:127-145`
**Issue:** `refetch()` catches every error, including `profile HTTP 422/500`, and calls `conn.markOffgrid()`. The red OFF-GRID banner then shows while the tailnet is up. If the saved location state is a pin whose id was removed from `places.toml` (or see WR-02), every refetch returns 422. The EventSource also gets 422, closes permanently (non-200 responses are not retried), and the 40 s watchdog reconnects and calls `onDead` → `refetch` forever. Meanwhile the banner flips between online (`onHello` never fires, so it stays offgrid) and stale data.
**Fix:** Distinguish network failure from HTTP failure. Throw a typed error with `status`, call `markOffgrid()` only for network errors and timeouts, and on 422 for a pin fall back to GPS:
```ts
catch (e) {
  if (e instanceof HttpError && e.status === 422 && loc.state().mode === "pin") loc.useGps();
  else if (!(e instanceof HttpError)) conn.markOffgrid();
}
```

### WR-04: Stream layers for a new location are merged into the old location's profile (and may be silently dropped)

**File:** `web/src/app.ts:69-73, 186-194`, `web/src/net.ts:30-34`
**Issue:** `setLocationParams` starts `refetch()` and `stream.reopen()` in parallel. The new stream's `hello`/`layer` frames often arrive before the profile fetch resolves, and `onLayer` calls `applyLayer(profile, layer)` on the old location's profile. The UI then shows a mix: sun rows for location A and uv_window for B, under B's strip label. `scheduleSave` also persists this hybrid to IndexedDB. If the refetch fails (4 s timeout), the hybrid stays. In addition, `applyLayer` drops a layer whose `rev` is lower than the old location's layer, and `uv_window.rev = fetched_at` differs per cell. So B's valid layer can be discarded, leaving A's UV window rows displayed for B.
**Fix:** Tag the profile with the params key it was fetched for. In `onLayer`, ignore frames (or trigger `refetch`) unless `paramKey(params) === profileKey`. Only compare `rev` when the layer comes from the same location.

### WR-05: uv_window fallback estimate is never regenerated, and failing fetches are retried on every request

**File:** `server/shinigami/providers/uv_window.py:80-92`, `server/shinigami/assemble.py:36-43`
**Issue:** On upstream failure, the estimate is only written when no row exists (`get_layer(...) is None`). Once an estimated row exists, or an old real row older than TTL, later failures leave it untouched. The estimate covers days -1..2 from the original `now`, so after a multi-day Open-Meteo outage `query()` returns `status=stale` with zero items. The fallback silently stops working, which defeats "HUD never goes blank". Also, every `/api/profile` and `/api/stream` call while the layer is `stale`/`pending` spawns a new upstream fetch. Singleflight only dedupes concurrent calls, and there is no negative cache or backoff for the on-demand tier, so every foreground/refetch hits a failing Open-Meteo.
**Fix:** In the except branch, regenerate the estimate when the row is missing, is itself estimated, or has no boundary in `[now, now+HORIZON_S]`. Add a per-(provider, cell) failure timestamp in `Runtime` and skip `request_cell` for, say, 5 minutes after a failure.

### WR-06: First paint blocks on IndexedDB with no timeout (violates the < 1 s / "must work" rule)

**File:** `web/src/app.ts:113, 123`, `web/src/location.ts:129`
**Issue:** `boot` awaits `Promise.all([loadProfile(), loadLastSync()])` and then `await loc.start()` (another IDB `get`) before starting the ticker or any fetch. The `try/catch` wrappers only handle rejections. If IndexedDB hangs (a recurring WebKit failure mode: blocked open, storage pressure, the backgrounded-process "connection lost" state), the promise never settles. The app then shows the loading skeleton forever and never issues a network request.
**Fix:** Race every IDB read against a short timeout:
```ts
const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
const [cached, lastSync] = await withTimeout(Promise.all([loadProfile(), loadLastSync()]), 300, [null, null]);
```
Apply the same guard to the `get(STATE_KEY)` in `location.start()`.

### WR-07: Loading skeleton can stick forever offline; no empty state once rows expire

**File:** `web/src/app.ts:67, 115-119, 156-159`, `web/src/ui/next-list.ts:115`
**Issue:** `list.setState("loading")` is only replaced by `setState(...)` after a successful fetch, or by `update()` when `rows.length > 0`. Two problems follow:
- If a cached profile exists but yields 0 visible rows (all countdowns elapsed, uv_now pending) and the device is offline, `refetch` fails and skips `no-data-offline` because `profile` is non-null. The skeleton then shows "loading" indefinitely.
- After a successful `ready`, when rows expire down to zero, `update([])` leaves a blank list with no "Nothing on the radar" state.
**Fix:** Derive the list state on every tick, inside `render()` and the ticker callback:
```ts
const rows = selectVisible(profile, now);
list.setState(rows.length ? "ready" : profile ? "empty" : conn.state() === "offgrid" ? "no-data-offline" : "loading");
```
Make `setState` idempotent so it does not rebuild the DOM every second.

### WR-08: GPS timeout / position-unavailable is reported as "Location is off"

**File:** `web/src/location.ts:107-117`
**Issue:** The error callback ignores `GeolocationPositionError.code`. A `TIMEOUT` (8 s, common indoors) or `POSITION_UNAVAILABLE` sets `gps: "off"`, shows "GPS off" in the strip, and opens the sheet with the copy telling the user to enable Location Services. Only `PERMISSION_DENIED` (code 1) means off.
**Fix:**
```ts
(err) => {
  pending = false;
  if (s.mode !== "gps") return;
  if (err.code !== 1) { deps.onState?.(s); return; } // keep "locating"/"live", retry on next foreground
  ...
}
```

### WR-09: systemd unit has minimal sandboxing; the service can write its own code and served assets

**File:** `deploy/shinigami.service:6-18`
**Issue:** Only `NoNewPrivileges` and `PrivateTmp` are set. The process can write to all of `/opt/shinigami` (its own Python code, `.venv`, `web/dist`, deploy scripts; see CR-01), so a compromise persists across restarts and can plant a malicious PWA bundle. The service only needs to write `/var/lib/shinigami`.
**Fix:** Add:
```
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/shinigami
PrivateDevices=true
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
CapabilityBoundingSet=
LockPersonality=true
```

## Info

### IN-01: Suggest cache keys share the geocode namespace

**File:** `server/shinigami/api/suggest.py:28, 88`, `server/shinigami/api/geocode.py:67`
**Issue:** A Search query whose normalised text begins with `suggest|` returns cached Photon results from `/api/geocode`. This is harmless but sloppy.
**Fix:** Use a separate table, or prefix geocode keys too (`geocode|`).

### IN-02: Client timeouts are shorter than the server's worst case

**File:** `web/src/location-search.ts:9, 29`, `server/shinigami/api/suggest.py:24-26`, `server/shinigami/api/geocode.py:19-21`
**Issue:** Suggest can wait up to 1 s for a slot plus `timeout=4.0`. httpx applies that timeout per phase (connect/read/write/pool), not as a total, so the server's worst case is well above the client's 4 s abort. The client then shows "Search failed" while the server still completes the call and caches the result. Geocode has the same issue: 3 s + 4 s per phase vs a 9 s client timeout.
**Fix:** Wrap the upstream call in `asyncio.timeout(TIMEOUT_S)` for a hard total, and set client timeouts above `MAX_WAIT_S + TIMEOUT_S`.

### IN-03: Version string hard-coded in three places; footer label is misleading

**File:** `web/src/app.ts:104`, `server/shinigami/settings.py:20`, `pyproject.toml`
**Issue:** `v0.1.0` is duplicated. The footer prints "server HH:MM" using the phone's local timezone on the offset-corrected clock.
**Fix:** Inject the version via Vite `define` from `package.json`, or read it from `/api/health`.

### IN-04: Committed example reveals the home suburb and gym

**File:** `deploy/places.example.toml:9, 29`
**Issue:** "Home (Bulleen)" and "Hammers Gym Nunawading" are committed. These are not coordinates, but they are personal location/routine data in git.
**Fix:** Use generic example labels (`Home`, `Gym`) in the committed example.

### IN-05: verify.sh checks that can false-pass or false-fail

**File:** `deploy/verify.sh:50-51, 124-125, 79-86`
**Issue:**
- `profile_p95` counts failed or timed-out curls by their `time_total`, so errors can look fast.
- `tailnet_ip` fails on an IPv6 tailnet address (`fd7a:115c:a1e0::/48`).
- `verify --local` (run by every `deploy.sh`) SIGKILLs the freshly deployed production service on every deploy.
**Fix:** Use `-f` and count non-200s as failures. Accept the Tailscale IPv6 ULA. Gate the SIGKILL test behind a `--chaos` flag.

### IN-06: npm/uv caches land inside the repo checkout

**File:** `deploy/deploy.sh:21`
**Issue:** `HOME=/opt/shinigami` makes npm write `/opt/shinigami/.npm` (and other dotfiles) into the git working tree. These paths are not in `.gitignore`.
**Fix:** Set `HOME=/var/lib/shinigami` or `npm_config_cache=/var/cache/shinigami-npm`.

### IN-07: SW update swaps caches under a running page

**File:** `web/src/sw.ts:9-11`
**Issue:** `skipWaiting()` plus `clientsClaim()` plus `cleanupOutdatedCaches()` delete the old precache while an old page is still open. Today the bundle is a single entry, so this works, but any lazy-loaded chunk or font requested after an update will 404 offline.
**Fix:** Prompt or reload on `controllerchange`, or drop `skipWaiting` and use the `registerSW` `onNeedRefresh` flow.

---

_Reviewed: 2026-11-06T01:36:11Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Fixes applied (2026-11-06, approved by David: criticals + privacy warning)

| Finding | Status | Commit |
|---------|--------|--------|
| CR-01 service user to root via deploy | Fixed: root-owned checkout/.git/deploy, service owns only build outputs, no safe.directory override; verify `repo_root_owned` | 3667b8b |
| CR-02 home coords recoverable from sun times | Fixed: sun computed for the 0.1° snap_cell, times rounded to the minute; tests prove cell-level output | 80afc51 |
| WR-01 search history kept forever | Fixed: 30-day TTL, 500-row cap, in-memory cache pruned | 835cdee |
| WR-09 no systemd sandbox | Fixed: ProtectSystem=strict and related hardening; verify `sandbox_protect_system` | 3667b8b |
| WR-02..WR-08, IN-01..IN-07 | Deferred to Phase 2 backlog (robustness, not Phase 1 promises) | - |

Deployed and verified: `verify.sh --local` `{"pass":17,"fail":0,"skip":0,"p95_ms":2}`; `--remote` 13/0/0.
