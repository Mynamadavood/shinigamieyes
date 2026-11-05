# API Keys & Access — Setup Steps

Drafted 2026-11-05 from the project research. Portal pages change. Where a step says **(verify)**, the research found the detail but couldn't confirm it end to end, so trust what the portal actually shows.

**Golden rule:** keys go in `.env` on the Proxmox server only. They never go in git, the PWA or the phone. The phone only ever talks to your server.

| # | Key | Blocks | Lead time | Status |
|---|-----|--------|-----------|--------|
| 1 | Vic GTFS-Realtime | Phase 3 (live transit) | Usually instant (verify) | ☐ |
| 2 | PTV Timetable API v3 | Phase 3 (disruptions, departures) | Days to weeks (manual email) | ☐ |
| 3 | EPA Victoria | Phase 4 (air quality) | Usually instant (verify) | ☐ |
| 4 | OpenElectricity | Phase 4 (grid) | Waitlisted | ☐ |
| 5 | aisstream.io | Phase 5 (ships) | Instant | ☐ |
| 6 | VicEmergency official feed | Nothing (public feeds work) | Unknown | ☐ |
| — | Tailscale setup | Phase 1 | 10 min | ☐ |

---

## 1. Vic GTFS-Realtime (Transport Victoria Open Data)

Live train, tram and bus positions and trip updates.

1. Go to **https://opendata.transport.vic.gov.au** and create an account (the Register / Sign up link). Confirm your email.
2. Find the **GTFS Realtime** dataset. It's also listed at https://discover.data.vic.gov.au/dataset/gtfs-realtime.
3. Request access or subscribe to the API product. The portal then issues your **API key**. It may be under your profile as "API keys" or "Subscriptions". **(verify)**
4. Note the endpoint URLs for each mode: Metro Train, Yarra Trams, Metro Bus. Each mode has its own feeds (trip updates, vehicle positions, service alerts).
5. Test it from the server:
   ```bash
   curl -H "KeyID: YOUR_KEY" -o test.pb "<feed URL from the portal>"
   ```
   A binary `.pb` file of a few KB or more means it works. A 401/403 means the header name is wrong. **(verify: the research says `KeyID`)**
6. Also download the **static GTFS** zip (timetables and stops) from the same portal. Phase 3 imports it.
7. Add to `.env`: `GTFSR_KEY=...`

Limits: about **24 calls per 60 s per mode**. Licence: CC BY 4.0 (attribution goes on the Sources screen).

## 2. PTV Timetable API v3

Gives disruptions and departures-by-stop. It's a manual email request, so **send it first**.

1. Email **APIKeyRequest@ptv.vic.gov.au**
2. Subject: `PTV Timetable API - request for key`
3. Body (draft, edit to taste):
   > Hi,
   >
   > I'd like to request a developer ID and API key for the PTV Timetable API v3.
   >
   > Name: David [surname]
   > Email: [your email]
   > Intended use: a personal, non-commercial app for my own use that shows nearby stops, real-time departures and disruptions around my current location in Melbourne. It is not published or redistributed.
   >
   > Thanks,
   > David
4. They reply with a **devid** (a number) and a **key** (a UUID-style string).
5. Add to `.env`: `PTV_DEVID=...` and `PTV_KEY=...`
6. Every request has to be signed, and Phase 3 builds this. For reference: take the request path including `?devid=...`, compute HMAC-SHA1 over it with the key, and append `&signature=<UPPERCASE HEX>`.

If there's no reply in about 2 weeks, follow up once. Phase 3 works on GTFS-R alone in the meantime.

## 3. EPA Victoria (air quality)

1. Go to **https://portal.api.epa.vic.gov.au** and sign up. Confirm your email.
2. Under **Products**, subscribe to **"Environment Monitoring"**. **(verify: the product name came from a community post)**
3. Copy the subscription key from your profile.
4. Test it by trying the "parameters" or "sites" operation in the portal's API console. It should return JSON with monitoring sites. Note the **header name** the console uses for the key. **(verify)**
5. Add to `.env`: `EPA_KEY=...`

Limit: about 5 requests per second, which is plenty.

## 4. OpenElectricity (grid mix, price, rooftop solar)

1. Go to **https://platform.openelectricity.org.au** and sign up.
2. Signups are **waitlisted**, so join now and watch your email.
3. Once you're approved, create an **API key** in the platform dashboard.
4. Add to `.env`: `OPENELECTRICITY_KEY=...`

If it's still waitlisted by Phase 4, the fallback is AEMO's public NEM summary data, which needs no key **(verify)**.

## 5. aisstream.io (ships in Port Phillip)

1. Go to **https://aisstream.io** and **sign in with GitHub**.
2. Open the **API Keys** page and create a key.
3. Add to `.env`: `AISSTREAM_KEY=...`

Rules: the key is **server-side only**. You get up to 3 connections, you must send the subscription message within 3 s of connecting, and a bounding box is required. Coverage near Port Phillip may be patchy.

## 6. VicEmergency official data feed (optional, no rush)

The public GeoJSON feeds already work, so this only gets you a more official, supported route.

1. Go to the VicEmergency / Emergency Management Victoria data-feed page (search "VicEmergency data feed access").
2. Register interest using their form or contact email, and describe a personal, non-commercial use.

## Optional (skip unless needed)

- **OpenSky Network.** Create an account at opensky-network.org and then an **OAuth2 API client** in your account settings. This is only a fallback; adsb.lol needs no key.
- **City of Melbourne.** Anonymous access works. An app key from data.melbourne.vic.gov.au only raises the quota.

---

## Tailscale setup (do before Phase 1)

1. Open **https://login.tailscale.com/admin**
2. **DNS** tab: turn on **MagicDNS**, then turn on **HTTPS Certificates**.
3. Check your **tailnet name** (shown on the DNS page). It becomes part of the URL (`xxx.ts.net`) and is published in public certificate logs, so pick a name that doesn't reveal anything if you rename it.
4. **Machines** tab, then the Proxmox host or LXC that will run Shinigami:
   - Rename it to the final name, e.g. `shinigami`. **Freeze this name.** Changing it later wipes the installed app's data.
   - In the `…` menu, choose **Disable key expiry**.
5. Make sure the iPhone has the Tailscale app installed and is on the same tailnet.

The URL will end up as `https://shinigami.<tailnet>.ts.net`. Phase 1 wires up `tailscale serve`.

## Where the keys live

Server only, in `/etc/shinigami/.env` (mode 0640 root:shinigami, installed by deploy/lxc-setup.sh):

```
GTFSR_KEY=
PTV_DEVID=
PTV_KEY=
EPA_KEY=
OPENELECTRICITY_KEY=
AISSTREAM_KEY=
```

`.env` is in `.gitignore`, so it is never committed.
