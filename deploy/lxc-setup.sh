#!/usr/bin/env bash
# Run INSIDE the shinigami LXC as root, after cloning the repo to /opt/shinigami.
# Installs Node 22, uv, Tailscale (own node "shinigami"), the systemd unit, and
# publishes 127.0.0.1:8000 on the tailnet with `tailscale serve` (never Funnel).
# Idempotent. Official vendor installers (NodeSource, astral.sh, tailscale.com)
# run once as root over HTTPS; single-user homelab, accepted risk.
set -euo pipefail

REPO=/opt/shinigami

if [ ! -c /dev/net/tun ]; then
  cat >&2 <<'EOF'
FATAL: /dev/net/tun is missing in this container.
Fix on the Proxmox host (then `pct reboot <CTID>`): add to /etc/pve/lxc/<CTID>.conf
  lxc.cgroup2.devices.allow: c 10:200 rwm
  lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
(deploy/proxmox-create-lxc.sh does this automatically.)
EOF
  exit 1
fi

[ -d "$REPO/deploy" ] || { echo "FATAL: $REPO is not a checkout of the repo." >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git gnupg sqlite3 iproute2

# Node 22 (D-15, Vite 8 needs >= 22.12)
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<12)){console.error("Node >= 22.12 required, got "+process.version);process.exit(1)}'
echo "node $(node -v)"

# uv
# Must land in /usr/local/bin: deploy.sh runs uv as the `shinigami` service user,
# who cannot see root's ~/.local/bin. UV_UNMANAGED_INSTALL forces a fixed dir.
if [ ! -x /usr/local/bin/uv ]; then
  if [ -x /root/.local/bin/uv ]; then
    install -m 0755 /root/.local/bin/uv /root/.local/bin/uvx /usr/local/bin/
  else
    curl -LsSf https://astral.sh/uv/install.sh | env UV_UNMANAGED_INSTALL=/usr/local/bin sh
  fi
fi
/usr/local/bin/uv --version

# service user and directories
id shinigami >/dev/null 2>&1 || useradd --system --home-dir /opt/shinigami --shell /usr/sbin/nologin shinigami
install -d -o shinigami -g shinigami /opt/shinigami-python /var/cache/shinigami-uv
install -d -m 0750 -o root -g shinigami /etc/shinigami

if [ ! -f /etc/shinigami/.env ]; then
  install -m 0640 -o root -g shinigami "$REPO/.env.example" /etc/shinigami/.env
fi
if [ ! -f /etc/shinigami/places.toml ]; then
  install -m 0640 -o root -g shinigami "$REPO/deploy/places.example.toml" /etc/shinigami/places.toml
fi
chmod 0640 /etc/shinigami/.env /etc/shinigami/places.toml
chown root:shinigami /etc/shinigami/.env /etc/shinigami/places.toml
echo "Edit /etc/shinigami/places.toml: set home lat/lon"

# Tailscale (own node, frozen hostname)
if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
systemctl enable --now tailscaled
if ! tailscale status >/dev/null 2>&1; then
  echo "Tailscale is logged out. Open the URL below to approve this node."
  tailscale up --hostname=shinigami
fi
tailscale serve --bg --https=443 http://127.0.0.1:8000
tailscale serve status

# systemd unit
install -m 0644 "$REPO/deploy/shinigami.service" /etc/systemd/system/shinigami.service
systemctl daemon-reload
systemctl enable shinigami

bash "$REPO/deploy/deploy.sh"
