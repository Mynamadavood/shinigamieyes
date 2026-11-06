# Phase 2: 3D Map, Hero and Surveillance - Context

**Gathered:** 2026-11-07
**Status:** Ready for planning

<domain>
## Phase Boundary

David opens the app and gets a red-eyes "activation", then a dark, tilted, desaturated-blue 3D map of where he is (self-hosted tiles, fonts and sprites), with floating icon + label tags that open info cards, the Phase 1 countdowns carried over as HUD readouts and a pull-up drawer, and nearby cameras: mapped CCTV within ~150 m ("mapped, not exhaustive") and fixed speed/red-light cameras as static info. Requirements: HUD-03, HUD-04, HUD-05, HUD-10, SURV-01, SURV-02. Mode: MVP (vertical slices).

Not in this phase: transit, environment layers beyond sun/UV, ranking (Phase 4), proactive camera/driving alerts (excluded by SURV-02), compass/heading features, AR camera.

</domain>

<decisions>
## Implementation Decisions

### Red-eyes opening (HUD-03)
- **D-01:** Plays on **every cold open** only (fresh launch). Not on resume from background.
- **D-02:** Animation: **eyes snap open + red iris flash**, then cut to the map. Total ≤ 1.5 s, plays **over real loading** (cached profile + map init run underneath), never delays data.
- **D-03:** Art: an **original SVG** of anime-style eye line art in the spirit of `.planning/references/hero-eyes.png`, **blood red on black** (never the reference's magenta), **not traced** from the reference.
- **D-04:** Keep the reference's framing: red pixel-font **`EYES` title bar with the `×` box**. **Tap anywhere** (incl. `×`) skips straight to the map.

### Map view and camera (HUD-04, HUD-10)
- **D-05:** **Full-screen map** with a **pull-up "next" drawer** at the bottom: collapsed it shows the top 2–3 countdowns; dragged up it shows the full Phase 1 list (same row component and styling).
- **D-06:** Camera is **north-up, follows David's position**, tilted to show extruded buildings. **No compass / heading rotation** (no DeviceOrientation permission).
- **D-07:** **Free pan / pinch / rotate**, a **recenter** button snaps back to David, and **long-press drops a manual pin** at that spot (fulfils Phase 1 D-08's "pin can be dropped on the map"). A dropped pin behaves like an address-search pin (source `search`/manual, coordinates from the client).
- **D-08:** Self-hosted tiles cover **Greater Melbourne** (Dandenongs, Geelong, Mornington Peninsula), not all of Victoria. Outside the extract the map degrades to the offline grid look (D-15), data still works.

### Map tags and info cards (HUD-05)
- **D-09:** Items **without a position** (sun, UV) render as **fixed HUD corner readouts** (Watch Dogs "REMOTE IP / LIVE STREAMING" style text, name + countdown), and in the drawer. Only items with a real position get **floating tags**.
- **D-10:** Tapping a tag opens a **floating framed card beside the tag** with a thin leader line (as in `.planning/references/nethack-view.png`). Tap elsewhere closes it.
- **D-11:** **Tag budget ~20 labelled tags**: nearest and most urgent (red/severity) get full icon + label; the rest shrink to small icons that expand to labels when zoomed in. Keeps the map smooth on the iPhone (success criterion 5).
- **D-12:** Camera card content: **type, distance, source + "mapped, not exhaustive"**, plus direction / operator / surveillance type when OSM has them. Speed/red-light card: **type, road/location, "static info only"**.

### Cameras (SURV-01, SURV-02)
- **D-13:** Camera tags are **neutral blue**, switching to **blood red within ~30 m** (red stays scarce, Phase 1 D-03).
- **D-14:** Cameras live **on the map only**, plus a **HUD count readout** like `6 cameras · 150 m · mapped, not exhaustive`. The drawer stays countdowns-only. (Resolves the "everything has a countdown" rule: cameras are positioned facts, not timed items.)
- **D-15a:** CCTV radius **~150 m**; speed/red-light cameras within **~1 km**. Static info only, **no proactive alerts**.
- **D-16:** The caveat **"mapped, not exhaustive"** appears on the count readout **and** every camera card. The UI must never imply "no cameras here" when the count is 0 (e.g. `0 mapped cameras · 150 m · not exhaustive`).

### Offline map, marker, buildings
- **D-15:** Offline (Tailscale off / tiles unreachable): **recently seen tiles are cached on the phone** so the area around David still draws; anything uncached renders as a **dark blue grid**, with tags and the marker still on top. OFF-GRID banner behaviour from Phase 1 unchanged.
- **D-17:** David's position marker is an **original small red suited-figure silhouette** (a nod to the Death Note vibe, **not** a likeness of any existing character), with a faint **GPS accuracy ring**. A manual pin uses a distinct **blue** marker.
- **D-18:** **Tapped building only** lights up in **solid blood red** (extrusion) with a small card (name / height if the tile data has it). All other buildings stay blue. Camera-bearing buildings are **not** tinted.

### Carried forward (Phase 1, still binding)
- Blood red scarce + desaturated NetHack blue + white; pixel font for titles only, monospace with tabular numerals for names/countdowns (Phase 1 D-01..D-03).
- Countdown format and maths, expiry pulse, stale dimming, OFF-GRID banner (Phase 1 D-04..D-07).
- Pinned places' coordinates never reach the client; place layers computed at the 0.1° cell (Phase 1 review fix CR-02). Map pins dropped by David are client-known and fine.
- Every third-party lookup goes through the server; the phone never calls a third party (HUD-10, Phase 1 geocode/suggest pattern).

### Claude's Discretion
- Exact tilt angle, zoom range, drawer heights and snap points, animation easing/timings within the stated limits.
- Icon set for tags (must be self-hosted sprites, on-theme, original).
- Tile pipeline details (Protomaps PMTiles extract, style authoring, glyph/sprite generation) and how the server serves them (range requests from FastAPI or static).
- CCTV data pipeline (Geofabrik extract + osmium filter vs. Overpass bulk, weekly refresh) and speed-camera geocoding approach, following CLAUDE.md research notes (no live Overpass in the request path).
- Phone-side tile cache size and eviction.
- `prefers-reduced-motion` handling for the opening and pulses (should simplify, not remove, the skip path).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` § Phase 2 — goal, success criteria 1–5, MVP mode, UI hint
- `.planning/REQUIREMENTS.md` — HUD-03, HUD-04, HUD-05, HUD-10, SURV-01, SURV-02
- `.planning/PROJECT.md` — privacy hard rule (places/infrastructure/self, never people), constraints

### Visual references
- `.planning/references/hero-eyes.png` — opening screen composition (EYES title bar, × box, eyes). Style reference only; recolour to blood red, do not trace
- `.planning/references/nethack-view.png` — main view look: desaturated blue world, thin frame, floating icon+label tags, framed info card with leader line, red highlighted building
- `.planning/references/project-brief.pdf` — original brief

### Prior phase decisions and contracts
- `.planning/phases/01-foundation-and-flat-hud-slice/01-CONTEXT.md` — D-01..D-17 (look, countdowns, location, server)
- `.planning/phases/01-foundation-and-flat-hud-slice/01-UI-SPEC.md` — tokens, typography, row component, countdown format, motion contract (carry forward)
- `.planning/phases/01-foundation-and-flat-hud-slice/01-REVIEW.md` — deferred WR-02..WR-08 (WR-06 IndexedDB first-paint timeout touches the <1 s promise; fix early)
- `CLAUDE.md` — stack (MapLibre 6.x, pmtiles, Protomaps basemaps), tile hosting notes, Overpass/OSM and road-safety-camera data caveats

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/src/ui/next-list.ts` + row styles: become the drawer content unchanged (D-05)
- `web/src/ui/location-sheet.ts` / `location-search.ts`: place picker and search stay; long-press pin (D-07) feeds the same `onSearch`-style handler
- `web/src/ticker.ts`, `clock.ts`, `format.ts`, `freshness.ts`: drive HUD corner readouts (D-09) with the same countdown maths
- `web/src/ui/offgrid-banner.ts`, `net.ts`, `offgrid.ts`: offline state for D-15
- `web/src/styles/tokens.css`: palette and type tokens for map style colours and tags
- `server/shinigami/schema.py` `Item.geom` (currently always null): the slot for positioned items (cameras); `ItemKind` deliberately has no person kinds
- `server/shinigami/geo.py` `snap_cell`, `haversine_m`: radius filters (150 m / 1 km)
- `server/shinigami/store.py` + providers pattern (`providers/base.py`): new camera provider(s) with static datasets loaded at startup

### Established Patterns
- Cached-first paint from IndexedDB, then `/api/profile`, then SSE `/api/stream` live fill-in
- Server-side proxy for every third party; nothing upstream in the profile request path
- Strict CSP and same-origin assets (fonts self-hosted); service worker precache via vite-plugin-pwa injectManifest
- Single uvicorn worker, in-process runtime; systemd sandbox (`ProtectSystem=strict`, writes only to `/var/lib/shinigami`) — large tile files must live where the service can read and deploy can write

### Integration Points
- `web/src/ui/shell.ts` slots (title bar, banner, location strip, list host, footer): restructure into map canvas + overlay HUD + drawer
- `deploy/deploy.sh` / `verify.sh`: tile extract download + checks that no third-party hosts are requested (HUD-10)
- CSP must allow MapLibre workers (blob:) and same-origin tiles/glyphs/sprites only

</code_context>

<specifics>
## Specific Ideas

- "Light Yagami energy": the activation should feel like the eyes switching on, not a splash screen.
- Watch Dogs reference text overlays ("REMOTE IP", "LIVE STREAMING") are the model for HUD corner readouts.
- David wanted a personal, on-theme position marker; he suggested Light himself, which would copy an existing character, so the decision is an original suited-figure silhouette.

</specifics>

<deferred>
## Deferred Ideas

- Map rotating with compass heading (rejected for Phase 2; could revisit with AR work later).
- Tinting buildings that carry cameras red (rejected for now to keep red scarce).
- All-of-Victoria tile coverage (Greater Melbourne only for now).

</deferred>

---

*Phase: 02-3d-map-hero-and-surveillance*
*Context gathered: 2026-11-07*
