---
phase: 01-foundation-and-flat-hud-slice
plan: 03
subsystem: infra
tags: [proxmox, lxc, tailscale, ios, pwa, uat]
requires: [01-01, 01-02]
provides:
  - live shinigami LXC (CT 110, onboot) serving the skeleton at https://shinigami.<tailnet>.ts.net
  - Gate 1 iPhone go/no-go signed GO
affects: [01-04, 01-08, 01-11]
tech-stack:
  added: []
  patterns: [tailscale serve over loopback uvicorn, git-pull deploy]
key-files:
  created:
    - .planning/phases/01-foundation-and-flat-hud-slice/01-03-SUMMARY.md
  modified:
    - deploy/UAT-DEVICE.md
    - deploy/proxmox-create-lxc.sh
    - deploy/lxc-setup.sh
    - deploy/deploy.sh
key-decisions:
  - "SSE through tailscale serve verified unbuffered: keep SSE for live fill-in (no polling fallback, Pitfall 12 not triggered)"
requirements-completed: [PLAT-01, PLAT-07]
duration: ~2h (human-paced)
completed: 2026-11-05
---

# Phase 1 Plan 03: Deploy + iPhone Gate 1 Summary

David provisioned the `shinigami` LXC on Proxmox (CT 110, unprivileged, onboot 1, /dev/net/tun), joined it to the tailnet as its own node `shinigami`, deployed the skeleton, and passed the iPhone go/no-go.

## Tasks

| # | Task | Result |
|---|------|--------|
| 1 | David provisions LXC + deploys | Done. `verify.sh --local` → `{"pass":13,"fail":0,"skip":1}` |
| 2 | Claude verifies from dev PC (D-14) | `verify.sh --remote` → `{"pass":8,"fail":0,"skip":4}`; TLS, tailnet-only IP, CSP, SW no-cache, manifest, SSE unbuffered, public DNS not routable all PASS. Recorded in UAT-DEVICE.md (d451ac9) |
| 3 | iPhone Gate 1 | David: "go" — all six steps passed (Safari TLS with Pi-hole + AdGuard, A2HS icon, standalone full-screen, SSE ticking, Tailscale-off no load, survives `pct reboot`) |

## Deviations (bugs found during bring-up, fixed in the deploy kit)

1. **[Rule 1 - Bug] Wrong template architecture** — `pveam available` now lists arm64 templates and `sort -V` picked `_arm64`, so CT start failed with `Exec format error`. Fixed: template filter pinned to `dpkg --print-architecture` (3ed6194).
2. **[Rule 1 - Bug] uv installed only for root** — astral installer ignored `UV_INSTALL_DIR`, putting uv in `/root/.local/bin`. Fixed: `UV_UNMANAGED_INSTALL=/usr/local/bin` + copy fallback; deploy.sh asserts `/usr/local/bin/uv` (9c4dd81).
3. **[Rule 1 - Bug] runuser drops /usr/local/bin from PATH** on Debian 13. Fixed: deploy.sh `as_svc` sets PATH explicitly (4da1b67).
4. **Operator slip (no code change):** `tailscale up --hostname=shinigami` was first run on the Proxmox host, renaming the host's node. Host was clean otherwise; David renamed it back with `tailscale set --hostname=proxmox`.

Note: deploy.sh's own `git pull` updates the script after bash has loaded it, so a fix to deploy.sh takes effect on the *next* run.

## Self-Check: PASSED
