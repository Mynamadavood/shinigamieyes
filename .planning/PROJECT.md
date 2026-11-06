# Shinigami Eyes

## What This Is

A private, Watch Dogs-style profiler of David's surroundings: a full-screen iPhone home-screen web app (PWA) backed by his Proxmox home lab, reachable only over Tailscale. Open it anywhere in Melbourne and the eyes "activate" — a live profile of the street, the room, the sky, the airwaves and David himself, so he is always one step ahead (Light Yagami energy). It profiles places, infrastructure and David's own life — never other people.

**Design rule:** like Death Note's Shinigami eyes, everything shown gets a **name and a countdown** (Tram: arrives in 3:12 · Golden hour: ends in 18 min · Gym streak: dies at midnight).

## Core Value

**An instant, glanceable HUD:** open the app and a cached profile of where you are is on screen in under a second, every item named with a ticking countdown — live data fills in after. If everything else fails, this must work.

## Requirements

### Validated

- [x] Python + FastAPI backend running on Proxmox (LXC CT 110), with a cache layer so the HUD never waits on upstream APIs — Validated in Phase 1: Foundation and Flat HUD Slice
- [x] Phone reaches the backend only over Tailscale (`tailscale serve`, no funnel, loopback bind); nothing exposed publicly — Validated in Phase 1
- [x] Location-driven profile endpoint: GPS, saved-place pins (coordinates server-side only) or address search; cached first, live refresh over SSE — Validated in Phase 1 (sun + UV layers)
- [x] Installable full-screen iOS PWA (home-screen app, offline shell, last profile cached on device, OFF-GRID banner) — Validated in Phase 1 on David's iPhone
- [x] Every item rendered with a name and a live countdown (flat list; map HUD comes in Phase 2) — Validated in Phase 1

### Active

<!-- v1 milestone = City mode (brief Phase 1, no hardware). Hypotheses until shipped. -->

**Platform & backend**

**HUD / look**
- [ ] Hero "activation" screen: anime Shinigami eyes in blood red on pure black, pixel-font title bar (ref: `.planning/references/hero-eyes.png`)
- [ ] NetHack-style main view over a dark, tilted 3D map (MapLibre): desaturated blue world, thin frame, floating icon+label tags, red highlighted volumes, pop-up info cards on places/things (ref: `.planning/references/nethack-view.png`)
- [ ] Glitchy HUD feel; every item rendered with a name and a live countdown

**City mode data layers (Melbourne-wide)**
- [ ] PTV: nearest stops, real-time departures, disruptions, approaching vehicles (GTFS-realtime first; PTV Timetable API once key arrives)
- [ ] Surveillance: known CCTV within ~150 m (OSM via Overpass) + fixed speed / red-light cameras (Victorian road safety camera list)
- [ ] Environment: air quality (EPA Vic), UV (ARPANSA), pollen + thunderstorm asthma (Melbourne Pollen), BOM weather + rain radar, fire danger (CFA)
- [ ] City of Melbourne: pedestrian counts, parking bay sensors, street trees, development activity (CBD coverage only — degrade gracefully elsewhere)
- [ ] Buildings: heritage (Victorian Heritage Database) + Wikipedia geosearch for what's in front of you
- [ ] Hazards: fires, floods, incidents nearby (VicEmergency public GeoJSON feeds — live but best-effort, no SLA; never show empty as "all clear")
- [ ] Sky: planes overhead (OpenSky / adsb.lol), ISS and satellite passes (CelesTrak)
- [ ] Bay: ships in Port Phillip (aisstream.io)
- [ ] Towers: licensed transmitter sites and carriers nearby (ACMA RRL)
- [ ] Grid & water: Victoria live generation mix + price, rooftop solar share (AEMO via OpenElectricity), water storage (Melbourne Water)
- [ ] Listen-in: Broadcastify CFA/FRV feeds and KiwiSDR/WebSDR links (no hardware)

### Out of Scope

- Face recognition, number-plate lookups — identifies/tracks people (Surveillance Devices Act; hard rule)
- Logging other people's Wi-Fi or Bluetooth devices — tracks people; only opted-in household phones ever appear (house mode, later)
- Police decryption, pager decoding, phone/cordless interception — illegal; receive-only unencrypted signals only
- Rebroadcasting or publishing any data/stream — everything stays private behind Tailscale
- Transmitting on radio — not until Foundation licence held (milestone 7+)
- Sending personal/financial data to any cloud service — personal data never leaves Proxmox
- AR live-camera overlay — deferred: v1 uses the 3D map; camera AR mode is a later phase
- Personal layers (self-profile card, gym, uni, learner logbook, photography, home lab, downtime, money) — milestone 2
- Own SDR radio (ADS-B, OpenWebRX+, AIS), house mode (ESP32/ESPresense/Home Assistant), dispatch transcription (whisper.cpp), Meteor-M/radiosondes, amateur licence — later milestones; need hardware
- EPA industrial licence layer — brief's Phase 2
- Native iOS app / background location — PWA + iOS Shortcuts automations instead

## Context

- **User:** David, 20, Chem Eng at Monash, Melbourne. Solo developer; building over the summer holidays after exams (2–4 Nov 2026). Uses it anywhere in Melbourne (home in Bulleen, Monash Clayton, Hammers Gym Nunawading, CBD).
- **Origin:** detailed project brief written with another Claude agent (Oct 19 2026) — `.planning/references/project-brief.pdf`. Full 7-phase vision lives there: City mode → personal layers → first radio → house mode → dispatch transcription → sky/atmosphere → amateur licence.
- **Home lab:** Proxmox server, 32 GB RAM, Quadro M4000 GPU (if used for CUDA later: pin CUDA 12, never 13). Tailscale for access.
- **SPENCER 2.0:** David's existing assistant, already running on Proxmox. "Shinigami is the eyes, SPENCER is the voice" — Shinigami detects, SPENCER decides whether to interrupt. v1 doesn't depend on it; alert delivery via SPENCER comes later.
- **LifeOS:** existing life dashboard, its own container on Proxmox. Intended relationship: **both directions** — Shinigami reads stats (gym, sleep, streaks) for the self-profile card and writes events back (gym arrival, logbook drives). Internals unknown — needs investigation before milestone 2.
- **Visual references:** `.planning/references/hero-eyes.png` (eyes, recolour pink→red), `.planning/references/nethack-view.png` (Watch Dogs 2 NetHack).
- **Hardware on order (for later milestones):** 2× RTL-SDR Blog V4, 1090 MHz antenna + LNA, discone, QFH parts, powered USB hub, per-room ESP32 sensor kits, small ESP32 display.
- **Open to-dos:** apply for PTV API key (not yet applied); register interest in VicEmergency data feed; check RadioReference for CFA district mode; Liftoff export; Apple Watch decision; VicRoads logbook rules.

## Constraints

- **Hosting**: Backend on David's Proxmox only; phone reaches it only over Tailscale — privacy and control
- **Privacy/Legal**: Published or broadcast-to-everyone data only; nothing that identifies or tracks other people — Victoria's Surveillance Devices Act
- **Radio**: Receive-only, unencrypted signals only; nothing rebroadcast — legal
- **Performance**: Cached data on screen in < 1 s, live data fills in after — "never the slow path"
- **Tech stack**: Python + FastAPI backend; iOS PWA frontend with MapLibre 3D map — chosen for data/radio tooling fit
- **Platform**: iOS Safari PWA limits (no background location) — use iOS Shortcuts automations as triggers
- **Dependencies**: API keys not yet applied for — Vic GTFS-Realtime (KeyID), PTV Timetable v3, EPA Victoria, aisstream.io, OpenElectricity (waitlisted); build adapters against recorded fixtures until keys arrive. VicEmergency public feeds work today but have no SLA
- **Tiles**: self-hosted Protomaps PMTiles (Melbourne extract) in production so location never leaks to a tile CDN; OpenFreeMap only for early dev
- **Timeline**: Solo, summer holidays 2026–27; each phase must be usable on its own
- **Resources**: Proxmox 32 GB RAM shared with SPENCER, LifeOS and other VMs

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| v1 milestone = City mode only | Needs no hardware; hardware arrives after exams | — Pending |
| Python + FastAPI backend | Best fit for data/GTFS libs and later radio/whisper.cpp work | ✓ Good (Phase 1; custom asyncio runtime + stdlib sqlite instead of APScheduler/aiosqlite) |
| iOS PWA, not native app | Fast to build solo, home-screen full-screen, Tailscale-reachable | ✓ Good (Phase 1: installs, updates in place, GPS prompts once) |
| 3D dark map (MapLibre) as HUD canvas now, AR camera later | Reliable indoors and on iOS; AR camera + compass is harder | — Pending |
| Hero = red Shinigami eyes; main view = Watch Dogs NetHack style | David's visual references | — Pending |
| LifeOS integration both directions, deferred to milestone 2 | LifeOS internals unknown | — Pending |
| Profiles places/infrastructure/self, never other people | Legal + ethical hard rule | — Pending |
| Address type-ahead via Photon, full search via Nominatim, both server-side | Nominatim forbids autocomplete; phone never contacts geocoders | ✓ Good (Phase 1) |
| Pinned-place layers computed for a 0.1° cell, never the exact point | Home coordinates must not be recoverable from client data | ✓ Good (Phase 1 review fix) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-11-06 after Phase 1 completion*
