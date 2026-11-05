# Phase 1: Foundation and Flat HUD Slice — Discussion Log

**Date:** 2026-11-05
**Mode:** discuss (default)
**Areas selected:** Flat HUD look, Countdown & OFF-GRID style, Location & manual pin, Server & hostname setup

> Human reference only. Downstream agents read `01-CONTEXT.md`.

## Flat HUD look

| Question | Options | Selected |
|----------|---------|----------|
| Phase 1 list look before the map | Full HUD from day one (rec) / Plain and functional / Terminal readout | **Full HUD from day one** |
| Font direction | Pixel title + clean mono body / Pixel everywhere / Watch Dogs sans | **Pixel title + clean mono body** |
| Accent colours | Red + cold blue (rec) / Red only / Red + magenta | **Red + cold blue** |

## Countdown & OFF-GRID style

| Question | Options | Selected |
|----------|---------|----------|
| Countdown format | Adaptive (rec) / Always clock-style / Words | **Adaptive** |
| At zero / stale | Flash red then fade out (rec) / Flip to next event / Quiet dim only | **Flash red then fade out** |
| OFF-GRID loudness | Persistent red banner / Subtle corner tag / Glitch takeover | **Persistent red banner** |

## Location & manual pin

| Question | Options | Selected |
|----------|---------|----------|
| Manual pin without a map | Saved places + address search (rec) / Saved places only / Address search only | **Saved places + address search** |
| Location refresh | On open + every ~100 m (rec) / Continuous / Only on open | **On open + every ~100 m** |
| Starting presets | Home / Monash Clayton / Melbourne CBD / Hammers Gym Nunawading | **All four.** Note: home is in **Bulleen** (not Nunawading) |

## Server & hostname setup

| Question | Options | Selected |
|----------|---------|----------|
| Tailscale on Proxmox? | On host / Inside VMs / Not yet | **Yes, on the Proxmox host** |
| Where it runs | New unprivileged LXC (rec) / New Debian VM / Alongside LifeOS/SPENCER | **New unprivileged LXC** |
| Final hostname | shinigami / eyes / ryuk | **shinigami** |
| Setup delivery | Scripts I run (rec) / Step-by-step guide / Claude over SSH | **Scripts I run** |

## Claude's discretion
Font picks, timings, stale thresholds, geocoder, LXC creation method, service manager details.

## Deferred ideas
None.
