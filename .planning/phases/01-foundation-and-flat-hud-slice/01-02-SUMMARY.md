---
phase: 01-foundation-and-flat-hud-slice
plan: 02
subsystem: infra
tags: [proxmox, lxc, tailscale, systemd, bash, deploy]
requires: []
provides:
  - deploy kit (LXC create, in-container setup, redeploy, systemd unit)
  - deploy/verify.sh --local / --remote smoke verifier
  - paste-ready CHECKLIST and device UAT gates
affects: [01-03, 01-11]
tech-stack:
  added: []
  patterns: [loopback bind + tailscale serve, EnvironmentFile in /etc/shinigami]
key-files:
  created:
    - .gitattributes
    - deploy/proxmox-create-lxc.sh
    - deploy/lxc-setup.sh
    - deploy/deploy.sh
    - deploy/shinigami.service
    - deploy/verify.sh
    - deploy/CHECKLIST.md
    - deploy/UAT-DEVICE.md
    - deploy/places.example.toml
    - .env.example
  modified:
    - .planning/API-KEYS.md
key-decisions:
  - "verify.sh SKIPs endpoints from later plans while they 404"
requirements-completed: [PLAT-01, PLAT-07]
duration: 15min
completed: 2026-11-05
---

# Phase 1 Plan 02: Deployment kit Summary

Scripts, systemd unit and verifier so David can go from empty Proxmox to a Tailscale-only shinigami LXC by pasting commands, with `verify.sh` checking loopback bind, serve tailnet-only, funnel off, frozen FQDN, SIGKILL restart, journald hygiene and /api/profile p95.

## Tasks

1. Scripts, unit, verify.sh, .gitattributes: commit b4a3947
2. CHECKLIST, UAT-DEVICE, places/env examples, API-KEYS path fix: commit 42efdeb

## Checks run

- `bash -n` on all four scripts: pass (shellcheck not installed)
- `bash deploy/verify.sh --remote https://example.com`: FAIL hostname_shape, exit 1, JSON line printed
- Funnel grep gate (only `funnel status`), no `0.0.0.0` in unit, .env.example has no key values: pass
- `.gitignore` (from 01-01) correctly un-ignores `.env.example` and `deploy/places.example.toml`

## Deviations from Plan

None. Scripts could not be executed against Proxmox/LXC (no access, D-13); runtime behavior is unverified until plan 01-03.

## Notes

- CHECKLIST step 4 notes that lxc-setup.sh's final deploy step may stop at the health check until config (step 5) is done; re-run deploy.sh.

## Known Stubs

None.

## Self-Check: PASSED
