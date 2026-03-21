# UniFi Network — Homey App Setup Guide

> Created-by: Sonnet 4.6 | 2026-03-21  
> Screenshots target: **UniFi OS 4.x / Network 9.x** (UDM Pro / UDR / Cloud Key Gen2+).  
> For legacy Docker / Cloud Key Gen1 (port 8443), see the [Legacy Controller](#legacy-docker--cloud-key-gen1-port-8443) section.

---

## Prerequisites

- A **Homey Pro** (2019, 2023, 2026, or mini) on the same local network as your UniFi controller.
- A UniFi controller running **Network 6.x or higher** (7.x+ recommended for best feature coverage).
- The **Ubiquiti UniFi Network** app installed on Homey (search "UniFi Network" in the Homey App Store).

---

## Overview

```
[UniFi Controller] ←──HTTPS/WSS──→ [Homey Pro]
         ↑
  You create a dedicated admin user here
```

The app connects to your controller **directly over your LAN**.  
It does not route through the Ubiquiti cloud.

---

## Step 1 — Create a Dedicated Local Admin User in UniFi

> **Why?** Using your main Super Admin account is a security risk. Create a dedicated account with limited privileges so that the Homey app cannot accidentally change critical network settings.

### 1.1 — Open UniFi OS Settings

1. Open your browser and go to `https://<controller-ip>` (e.g. `https://192.168.1.1`).
2. Log in with your Super Admin account.
3. Click the **UniFi OS** logo (top left) → **Settings** (gear icon in the sidebar).

![UniFi OS — open Settings](screenshots/01-unifios-open-settings.png)
*Figure 1: Click the gear icon to open UniFi OS Settings.*

---

### 1.2 — Navigate to Admins & Users

1. In the left sidebar, click **Admins & Users**.
2. Click **Add Admin** (top right button).

![UniFi OS — Admins and Users page](screenshots/02-unifios-admins-users.png)
*Figure 2: The Admins & Users page. Click "Add Admin" to create a new account.*

---

### 1.3 — Fill in the Admin Details

Fill in the form:

| Field | Value | Notes |
|---|---|---|
| **Username** | `homey-integration` | Use a descriptive name; minimum 32 characters for password |
| **Email** | (any valid email) | Not used by the app |
| **Role** | `Network Admin` | See role matrix below |
| **MFA** | **Disabled** | The app does not support MFA; enable MFA on your personal account instead |
| **Password** | (strong, unique) | Store securely — you will enter this in Homey |

![UniFi OS — Add Admin form](screenshots/03-unifios-add-admin-form.png)
*Figure 3: Fill in the admin details. Set Role to "Network Admin" and disable MFA.*

> **Role Matrix**
>
> | Role | Can detect clients | Can block/unblock | Can PoE cycle | Can toggle WLAN |
> |---|---|---|---|---|
> | Read Only | ✅ | ❌ | ❌ | ❌ |
> | Network Admin | ✅ | ✅ | ✅ | ✅ |
> | Super Admin | ✅ | ✅ | ✅ | ✅ |
>
> **Recommended**: Use **Network Admin** — it can do everything this app needs without global access.

4. Click **Save**.

---

### 1.4 — Note the Username and Password

Write down (or save in your password manager):
- **Username**: `homey-integration`
- **Password**: the password you set

You will enter these in the Homey app settings page in Step 3.

---

## Step 2 — Find Your Site ID

Every UniFi controller has at least one **site** (default: `default`).  
If you have multiple sites, you need the **Site Name** (not the display name).

### Option A — From the Homey App Settings Page (easiest)

The app has a **Sites** tab that discovers site names automatically after connecting.  
Complete Step 3 first, then come back and check the Sites tab.

### Option B — From the UniFi Network Application URL

1. Open UniFi Network application (via `https://<controller-ip>/network/`).
2. Look at the URL bar: `https://192.168.1.1/network/default/dashboard`
                                                             ↑
                                                          This is the site name

![UniFi Network — site name in URL](screenshots/04-network-site-name-url.png)
*Figure 4: The site name appears in the URL path. In this example it is "default".*

### Option C — From the UniFi Network System Settings

1. Open UniFi Network → **Settings** (gear icon) → **System** → scroll to **Site Settings**.
2. The **Site Name** field shows the internal name.

![UniFi Network — System site name](screenshots/05-network-system-site-name.png)
*Figure 5: The Site Name field under Network → Settings → System.*

---

## Step 3 — Configure the Homey App

### 3.1 — Open the App Settings

1. Open the **Homey** mobile app.
2. Tap **More** (bottom right) → **Apps** → **UniFi Network**.
3. Tap the **Settings** button (gear icon).

Or on desktop: open `my.homey.app` → Apps → UniFi Network → Settings.

![Homey app — open settings](screenshots/06-homey-open-settings.png)
*Figure 6: Open the UniFi Network settings from the Homey app.*

---

### 3.2 — Fill in Server Details

The settings page has three sections. Fill them in as follows:

#### Server Details

| Field | Value | Notes |
|---|---|---|
| **IP address** | `192.168.1.1` | Your UniFi controller's LAN IP or hostname |
| **Port** | `443` | Use `443` for UniFi OS (UDM, UDR, CK Gen2+); use `8443` for Docker / CK Gen1 |

![Homey settings — Server Details](screenshots/07-homey-settings-server.png)
*Figure 7: Enter your controller's IP address and port.*

#### User Credentials

| Field | Value |
|---|---|
| **Username** | `homey-integration` (the user you created in Step 1) |
| **Password** | the password you set in Step 1 |

![Homey settings — User Credentials](screenshots/08-homey-settings-credentials.png)
*Figure 8: Enter the credentials of the dedicated admin user.*

> ⚠️ **Important**: Make sure MFA is **disabled** for this user (see Step 1.3). The app will fail to connect if MFA is enabled.

#### Site

| Field | Value |
|---|---|
| **Site** | `default` | (or your site name from Step 2) |

![Homey settings — Site](screenshots/09-homey-settings-site.png)
*Figure 9: Enter the Site ID. The default value is "default".*

#### Pull Method & Interval

| Field | Recommended | Notes |
|---|---|---|
| **Pull Method** | `Interval & Websocket` | Real-time events via WebSocket + periodic polling fallback |
| **Interval** | `15` | Polling interval in seconds (minimum 10 s) |
| **Enable application flows** | ✅ Checked | Enables global triggers for non-paired devices |

![Homey settings — Pull Method](screenshots/10-homey-settings-pull-method.png)
*Figure 10: Set Pull Method to "Interval & Websocket" for best real-time performance.*

---

### 3.3 — Test and Save

1. Click **Test credentials** — you should see a green "Credentials are valid" message.

![Homey settings — Test success](screenshots/11-homey-settings-test-success.png)
*Figure 11: A successful credentials test.*

2. Click **Apply** to save the settings.
3. The **Status** indicator should change to **Connected**.
4. The **Realtime updates Status** should change to **Connected** within a few seconds.

![Homey settings — Connected status](screenshots/12-homey-settings-connected.png)
*Figure 12: Both Status and Realtime updates Status show "Connected".*

> If the status shows **Disconnected** after clicking Apply, check:
> - Is the IP address correct and reachable from Homey's network?
> - Is the port correct (443 for UniFi OS, 8443 for Docker)?
> - Is MFA disabled for the user?
> - Is the Site name correct? Check the **Sites** tab for a list of discovered sites.

---

## Step 4 — Pair Devices

### 4.1 — Add Wi-Fi Clients

1. In the Homey app, tap **Devices** → **+** (add device).
2. Select **UniFi Network** → **Wifi Client**.
3. Homey will list all currently connected Wi-Fi clients.

![Homey pairing — Wi-Fi clients list](screenshots/13-homey-pair-wifi-clients.png)
*Figure 13: All currently connected Wi-Fi clients appear in the pairing list.*

4. Select the devices you want to track (e.g. family members' phones, tablets).
5. Give them descriptive names.

> **Tip**: Only pair devices that are frequently on your network. Each paired device generates flow card triggers.

### 4.2 — Add Cable Clients

Follow the same steps, selecting **Cable Client** instead of **Wifi Client**.

### 4.3 — Add Network Switches (for PoE control)

Follow the same steps, selecting **Network Switch**.  
After pairing, the switch will show all its ports as capabilities.

### 4.4 — Add Access Points

Follow the same steps, selecting **Access Point**.  
This enables the "first/last device connected to AP" flow triggers.

---

## Step 5 — Create Flows

Here are some useful flow examples to get started.

### Example 1 — Home/Away presence detection

**Trigger**: `A Device just connected` (global Wi-Fi trigger)  
**Condition**: `[Device Name] is connected` is true  
**Action**: Set Homey location to **Home**

**Trigger**: `Wifi connection lost` (global Wi-Fi trigger)  
**Condition**: `No tracked clients are connected` is true  
**Action**: Set Homey location to **Away**

### Example 2 — Block a device at bedtime

**Trigger**: Time is 22:00  
**Condition**: `[Kids Phone] is connected`  
**Action**: `Block Wi-Fi client — [Kids Phone]`

![Homey flow — block device at bedtime](screenshots/14-homey-flow-block-bedtime.png)
*Figure 14: Block a client device at a specific time.*

### Example 3 — PoE power-cycle a camera

**Trigger**: `[Camera] is offline` (virtual trigger)  
**Action**: `PoE power-cycle port — [MainSwitch], port 5`

---

## Legacy: Docker / Cloud Key Gen1 (port 8443)

If you are running the UniFi Network controller as Docker or on a Cloud Key Gen1:

| Field | Value |
|---|---|
| **IP address** | IP of the Docker host or Cloud Key Gen1 |
| **Port** | `8443` |

The controller uses a **self-signed TLS certificate** by default.  
The app connects successfully because certificate verification is disabled by default.

> **Note**: The admin user is created the same way (Settings → Admins & Users in the Network application).

---

## Generating an API Key (for future v2.6 dual-path auth)

Newer UniFi OS controllers (Network ≥ 7.x) support a stable API Key that does not expire.  
While the app currently uses username/password auth, future version 2.6 will add optional API Key support.

**Create an API Key now** (future-proof your setup):

1. Open UniFi OS → **Settings** → **API** → **Create New API Key**.
2. Name it `homey-integration-key`.
3. Copy the key — it is only shown once.
4. Store it in your password manager alongside the credentials.

![UniFi OS — Create API Key](screenshots/15-unifios-create-api-key.png)
*Figure 15: Create an API Key in UniFi OS Settings → API Keys.*

When v2.6 is released, paste this key into the new "API Key" field in the Homey app settings.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Status: Disconnected after saving | Wrong IP/port, or controller unreachable | Ping the controller IP from your network; check port |
| "Credentials are invalid" on Test | Wrong username/password, or MFA enabled | Re-enter credentials; disable MFA for this user |
| Realtime updates: Unknown | WebSocket blocked by firewall | Allow WSS on port 443 (or 8443) from Homey to controller |
| No devices appear in pairing list | Not logged in yet, or wrong site | Wait 10 s and retry; check the Sites tab for correct site name |
| Flow trigger doesn't fire | Device not paired, or WS not connected | Verify WebSocket status; check device is connected to UniFi |
| App crashes on start | Usually a network error at boot | Check Homey logs; ensure controller is online when Homey boots |

### Check Connection Status

The settings page always shows:
- **Status**: `Connected` / `Disconnected` / `Connecting...`
- **Realtime updates Status**: `Connected` / `Disabled` / `Unknown`
- **Last update at**: timestamp of the last received WebSocket event

If "Realtime updates Status" shows `Unknown` for more than 30 seconds after connecting, the WebSocket connection failed. The app will still work using polling only.

---

## Screenshot Placeholder Index

| Filename | Description | Target screen |
|---|---|---|
| `01-unifios-open-settings.png` | UniFi OS home with Settings gear highlighted | UniFi OS 4.x home |
| `02-unifios-admins-users.png` | Admins & Users page with Add Admin button | UniFi OS Settings |
| `03-unifios-add-admin-form.png` | Add Admin form filled in | UniFi OS Settings |
| `04-network-site-name-url.png` | Browser URL bar showing site name | UniFi Network app URL |
| `05-network-system-site-name.png` | System → Site Settings with site name | UniFi Network Settings |
| `06-homey-open-settings.png` | Homey app, UniFi Network app settings gear | Homey mobile app |
| `07-homey-settings-server.png` | Settings page — Server Details section | Homey settings page |
| `08-homey-settings-credentials.png` | Settings page — Credentials section | Homey settings page |
| `09-homey-settings-site.png` | Settings page — Site section | Homey settings page |
| `10-homey-settings-pull-method.png` | Settings page — Pull Method section | Homey settings page |
| `11-homey-settings-test-success.png` | "Credentials are valid" message | Homey settings page |
| `12-homey-settings-connected.png` | Status = Connected, WS = Connected | Homey settings page |
| `13-homey-pair-wifi-clients.png` | Pairing list with Wi-Fi clients | Homey add device flow |
| `14-homey-flow-block-bedtime.png` | Example flow: block device at 22:00 | Homey flow editor |
| `15-unifios-create-api-key.png` | API Key creation form | UniFi OS Settings → API |

> 📸 **Taking screenshots**: All screenshots should be taken on **UniFi OS 4.x / Network 9.x** and **Homey mobile app (iOS or Android)**. Save as PNG at 2× resolution. File them in `docs/screenshots/`.

