#!/usr/bin/env bash
# Run INSIDE the shinigami LXC as root. One-command redeploy (D-15):
# git pull + uv sync + npm ci + vite build + restart + verify.
# From the Proxmox host: pct exec <CTID> -- bash /opt/shinigami/deploy/deploy.sh
set -euo pipefail

cd /opt/shinigami

git -c safe.directory=/opt/shinigami pull --ff-only
chown -R shinigami:shinigami /opt/shinigami

[ -x /usr/local/bin/uv ] || { echo "FATAL: /usr/local/bin/uv missing - re-run deploy/lxc-setup.sh" >&2; exit 1; }

as_svc() {
  runuser -u shinigami -- env \
    UV_PYTHON_INSTALL_DIR=/opt/shinigami-python \
    UV_CACHE_DIR=/var/cache/shinigami-uv \
    HOME=/opt/shinigami "$@"
}

as_svc uv sync --frozen --no-dev
as_svc npm --prefix web ci
as_svc npm --prefix web run build

if ! cmp -s deploy/shinigami.service /etc/systemd/system/shinigami.service; then
  install -m 0644 deploy/shinigami.service /etc/systemd/system/shinigami.service
  systemctl daemon-reload
fi

systemctl restart shinigami

ok=0
for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
if [ "$ok" -ne 1 ]; then
  echo "FATAL: /api/health not up after 20 s. See: journalctl -u shinigami -n 50 --no-pager" >&2
  exit 1
fi

bash deploy/verify.sh --local
