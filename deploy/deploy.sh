#!/usr/bin/env bash
# Run INSIDE the shinigami LXC as root. One-command redeploy (D-15):
# git pull + uv sync + npm ci + vite build + restart + verify.
# From the Proxmox host: pct exec <CTID> -- bash /opt/shinigami/deploy/deploy.sh
set -euo pipefail

cd /opt/shinigami

# Ownership (review CR-01): root owns the checkout, .git and deploy/ because root runs
# git and these scripts. The service user owns only build outputs that root never
# executes (.venv, web/ for `npm ci`, web/node_modules, web/dist). The unit's
# ProtectSystem=strict also makes /opt read-only to the running service.
lock_down() {
  chown -R root:root /opt/shinigami
  chmod -R go-w /opt/shinigami
  install -d -o shinigami -g shinigami /opt/shinigami/.venv /var/cache/shinigami-npm
  chown shinigami:shinigami /opt/shinigami/web
  for d in /opt/shinigami/.venv /opt/shinigami/web/node_modules /opt/shinigami/web/dist; do
    if [ -e "$d" ]; then chown -R shinigami:shinigami "$d"; fi
  done
}

lock_down
# Root-owned repo now, so no safe.directory override (that override disables git's
# protection against running hooks/config from a repo another user can write).
git pull --ff-only
lock_down

[ -x /usr/local/bin/uv ] || { echo "FATAL: /usr/local/bin/uv missing - re-run deploy/lxc-setup.sh" >&2; exit 1; }

as_svc() {
  # runuser resets PATH for the service user (no /usr/local/bin on Debian 13),
  # so set it explicitly or `uv` is not found.
  runuser -u shinigami -- env \
    PATH=/usr/local/bin:/usr/bin:/bin \
    UV_PYTHON_INSTALL_DIR=/opt/shinigami-python \
    UV_CACHE_DIR=/var/cache/shinigami-uv \
    npm_config_cache=/var/cache/shinigami-npm \
    HOME=/var/cache/shinigami-npm "$@"
}

as_svc uv sync --frozen --no-dev --group data
as_svc npm --prefix web ci
as_svc npm --prefix web run build

if ! cmp -s deploy/shinigami.service /etc/systemd/system/shinigami.service; then
  install -m 0644 deploy/shinigami.service /etc/systemd/system/shinigami.service
  systemctl daemon-reload
fi

# Weekly camera refresh (never started from here; David runs the first one, see 02-06).
units_changed=0
for u in shinigami-data.service shinigami-data.timer; do
  if ! cmp -s "deploy/$u" "/etc/systemd/system/$u"; then
    install -m 0644 "deploy/$u" "/etc/systemd/system/$u"
    units_changed=1
  fi
done
if [ "$units_changed" -eq 1 ]; then systemctl daemon-reload; fi
systemctl enable --now shinigami-data.timer

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
