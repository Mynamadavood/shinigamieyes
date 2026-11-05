# Phase 1: Foundation and Flat HUD Slice - Context

**Gathered:** 2026-11-05
**Status:** Ready for planning

<domain>
## Phase Boundary

David can install Shinigami Eyes from his iPhone over Tailscale (`https://shinigami.<tailnet>.ts.net`) and see a cached-first, ranked **list** of named items with live countdowns for his location. The first providers are golden/blue hour (computed locally) and UV protection (ARPANSA). Phase 1 also builds the foundations every later layer reuses: the Item/Layer schema with absolute target times, the Provider contract, read-only `/profile`, SSE live fill-in, the PWA shell with device cache, the OFF-GRID state, location handling, and the LXC service on Proxmox.

Requirements: PLAT-01..07, HUD-01, HUD-02, ENV-04, ENV-07.
Not in this phase: 3D map, hero activation screen, map tags/cards (Phase 2); ranking strip/chips/toggles (Phase 4); Shortcuts prewarm (Phase 7).

</domain>

<decisions>
## Implementation Decisions

### Flat HUD look
- **D-01:** Full Shinigami HUD styling from day one, not a throwaway plain list. The Phase 1 list should become the "next" strip / drawer of the final HUD, so its styling carries forward into Phase 2.
- **D-02:** Black background, thin frames. Use a **pixel font for titles/headers only** (like the "EYES" title bar in the hero reference) and a **clean monospace for item names and countdowns**, with tabular numerals.
- **D-03:** Palette: **blood red** for highlights and urgent items (kept scarce so it keeps its meaning), **desaturated cold NetHack blue** for neutral items and the world, white for text. No pink or magenta.

### Countdowns, expiry and OFF-GRID
- **D-04:** Adaptive countdown format:
  - under 1 h: `mm:ss`, ticking every second (e.g. `18:42`)
  - under 1 day: `3h 12m`
  - longer: `14d 6h`
  - Always computed as `target_ts − (now + server offset)`, never a decrementing counter.
- **D-05:** When a countdown hits zero it gives a **brief red pulse, then dims and drops off** the list.
- **D-06:** Stale data **dims and shows an age tag** (e.g. `2h old`). Every item shows data freshness.
- **D-07:** Server unreachable → a **persistent full-width red banner**: `OFF-GRID · last sync 14m ago`. Cached items stay visible and keep ticking underneath. Fetches time out in 3–5 s, so the app never hangs.

### Location and manual pin
- **D-08:** GPS by default. Manual pin = **one-tap saved places plus address search** (geocoded on David's server, never from the phone to a third party). From Phase 2 onward, the pin can also be dropped on the map.
- **D-09:** Starting presets: **Home (Bulleen)**, **Monash Clayton**, **Melbourne CBD**, **Hammers Gym Nunawading**. The exact home coordinates/address live in server-side config only, never in git.
- **D-10:** Location refresh: get a fresh fix **on open and when returning to the app**, then update only after moving **~100 m**. No continuous high-accuracy watch, to save battery.

### Server and hostname
- **D-11:** Runs in a **new unprivileged Debian LXC** on Proxmox, isolated from SPENCER and LifeOS (~1–2 GB RAM).
- **D-12:** Tailscale is already on the Proxmox host. The LXC joins the tailnet as **its own node** named **`shinigami`** (needs `/dev/net/tun` passthrough). The hostname is **frozen**: `https://shinigami.<tailnet>.ts.net`. Disable key expiry on the node. HTTPS via `tailscale serve`, never Funnel.
- **D-13:** Setup is delivered as **scripts David runs**: the repo ships a setup script plus a short checklist, David pastes a few commands into the Proxmox shell, and Claude verifies afterwards. Claude gets no SSH access.

### Claude's Discretion
- Exact pixel and monospace font choices (must be self-hosted), sizes and spacing.
- Precise stale thresholds per layer, pulse/fade timings, list ordering within Phase 1 (a simple urgency sort is fine until Phase 4 ranking).
- Geocoder choice for address search (Nominatim proxied and cached server-side is the research default).
- Whether the LXC is created by a host-side script (`pct create`) or by a manual checklist step followed by an in-container script.
- Service manager details (systemd + uv per research).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope and requirements
- `.planning/PROJECT.md` — vision, hard rules (no person-level data), constraints
- `.planning/REQUIREMENTS.md` — PLAT-01..07, HUD-01, HUD-02, ENV-04, ENV-07 definitions
- `.planning/ROADMAP.md` §Phase 1 — goal and success criteria

### Research (stack, architecture, pitfalls)
- `.planning/research/SUMMARY.md` — resolved conflicts, stack versions, Phase 1 delivery list, critical pitfalls
- `.planning/research/STACK.md` — FastAPI/uvicorn/httpx/pydantic versions, Vite/vite-plugin-pwa, `tailscale serve` command, LXC deploy
- `.planning/research/ARCHITECTURE.md` — Provider contract, Item/Layer schema, stores, SSE hub, client open sequence (IndexedDB → server cache → SSE)
- `.planning/research/PITFALLS.md` — countdown drift, origin churn, HTTPS on iPhone, LXC TUN, iOS standalone geolocation, timezone/`tzdata`
- `.planning/research/FEATURES.md` — table-stakes item schema, freshness and stale indicators

### Visual references
- `.planning/references/hero-eyes.png` — pixel title bar style (recolour to red); the hero itself is Phase 2
- `.planning/references/nethack-view.png` — cold blue and red palette, thin frame, label style

### Keys and access
- `.planning/API-KEYS.md` — Tailscale setup steps (MagicDNS, HTTPS certs, key expiry); `.env` layout

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None. Greenfield repo (only README.md, CLAUDE.md, .gitignore, .planning/).

### Established Patterns
- `.gitignore` already excludes `.env` / `.env.*` (except `.env.example`). Keys and home coordinates live in server `.env`/config.
- Git in this repo needs a `safe.directory` override (the E: drive doesn't record ownership). Use `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0=E:/shinigamieyes/shinigamieyes` on git commands.

### Integration Points
- Proxmox host (already on the tailnet) → new LXC `shinigami`.
- Development happens on Windows (E:), deployment on Debian LXC, so use cross-platform tooling and include `tzdata` for zoneinfo on Windows.

</code_context>

<specifics>
## Specific Ideas

- Title bar style from the hero reference: a pixel-font bar like "EYES" with a close box, recoloured red.
- Countdown examples to match: `Golden hour: ends in 18:42`, `UV protection: until 3h 12m`.
- OFF-GRID banner copy: `OFF-GRID · last sync 14m ago`.
- David's real places: lives in **Bulleen**, studies at **Monash Clayton**, trains at **Hammers Gym Nunawading**, often in the CBD.

</specifics>

<deferred>
## Deferred Ideas

None. Discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation-and-flat-hud-slice*
*Context gathered: 2026-11-05*
