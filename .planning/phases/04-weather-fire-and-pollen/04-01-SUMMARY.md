# 04-01 Summary: weather, fire danger, pollen, chips and toggles

**Built 2026-11-27 outside the usual discuss/plan loop (GSD commands were not available in the cloud session; Boss asked to start on the no-key pieces).** One plan, one PR. Status: code complete, tests green, **device UAT pending**.

## Sources (all probed live 2026-11-27, no keys)

| Layer | Source | Tier | Notes |
|-------|--------|------|-------|
| `weather` | Open-Meteo `current` + `minutely_15` precipitation (6 h) | on_demand, per 0.1° cell, TTL 15 min | Cell centre only leaves the box. BOM unofficial API skipped (Open-Meteo works and is CC BY) |
| radar | Link-out to BOM IDR023 loop from the weather chip | - | ENV-02 allows link-out; an overlay needs FTP frames + reprojection, and remote images would break the CSP `img-src 'self'` |
| `fire_danger` | CFA RSS `cfa/rssfeed/central-firedistrict_rss.xml` | polled 30 min | Central district only (covers Greater Melbourne). AFDRS: No rating 0, Moderate 1, High 2, Extreme/Catastrophic 3; Total Fire Ban forces 3. Past the feed's last day the layer goes pending, never shows yesterday |
| `pollen` | melbournepollen.com.au home page (regex on CSS classes) | polled 3 h | Grass pollen Low 0..Extreme 3; thunderstorm asthma Low 0, Moderate 2, High 3. **Site says its forecasts are copyright, no reproduction without permission.** Private single-viewer display, but Boss should decide; the provider is one line to drop from `main.py`. VicEmergency asthma warnings were not wired (no asthma events in today's feed; the VicEmergency feed arrives with Phase 6 hazards) |
| `uv_now` | unchanged, now `chip: true` with severity from the band | - | |

## What changed

- `server/shinigami/providers/weather.py`, `fire.py`, `pollen.py`; registered in `main.py`. `arpansa.py` sets `chip` + band level.
- Items with `detail.chip: true` render as banded chips under the location strip (`web/src/ui/chips.ts`, `styles/chips.css`) and are skipped by `selectVisible`, so UV no longer takes a corner readout. The rain countdown ("Rain starts" / "Rain ends") stays a normal timed row.
- Escalation (HUD-07): colour follows the band always; the red pulse fires only when a chip's band rises between renders, never on first paint or a value change. Respects reduced motion.
- Toggles (HUD-08): `web/src/layers.ts` groups (Transit, Cameras, Weather, UV, Fire, Pollen, Sun) persisted in `localStorage`; toggle row shows in the open drawer. Hiding is view-only: the cached/stored profile and stream merges keep every layer, so turning a group back on is instant.
- Footer credits now list the chip sources (Open-Meteo CC BY, ARPANSA, CFA/BOM, AirHealth) beside the PTV licence.

## Tests

pytest 331 (was 314), vitest 439 (was 430), ruff and `npm run build` clean. Fixtures: `server/tests/fixtures/cfa_central.xml` (live shape, weekend values edited to cover HIGH and TFB), `melbournepollen.html` (trimmed live markup).

## UAT for Boss (on the phone)

1. Chips show WX, UV, FIRE, POLLEN, ASTHMA under the location strip; tapping WX opens the BOM radar in Safari.
2. A "Rain starts in" or "Rain ends in" row appears (or "dry next 6 h").
3. Open the drawer, untick Transit and UV: tags, rows and chips go; relaunch the app and they stay off.
