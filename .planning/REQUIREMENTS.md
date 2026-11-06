# Requirements: Shinigami Eyes

**Defined:** 2026-11-05
**Core Value:** An instant, glanceable HUD — open the app and a cached profile of where you are is on screen in under a second, every item named with a ticking countdown; live data fills in after.

## v1 Requirements

Milestone v1 = City mode (no hardware). Each maps to one roadmap phase.

### Platform (PLAT)

- [x] **PLAT-01**: David can open the app on his iPhone over Tailscale at a fixed HTTPS `*.ts.net` address; nothing is reachable from the public internet
- [x] **PLAT-02**: David can install the app to the iPhone home screen and it launches full-screen (standalone, safe-area aware)
- [x] **PLAT-03**: When David opens the app, the last profile for his location is on screen in under 1 s (from device cache, then server cache), and live data fills in afterwards without a reload
- [x] **PLAT-04**: The backend answers the profile request only from local caches/stores (never waits on an upstream API); p95 `/profile` ≤ 300 ms on the Proxmox host
- [x] **PLAT-05**: When the server is unreachable (off-tailnet, offline), the app shows the last cached profile with an explicit "OFF-GRID" state instead of hanging
- [x] **PLAT-06**: The app uses the phone's GPS location, and David can drop a manual pin when GPS is unavailable or denied
- [x] **PLAT-07**: The backend runs as a service on Proxmox (unprivileged LXC) that restarts on failure and survives host reboots
- [ ] **PLAT-08**: An iOS Shortcut can call a prewarm endpoint (e.g. on arrival somewhere) so the profile for that location is already cached when David opens the app

### HUD (HUD)

- [x] **HUD-01**: Every item on screen shows a name and a live countdown that ticks every second, computed from an absolute target time (stays correct on cached data and after the app was backgrounded)
- [x] **HUD-02**: Expired or stale items are visibly dimmed or removed, and each item shows how fresh its data is
- [ ] **HUD-03**: On cold open, a hero "activation" screen shows the Shinigami eyes in blood red on black (≤1.5 s, skippable, plays over real loading, never delays data)
- [ ] **HUD-04**: The main view is a dark, tilted 3D map of David's surroundings in the Watch Dogs NetHack style (desaturated blue world, thin frame, extruded buildings)
- [ ] **HUD-05**: Items appear as floating icon + label tags on the map; tapping one opens an info card with its details
- [ ] **HUD-06**: A "next" strip shows the 3–4 most urgent items, ranked by urgency × relevance × severity; map tags are capped to a budget so the screen stays readable
- [ ] **HUD-07**: Slow-changing conditions (air, UV, fire danger, pollen) appear as colour-banded chips that escalate only when crossing a threshold
- [ ] **HUD-08**: David can toggle individual layers on and off, and the choice persists
- [ ] **HUD-09**: Glitch effects fire only on state changes (never over resting text), and red is reserved for highlights/threats
- [ ] **HUD-10**: Map tiles, fonts and sprites are served from David's own server, so no third party learns his location
- [ ] **HUD-11**: David can open a Sources screen showing each feed's status, last update time and attribution
- [ ] **HUD-12**: Layers outside their coverage (e.g. City of Melbourne data outside the CBD) show "out of coverage" rather than looking broken

### Transit (TRAN)

- [ ] **TRAN-01**: David can see his nearest PTV stops (train, tram, bus) with distance and walk time
- [ ] **TRAN-02**: David can see the next departures from those stops with live countdowns, labelled "live" vs "scheduled"
- [ ] **TRAN-03**: David can see vehicles approaching his nearest stops on the map
- [ ] **TRAN-04**: David can see current disruptions/service alerts affecting nearby routes

### Environment (ENV)

- [ ] **ENV-01**: David can see current weather and a "rain in N min" / "rain ends in N min" countdown
- [ ] **ENV-02**: David can see a rain radar overlay on the map (or a link-out if the radar source proves too costly)
- [ ] **ENV-03**: David can see current air quality from the nearest EPA Victoria monitoring site
- [x] **ENV-04**: David can see the current UV index and a countdown to when UV protection is no longer needed
- [ ] **ENV-05**: David can see today's fire danger rating for his district
- [ ] **ENV-06**: David can see pollen level and thunderstorm asthma risk (best-effort source; falls back to VicEmergency thunderstorm-asthma warnings)
- [x] **ENV-07**: David can see golden hour and blue hour countdowns for his location

### Hazards (HAZ)

- [ ] **HAZ-01**: David can see fires, floods and other emergency incidents near him, with distance and direction
- [ ] **HAZ-02**: A nearby warning raises a hazard banner that pre-empts everything else on screen
- [ ] **HAZ-03**: When the hazard feed is down or empty, the app says so with the feed age — never "all clear"

### Surveillance (SURV)

- [ ] **SURV-01**: David can see known CCTV cameras within ~150 m (from OpenStreetMap), labelled "mapped, not exhaustive"
- [ ] **SURV-02**: David can see fixed speed and red-light cameras nearby, as static information only (no proactive driving alerts)

### Sky & Bay (SKY)

- [ ] **SKY-01**: David can see planes currently overhead with callsign, altitude and type
- [ ] **SKY-02**: David can see countdowns to the next visible ISS and bright satellite passes
- [ ] **SKY-03**: David can see ships in Port Phillip Bay with name, type and "last seen"

### Context (CTX)

- [ ] **CTX-01**: David can tap a nearby building to see its heritage listing and/or Wikipedia summary
- [ ] **CTX-02**: David can see licensed radio transmitter sites (towers) near him with their carriers/licensees
- [ ] **CTX-03**: In the CBD, David can see City of Melbourne pedestrian counts, parking bay availability, street trees (species, useful life) and development activity nearby
- [ ] **CTX-04**: David can see Victoria's live grid generation mix, spot price (with countdown to the next interval) and rooftop solar share
- [ ] **CTX-05**: David can see Melbourne Water storage levels
- [ ] **CTX-06**: David can open listen-in links for nearby CFA/FRV dispatch (Broadcastify) and KiwiSDR receivers (link-out only, no proxying or recording)

## v2 Requirements

Deferred. Tracked but not in the current roadmap.

### Integration

- **INT-01**: Shinigami emits signal events through an outbox so SPENCER can decide whether to interrupt David
- **INT-02**: Shinigami reads gym/sleep/streak stats from LifeOS for the self-profile card
- **INT-03**: Shinigami writes events (gym arrival, logbook drives) back to LifeOS

### Personal layers (milestone 2)

- **PERS-01**: Self-profile card (DAVID, 20, Chem Eng — exams, gym streak, sleep, last call to Mum, server health, next tram)
- **PERS-02**: Gym mode at Hammers Gym Nunawading (program, last numbers, overload target, PRs, streak countdown)
- **PERS-03**: Uni mode (next class, room, walk time, Moodle deadlines, exam countdowns)
- **PERS-04**: Learner-driver logbook (hours toward 120 incl. 20 night, earliest P-test date)
- **PERS-05**: Photography (aurora alerts, cloud cover, map of past shots)
- **PERS-06**: Home lab (Proxmox node/VM health, SPENCER uptime, Tailscale peers)
- **PERS-07**: Downtime and money (optional) layers
- **PERS-08**: EPA industrial licence layer (engineer's lens)

### Later milestones

- **HUD-AR**: AR live-camera NetHack overlay
- **RADIO**: Own ADS-B/AIS receivers, OpenWebRX+, dispatch transcription (whisper.cpp), Meteor-M, radiosondes
- **HOUSE**: Home Assistant + ESP32/ESPresense house mode
- **HAM**: Foundation licence, APRS, WICEN

## Out of Scope

| Feature | Reason |
|---------|--------|
| Face recognition, number-plate lookups | Identifies/tracks people — hard rule (Surveillance Devices Act) |
| Logging other people's Wi-Fi/Bluetooth devices | Tracks people; only opted-in household phones ever (house mode) |
| Any person-level map tag | Hard rule — item kinds are allow-listed (place, infrastructure, transit vehicle, aircraft, vessel, self) |
| Police decryption, pager decoding, phone interception | Illegal; receive-only unencrypted only |
| Proxying/recording/rebroadcasting audio or data | Everything stays private; listen-in is link-out only |
| Radio transmitting | Not until Foundation licence held |
| Personal/financial data to any cloud | Never leaves Proxmox |
| Push notifications in v1 | Payloads transit Apple's push service; SPENCER owns interruption later |
| Trip planner, long-range forecasts, history playback | Not the HUD's job; scope control |
| Native iOS app / background location | PWA + iOS Shortcuts instead |
| Multi-user | Private, for David alone |

## Traceability

Set during roadmap creation (2026-11-05).

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLAT-01 | Phase 1 | Complete |
| PLAT-02 | Phase 1 | Complete |
| PLAT-03 | Phase 1 | Complete |
| PLAT-04 | Phase 1 | Complete |
| PLAT-05 | Phase 1 | Complete |
| PLAT-06 | Phase 1 | Complete |
| PLAT-07 | Phase 1 | Complete |
| HUD-01 | Phase 1 | Complete |
| HUD-02 | Phase 1 | Complete |
| ENV-04 | Phase 1 | Complete |
| ENV-07 | Phase 1 | Complete |
| HUD-03 | Phase 2 | Pending |
| HUD-04 | Phase 2 | Pending |
| HUD-05 | Phase 2 | Pending |
| HUD-10 | Phase 2 | Pending |
| SURV-01 | Phase 2 | Pending |
| SURV-02 | Phase 2 | Pending |
| TRAN-01 | Phase 3 | Pending |
| TRAN-02 | Phase 3 | Pending |
| TRAN-03 | Phase 3 | Pending |
| TRAN-04 | Phase 3 | Pending |
| ENV-01 | Phase 4 | Pending |
| ENV-02 | Phase 4 | Pending |
| ENV-03 | Phase 4 | Pending |
| ENV-05 | Phase 4 | Pending |
| ENV-06 | Phase 4 | Pending |
| CTX-04 | Phase 4 | Pending |
| CTX-05 | Phase 4 | Pending |
| HUD-06 | Phase 4 | Pending |
| HUD-07 | Phase 4 | Pending |
| HUD-08 | Phase 4 | Pending |
| HAZ-01 | Phase 5 | Pending |
| HAZ-02 | Phase 5 | Pending |
| HAZ-03 | Phase 5 | Pending |
| SKY-01 | Phase 5 | Pending |
| SKY-02 | Phase 5 | Pending |
| SKY-03 | Phase 5 | Pending |
| CTX-01 | Phase 6 | Pending |
| CTX-02 | Phase 6 | Pending |
| CTX-03 | Phase 6 | Pending |
| CTX-06 | Phase 6 | Pending |
| HUD-12 | Phase 6 | Pending |
| PLAT-08 | Phase 7 | Pending |
| HUD-09 | Phase 7 | Pending |
| HUD-11 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 45 total
- Mapped to phases: 45
- Unmapped: 0

---
*Requirements defined: 2026-11-05*
*Last updated: 2026-11-05 after initial definition*
