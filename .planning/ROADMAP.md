# Roadmap: Shinigami Eyes

## Overview

v1 = City mode: a private, Tailscale-only iPhone PWA that profiles Melbourne around David with named, ticking items. Each phase is a vertical, end-to-end usable slice. Phase 1 gets a real (flat) HUD onto the phone with cached-first loading and two no-key layers; every later phase adds a complete capability on top, so stopping after any phase leaves a working app.

## Phases

- [x] **Phase 1: Foundation and Flat HUD Slice** - Installable Tailscale-only PWA showing a cached-first, ticking list of sun and UV items at your location (completed 2026-11-06)
- [ ] **Phase 2: 3D Map, Hero and Surveillance** - Dark tilted 3D map with floating tags, info cards, hero activation, and CCTV/road-camera layer
- [ ] **Phase 3: Transit** - Nearest PTV stops, live departures, approaching vehicles and disruptions
- [ ] **Phase 4: Environment, Grid/Water and Ranking** - Weather/rain, air, fire danger, pollen, grid and water, plus the ranked "next" strip, chips and layer toggles
- [ ] **Phase 5: Hazards, Sky and Bay** - Emergency incidents with pre-empting banner, planes, ISS/satellite passes and ships
- [ ] **Phase 6: Context and Coverage** - Heritage/Wikipedia, towers, City of Melbourne CBD data, listen-in link-outs, out-of-coverage handling
- [ ] **Phase 7: Prewarm, Polish and Hardening** - Shortcut prewarm, glitch effects, Sources screen, soak-tested and backed up

## Phase Details

### Phase 1: Foundation and Flat HUD Slice

**Goal**: David can install the app from his iPhone over Tailscale and see a cached-first, ranked list of named items with live countdowns for his location
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: PLAT-01, PLAT-02, PLAT-03, PLAT-04, PLAT-05, PLAT-06, PLAT-07, HUD-01, HUD-02, ENV-04, ENV-07
**Success Criteria** (what must be TRUE):

  1. David opens the fixed `*.ts.net` HTTPS address on his iPhone, adds it to the home screen, and it launches full-screen and safe-area aware; the address is unreachable from the public internet
  2. On open, the last profile appears in under 1 s from device cache, and live items fill in without a reload
  3. David sees golden hour/blue hour and UV-protection countdowns that tick every second, stay correct after backgrounding, and dim when expired or stale, each showing data freshness
  4. With the server unreachable, the app shows the last cached profile marked "OFF-GRID" instead of hanging
  5. David can use phone GPS or drop a manual pin when GPS is denied, and the service survives a Proxmox reboot and restarts on failure

**Plans:** 11/11 plans complete

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Skeleton: package audit checkpoint, FastAPI health + SSE probe, installable Vite PWA shell (wave 1)
- [x] 01-02-PLAN.md — Skeleton: deploy kit (pct create, lxc-setup, deploy.sh, systemd unit, verify.sh, checklists) (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-03-PLAN.md — Skeleton: provision the shinigami LXC and iPhone go/no-go Gate 1 (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-04-PLAN.md — Item/Layer/Profile contract, golden/blue hour provider, read-only /api/profile (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-05-PLAN.md — Countdown HUD: formatter/clock/ticker, styled next-list, tokens and fonts (wave 4)
- [x] 01-06-PLAN.md — UV slice: SQLite store, runtime/event bus, ARPANSA UV now, Open-Meteo UV protection window (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-07-PLAN.md — Freshness, stale dimming, urgent red, expiry pulse-dim-drop, empty states (wave 5)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 01-08-PLAN.md — Cached-first open (IndexedDB), SSE live fill-in, OFF-GRID banner (wave 6)

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 01-09-PLAN.md — GPS with 100 m hysteresis, saved places, Set Location sheet (wave 7)

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 01-10-PLAN.md — Address search via server-side Nominatim proxy (wave 8)

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 01-11-PLAN.md — Deploy and iPhone phase acceptance Gate 2 incl. host reboot (wave 9)

**UI hint**: yes

### Phase 2: 3D Map, Hero and Surveillance

**Goal**: David sees his surroundings as a dark, tilted Watch Dogs-style 3D map with named tags and cards, opened by a red-eyes activation, with nearby cameras shown
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: HUD-03, HUD-04, HUD-05, HUD-10, SURV-01, SURV-02
**Success Criteria** (what must be TRUE):

  1. On cold open the blood-red Shinigami eyes play for 1.5 s or less over real loading, are skippable, and never delay data
  2. The main view is a desaturated-blue tilted map with extruded buildings, with tiles, fonts and sprites served from David's own server (no third-party requests)
  3. Items appear as floating icon + label tags, and tapping one opens an info card with its details
  4. David sees mapped CCTV within about 150 m labelled "mapped, not exhaustive", and fixed speed/red-light cameras as static info only
  5. The map stays smooth on the real iPhone with tags capped to a budget

**Plans:** 8/14 plans executed

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Human gate: approve maplibre-gl/workbox/pmtiles/osmium, generate JetBrains Mono glyphs, install once (wave 1)
- [x] 02-02-PLAN.md — Robustness: IDB first-paint timeout, location-keyed profile, derived list state, GPS error codes, HttpError, GPS accuracy (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-03-PLAN.md — HUD frame: full-screen shell over grid, corner readouts, pull-up drawer, cameras kept out of rows (wave 2)
- [x] 02-04-PLAN.md — Server-decoded PMTiles /tiles endpoint, tile meta/health, pmtiles CLI + extract scripts, verify probes (wave 2)
- [x] 02-05-PLAN.md — OSM camera job (CCTV + enforcement relations, privacy filters) + weekly sandboxed timer (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-06-PLAN.md — CT provisioning: disk check, extract dry-run + extract, first camera run, Gate 3 checklist (wave 3)
- [x] 02-07-PLAN.md — Camera providers (150 m / 1 km), saved-place privacy, camera count readout (wave 3)
- [x] 02-08-PLAN.md — 3D map: token-driven Protomaps style, lazy MapLibre, self-hosted glyphs, offline grid hint (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 02-09-PLAN.md — Figure marker, accuracy ring, pin marker, follow/recenter, icon sprite (wave 4)
- [ ] 02-12-PLAN.md — Red-eyes hero on cold open, <= 1.5 s, skippable, reduced motion (wave 4)
- [ ] 02-13-PLAN.md — SW tile/glyph caches for offline + HUD-10 CSP/verify guards (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 02-10-PLAN.md — Camera tags (budget 20/60, red within 30 m) and info cards with leader lines (wave 5)

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 02-11-PLAN.md — Long-press pin, YOUR PIN / YOU cards, tapped-building red highlight (wave 6)

**Wave 7** *(blocked on Wave 6 completion)*

- [ ] 02-14-PLAN.md — Redeploy, remote verify and iPhone Gate 3 phase acceptance (wave 7)

**UI hint**: yes

### Phase 3: Transit

**Goal**: David can see how to get moving from where he stands: nearby stops, live departures, approaching vehicles and disruptions
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: TRAN-01, TRAN-02, TRAN-03, TRAN-04
**Success Criteria** (what must be TRUE):

  1. David sees nearest train, tram and bus stops with distance and walk time
  2. Next departures show live countdowns, each labelled "live" or "scheduled"
  3. Vehicles approaching the nearest stops are visible on the map
  4. Current disruptions affecting nearby routes are listed

**Plans**: TBD
**UI hint**: yes

### Phase 4: Environment, Grid/Water and Ranking

**Goal**: David gets a readable picture of conditions (rain, air, fire danger, pollen, grid, water) with the most urgent items surfaced first and layers he can toggle
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: ENV-01, ENV-02, ENV-03, ENV-05, ENV-06, CTX-04, CTX-05, HUD-06, HUD-07, HUD-08
**Success Criteria** (what must be TRUE):

  1. David sees current weather and a "rain in N min" or "rain ends in N min" countdown, with a radar overlay (or link-out)
  2. Air quality, fire danger, pollen/asthma risk, and grid mix, price countdown, solar share and water storage appear, slow-changing ones as colour-banded chips that escalate only on thresholds
  3. A "next" strip shows the 3-4 most urgent items ranked by urgency, relevance and severity, and map tags stay within budget
  4. David can toggle layers on and off and the choice persists after relaunch

**Plans**: TBD
**UI hint**: yes

### Phase 5: Hazards, Sky and Bay

**Goal**: David is warned of nearby emergencies and can see what is overhead and in the bay
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: HAZ-01, HAZ-02, HAZ-03, SKY-01, SKY-02, SKY-03
**Success Criteria** (what must be TRUE):

  1. Nearby fires, floods and incidents show with distance and direction
  2. A nearby warning raises a banner that pre-empts everything else on screen
  3. When the hazard feed is down or empty, the app says so with the feed age, never "all clear"
  4. David sees planes overhead (callsign, altitude, type), ISS/satellite pass countdowns, and Port Phillip ships (name, type, last seen)

**Plans**: TBD
**UI hint**: yes

### Phase 6: Context and Coverage

**Goal**: David can learn what he is looking at (buildings, towers, CBD city data) and open listen-in links, with clear handling outside coverage
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: CTX-01, CTX-02, CTX-03, CTX-06, HUD-12
**Success Criteria** (what must be TRUE):

  1. Tapping a nearby building shows its heritage listing and/or Wikipedia summary
  2. Nearby licensed transmitter sites show with their carriers/licensees
  3. In the CBD, pedestrian counts, parking availability, street trees and development activity appear
  4. David can open Broadcastify CFA/FRV and KiwiSDR links (link-out only)
  5. Outside the CBD, City of Melbourne layers read "out of coverage" and not broken

**Plans**: TBD
**UI hint**: yes

### Phase 7: Prewarm, Polish and Hardening

**Goal**: The app is ready before David opens it, feels like the Shinigami eyes, and is trustworthy about its sources
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: PLAT-08, HUD-09, HUD-11
**Success Criteria** (what must be TRUE):

  1. An iOS Shortcut call to the prewarm endpoint means the profile for that place is already cached when David opens the app
  2. Glitch effects fire only on state changes, never over resting text, and red is reserved for highlights/threats
  3. The Sources screen lists each feed's status, last update time and attribution
  4. A 20-minute session on the phone runs without crashing or losing the map

**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation and Flat HUD Slice | 11/11 | Complete    | 2026-11-06 |
| 2. 3D Map, Hero and Surveillance | 8/14 | In Progress|  |
| 3. Transit | 0/0 | Not started | - |
| 4. Environment, Grid/Water and Ranking | 0/0 | Not started | - |
| 5. Hazards, Sky and Bay | 0/0 | Not started | - |
| 6. Context and Coverage | 0/0 | Not started | - |
| 7. Prewarm, Polish and Hardening | 0/0 | Not started | - |
