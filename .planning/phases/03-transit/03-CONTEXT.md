# Phase 3: Transit - Context

**Gathered:** 2026-11-13
**Status:** Ready for planning

<domain>
## Phase Boundary

David can see how to get moving from where he stands: his nearest train, tram and bus stops with distance and walk time (TRAN-01), next departures with live countdowns labelled live or scheduled (TRAN-02), vehicles approaching those stops on the map (TRAN-03), and current disruptions on those routes (TRAN-04).

Not in this phase: journey planning or routing between places, fares or myki, favourites, notifications or alerts pushed to the phone, V/Line trip planning, other transport (bikes, scooters, rideshare).

</domain>

<decisions>
## Implementation Decisions

### Which stops count as nearby (TRAN-01)
- **D-01:** Show the **nearest stop per mode**: train, tram, bus. Not every stop in a radius.
- **D-02:** For tram and bus, cover **both directions of travel**: the nearest stop for each direction (stops come in pairs across the road). A train station counts once and covers all its platforms. So at most about 5 to 6 stops.
- **D-03:** Walk limits **by mode**: train up to about 1.5 km, tram up to about 800 m, bus up to about 500 m. Beyond its limit a mode shows as "none nearby" (never silently missing).
- **D-04:** **Saved places: all except Home.** Monash, the CBD and the gym show their real nearest stops, departures, vehicles and disruptions. **Home viewed as a saved place shows no transit at all** (same fail-closed rule as cameras: `Place.home` / `cameras=false` style gate, no stops, no distances, nothing that hints at Home's location). Live GPS while standing at home works as normal.
- **D-05:** Each stop shows its name, mode, distance and walk time.

### How departures are shown (TRAN-02)
- **D-06:** **Drawer rows + stop card.** The drawer gets one countdown row per stop and direction for the next service (e.g. `Tram 96 to St Kilda · 3:12`). Tapping a stop's tag on the map opens a card with more departures.
- **D-07:** The stop card lists the **next 2 departures per route and direction**, capped at about 8 lines for busy stops.
- **D-08:** **Catchable logic.** The drawer row shows the next service David can actually reach on foot. A departure sooner than his walk time is **dimmed** in the stop card and skipped for the drawer row.
- **D-09:** The row's main countdown is the **departure time**, with a smaller **"leave in M:SS"** beside it (departure minus walk time). The row turns **blood red when it is time to leave now**.
- **D-10:** Every departure is labelled **live or scheduled** (requirement). Exact marking is Claude's discretion (see below).

### Vehicles on the map (TRAN-03)
- **D-11:** Show **only vehicles heading to David's nearby stops**: on routes that serve those stops, not yet past the stop, within a couple of km. Not every vehicle nearby.
- **D-12:** A vehicle is a **small mode icon with the route number** that moves as positions update. Tapping it opens a card: route and destination, which of David's stops it is heading to, and its countdown to that stop. No always-on countdown label on the vehicle.
- **D-13:** **Tag label priority when crowded: stops, then vehicles, then cameras.** Nearby stops always get a label. Cameras keep their red-within-30 m labels; other cameras shrink to icons first. The overall budget stays about 20 labelled tags (Phase 2 D-11); no separate transit budget.
- **D-14:** **Edge pointers for off-screen stops.** The follow zoom stays as it is. A small arrow at the screen edge points to each off-screen nearby stop with its name and distance (`Flinders St · 900 m`); tapping it moves the map to the stop.

### Disruptions (TRAN-04)
- **D-15:** Only alerts for **routes that serve the nearby stops shown**, plus alerts on those stops themselves (stop closed, lift out). No network-wide or radius-based alerts.
- **D-16:** Placement: a **warning mark on each affected departure row and stop card** with the alert text in the card, plus a **corner readout with the count** (`2 disruptions · your routes`) that lists them on tap. No separate drawer row per disruption, unless the alert has a known end time (then a countdown row is allowed).
- **D-17:** **Red only when it stops the service**: cancelled departure, suspended route, closed stop, buses replacing trains on David's routes. Delays, detours and planned-works notices stay white/blue with a warning mark.

### Data sources and keys
- **D-18:** David has the **PTV Timetable API key only**. The GTFS Realtime key (Transport Victoria open data portal) has not arrived. **Build PTV-first**: departures, disruptions and whatever vehicle positions the PTV API offers. Design the provider so the GTFS Realtime feeds can be added later behind the same screens. Use recorded fixtures for anything not yet reachable.
- **D-19:** The key lives only in `/etc/shinigami/.env` on the CT as `PTV_DEVID` and `PTV_KEY`. David adds it himself. Never in chat, git, logs or on the phone.

### Carried forward (still binding)
- Everything shown has a name and a countdown; countdown format, expiry pulse and stale dimming as in Phase 1 (D-04..D-07).
- Blood red is scarce; world is desaturated blue and white (Phase 1 D-01..D-03, Phase 2 D-13).
- The phone never calls a third party; all PTV calls go through the server (HUD-10).
- No upstream call in the `/api/profile` request path; cached data on screen in under 1 s, live fills in after (PLAT-04).
- Saved-place coordinates never reach the phone; pin profiles return null lat/lon. Home never gets location-revealing layers.
- Nothing that identifies or tracks people: vehicles are shown by route, never by driver or passenger data.
- CSP `style-src 'self'`, no innerHTML, no CDN assets.

### Claude's Discretion
- Walk-time maths: about 5 km/h over straight-line distance with a small detour allowance.
- Live/scheduled marking: suggested small `LIVE` / `SCHED` label per row and card line, scheduled-only times slightly dimmed, "delayed N min" when live differs from the timetable.
- Vehicle styling: blue, never red; a vehicle whose position is older than about 2 minutes fades out.
- Stop tag icons per mode (original, self-hosted sprites).
- Polling cadence, cache TTLs and how stops are stored (GTFS Schedule static stops in SQLite/STRtree vs PTV stops-near-location), within the rate limits in CLAUDE.md.
- How "direction" is derived for stop pairs.
- Late-night / no-more-services wording, and the loading state before transit data arrives.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project rules and stack
- `CLAUDE.md` — constraints, stack, and the Data Source Verification table (rows: Vic GTFS-Realtime, Vic GTFS Schedule, PTV Timetable API v3 incl. HMAC-SHA1 signing and key process)
- `.planning/PROJECT.md` — core value, privacy and hosting constraints
- `.planning/REQUIREMENTS.md` — TRAN-01..TRAN-04
- `.planning/ROADMAP.md` — Phase 3 goal and success criteria

### Research
- `.planning/research/STACK.md` — transit data source notes
- `.planning/research/PITFALLS.md` — known traps
- `.planning/research/ARCHITECTURE.md` — provider tiers and caching design

### Prior phase decisions
- `.planning/phases/02-3d-map-hero-and-surveillance/02-CONTEXT.md` — map, tags, cards, tag budget, drawer, camera rules
- `.planning/phases/02-3d-map-hero-and-surveillance/02-UI-SPEC.md` — visual contract for tags, cards, readouts
- `.planning/phases/02-3d-map-hero-and-surveillance/02-REVIEW-FIX.md` — Home protections (CR-S1, WR-S1, WR-S2, WR-W5) that transit must follow
- `.planning/phases/01-foundation-and-flat-hud-slice/01-CONTEXT.md` — countdown format, colours, OFF-GRID behaviour

### External
- PTV Timetable API v3 key and signature doc: https://www.vic.gov.au/sites/default/files/2025-06/PTV-Timetable-API-key-and-signature-document.rtf
- GTFS Realtime dataset (later): https://discover.data.vic.gov.au/dataset/gtfs-realtime

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/shinigami/providers/base.py`: `Provider` contract with `computed` / `polled` / `on_demand` tiers; `query()` is sync with no network, `refresh()` and `fetch_cell()` do the fetching. `exact_location_only` flag already gates providers for saved-place pins.
- `server/shinigami/providers/cameras.py` + `cameras_store.py`: pattern for a positioned-items layer backed by a local store and a spatial index.
- `server/shinigami/places.py`: `Place.cameras` / `Place.home`; `api/profile.py` `camera_ok` shows how to gate a layer per place.
- `web/src/map/tags.ts`, `card.ts`, `camera-card.ts`, `leader.ts`: tag layer with label budget, flip-at-edge labels and cards placed away from other tags.
- `web/src/ui/next-list.ts`, `drawer.ts`: countdown rows in the pull-up drawer.
- `web/src/ui/readouts.ts`: corner readouts (camera count pattern fits the disruption count).

### Established Patterns
- Fixture-first adapters with `respx` contract tests (`server/tests/fixtures/`).
- SSE stream pushes layer refreshes after first paint; the phone caches the last profile in IndexedDB keyed by location.
- `deploy/verify.sh` gains a check per new layer; `/api/health` reports store status without coordinates.

### Integration Points
- New transit provider(s) registered alongside sun, UV and cameras; assemble.py decides which providers run for pins.
- Tag layer needs moving markers (vehicles) and edge pointers: both new behaviours.
- Settings need `PTV_DEVID` / `PTV_KEY` from `.env`; the app must run (with "no key" state) when they are absent.

</code_context>

<specifics>
## Specific Ideas

- Drawer row example: `Tram 96 to St Kilda · departs 6:12 · leave in 1:40`.
- Edge pointer example: `Flinders St · 900 m`.
- Disruption readout example: `2 disruptions · your routes`.
- A vehicle should read as "your tram, 2 stops away", not as general traffic.

</specifics>

<deferred>
## Deferred Ideas

- GTFS Realtime feeds as the main live source once the key arrives (designed for in D-18, switched on later).
- Network-wide major disruption awareness.
- A "show transit" zoom-to-fit button.

### Reviewed Todos (not folded)
- Voice memo capture (record on phone, send straight to server): a new capability unrelated to transit; stays in the backlog.

</deferred>

---

*Phase: 3-Transit*
*Context gathered: 2026-11-13*
