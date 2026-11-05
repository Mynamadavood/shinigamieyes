#!/usr/bin/env bash
# Run on the PROXMOX HOST shell as root (not inside a container).
# Creates the unprivileged Debian LXC "shinigami" with onboot=1 and /dev/net/tun
# passthrough (needed for the container's own Tailscale node). Re-runnable: it
# refuses to create a second CT with the same hostname (no duplicate identities).
#
# Overrides (env): CTID STORAGE BRIDGE MEMORY SWAP DISK_GB CORES
set -euo pipefail

command -v pct >/dev/null 2>&1 || { echo "FATAL: pct not found - run this on the Proxmox host." >&2; exit 1; }

if pct list | awk 'NR>1 {print $NF}' | grep -qx 'shinigami'; then
  echo "FATAL: a CT with hostname 'shinigami' already exists. Delete it and its Tailscale machine first." >&2
  exit 1
fi

CTID="${CTID:-$(pvesh get /cluster/nextid)}"
STORAGE="${STORAGE:-local-lvm}"
BRIDGE="${BRIDGE:-vmbr0}"
MEMORY="${MEMORY:-1536}"
SWAP="${SWAP:-512}"
DISK_GB="${DISK_GB:-8}"
CORES="${CORES:-2}"

echo "CTID=$CTID STORAGE=$STORAGE BRIDGE=$BRIDGE MEMORY=$MEMORY SWAP=$SWAP DISK_GB=$DISK_GB CORES=$CORES"

pveam update
TEMPLATE="$(pveam available --section system | awk '{print $2}' | grep -E '^debian-13-standard' | sort -V | tail -n1 || true)"
if [ -z "$TEMPLATE" ]; then
  TEMPLATE="$(pveam available --section system | awk '{print $2}' | grep -E '^debian-12-standard' | sort -V | tail -n1 || true)"
fi
[ -n "$TEMPLATE" ] || { echo "FATAL: no debian-13/12 standard template found." >&2; exit 1; }
echo "Template: $TEMPLATE"

if ! pveam list local | grep -q "$TEMPLATE"; then
  pveam download local "$TEMPLATE"
fi

pct create "$CTID" "local:vztmpl/$TEMPLATE" \
  --hostname shinigami \
  --unprivileged 1 \
  --features nesting=1 \
  --cores "$CORES" \
  --memory "$MEMORY" \
  --swap "$SWAP" \
  --rootfs "$STORAGE:$DISK_GB" \
  --net0 "name=eth0,bridge=$BRIDGE,ip=dhcp" \
  --onboot 1 \
  --startup order=5,up=30 \
  --ostype debian

CONF="/etc/pve/lxc/$CTID.conf"
add_line() {
  grep -qxF "$1" "$CONF" || echo "$1" >> "$CONF"
}
add_line 'lxc.cgroup2.devices.allow: c 10:200 rwm'
add_line 'lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file'

pct start "$CTID"
pct config "$CTID" | grep -E 'onboot|hostname'
echo
echo "Next: pct enter $CTID"
