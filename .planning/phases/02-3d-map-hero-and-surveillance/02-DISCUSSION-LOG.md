# Phase 2: 3D Map, Hero and Surveillance - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-07
**Phase:** 02-3d-map-hero-and-surveillance
**Areas discussed:** Red-eyes opening, Map view and camera, Map tags and info cards, Cameras, Offline map, Position marker, Red building highlights

---

## Red-eyes opening

| Question | Options | Selected |
|----------|---------|----------|
| When it plays | Every cold open / First open each day / Every open incl. resume | Every cold open |
| Animation | Snap open + red flash / Glitch in / Slow fade | Snap open + red flash |
| Art source | Original SVG in that style / User provides art / Pixel-art eyes | Original SVG |
| Frame | Keep EYES bar, tap anywhere skips / Eyes only | Keep EYES bar |

## Map view and camera

| Question | Options | Selected |
|----------|---------|----------|
| Screen split | Full map + pull-up drawer / Fixed split / Map-list toggle | Full map + drawer |
| Camera follow | North-up follows / Rotates with heading / Fixed view | North-up follows |
| Touch | Free pan + recenter + long-press pin / Free pan, no pin / Locked | Free pan + recenter + long-press pin |
| Tile coverage | Greater Melbourne / All of Victoria | Greater Melbourne |

## Map tags and info cards

| Question | Options | Selected |
|----------|---------|----------|
| Unpositioned items | HUD corner readouts / Drawer only / Tag at your position | HUD corner readouts |
| Card style | Floating beside tag / Bottom sheet / Hybrid | Floating beside tag |
| Tag budget | Nearest + urgent, rest as dots / Nearest only / Cluster counts | Nearest + urgent, rest as dots |
| Camera card | Type, distance, source + caveat / Minimal | Full |

## Cameras

| Question | Options | Selected |
|----------|---------|----------|
| Look | Blue, red within ~30 m / Always red / Blue only | Blue, red within ~30 m |
| Countdown rule | Map + count readout / Drawer rows with distance / Walking-time countdown | Map + count readout |
| Speed-cam radius | ~1 km / 150 m / Everything on screen | ~1 km |
| Caveat placement | Readout + every card / Cards only | Readout + every card |

## Extra areas

| Question | Options | Selected |
|----------|---------|----------|
| Offline map | Cached area, grid beyond / Grid + tags only / Fall back to list | Cached area, grid beyond |
| Position marker | HUD reticle + ring / Pulsing dot / Simple dot | Other: "a cool icon, personal touch" → offered eye glyph / apple / initial / reticle combo → David: "1, or Light himself" → Light would copy an existing character; offered red eye glyph / original silhouette / eye in reticle → **Original silhouette** |
| Red buildings | Tapped only / Also camera buildings / All blue | Tapped only |

## Claude's Discretion

Tilt, zoom range, drawer snap points, icon set, tile pipeline, CCTV/speed-camera data pipeline, phone tile cache size, reduced-motion handling.

## Deferred Ideas

Compass-heading rotation; red tint on camera buildings; all-of-Victoria tiles.
