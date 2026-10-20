---
title: Home Assistant
description: Install Navet with HACS, as a Home Assistant App, or with Docker.
editUrl: https://github.com/navet-app/navet/edit/main/docs/HOME_ASSISTANT.md
---

This guide helps you install the complete Navet dashboard for Home Assistant.

To add individual Navet cards to your existing Home Assistant dashboard, follow
[the Navet Cards installation guide](/cards/installation/). Navet Cards runs independently.

You only need to choose **one** installation method.

## Pick an installation method

| Choose this | Use it when |
|---|---|
| **HACS custom panel** | You already use HACS and want Navet in the Home Assistant sidebar. This is the easiest choice for most HACS users. |
| **Home Assistant App** | You use Home Assistant OS and want Home Assistant to run Navet for you. |
| **Standalone Docker** | You already manage Docker and want Navet to run as a separate website. |

Not sure which one to choose? Use the **HACS custom panel** if you already have HACS. Otherwise,
use the **Home Assistant App**.

## Option 1: Install with HACS

### What you need

- Home Assistant
- HACS

### Install Navet

1. Open **HACS** in Home Assistant.
2. Open **Integrations**.
3. Open the menu in the top-right corner and choose **Custom repositories**.
4. Paste this address:

   ```text
   https://github.com/navet-app/navet-home-assistant
   ```

5. Choose **Integration** as the category, then add the repository.
6. Search for **Navet** in HACS and download it.
7. Restart Home Assistant.
8. Go to **Settings → Devices & services**.
9. Choose **Add integration**, search for **Navet**, and add it.
10. Open **Navet** from the Home Assistant sidebar.

Navet uses your current Home Assistant session.

## Option 2: Install the Home Assistant App

### What you need

- Home Assistant OS on an `amd64` or `aarch64` system

### Install Navet

1. Go to **Settings → Apps → App store**.
2. Open the menu in the top-right corner and choose **Repositories**.
3. Paste this address and add it:

   ```text
   https://github.com/navet-app/navet
   ```

4. Find **Navet** in the App store and install it.
5. Turn on **Start on boot**.
6. Turn on **Show in sidebar**.
7. Choose **Start**.
8. Wait until the App says **Running**.
9. Choose **Open Web UI**.

Your rooms and devices should appear automatically.

The App opens inside Home Assistant through Ingress by default. If you also need a separate
dashboard URL, open the App's **Network** settings and assign any available host port to the
optional direct Navet web interface. Direct access uses its own Home Assistant sign-in.

Ingress is available to non-admin Home Assistant users and reuses their existing Home Assistant
session. Media requests use short-lived URLs signed through that user's connection and load
directly from Home Assistant. The App does not proxy browser requests with its Supervisor token.

## Option 3: Install with Docker

Choose this option only if you are comfortable using Docker.

### What you need

- Docker with Docker Compose
- a Home Assistant address reachable from the browser while it signs in, such as a LAN, VPN,
  Tailscale, or external address
- a route from the Navet container to the same Home Assistant installation

### Create the Compose file

1. Make a new folder for Navet.
2. Inside that folder, create a file named `docker-compose.yml`.
3. Paste this into the file:

   ```yaml
   services:
     navet:
       image: ghcr.io/awesomestvi/navet:latest
       container_name: navet
       restart: unless-stopped
       ports:
         - "8080:80"
       volumes:
         - navet-data:/data

   volumes:
     navet-data:
   ```

### Start Navet

1. Open a terminal in the folder that contains `docker-compose.yml`.
2. Run:

   ```bash
   docker compose up -d
   ```

3. Open [`http://localhost:8080`](http://localhost:8080) when Docker runs on this computer. From
   another device, replace `localhost` with the Docker host's LAN, VPN, or public name.
4. Choose **Home Assistant**, enter an address that the current browser can reach, and sign in.
5. Approve the Home Assistant login when asked.

Keep the `navet-data` volume. It stores your Navet dashboard and browser sign-ins when the
container is updated or recreated.

### Sign in at home or through a VPN

Open **Settings → System → Home Assistant** and choose **Edit URL** when moving between a LAN,
VPN, Tailscale, or external address, then complete the Home Assistant sign-in. Navet keeps your
dashboard workspace when it can verify that both addresses reach the same installation. Otherwise,
it opens a separate workspace for the new address. Returning to a saved address restores its
associated workspace.

A camera **direct-stream URL** configured in Navet must be reachable from the browser's current
network. Home Assistant-provided snapshots, HLS, and fallback paths use Navet's proxy.
Native WebRTC can negotiate a separate media path supplied by Home Assistant; when that path
is not usable across the current network, Navet falls back to another provider-supported transport.

### Optional: configure a Home Assistant upstream address

Set `NAVET_HASS_URL` when Navet should use a fixed address to reach Home Assistant from the
container. Browsers can sign in through another address that reaches the same installation, such
as a VPN address.

Add these lines under `restart: unless-stopped`:

```yaml
environment:
  NAVET_HASS_URL: "http://homeassistant.local:8123"
```

Replace the example with an address that works from the Navet container. Navet uses it for the
sign-in token exchange and subsequent API traffic. To connect to a different Home Assistant
installation, update the value and recreate the container.

### Update the Docker installation

Run these commands from the same folder:

```bash
docker compose pull
docker compose up -d
```

Do not add `-v` when stopping the Compose project. That option deletes the saved Navet data.

## Connect another standalone screen

On the new standalone screen, choose **Connect with another device** to display a one-time
code. On your primary device, open your signed-in Navet app or PWA →
**Settings → System → Authorized devices**, enter the code, then review and approve access.
The new screen connects automatically with its own revocable session.

## Optional: let Navet hide the Home Assistant bars

The HACS integration includes a small Home Assistant module that lets Navet hide the Home Assistant
header and sidebar in kiosk mode.

1. Make sure the Navet HACS integration is installed.
2. Open your Home Assistant `configuration.yaml` file.
3. Add:

   ```yaml
   frontend:
     extra_module_url:
       - /api/navet/static/navet-ha-shell.js
   ```

4. Save the file.
5. Check the configuration in Home Assistant.
6. Restart Home Assistant.

If you already have a `frontend:` section, add only the `extra_module_url` lines inside it. Do not
create a second `frontend:` section.

## If something does not work

### Navet is missing from the sidebar after a HACS install

1. Make sure Home Assistant was restarted after the download.
2. Go to **Settings → Devices & services**.
3. Check that the **Navet** integration is installed.
4. If it is missing, choose **Add integration** and add **Navet**.
5. Refresh the browser page.

### The Home Assistant App does not open

1. Open **Settings → Apps → Navet**.
2. Check that its status is **Running**.
3. Open the **Log** tab and read the first error.
4. Restart the App and try **Open Web UI** again.

### Enable or change direct App access

The direct interface is disabled until you assign it a host port.

1. Go to **Settings → Apps → Navet → Configuration**.
2. In **Network**, enter an available host port for the optional direct Navet web interface, such
   as `8234`, and save.
3. Restart Navet, then open `http://homeassistant.local:8234` with the port you selected.
4. Sign in to Home Assistant when Navet asks. This browser-bound session is separate from the
   session Home Assistant provides through Ingress.

If Home Assistant reports that the port is already in use, choose another port. Removing the port
from **Network** disables direct access without affecting **Open Web UI** or the sidebar.

### Docker cannot connect to Home Assistant

1. If the Home Assistant sign-in page does not open, make sure the address entered in Navet works
   from the current browser and that its VPN or external route is connected.
2. If Home Assistant accepts the sign-in but Navet says the address is unreachable, make sure the
   exact address and port work from the Navet container. If it says the sign-in code was rejected,
   confirm the address shown on the Home Assistant login page matches the address entered in Navet
   and start a fresh sign-in.
3. If the server uses HTTPS, make sure the container trusts its certificate.
4. If Navet says it is configured for another address, update or remove `NAVET_HASS_URL` and
   recreate the container.
5. Run `docker compose up -d` again after changing the Compose file.

### Navet stays on Starting your dashboard

1. Reload Navet once so the current application version is active.
2. Confirm that the Navet container can still reach its trusted Home Assistant upstream. The
   browser does not need to reach that saved LAN address after sign-in.
3. Keep the VPN connected if it is how you reach Navet itself. A VPN route to Home Assistant is
   needed in the browser only when opening its authorization page or when you configured a custom
   camera direct-stream URL.
4. If the screen changes to a recovery message, use **Retry connection** for a temporary outage.
   Choose **Back to login** when you need to clear the current browser session and sign in again.

### Login returns to the wrong page

If Navet is behind a reverse proxy, make sure the proxy keeps the original host name and HTTPS
information. Start the login and finish it in the same browser.

For more checks, see [Connection or sign-in fails](/guide/troubleshooting/connection/).

## You are ready

Open Navet and check that your rooms and devices appear. Then continue with
[Your first 15 minutes with Navet](/guide/quick-start/first-15-minutes/).
