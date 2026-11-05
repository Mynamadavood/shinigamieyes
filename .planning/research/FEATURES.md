# Feature Landscape

**Domain:** Private, glanceable "surroundings profiler" HUD (Watch Dogs-style), iOS PWA, one user, Melbourne. v1 = City mode, no hardware.
**Researched:** 2026-11-05
**Confidence:** MEDIUM overall. Competitor feature sets (Transit, Citymapper, Flightradar24, MarineTraffic, ISS/sky apps, AQ apps, Watch Dogs 2 NetHack UI) come from training knowledge, not re-verified this session (no live fetches). Treat as hypotheses. UX conclusions are reasoned from the project's own constraints (PROJECT.md).

## Comparable Products: What They Do

| Product class | Examples | Core pattern worth borrowing | Pattern to skip |
|---|---|---|---|
| Transit | Transit, Citymapper, PTV app | "Nearby" list sorted by next departure, big countdown minutes, live-vehicle dot, disruption banner, favourites | Trip planning, ticketing, accounts |
| Flight / ship trackers | Flightradar24, MarineTraffic, adsb.lol | Icon heading-rotated on map, tap for card (callsign, type, alt, route), "overhead now" | Playback/history, alerts for premium, social |
| Sky apps | ISS Detector, Heavens-Above, Stellarium | Pass table: rise time, max elevation, direction, brightness; "visible tonight" | Full star atlas, AR sky overlay (deferred) |
| Air/weather | IQAir, AirVisual, BOM, Pollen apps | One colour-banded number + category word + one-line advice; rain radar loop | Long forecasts, ads, multi-city |
| Situational dashboards / OSINT hobby | Home Assistant dashboards, worldmonitor-style boards, Overpass-based CCTV maps (SurveillanceUnderSurveillance) | Layer toggles, per-source freshness timestamp, severity colouring | Everything-on-one-map clutter, global scope |
| Watch Dogs fan HUDs / NetHack view | WD2 ctOS, fan "profiler" overlays | Floating tag+icon anchored to objects, red highlight volumes, scan sweep on activation, glitch transitions, profile card with name + 1-3 attributes | Constant full-screen noise, unreadable fonts, fake "hack" minigames |

## Table Stakes

Missing = the HUD is not useful or breaks the core value.

| Feature | Why expected | Complexity | Notes |
|---|---|---|---|
| Cached profile on screen < 1 s (last profile in device storage + server cache) | Core value | Med | Service worker + IndexedDB on device; server returns cached-first, SSE/poll or second fetch for live. Show "as of" age per item |
| Name + countdown on every item (universal item model: `name`, `kind`, `ts_expires/arrives`, `source`, `fetched_at`) | Design rule | Med | Make this the schema, not a UI afterthought. Items without a natural countdown get a synthetic one: data staleness ("updated 40s ago") or validity window (UV peak ends, forecast changes) |
| Ticking countdowns computed client-side from absolute timestamps | Ticks without network; stays honest | Low | Never ship "3 min"; ship an epoch time. Dim/strike when overdue |
| Per-item freshness + stale indicator | Trust; cached-first means data is old by design | Low | Dim stale items; never hide them silently |
| PTV nearest stops + next departures + approaching vehicles | The most-used layer for a Melbourne day | High | GTFS-R first (trip updates + vehicle positions), static GTFS join; PTV API later. Timetable fallback when realtime absent, labelled "scheduled" |
| Disruptions on nearby routes | Transit apps all have it | Med | GTFS-R alerts |
| Weather essentials: now, rain-incoming countdown ("rain in 14 min"), radar | Melbourne weather; countdown fits perfectly | Med | BOM terms: check licensing / scrape fragility (flag) |
| Air quality + UV + pollen as banded chips | Standard health-glance | Low-Med | Colour band + word + validity window |
| Hazards nearby (fire, flood, incident) with severity | Safety value of "one step ahead" | Med | No official VicEmergency feed; fragile source, show source health |
| Location-driven refresh (GPS on open, re-query on move > N m) | HUD is where-you-are | Med | iOS PWA foreground-only; handle permission denied -> last known / manual pin / home presets (Nunawading, Monash, CBD) |
| Full-screen installable PWA, offline shell, offline last-profile | Daily-use feel | Med | iOS quirks: standalone mode, safe-area, no background geolocation |
| Hero activation screen (eyes) | Identity of the product | Med | See "Hero + map" below. Must never block the < 1 s profile; run it over loading, skippable |
| Dark tilted 3D map with floating tagged icons and info cards | The "main view" | High | MapLibre; see below |
| Layer ranking/priority so the screen is not a hairball | Many layers, small screen | Med | See "Ranking" |
| Layer toggles / presets | Hobby dashboards all have it | Low | Presets by context ("Commute", "Walk", "Sky") |
| Source health/status page (last OK, error, rate-limit) | Many fragile free feeds, solo maintainer | Low-Med | Prevents silent decay; essential given VicEmergency/BOM fragility |
| Graceful degradation outside coverage (CoM sensors only CBD) | Stated requirement | Low | Layer shows "no coverage here", not empty/blank |
| Tailscale-only access, no public exposure | Hard constraint | Low | Infra, not UI; still a requirement |

## Differentiators

Not expected from generic apps; this is why the product exists.

| Feature | Value proposition | Complexity | Notes |
|---|---|---|---|
| Unified "everything has a name and a countdown" grammar across unrelated domains | No competitor mixes tram, UV, ISS pass, solar share in one idiom | Med | Falls out of the item schema |
| Single-call location profile (all layers, one response, cached-first) | Speed no multi-app workflow can match | Med | Core architecture; server pre-warms caches for home/Monash/CBD |
| Surveillance layer: CCTV (OSM) within ~150 m + speed/red-light cameras | Pure Watch Dogs flavour, genuinely useful for driving (cameras) | Med | Infrastructure only. Label "mapped, not exhaustive" |
| "Next thing that matters" ticker/priority strip (top 3 by urgency) | Glance in 1 s: what happens next | Med | Computed from ranking score (below) |
| Overhead sky: planes now (callsign/type/alt), ISS + satellite passes with countdown | Looks outward; compelling "eyes" moment | Med | adsb.lol/OpenSky; CelesTrak TLE + client SGP4 (satellite.js) so passes tick offline |
| Bay ships (AIS) | Unusual, cheap | Med | aisstream websocket; backend holds connection, cache |
| Buildings: heritage + Wikipedia "what am I looking at" | Turns a street into a tour; card pops on the 3D building | Med | Tie to map building tap |
| Grid and water: VIC generation mix, price, solar share, dam storage | Chem Eng interest; countdown = price interval ends | Low-Med | OpenElectricity; 5-min interval gives natural countdown |
| Towers (ACMA RRL) with carriers | Niche, precursor to radio milestones | Med | Static dataset import |
| Listen-in links (Broadcastify CFA/FRV, KiwiSDR) | Radio flavour without hardware | Low | Links/embeds only; no rebroadcast; Broadcastify may need account |
| Glitch/scan activation FX and transitions (sparing) | Atmosphere | Med | See below |
| Context presets that auto-select by location/time (at Monash, at home, driving speed) | Reduces clutter further | Med | Defer to after ranking works |
| Sunrise/golden hour/blue hour countdowns | Cheap, delightful, fits grammar | Low | Local computation, no API (astral/suncalc) |
| Hook points for SPENCER alerts (event schema, not integration) | Future "eyes + voice" | Low | Emit alertable events with severity; do not build delivery in v1 |

## Anti-Features

| Anti-Feature | Why avoid | What to do instead |
|---|---|---|
| Face recognition, plate lookup, person identification | Legal (Surveillance Devices Act) and hard rule | Profile places/infrastructure only |
| Showing other people's phones/Wi-Fi/Bluetooth devices, "nearby devices" | Tracks people | Nothing; only opted-in household devices in later house mode |
| Per-person tags on map (even fake "profiles" of passers-by) | Even as a gag, normalises the thing the project forbids; also the Watch Dogs trap | Tag places, vehicles-as-public-transit, aircraft, ships |
| Individual-vehicle tracking of private cars | Same | Show public-transit vehicles and aircraft/ships (broadcast-by-design) only |
| Police/emergency decrypted or pager decoding | Illegal | Link to public unencrypted streams only |
| Rebroadcast / sharing / public URL / multi-user accounts | Privacy; scope | Tailscale only; single-user, no auth system beyond network |
| Cloud analytics, crash reporters, third-party fonts/CDN/tile calls that leak location | Location privacy | Self-host tiles/fonts/assets where feasible; or proxy through backend so phone never hits third parties |
| Trip planner / routing / ticketing | Clone of existing apps, huge scope | Departures + approaching only |
| Always-on everything map | Unreadable on a phone | Ranked, budgeted tags (below) |
| Full 3D-building photo-real map, global coverage | Weight, fights "dark, desaturated" look | Dark vector style, extruded footprints, Melbourne only |
| Historical playback / data warehousing of tracks | Storage creep; becomes tracking | Short TTL cache only; keep David's own location history out of v1 |
| Long forecasts and charts | Not glanceable | One chip + one countdown |
| Heavy continuous glitch/CRT shader over data | Hurts legibility, battery, and iOS GPU | Brief glitch bursts on events; clean text always |
| AR camera overlay (v1) | Deferred; compass/camera harder on iOS | 3D map |
| Personal layers, LifeOS write-back, SDR, house mode in v1 | Later milestones | Keep item schema extensible to them |
| Push notifications in v1 | iOS PWA push is restrictive; SPENCER is the alert path | Foreground HUD only |

## Ranking Many Layers on One Small Screen

Constraint: roughly 360x780 pt, one-handed, glanced for 1-2 seconds. Reasoned recommendations (MEDIUM/LOW; validate by use).

1. **One scoring function, all layers.** `score = urgency (time-to-event, inverse) x relevance (distance, in your direction/route) x severity (hazard > info) x user weight (layer pin)`. A tram in 2 min at 80 m beats an ISS pass in 6 h; a bushfire warning for your suburb beats both. Compute server-side, send rank; client can re-sort as timers tick.
2. **Three tiers of surface:**
   - **Strip (always visible, 3-4 items):** top-scored "next" items with countdown. This is the glance answer.
   - **Map tags (budgeted, ~8-12 max visible):** collision-avoided, nearest/highest-score win, others collapse into a count badge ("+5 CCTV") that expands on tap. Zoom raises the budget.
   - **Drawer/sheet (everything else):** swipeable layer sections, each sorted internally by next-countdown. Section header shows one-line summary chip ("AQ good - UV 9 until 3:40pm").
3. **Ambient chips row** for slow-changing environment (AQ, UV, pollen, grid price): colour-banded, tap to expand. They only escalate into the strip when they cross a threshold (UV >= 8, pollen high, storm asthma, fire danger severe).
4. **Hazards pre-empt everything** (pinned red banner), then imminent transit, then everything else.
5. **Density control:** cluster by layer; icon-only at low zoom, label at high; red highlight volume reserved for the 1-3 highest-score things so red keeps meaning.
6. **Context presets** (Commute / Walk / Look-up / Home) change weights, not hard-hide data.
7. **Never reflow while the user reads:** reorder on explicit refresh or on large score change, with animation; stable positions beat perfect ordering.

## Hero Activation + NetHack 3D Map: Gimmick vs Good

What makes it feel good (reasoned from the references and general HUD practice; MEDIUM-LOW):

- **Earn the flourish, then get out of the way.** Activation is 1.0-1.5 s max and plays *while* the cached profile mounts underneath, so it adds drama without delay; tap-to-skip; only on cold open (not every resume). A long intro on a daily-use tool becomes an irritant within a week.
- **Activation does real work.** The "scan" sweep reveals actual layers populating (sweep over the map, tags pop as data lands). A reveal tied to real loading reads as function, not decoration.
- **Restraint with red.** Black/desaturated blue world, red only for highlight volumes, hazards and the eyes. If everything is red nothing is. Pixel font for titles/labels only; body numbers in a legible mono.
- **Typography first.** Countdowns in tabular-nums so digits do not jitter; large minimum size; high contrast. Glitch only on state change (new item, alert, layer switch), 150-300 ms, never over text at rest.
- **Tag design:** icon + short name + countdown, thin leader line to anchor, distance-faded; pop-up card = name, 1-3 facts, source + age. Same card layout for every layer.
- **Camera that helps:** tilt ~55-60 deg, heading-up toggle, recenter button, gentle fly-to on activation; extruded buildings subtle, so tags (not geometry) are the stars.
- **Performance is the aesthetic:** MapLibre on iOS Safari WebGL; limit tag count, avoid heavy DOM markers (use symbol layers or a capped set), CSS-only FX where possible, `prefers-reduced-motion` respected. Jank breaks the illusion faster than anything.
- **Sound/haptics:** optional, off by default; iOS PWA haptics are limited (flag LOW).
- **Gimmick tests:** (a) does it delay information? (b) does it hide text? (c) would you still want it on the 50th open? If any fail, cut or shorten.

## Feature Dependencies

```
Item schema (name, kind, absolute time, source, fetched_at)
  -> countdown rendering (client ticking)
  -> ranking score -> strip / tag budget / chips / hazard banner
  -> source-health page, stale indicators

Backend cache layer (cached-first, background refresh)
  -> single-call profile endpoint
     -> device cache (IndexedDB) + offline shell -> <1 s open
     -> every data layer (PTV, env, hazards, sky, bay, CoM, buildings, towers, grid, listen-in)

GPS/location handling (+ manual/preset fallback)
  -> profile endpoint, map centering, distance-based ranking, coverage degradation

Static datasets ingest (GTFS static, ACMA RRL, heritage, cameras, OSM CCTV)
  -> PTV departures (static+realtime join), towers, buildings, surveillance layer

MapLibre 3D dark map
  -> floating tags, red volumes, info cards, tag collision/clustering
  -> hero activation (reveal over map)

TLE data (CelesTrak) + client SGP4 -> satellite/ISS passes with offline countdowns
Alert-worthy event schema -> (later) SPENCER delivery
```

## MVP Recommendation (v1 City mode, in build order)

1. Item schema + cache-first profile endpoint + PWA shell with device cache (the core value; ship before any pretty).
2. PTV departures via GTFS-R + nearest stops, with ticking countdowns.
3. Flat ranked list UI (strip + sections + freshness) before the 3D map, so the HUD is useful on its own.
4. Environment chips (weather/rain countdown, AQ, UV, pollen, fire danger) + sun/golden hour.
5. 3D NetHack map with budgeted tags and info cards; then hero activation with real-reveal.
6. Hazards, surveillance (CCTV + cameras), sky (planes, ISS), buildings.
7. Bay, grid/water, CoM sensors, towers, listen-in (lower urgency, mostly static or slow data).
8. Source-health page throughout (cheap; build alongside the first connector).

Defer: context auto-presets, haptics/sound, SPENCER delivery, anything personal or hardware-bound.

## Sources and Confidence

- PROJECT.md (E:\shinigamieyes\shinigamieyes\.planning\PROJECT.md): HIGH for scope and constraints.
- Competitor feature descriptions (Transit, Citymapper, Flightradar24, MarineTraffic, Heavens-Above, IQAir, Watch Dogs 2 UI): training knowledge, not re-verified: LOW-MEDIUM.
- Ranking and hero/map UX guidance: reasoned synthesis, needs validation in use: LOW-MEDIUM.
- Feed-specific risks (BOM licensing, VicEmergency no official feed, Broadcastify account requirement, iOS PWA push/haptics limits): flagged for phase-level verification.
