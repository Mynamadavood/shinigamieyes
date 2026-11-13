# Phase 3: Transit - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-13
**Phase:** 03-transit
**Areas discussed:** Which stops count as nearby, How departures are shown, Vehicles on the map, Disruptions, Data keys

---

## Which stops count as nearby

| Question | Options | Selected |
|----------|---------|----------|
| How many stops | Nearest per mode / Everything within a radius / Nearest few, any mode | Nearest per mode ✓ |
| Directions | Both directions / Single nearest stop only | Both directions ✓ |
| Walk limit | By mode (train 1.5 km, tram 800 m, bus 500 m) / One limit for all / No limit | By mode ✓ |
| Saved places | All except Home / Home too, but blurred / All places including Home | All except Home ✓ |

**Notes:** Walk-time maths left to Claude (about 5 km/h, straight line plus detour allowance).

---

## How departures are shown

| Question | Options | Selected |
|----------|---------|----------|
| Where | Drawer rows + stop card / Stop card only / Drawer only | Drawer rows + stop card ✓ |
| Card depth | Next 2 per route and direction / Next 5, any route / Everything in the next 30 min | Next 2 per route and direction ✓ |
| Catchable | Dim it, show next catchable / Show all, mark "can't make it" / Ignore walk time | Dim it, show next catchable ✓ |
| Countdown target | Departure time plus "leave in" / "Leave by" only / Departure time only | Departure time plus "leave in" ✓ |

**Notes:** Live/scheduled marking left to Claude (LIVE / SCHED labels, delayed N min).

---

## Vehicles on the map

| Question | Options | Selected |
|----------|---------|----------|
| Which vehicles | Only ones heading to your stops / Everything nearby / Only the next one per route | Only ones heading to your stops ✓ |
| Look | Small icon + route, card on tap / Full tag with countdown / Dot only | Small icon + route, card on tap ✓ |
| Tag priority | Stops, then vehicles, then cameras / Cameras stay first / Separate budgets | Stops, then vehicles, then cameras ✓ |
| Off-screen stops | Edge pointers / Leave them off screen / "Show transit" button | Edge pointers ✓ |

**Notes:** Vehicle colour and stale fade left to Claude.

---

## Disruptions

| Question | Options | Selected |
|----------|---------|----------|
| Which alerts | Routes at your nearby stops / Anything within a few km / Network-wide majors too | Routes at your nearby stops ✓ |
| Placement | On the affected rows + a count readout / Own rows in the drawer / Stop card only | On the affected rows + a count readout ✓ |
| Red rule | Only when it stops your service / Any current disruption / Never red | Only when it stops your service ✓ |

---

## Data keys

| Question | Options | Selected |
|----------|---------|----------|
| GTFS Realtime key status | Only the PTV key so far / I have both / Applied, waiting | Only the PTV key so far ✓ |

---

## Claude's Discretion

Walk-time maths; live/scheduled marking; vehicle styling and stale fade; stop icons; polling cadence and stop storage; direction derivation; late-night and loading states.

## Deferred Ideas

GTFS Realtime as main live source (when key arrives); network-wide major disruptions; "show transit" zoom-to-fit button; voice memo capture todo (not transit).
