# ADR-0004 — UniFi Network Integration Strategy

- **Status**: Accepted
- **Date**: 2026-03-21
- **Deciders**: Stèphan Eizinga, Sonnet 4.6
- **Tags**: integration, auth, websocket, flow-cards, security

---

## Context and Problem Statement

The app must communicate with a UniFi Network controller to detect client events, query device state, and execute control actions (block/unblock, PoE cycle, WLAN toggle).  
Ubiquiti provides two distinct API surfaces:

1. **Legacy "Classic" API** — session-cookie auth, `/api/s/<site>/...`, available since controller v4; supported by `node-unifi`.
2. **Official REST API v1** — Bearer API-key auth, `/v1/...`, available from UniFi OS / Network ≥ 7.x; documented in `specs/unifi-network-api-cheatsheet.md`.

Both must be supported (dual-path), with legacy as primary for backwards compatibility.

---

## Decision Drivers

- Existing user base uses session-cookie auth (no migration disruption).
- New UniFi OS controllers (UDM, UDR, UDW, Cloud Key Gen2+) support API keys — more stable, no session expiry.
- WebSocket event stream (`/wss/s/<site>/events`) is essential for real-time flow triggers; official REST API has no WS yet.
- Self-hosted (Docker) controllers may not have UniFi OS path prefix — must detect.
- `node-unifi` already handles UniFi OS detection (`_unifios` flag) and CSRF headers.
- `platforms: ["local"]` — no cloud relay needed; direct TCP connection to controller.

---

## Considered Options

1. **Legacy-only** — session-cookie + `node-unifi`; no API-key path
2. **API-key-only** — migrate to `/v1/` REST; drop `node-unifi`
3. **Dual-path** — `node-unifi` (legacy + WS) as primary; `/v1/` Bearer API-key as secondary for controllers that support it

---

## Decision Outcome

**Chosen option: Option 3 — Dual-path**, implementing legacy auth first (already working) and adding API-key path in v2.6.

---

## Authentication Strategy

### Path A — Session Cookie (current, all controllers)

```
POST https://<host>:<port>/api/auth/login      ← UniFi OS
POST https://<host>:<port>/api/login           ← legacy / Docker
Body: { username, password, rememberMe: true }
→ Set-Cookie: unifises=...; TOKEN=...
```

- Handled entirely by `node-unifi` (auto-detects UniFi OS via `_unifios`).
- CSRF token automatically managed by `node-unifi` via `X-Csrf-Token` header.
- Session expires; app re-logins every hour via `refreshAuthTokens()`.

### Path B — Bearer API Key (v2.6, UniFi OS ≥ 7.x)

```
GET https://<host>/proxy/network/v1/sites
Authorization: Bearer <api_key>
```

- API key created in UniFi OS Settings → API Keys.
- No session management; no CSRF required.
- More stable for long-lived connections.
- Requires optional `apiKey` field in app settings.
- When `apiKey` is set, `/v1/` calls use Bearer; WS still uses session-cookie (no WS on `/v1/` yet).

---

## Event Ingestion Strategy

### Primary — WebSocket (real-time)

| Controller type | WS endpoint |
|---|---|
| Legacy / Docker | `wss://<host>:<port>/wss/s/<site>/events` |
| UniFi OS | `wss://<host>/proxy/network/wss/s/<site>/events` |

- Already implemented in `library/websocket.js`.
- **Gap**: reconnect uses fixed 5 s interval — **must be replaced with exponential backoff + jitter**.
- **Gap**: no dedup / replay guard — identical event can fire twice on reconnect.
- Heartbeat: send `'ping'` every 3 s; expect `'pong'`.

### Secondary — Polling fallback

- `checkDevicesState()` runs on configurable interval (default 15 s, minimum 10 s).
- Called via `this.homey.setInterval()` — cleared on `onUninit()`.
- Acts as safety net when WS is unavailable.

### Exponential Backoff Spec (gap fix for WS reconnect)

```
attempt 0: wait 2 s
attempt 1: wait 4 s
attempt 2: wait 8 s
...
attempt n: wait min(2^(n+1), 300) s  +  jitter(0..1 s)
reset counter on successful open event
```

---

## Device and Client Model

| Entity | UniFi type field | Driver | Key capabilities |
|---|---|---|---|
| Wi-Fi client | `is_wired: false` | `wifi-client` | `connected`, `blocked`, `measure_signal`, `measure_rssi`, `ap`, `ap_mac`, `wifi_name`, `radio_proto`, `ipAddress` |
| Cable client | `is_wired: true` | `cable-client` | `connected`, `blocked`, `ipAddress` |
| Access Point | `type: "uap"` | `access-point` | `connected`, `ipAddress` |
| Network Switch | `type: "usw"` | `network-switch` | `connected`, `ipAddress`, `ports`, `port.port_N`, `poe` |
| Gateway / UDM | `type: "ugw"` / `"udm"` | ❌ no driver yet | WAN stats, WAN up/down |

---

## Flow Cards — Current vs Planned

### Triggers

| Card ID | Status | Source |
|---|---|---|
| `a_client_connected` | ✅ Implemented | WS `EVT_WU_Connected` |
| `a_client_disconnected` | ✅ Implemented | WS `EVT_WU_Disconnected` |
| `wifi_client_connected` | ✅ Implemented | WS device trigger |
| `wifi_client_disconnected` | ✅ Implemented | WS device trigger |
| `wifi_client_roamed` | ✅ Implemented | WS `EVT_WU_Roamed` |
| `wifi_client_roamed_to_ap` | ✅ Implemented | WS |
| `wifi_client_signal_changed` | ✅ Implemented | Polling delta |
| `cable_client_connected` | ✅ Implemented | WS `EVT_WU_Connected` (lan) |
| `cable_client_disconnected` | ✅ Implemented | WS |
| `first_device_connected` | ✅ Implemented | AP client count |
| `last_device_disconnected` | ✅ Implemented | AP client count |
| `first_device_online` | ✅ Implemented | Client count |
| `last_device_offline` | ✅ Implemented | Client count |
| `wan_up` | ❌ Planned v2.6 | WS `EVT_WAN_*` or `/v1/` poll |
| `wan_down` | ❌ Planned v2.6 | WS `EVT_WAN_*` or `/v1/` poll |
| `ids_ips_alert` | ❌ Planned v2.6 | WS `EVT_AD_*` |
| `rogue_ap_detected` | ❌ Planned v2.6 | WS `EVT_WU_RogueApDetected` |

### Conditions

| Card ID | Status |
|---|---|
| `wifi_client_connected` | ✅ |
| `wifi_client_connected_with_ap` | ✅ |
| `wifi_client_blocked` | ✅ |
| `cable_client_blocked` | ✅ |
| `clients_connected` | ✅ |
| `guests_connected` | ✅ |
| `ap_has_clients_connected` | ✅ |
| `device_online` | ❌ Planned v2.6 |
| `port_poe_on` | ❌ Planned v2.6 |

### Actions

| Card ID | Status |
|---|---|
| `wifi_block` | ✅ |
| `wifi_unblock` | ✅ |
| `cable_block` | ✅ |
| `cable_unblock` | ✅ |
| `network_switch_power_cycle_port` | ✅ |
| `network_switch_power_off_port` | ✅ |
| `network_switch_power_on_port` | ✅ |
| `toggle_wlan` | ❌ Planned v2.6 |
| `reconnect_client` | ❌ Planned v2.6 |

---

## Limits and Security

- **TLS**: `sslverify` must be user-configurable; default `true` for new installs.
- **Secrets**: controller URL, username, password, API key stored via `this.homey.settings` (encrypted at rest by Homey).
- **Credentials never logged** — use `this.homey.app.debug()` which is gated by debug flag.
- **Permissions**: app only requires `homey:manager:api` and `homey:app:com.ubnt.unifi`; no unnecessary capabilities.
- **Rate limiting**: no published limit from Ubiquiti; conservative polling (≥ 10 s); WS preferred.

---

## Links

- [UniFi Network API cheatsheet](../integration/unifi-network/api-notes.md)
- [node-unifi](https://github.com/jens-maus/node-unifi)
- [Getting Started with the Official UniFi API](https://help.ui.com/hc/en-us/articles/30076656117655)
- [Flow cards detail](../integration/unifi-network/flow-cards.md)

