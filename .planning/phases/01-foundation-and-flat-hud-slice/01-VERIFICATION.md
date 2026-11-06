---
phase: 01-foundation-and-flat-hud-slice
verified: 2026-11-06T12:10:00Z
status: passed
score: 5/5 roadmap success criteria verified (11/11 requirements satisfied)
overrides_applied: 1
overrides:
  - must_have: "Stale/expired rows dim/pulse as specified (on-device visual confirmation, Gate 2 item 12)"
    reason: "Behaviour is implemented and wired (freshness.ts isStale/ageTag -> model.selectVisible -> next-list classList stale/expiring -> app.css .row.stale opacity 0.55 / .row.expiring pulse) and covered by freshness.test.ts and next-list.test.ts. Only the on-device look is unconfirmed, because it needs 30+ min with Tailscale off. David explicitly deferred it when he signed Gate 2 GO (11/12)."
    accepted_by: "David"
    accepted_at: "2026-11-06T00:00:00Z"
---

# Phase 1: Foundation and Flat HUD Slice Verification Report

**Phase Goal:** David can install the app from his iPhone over Tailscale and see a cached-first, ranked list of named items with live countdowns for his location
**Mode:** mvp
**Verified:** 2026-11-06
**Status:** passed (one item David deferred on the device, recorded as an override)
**Re-verification:** No, this is the first verification

## User Flow Coverage (MVP)

| Step | Expected | Evidence | Status |
|------|----------|----------|--------|
| Open fixed ts.net address over Tailscale | Valid TLS, tailnet-only | lxc-setup.sh `tailscale serve --bg --https=443 http://127.0.0.1:8000`; service binds 127.0.0.1; verify.sh `funnel_off`; Gate 1 items 1, 6 signed | VERIFIED |
| Install to home screen, full-screen | standalone, safe-area | pwa-manifest.ts `display: standalone`; index.html viewport-fit=cover, apple-mobile-web-app-capable, black-translucent, apple-touch-icon; app.css `env(safe-area-inset-*)`; Gate 1 items 3 and 4 signed | VERIFIED |
| See cached profile at once | < 1 s from IndexedDB, then live | app.ts awaits `loadProfile()` and renders before `refetch()`/`openStream()`; Gate 2 item 1 signed | VERIFIED |
| Named items with live countdowns, sorted | golden/blue hour + UV, 1 Hz, absolute targets | sun.py, uv_window.py, arpansa.py produce Items with `target_ts`; model.selectVisible sorts by target (CONTEXT: a simple urgency sort is enough until Phase 4); ticker.ts runs on the 1 s boundary and on visibility; Gate 2 items 2 and 3 signed | VERIFIED |
| For his location | GPS or pin/search | location.ts getCurrentPosition with 100 m hysteresis; /api/places ids only; /api/geocode proxy; Gate 2 items 6-9 signed | VERIFIED |

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Opens the fixed `*.ts.net` HTTPS address, installs to the home screen, launches full-screen and safe-area aware; not reachable from the public internet | VERIFIED | Code: manifest, iOS meta tags, safe-area CSS, loopback bind in shinigami.service, serve only (no funnel). Device: Gate 1 items 1-6 signed by David on 2026-11-05. verify.sh --remote 13/0/0 |
| 2 | Last profile shows in under 1 s from device cache, and live items fill in without a reload | VERIFIED | app.ts boot(): IDB read, then render, then ticker, then fetchProfile (4 s abort), then openStream. stream.py subscribes before sending hello, sends a snapshot of the layers, then live layer events filtered by cell. net.applyLayer replaces layers in place, guarded by rev. Gate 2 item 1 signed |
| 3 | Golden/blue hour and UV countdowns tick every second, stay correct after backgrounding, dim when expired or stale, and show data freshness | VERIFIED (dim look on device: override) | Countdown = target_ts − (Date.now()+offset) (model.ts, clock.ts); ticker also fires on visibilitychange/pageshow/focus; ageTag text appears on every row; `.row.stale` and `.row.expiring` CSS are toggled by next-list. Gate 2 items 2 and 3 signed. Rows over 1 h show `Hh Mm` per user decision D-04. On-device dim look deferred by David (override) |
| 4 | With the server unreachable, the app shows the last cached profile marked "OFF-GRID" instead of hanging | VERIFIED | fetchProfile has a 4 s AbortController plus a race; the catch calls conn.markOffgrid() and keeps the profile; OffgridBanner subscribes to conn. Gate 2 items 4 and 5 signed |
| 5 | Phone GPS or a manual pin when GPS is denied; the service survives a Proxmox reboot and restarts on failure | VERIFIED | location.ts (gps, pin and search modes, onGpsOff opens the sheet); Restart=always; onboot 1 in proxmox-create-lxc.sh; verify.sh restart-after-SIGKILL check. Gate 1 (pct reboot) and Gate 2 (full host reboot, GPS denied, Monash pin) signed |

Plan-level must-haves (01-01..01-11) were checked as well. Every one maps onto the truths above and holds in code. Notable checks: the profile path makes no outbound calls (assemble.py only reads the store; request_cell is fire-and-forget); there is a type allow-list for item kinds (schema.py); the coordinate no-logging test passes; places and keys exist only as placeholders (`places.toml` and `.env` are gitignored).

**Score:** 5/5 truths verified (1 via a user-accepted override on the visual-only part of SC3)

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| server/shinigami/main.py | VERIFIED | create_app, CSP/cache middleware, routers, then StaticFiles last; lifespan starts Runtime |
| server/shinigami/schema.py, providers/base.py | VERIFIED | Item/Layer/Profile contract, Provider base |
| server/shinigami/providers/sun.py | VERIFIED | astral golden/blue hour for the 0.1° cell, 36 h horizon, rounded to the minute (CR-02 fix) |
| server/shinigami/providers/arpansa.py, uv_window.py | VERIFIED | Live UV index plus clear-sky UV≥3 window, estimate fallback, stale handling |
| server/shinigami/store.py, runtime.py | VERIFIED | SQLite WAL persistence, polled loops, singleflight request_cell, EventBus publish |
| server/shinigami/api/{profile,stream,places,geocode,suggest}.py | VERIFIED | All wired in main.py |
| web/src/{app,model,freshness,ticker,format,clock,net,offgrid,store,location,location-search}.ts | VERIFIED | Substantive and wired from main.ts → boot() |
| web/src/ui/{next-list,offgrid-banner,location-strip,location-sheet,shell}.ts | VERIFIED | Built from DOM with textContent only; state machine for expiring/stale/urgent |
| web/pwa-manifest.ts, web/src/sw.ts, web/index.html | VERIFIED | Installable shell |
| deploy/{proxmox-create-lxc.sh,lxc-setup.sh,deploy.sh,shinigami.service,verify.sh,CHECKLIST.md,UAT-DEVICE.md} | VERIFIED | deploy.sh runs `git pull --ff-only` … `verify.sh --local`; both gates signed |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| main.ts | app.boot | import + call | WIRED |
| app.ts | store.loadProfile | awaited before refetch/openStream | WIRED |
| app.ts ticker | model.selectVisible → NextList.update | startTicker callback | WIRED |
| model.ts | freshness.ageTag/isStale | RowVM fields → classList toggles | WIRED |
| net.openStream | /api/stream | EventSource hello/layer/ping + 40 s watchdog | WIRED |
| stream.py | EventBus.subscribe | subscribed before hello | WIRED |
| assemble.py | runtime.request_cell | pending/stale on-demand layers | WIRED |
| main.py | Runtime start/stop | lifespan | WIRED |
| profile.py resolve_location | app.state.places | place=id → server-side coords; response lat/lon null | WIRED |
| location-sheet | /api/geocode via searchAddress | Enter → results → useSearch | WIRED |
| deploy.sh | verify.sh --local | after restart | WIRED |
| shinigami.service | /etc/shinigami/.env | EnvironmentFile | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real Data | Status |
|----------|------|--------|-----------|--------|
| NextList rows | profile.layers | IDB cache → /api/profile → SSE layer events | Yes: sun is computed live; UV comes from ARPANSA/Open-Meteo through the SQLite store (Gate 2: UV rows seen ticking on device) | FLOWING |
| OffgridBanner | conn state + lastSync | fetch/SSE outcomes, IDB sync:last | Yes | FLOWING |
| LocationStrip/Sheet | location state, /api/places | GPS, IDB, server | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend tests | `uv run pytest -q` | 98 passed | PASS |
| Frontend tests | `npx vitest run` | 13 files, 111 passed | PASS |
| /api/profile returns named sun items with future targets | TestClient, default CBD | 200; sun fresh: Blue hour starts +23342 s, Golden hour starts, …; uv layers `pending` on a cold local store (expected) | PASS |
| Profile latency in-process | 20 × TestClient GET | p95 45 ms on the Windows dev PC (host: 2 ms, per verify.sh --local) | PASS |
| lat without lon rejected | GET ?lat=-37.8 | 422 | PASS |
| Static root has strict CSP | GET / | 200, `default-src 'self'` | PASS |
| Host smoke (from orchestrator / UAT-DEVICE.md) | verify.sh --local / --remote | 17/0/0 (p95 2 ms) / 13/0/0 | PASS (recorded evidence) |

### Probe Execution

None declared. The phase uses `deploy/verify.sh`, which is a host-only script (it needs the LXC and the tailnet), so it was not re-run here. The recorded results above come from David's runs on CT 110.

### Requirements Coverage

| Requirement | Plans | Status | Evidence |
|-------------|-------|--------|----------|
| PLAT-01 | 01-01, 01-02, 01-03, 01-11 | SATISFIED | serve-only, loopback bind, funnel_off, Gate 1 Tailscale-off test |
| PLAT-02 | 01-01, 01-03, 01-11 | SATISFIED | manifest + iOS meta + safe-area; Gate 1 install/full-screen |
| PLAT-03 | 01-08, 01-11 | SATISFIED | IDB-first boot + SSE fill-in; Gate 2 item 1 |
| PLAT-04 | 01-04, 01-06, 01-11 | SATISFIED | read-only assemble; test_profile_readonly; host p95 2 ms |
| PLAT-05 | 01-08, 01-11 | SATISFIED | 4 s timeout → OFF-GRID banner; Gate 2 items 4-5 |
| PLAT-06 | 01-09, 01-10, 01-11 | SATISFIED | GPS + pin + search; Gate 2 items 6-9 |
| PLAT-07 | 01-02, 01-03, 01-11 | SATISFIED | Restart=always, onboot=1; reboot tests in both gates |
| HUD-01 | 01-05, 01-07, 01-11 | SATISFIED | absolute-target countdown, 1 Hz boundary ticker, resume tick; Gate 2 items 2-3. "UV index now" is a reading row (target_ts null, shows "6.9 · High") by plan design; the UV countdown requirement is met by the UV protection rows |
| HUD-02 | 01-07, 01-11 | SATISFIED (device look: override) | freshness tag on every row; stale/expiring classes + CSS; tests |
| ENV-04 | 01-06, 01-11 | SATISFIED | uv_now + uv_window providers |
| ENV-07 | 01-04, 01-11 | SATISFIED | sun.py golden/blue hour |

No orphaned requirements: REQUIREMENTS.md maps exactly these 11 IDs to Phase 1, and every one is claimed by at least one plan.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (all phase source) | - | TBD/FIXME/XXX/TODO/placeholder scan | - | None found |
| web/src/app.ts | boot | First paint awaits IndexedDB with no timeout (review WR-06, deferred) | Warning | If IDB hangs, the < 1 s first paint is not guaranteed. It did not show up on device |
| web/src/app.ts | refetch catch | Every HTTP error counts as offgrid; a stale saved pin can loop on 422 (WR-03, deferred) | Warning | Edge case. Not hit in UAT |
| server/shinigami/providers/uv_window.py | fetch_cell | Estimate written only when no row exists; no backoff for failing on-demand fetches (WR-05, deferred) | Warning | After a multi-day Open-Meteo outage the UV window can go empty (stale) |
| web/src/ui/next-list.ts / app.ts | - | Loading skeleton can persist offline; no empty-state switch once all rows expire (WR-07, deferred) | Warning | Cosmetic edge case |

All of these are review findings that David explicitly deferred to the Phase 2 backlog (01-REVIEW.md "Fixes applied"). They are robustness gaps and do not stop the goal. The criticals (CR-01, CR-02) and WR-01/WR-09 were fixed and verified in code: sun times come from the snapped cell and are rounded to the minute, and the service unit sets ProtectSystem=strict.

### Human Verification Required

None outstanding. Every device-only check was signed by David in deploy/UAT-DEVICE.md (Gate 1: 7/7 GO; Gate 2: 11/12 GO). The one remaining item, the on-device stale/expired dim look, was explicitly deferred by David and is recorded as an override. It is not a blocker: the behaviour is implemented, wired and unit-tested, so only how it looks on the phone is unconfirmed.

### Gaps Summary

No blocking gaps. The phase goal holds in the codebase: the installable Tailscale-only PWA boots from IndexedDB, renders a list of named sun and UV items sorted by soonest target, with absolute-time countdowns, live SSE fill-in, OFF-GRID fallback, and GPS/pin/search location. It runs as an LXC service that restarts and survives reboots. David's signed device gates back this up. Four deferred review warnings (WR-03, WR-05, WR-06, WR-07) should be picked up in the Phase 2 backlog as planned.

---

_Verified: 2026-11-06_
_Verifier: Claude (gsd-verifier)_
