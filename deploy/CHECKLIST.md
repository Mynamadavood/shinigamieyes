# Deployment checklist (paste-ready)

Placeholders: `<CTID>` = container id, `<tailnet>` = your tailnet name. Never commit real coordinates or keys.

## 0. Tailscale admin console and iPhone

- Admin console: turn on MagicDNS and HTTPS Certificates (see `.planning/API-KEYS.md` "Tailscale setup").
- Tailnet name must be non-revealing: it appears in public certificate transparency logs.
- Delete any existing machine named `shinigami` or `shinigami-1` first (hostname churn orphans the PWA origin).
- iPhone: Tailscale app installed and connected to the same tailnet.

## 1. Push from the dev PC

```
git push origin main
```

## 2. Proxmox host shell: create the LXC

Public repo:

```
curl -fsSLO https://raw.githubusercontent.com/mynamadavood/shinigamieyes/main/deploy/proxmox-create-lxc.sh
```

Private repo: open the file on GitHub, copy it, then `nano /root/proxmox-create-lxc.sh` and paste.

List storages, then run:

```
pvesm status
STORAGE=<name> BRIDGE=vmbr0 bash proxmox-create-lxc.sh
```

Record the CTID it prints.

## 3. Enter the CT and clone the repo

```
pct enter <CTID>
apt-get update && apt-get install -y git
```

Public:

```
git clone https://github.com/mynamadavood/shinigamieyes.git /opt/shinigami
```

Private: create a key, add `/root/.ssh/id_ed25519.pub` as a READ-ONLY entry under GitHub repo Settings, Deploy keys, then clone:

```
ssh-keygen -t ed25519 -f /root/.ssh/id_ed25519 -N ""
cat /root/.ssh/id_ed25519.pub
git clone git@github.com:mynamadavood/shinigamieyes.git /opt/shinigami
```

## 4. Run setup

```
bash /opt/shinigami/deploy/lxc-setup.sh
```

Open the printed Tailscale login URL and approve. Then admin console, Machines, `shinigami`, Disable key expiry (D-12) so the node never drops offline.

Note: the script's final deploy step needs the real config, so if it stops at the health check, finish step 5 and re-run deploy.

## 5. Configure

```
nano /etc/shinigami/places.toml     # set home lat/lon; never commit this file
nano /etc/shinigami/.env            # set SHINIGAMI_CONTACT_EMAIL
bash /opt/shinigami/deploy/deploy.sh
```

## 6. Verify

In the CT:

```
bash /opt/shinigami/deploy/verify.sh --local
```

On the host:

```
pct config <CTID> | grep onboot      # must print: onboot: 1
```

From the dev PC (Claude runs this, D-14):

```
bash deploy/verify.sh --remote https://shinigami.<tailnet>.ts.net
```

## 7. Redeploy later

On the host:

```
pct exec <CTID> -- bash /opt/shinigami/deploy/deploy.sh
```

## 8. DNS environment (D-17)

- Pi-hole on Proxmox must not block or rewrite `ts.net`. Watch the Pi-hole Query Log while opening the URL on the iPhone, and run `pihole -q ts.net` (must show no blocklist hit).
- If Pi-hole is a tailnet global nameserver, keep MagicDNS on so `*.ts.net` is answered by 100.100.100.100. Pi-hole must not block `100.100.100.100` or conditional-forward `ts.net`.
- AdGuard Safari extension: if the page fails only in Safari, add `shinigami.<tailnet>.ts.net` to AdGuard's allowlist.

## 9. tailscale#19147 diagnosis ladder (iPhone SSL error on ts.net)

In order:

1. Tailscale app connected, MagicDNS on, no other VPN/DNS/DoH profile active (Settings, General, VPN & Device Management).
2. Open `https://shinigami.<tailnet>.ts.net/api/health` in Safari.
3. On the LXC, `tailscale funnel status` must show nothing.
4. Try cellular vs Wi-Fi.
5. Check Pi-hole/AdGuard per step 8.
6. Last resort: tailnet attribute `NodeAttrDisableSplitDNSWhenNoCustomResolvers`.

Record what fixed it.

## 10. Rollback

```
tailscale serve reset
systemctl stop shinigami
pct stop <CTID>          # on the host
```

## Notes

The setup scripts run vendor installers (NodeSource, astral uv, Tailscale) as root over HTTPS, once. This is an accepted risk for a single-user homelab.
