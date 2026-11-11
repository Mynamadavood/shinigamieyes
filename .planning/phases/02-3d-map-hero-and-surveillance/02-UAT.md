---
status: complete
phase: 02-3d-map-hero-and-surveillance
source: [02-14 Gate 3 in deploy/UAT-DEVICE.md]
started: 2026-11-07T00:00:00+11:00
updated: 2026-11-11T00:00:00+11:00
---

## Current Test

number: none
name: Gate 3 signed GO by David (2026-11-11) after gap plans 02-15..02-18
awaiting: none

## Tests

Full per-item results live in `deploy/UAT-DEVICE.md` Gate 3 (19 items: 17 pass, 2 skipped).

### 1. Saved place shows no cameras (PROVISIONAL decision 1)
expected: confirm or flip
result: issue
reported: "show cams" (then chose: all saved places except Home)
severity: major

### 2. Guard cameras excluded, private operator names dropped (PROVISIONAL decision 2)
expected: confirm or flip
result: issue
reported: "show if legally possible" (then chose: guards + business owner names)
severity: major

### 3. Speed camera tag at the screen edge
expected: tags fully visible
result: issue
reported: Claude noticed in David's 2026-11-07 iPhone screenshot: the `Speed camera` label clips at the right screen edge
severity: cosmetic

### 4. Open card over tags
expected: the card does not hide the tags around it
result: issue
reported: Claude noticed in David's 2026-11-07 iPhone screenshot: an open card covers nearby tags
severity: minor

## Summary

total: 19
passed: 17
issues: 4 (2 flipped decisions, 2 layout notes)
pending: 0
skipped: 2 (reduced motion not tried; Web Inspector needs a Mac, covered by verify.sh CSP/CDN checks)
blocked: 0

## Gaps

- truth: "Saved places other than Home show the camera layers (CCTV 150 m, speed/red-light 1 km) with distances from the place; Home shows none and keeps the `not shown for saved places` readout"
  status: closed
  reason: "User reported: show cams. Chose: all saved places except Home, so Home's location never reaches the phone"
  severity: major
  test: 1
  root_cause: "assemble.py skips every provider with exact_location_only when location.source == 'pin'. Tags measure distance only for gps/search views (map.ts setView), so pin views get no origin"
  artifacts: [server/shinigami/assemble.py, server/shinigami/places.py, server/shinigami/providers/cameras.py, web/src/map/map.ts, web/src/map/tags.ts, web/src/app.ts, deploy/verify.sh]
  missing:
    - "Per-place rule: cameras for saved places, never for Home. Prefer a places.toml flag (e.g. `cameras = false` on home, default true) over matching the id 'home', so the rule survives renames"
    - "Saved place profiles still never send the place's own lat/lon (location.lat/lon stay null); camera items carry their own positions"
    - "Client needs an origin for distance and red-tag ranking on pin views without the place coordinates: use distances computed server-side (detail.distance_m) or the camera layer centre; decide in planning"
    - "verify.sh place_no_cameras must change: Home (or any place with cameras=false) has no camera layers; another place does"
    - "Do not log or print places.toml coordinates in tests or verify output"
  debug_session: ""

- truth: "CCTV includes OSM guard posts (surveillance:type=guard) and shows owner names except when OSM marks the owner private or the camera is on a residential spot"
  status: closed
  reason: "User reported: show if legally possible. Chose: guards + business names"
  severity: major
  test: 2
  root_cause: "refresh_cameras.cctv_record drops surveillance:type=guard; public_operator keeps only operator:type public/government or names matching a public-body regex"
  artifacts: [server/shinigami/data/refresh_cameras.py, server/tests/test_refresh_cameras.py, web/src/map/camera-card.ts]
  missing:
    - "Emit guard posts as CCTV records (card type reads like `Guard post`)"
    - "Keep operator unless operator:type is private/individual/personal, or the node's tags mark a residential spot (building=house/residential/apartments/detached, or addr:housenumber with no shop/amenity/office/tourism tag); drop when unsure"
    - "Never emit personal-looking names: no name/contact/phone/email/website tags pass through"
    - "Card copy for guard posts keeps `Mapped, not exhaustive.`; nothing identifies a person"
    - "Re-run shinigami-data.service on the CT after deploy so cameras.json picks up the change"
  debug_session: ""

- truth: "Camera tag labels near the screen edge stay fully on screen"
  status: closed
  reason: "Observed in David's iPhone screenshot: `Speed camera` label clipped at the right edge"
  severity: cosmetic
  test: 3
  root_cause: "Tag labels extend right of the anchor with no viewport check"
  artifacts: [web/src/map/tags.ts, web/src/styles/tags.css]
  missing:
    - "Flip the label to the left of the icon (or clamp) when it would cross the safe-area edge"
  debug_session: ""

- truth: "An open info card does not hide the tags around it"
  status: closed
  reason: "Observed in David's iPhone screenshot: card overlaps nearby tags"
  severity: minor
  test: 4
  root_cause: "Card is placed at the tag with no avoidance of other tags"
  artifacts: [web/src/map/card.ts, web/src/map/leader.ts, web/src/styles/tags.css]
  missing:
    - "Place the card on the side with fewest tags, or dim/raise covered tags; keep the leader line to the selected tag"
  debug_session: ""
