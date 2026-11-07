---
phase: 02-3d-map-hero-and-surveillance
plan: 06
subsystem: provisioning
tags: [tiles, cameras, deploy, ops]
requires: ["02-04", "02-05"]
provides: ["Greater Melbourne PMTiles on the CT", "cameras.json on the CT", "weekly camera timer armed"]
affects: ["02-09..02-14 (real map data and cameras on device)"]
tech-stack:
  added: ["go-pmtiles v1.31.2 CLI in the CT (/usr/local/bin, sha256 pinned)", "openssh-server in the CT (key-only root, from= this PC's tailnet IP)"]
  patterns: ["Claude runs CT ops over SSH with a dedicated, revocable key"]
key-files:
  created: []
  modified: [deploy/install-pmtiles.sh, deploy/refresh-tiles.sh, deploy/verify.sh, deploy/shinigami-data.service, deploy/UAT-DEVICE.md]
decisions:
  - "D-13 changed by David (2026-11-07): Claude gets SSH to CT 110 only (dedicated ed25519 key restricted with from=100.122.1.115); never the Proxmox host"
metrics:
  tasks: 3
  completed: 2026-11-07
---

# Phase 2 Plan 06: Provision tiles and cameras on the CT Summary

The CT now serves a 125 MB Greater Melbourne PMTiles extract over the tailnet and holds a fresh camera dataset (674 CCTV, 189 speed, 136 red-light) that the server loads without a restart.

## Results
- Disk: 5.8 GB free before, no resize needed; 5.6 GB free after.
- Extract: dry-run 130 MB, final 125 MB, maxzoom 15, bbox 144.2,-38.55,145.75,-37.45.
- Camera job: 3 min, 249 MB peak memory, cameras.json 82 KB; weekly timer next run armed.
- `verify.sh --remote` 15/0/0; `verify.sh --local` 19/0/0.
- CBD probe: road-camera layer fresh with 13 cameras within 1 km; CCTV layer fresh (none mapped within 150 m of the probe point).

## Deviations
1. [Rule 1] `pmtiles: command not found` under `pct exec`/`runuser` (minimal PATH). Scripts now export `/usr/local/bin` (b6a75d7).
2. [Rule 1] `tile_cbd` check: HEAD fell through to the static 404, Windows Python printed CR into the tile maths, and tailscale serve strips gzip without `Accept-Encoding`. Check now uses GET, digit-filters x/y, sends the header (1dad315). Server unchanged.
3. [Rule 1] `shinigami-data.service` failed 203/EXEC because git stores the script as 644; unit now runs `/bin/bash refresh-data.sh` (1dad315).
4. Task 2 (David runs the provisioning) was finished by Claude over SSH after David installed a dedicated key (D-13 change above).

## Known Stubs
None.

## Threat Flags
- New access path: SSH root into CT 110, key-only, restricted to this PC's tailnet address; revoke by deleting the `claude-code-ct110` line in `/root/.ssh/authorized_keys`. Only counts and sizes recorded (T-02-21).

## Self-Check: PASSED
