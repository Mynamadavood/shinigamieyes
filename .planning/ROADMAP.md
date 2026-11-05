# Roadmap: Shinigami Eyes

## Overview

v1 = City mode: a private, Tailscale-only iPhone PWA that profiles Melbourne around David with named, ticking items. Each phase is a vertical, end-to-end usable slice. Phase 1 gets a real (flat) HUD onto the phone with cached-first loading and two no-key layers; every later phase adds a complete capability on top, so stopping after any phase leaves a working app.

## Phases

- [ ] **Phase 1: Foundation and Flat HUD Slice** - Installable Tailscale-only PWA showing a cached-first, ticking list of sun and UV items at your location
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
**Plans**: TBD
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
**Plans**: TBD
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
| 1. Foundation and Flat HUD Slice | 0/0 | Not started | - |
| 2. 3D Map, Hero and Surveillance | 0/0 | Not started | - |
| 3. Transit | 0/0 | Not started | - |
| 4. Environment, Grid/Water and Ranking | 0/0 | Not started | - |
| 5. Hazards, Sky and Bay | 0/0 | Not started | - |
| 6. Context and Coverage | 0/0 | Not started | - |
| 7. Prewarm, Polish and Hardening | 0/0 | Not started | - |
