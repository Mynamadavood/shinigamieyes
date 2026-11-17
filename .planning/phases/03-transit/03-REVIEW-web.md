---
phase: 03-transit
scope: web
reviewed: 2026-11-17T00:00:00Z
depth: standard
diff_base: d1afb34
files_reviewed: 29
files_reviewed_list:
  - web/public/icons.svg
  - web/src/app.test.ts
  - web/src/app.ts
  - web/src/map/card.test.ts
  - web/src/map/card.ts
  - web/src/map/edge-pointers.test.ts
  - web/src/map/edge-pointers.ts
  - web/src/map/map.test.ts
  - web/src/map/map.ts
  - web/src/map/tags.test.ts
  - web/src/map/tags.ts
  - web/src/map/transit-card.test.ts
  - web/src/map/transit-card.ts
  - web/src/map/types.ts
  - web/src/model.test.ts
  - web/src/model.ts
  - web/src/styles/app.css
  - web/src/styles/hud.css
  - web/src/styles/tags.css
  - web/src/styles/tokens.css
  - web/src/transit.test.ts
  - web/src/transit.ts
  - web/src/ui/disruption-sheet.test.ts
  - web/src/ui/disruption-sheet.ts
  - web/src/ui/next-list.test.ts
  - web/src/ui/next-list.ts
  - web/src/ui/readouts.test.ts
  - web/src/ui/readouts.ts
  - web/src/ui/shell.ts
findings:
  critical: 1
  warning: 11
  info: 7
  total: 19
status: issues_found
---

# Phase 3: Code Review Report (web)

**Reviewed:** 2026-11-17
**Depth:** standard
**Files Reviewed:** 29
**Status:** issues_found

## Summary

I reviewed the Phase 3 transit web changes (d1afb34..HEAD) with privacy first, then CSP/XSS, correctness, iPhone performance and accessibility.

**Privacy:** the main Home / camera-off paths hold.
- `stripExactLayers` removes both `cameras_*` and `transit_*` on the fetch path, the stream path, the debounced IndexedDB save and the cached-profile adoption.
- The map, tag layer, edge pointers, card context and disruption readout all read the stripped profile.
- Switching to Home clears tags, pointers and any open tag card.
- One defence-in-depth gap remains (WR-W11): it only matters if the server also fails.

**CSP/XSS:** clean. All PTV text goes through `textContent` or `setAttribute("aria-label")`. There is no `innerHTML`, no `style=` attribute and no outbound link. Inline layout uses CSSOM `style.setProperty`, which `style-src 'self'` allows. Icon hrefs only come from fixed lists of names.

**Main defect:** the edge pointers (D-14) can never appear in the real app. They are hidden whenever a `.sheet-backdrop` element exists, and both sheets keep theirs in the DOM for the whole session. The test fakes a sheet that is added and removed, so it does not catch this.

Other problems:
- The card's first countdown uses the phone clock instead of the server-corrected clock.
- Stop cards do not re-dim departures as time passes between frames.
- Countdown-line labels are dropped ("ends in" shows as a bare countdown).
- The vehicle fade never shows because the tag entry animation overrides it.
- Edge-pointer direction is wrong at the 60° follow pitch.
- Several layout reads run on every frame during map moves.

The D-08 30 s grace and the D-09 single red row work as built and as accepted. They are not flagged.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-W1: Edge pointers never render: `hidden()` is always true

**File:** `web/src/map/map.ts:373` (with `web/src/ui/disruption-sheet.ts:117-136`, `web/src/ui/location-sheet.ts:38-55`)
**Issue:** `hidden: () => document.querySelector(".sheet-backdrop") !== null`.
- `LocationSheet` and `DisruptionSheet` each create their `.sheet-backdrop` once in the constructor and append it for good. Both are built in `boot()` before the map loads.
- Closing a sheet only sets `backdrop.hidden = true`; the element stays in the DOM.
- So `querySelector` always finds an element, and `EdgePointers.recompute()` always goes to `removeAll()`.
- Result: D-14 / TRAN-01 edge pointers never show.
- `map.test.ts:770-781` hides the bug: it appends a fake `.sheet-backdrop` and then removes it, which is not how the real sheets behave.
- The UAT note "edge pointers bring the stop back" probably came from the drawer row's `focusStop` path. Re-check it on the device.

A second problem: even with a correct selector, `recompute()` only runs on map `move`/`moveend`, `update()` and `resize`. Opening or closing a sheet does not hide or restore the pointers until the map next moves.
**Fix:**
```ts
hidden: () => document.querySelector(".sheet-backdrop:not([hidden])") !== null,
```
Also call `pointers.recompute()` when either sheet opens or closes, for example through an `onToggle` callback or a `MutationObserver` on the two backdrops' `hidden` attribute. Change the map test to construct the real `LocationSheet` / `DisruptionSheet` and toggle `open()` / `close()`.

## Warnings

### WR-W1: Card countdowns start from the phone clock, then tick on the server clock

**File:** `web/src/map/tags.ts:681`, `web/src/map/card.ts:142`
**Issue:**
- `TagLayer.select()` builds the card content with `Date.now()`. Every other path, including `setCardContext` and `moveVehicle`, uses `nowMs()` (the server-offset clock).
- `depLine` also sets its first countdown text from `Date.now()`.
- `Card.tick` then uses `nowMs()` from `startTicker`.

With a skewed phone clock, the first frame shows a different value that jumps one second later. The stop card's catchable/`missed` check (`line()`) and the `DEPARTED_MS` filter also use the wrong clock, so the card's dimming can disagree with the drawer row, which uses `nowMs()`.
**Fix:** use `nowMs()` in `select()` (`desc.cardContent(..., nowMs())`). In `depLine`, take a `now` argument passed from `render()`, which gets it from `nowMs()`, instead of calling `Date.now()`.

### WR-W2: An open stop card never re-evaluates "missed" or departed lines between data frames

**File:** `web/src/map/card.ts:290-297`, `web/src/map/transit-card.ts:126-145,160-165`
**Issue:**
- `Card.tick` only rewrites the countdown text.
- The `missed` class (D-08 dimming) and the `DEPARTED_MS` drop are computed once, when the content is built.
- The content is only rebuilt when `setCardContext` sees a new departures or disruptions layer object.

So between polls, or indefinitely while off-grid or stale, a departure that has become uncatchable stays bright. A departed service stays listed at `00:00` (the countdown is clamped by `Math.max(0, …)`) until the next frame.

Also, every new departures frame calls `card.replace()`, which runs `replaceChildren()`. That resets the scroll position of a scrolled `.card-sections.scroll` block, so a busy stop card jumps back to the top about every 30 s.
**Fix:** give `CardLine` an optional `missAtMs` (target minus walk minus grace) and `goneAtMs`, and toggle `missed` / hide the line in `Card.tick`. Or re-run `stopCardContent` from the tag layer's 1 s tick while a stop card is open. Keep `sectionsEl.scrollTop` across `replace()`.

### WR-W3: Labels on countdown lines are dropped ("ends in", vehicle "<stop> in")

**File:** `web/src/map/card.ts:123-167`, `web/src/map/transit-card.ts:101-105,248`
**Issue:** `depLine` renders `line.text` only when there is no countdown (`countTargetMs === undefined && countText === undefined`). `alertSection` pushes `{ text: "ends in", countTargetMs }`, so the alert-end line shows a bare `05:12` under the alert title with no "ends in" label. That breaks the "name and countdown" rule and is confusing next to departure countdowns.

The vehicle line `{ text: "<stop> in", countTargetMs }` loses its text the same way; there the section head happens to repeat it. `transit-card.test.ts:157` only checks the view-model, never the rendered DOM.
**Fix:** in the countdown branch of `depLine`, add `if (line.text) { const l = document.createElement("span"); l.className = "dep-label"; l.textContent = line.text; el.insertBefore(l, count); }`. Add a DOM test asserting that the "ends in" text appears in the card.

### WR-W4: Vehicle fade-out (stale position) never shows

**File:** `web/src/styles/tags.css:13,94` and the new `.map-tag.vehicle.fading` rule
**Issue:**
- `.map-tag` has `animation: tag-in … linear both`, and the `tag-in` keyframes end at `opacity: 1`.
- With `fill-mode: both`, the animated value stays after the animation ends, and animation values beat normal author declarations.
- So `.map-tag.vehicle.fading { opacity: var(--o-fade) }` (and the 400 ms opacity transition) never takes effect, except for reduced-motion users, where the animation is `none`.

A vehicle whose position is 2–3 minutes old looks exactly like a live one until it disappears at 180 s. That defeats the staleness cue in the discretion notes ("older than about 2 minutes fades out"). jsdom tests cannot catch it.
**Fix:** use `animation-fill-mode: backwards` for `tag-in`, or put the fade on an inner wrapper. For example: `.map-tag.vehicle.fading .tag-icon, .map-tag.vehicle.fading .veh-badge { opacity: var(--o-fade); }`.

### WR-W5: Edge-pointer direction is wrong under the 60° follow pitch, and the ray origin differs from the bearing origin

**File:** `web/src/map/edge-pointers.ts:213-218`
**Issue:**
- The arrow angle is the geographic bearing from `map.getCenter()` minus the map bearing.
- At `FOLLOW.pitch = 60` (`view.ts:7`), the screen direction to a ground point is not its geographic bearing: perspective squeezes the forward axis.
- So a stop 45° right-forward projects at roughly 60–65° on screen. The chip lands on the wrong part of the edge and the arrow points away from where the stop really comes into view.
- The ray also starts at the clamp-rect centre (between the readouts bottom and the drawer top). That is not the screen point of `getCenter()`, which sits in the padded viewport centre (bottom padding 144).

The hysteresis is correct. The problem is only where the pointer is placed and which way it points.
**Fix:** for stops in front of the camera, use `map.project(lngLat)` and take the angle from `(cx, cy)` to the projected point. Fall back to the bearing method only when projection is not usable (behind the horizon). Alternatively take `cx, cy` from `map.project(getCenter())` so both origins match.

### WR-W6: Red within-30 m camera labels can be demoted by stop and vehicle boxes (D-13)

**File:** `web/src/map/tags.ts:107-123`
**Issue:** D-13 says "Cameras keep their red-within-30 m labels". In `assignTags`, red cameras skip the cap but still go through the overlap test, now against the stop boxes (40 px tall) and the vehicle boxes, which use the full 176 px label width even though a vehicle badge is about 24–48 px wide. A CCTV within 30 m of a stop at an intersection, which is common, gets demoted to a compact icon. Vehicles gliding past a near camera make its red label flicker on each reconcile.
**Fix:** exempt `red.has(c.id)` from the overlap test, as stops are exempt. At minimum, use a vehicle-sized box (badge width) for `prio === 1` in the collision check.

### WR-W7: The vehicle card is not refreshed when the ETA or destination changes without the vehicle moving

**File:** `web/src/map/tags.ts:545-553,566-569`
**Issue:** `syncVehicle` returns early when the coordinates are unchanged. Only `moveVehicle` calls `card.replace` for a selected vehicle. If an estimated tram or a stationary bus gets a new `eta_ts` / `eta_live` / `heading_stop_name` at the same position, the open card keeps counting down to the old ETA target and shows the old LIVE/SCHED value.
**Fix:** in `reconcile`, after updating `e.item`, call `card.replace(vehicleCardContent(e.item, nowMs()))` when `id === selectedId` and the item object changed, regardless of movement.

### WR-W8: Vehicle aria-label is rewritten every second

**File:** `web/src/map/tags.ts:541,610-618`
**Issue:** the 1 s ageing ticker calls `applyVehicleLook`, which does `setAttribute("aria-label", vehSpoken(...))`. That text contains a seconds countdown, so the label changes every second. VoiceOver can re-announce a focused element whose label changes, and it churns attributes on up to 8 markers each second. `NextList` and `Readouts` deliberately limit label updates to once a minute (`labelMinute`, `ARIA_REFRESH_MS`). This breaks that pattern.
**Fix:** only change the aria-label when the minute changes (or the est/fade state changes), as `NextList` does. Or leave the countdown out of the marker label, since the card carries it.

### WR-W9: Edge-pointer recompute forces layout on every map-move frame

**File:** `web/src/map/edge-pointers.ts:151-157,182-237`, `web/src/map/map.ts:355-368,375-380`
**Issue:** on every `move` frame (all pans, and every follow-mode GPS ease), `recompute()` does all of the following:
- `clampRect()`: `getComputedStyle(safeProbe)`, plus `getBoundingClientRect()` on `.readouts` and `.drawer`
- `avoid()`: `querySelector` plus `getBoundingClientRect()` on `.recenter`
- `hidden()`: `querySelector`
- per pointer: CSS var writes and `setAttribute("aria-label")`
- `offsetWidth` in `ensure` / `reveal`

The reads come after last frame's style writes, so each frame forces a synchronous style and layout recalculation on top of MapLibre's frame. That costs real frame time and battery on iPhone. The aria-label is also rewritten every frame even when it has not changed.
**Fix:** cache the clamp rect and safe-area insets. Refresh them on `resize`, on drawer state change and on sheet toggle, not per frame. Write `aria-label` only when it differs, as `distEl` already does.

### WR-W10: The disruption sheet is a frozen snapshot and survives a location change

**File:** `web/src/ui/disruption-sheet.ts:147-154`, `web/src/app.ts:146-148`
**Issue:**
- `open()` renders the layer it was given once.
- Later stream frames are never reflected: a cleared or added disruption does not show, and ended disruptions keep ticking at `00:00`.
- If David switches place while the sheet is open, it keeps listing the previous place's alerts under "YOUR ROUTES".
- Ended items are not filtered: `disruptionItems` ignores `target_ts <= now`.
- The corner readout, rendered every tick, can then disagree with the open sheet.
**Fix:** add `DisruptionSheet.update(layer)` and call it from `render()` while `isOpen()`. Close the sheet in `handle.setLocationParams` when the location identity changes. Drop items whose `to_ts` has passed.

### WR-W11: The client privacy backstop depends on the server or async state at cold start

**File:** `web/src/app.ts:184-191,296,343-345`
**Issue:** this is defence in depth only; the server rule is the main guard. For a camera-off place, `camerasOff(key)` is true only through one of:
- `noCameraPlaces`, which is filled only when the server already omitted every exact layer, so a server regression that sends `transit_*` for Home never adds Home to it
- `loc.state().pin.cameras === false`, which is undefined for a pin saved in location state before `cameras` was stored
- `places`, which is loaded asynchronously and is often still empty when the first `refetch()` resolves

The cached-adoption path checks only `savedPin?.cameras === false`. So if the server regressed and sent `transit_*` for Home on a cold open with legacy saved state, the first fetch would render Home's stops and distances, and `saveProfile` would write them to IndexedDB, before the places list arrives.
**Fix:** fail closed for pins.
- Treat a `place=` key as camera-off until its `cameras` flag is known to be `true` from `pin.cameras` or `places`.
- Re-strip and re-save the current profile when `loadPlaces` resolves.
- Use the same `camerasOff(restoredKey)` check on the cached-adoption path.

## Info

### IN-W1: Warning glyph renders as a solid triangle with no exclamation mark

**File:** `web/public/icons.svg` (`#warn`), `web/src/styles/tags.css` (`.dep-warn`, `.tag-warn svg`)
**Issue:** `#warn` draws the "!" as stroke-only paths (`M12 9v5M12 17v2`). `.dep-warn` and `.tag-warn svg` set `fill: currentColor` and, for tags, `stroke: none`. The triangle is filled in the same colour as the mark, so the "!" cannot be seen.
**Fix:** give the "!" its own contrasting fill/stroke in the symbol (for example a stroke set to the panel colour), or use outline styling consistently, as `.row-warn` does.

### IN-W2: The rules for "red" and "real disruption item" differ between modules

**File:** `web/src/model.ts:218-222,242`, `web/src/map/transit-card.ts:55-59,93`, `web/src/ui/readouts.ts:40`, `web/src/ui/disruption-sheet.ts:33-40`
**Issue:**
- Red means `severity === 3` in `model.ts` and `transit-card.ts`, but `severity >= 3 || service_stopped` in `readouts.ts` and `disruption-sheet.ts`.
- `transit-card` also excludes `detail.none` items; the other modules do not.

These agree with today's server output, but they will drift apart.
**Fix:** export one `isServiceStopping(item)` and one `disruptionItems(layer)` from `transit.ts` and use them everywhere.

### IN-W3: The drawer and the stop card use different walk times for the same stop under GPS

**File:** `web/src/model.ts:164-165`, `web/src/map/tags.ts:445-446`
**Issue:** drawer rows use the server's `walk_s`, measured from the request location. The card uses `walkSecondsFor(haversine)` from the current client fix. After a short walk the two can disagree about whether a departure is catchable.
**Fix:** prefer the client value for both, or pass the same `walkS` into `transitRows`.

### IN-W4: An edge pointer's width is measured once

**File:** `web/src/map/edge-pointers.ts:312-313`
**Issue:** `w` is cached when the pointer is created. When the distance text changes width (for example `950 m` to `1.2 km`), right-edge placement (`rect.right - w`) and the overlap checks use a stale width.
**Fix:** re-measure when `distEl` text changes.

### IN-W5: The vehicle card's "Position · N s ago" is static

**File:** `web/src/map/transit-card.ts:243`
**Issue:** the age is computed once per render and only refreshes when the vehicle moves.
**Fix:** render it as a ticking value, or refresh it from the ageing tick.

### IN-W6: Dead parameters and options

**File:** `web/src/ui/disruption-sheet.ts:115` (`_opts.reducedMotion` unused), `web/src/map/tags.ts:546` (`void now`)
**Fix:** remove them, or use `reducedMotion` for the sheet transition.

### IN-W7: A drawer row tap collapses the drawer even when `focusStop` fails

**File:** `web/src/app.ts:155-158`
**Issue:** if the map has not loaded yet, or the stop is not in `lastStopItems`, the drawer collapses and nothing else happens.
**Fix:** collapse only when `mapHandle?.focusStop(row.stopId)` returns true.

---

_Reviewed: 2026-11-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
