# Device Matrix

> Created-by: Sonnet 4.6 | 2026-03-21

---

## Overview

| UniFi Class | `type` field | Homey Driver | Status |
|---|---|---|---|
| Wi-Fi Client | `is_wired: false` | `wifi-client` | ✅ Implemented |
| Cable/Wired Client | `is_wired: true` | `cable-client` | ✅ Implemented |
| Access Point | `type: "uap"` | `access-point` | ✅ Implemented (basic) |
| Network Switch | `type: "usw"` | `network-switch` | ✅ Implemented (PoE) |
| Gateway / UDM | `type: "ugw"` / `"udm"` | ❌ No driver | Planned v2.6 |
| Aggregation Switch | `type: "uas"` | ❌ No driver | Future |
| WiFi Manager | `type: "uph"` | ❌ No driver | Future |

---

## Wi-Fi Client (`wifi-client` driver)

**Source**: `GET /api/s/<site>/stat/sta` filtered `is_wired: false`  
**Identity**: `mac` address (used as Homey device ID)

### Capabilities

| Capability ID | Type | Source field | Notes |
|---|---|---|---|
| `connected` | boolean | presence in active client list | `true` = in current `/stat/sta` response |
| `blocked` | boolean | `blocked` | Settable via block/unblock command |
| `measure_signal` | number | `signal` | dBm, Wi-Fi signal strength |
| `measure_rssi` | number | `rssi` | RSSI value |
| `wifi_name` | string | `essid` | SSID name |
| `ap` | string | `ap_name` | Access Point display name |
| `ap_mac` | string | `ap_mac` | Access Point MAC address |
| `radio_proto` | string | `radio_proto` | `ng`, `na`, `ax` (Wi-Fi 4/5/6) |
| `ipAddress` | string | `ip` / `last_ip` | Current or last known IP |
| `measure_rx_bytes` | number | `rx_bytes` | Bytes received (session) |
| `measure_tx_bytes` | number | `tx_bytes` | Bytes transmitted (session) |

### WebSocket Events

| Event key | Trigger | Payload fields |
|---|---|---|
| `EVT_WU_Connected` | Client connected to Wi-Fi | `user` (mac), `ssid`, `ap`, `radio`, `channel`, `hostname` |
| `EVT_WU_Disconnected` | Client disconnected | `user` (mac), `ssid`, `ap`, `duration`, `bytes` |
| `EVT_WU_Roamed` | Client roamed between APs | `user`, `ap`, `old_ap`, `ssid` |
| `EVT_WC_Blocked` | Client blocked | `user` (mac) |
| `EVT_WC_Unblocked` | Client unblocked | `user` (mac) |

---

## Cable/Wired Client (`cable-client` driver)

**Source**: `GET /api/s/<site>/stat/sta` filtered `is_wired: true`  
**Identity**: `mac` address

### Capabilities

| Capability ID | Type | Source field |
|---|---|---|
| `connected` | boolean | presence in active client list |
| `blocked` | boolean | `blocked` |
| `ipAddress` | string | `ip` / `last_ip` |

### WebSocket Events

| Event key | Trigger |
|---|---|
| `EVT_WU_Connected` (subsystem: `lan`) | Cable client connected |
| `EVT_WU_Disconnected` (subsystem: `lan`) | Cable client disconnected |
| `EVT_LC_Blocked` | Cable client blocked |
| `EVT_LC_Unblocked` | Cable client unblocked |

---

## Access Point (`access-point` driver)

**Source**: `GET /api/s/<site>/stat/device` filtered `type: "uap"` and `adopted: true`  
**Identity**: `mac` address

### UniFi AP models supported

| Model | UniFi name | Notes |
|---|---|---|
| `UAP6MP` | UniFi AP WiFi 6 Mesh Pro | Confirmed in production (from `app.js` comments) |
| `UAP6LR` | UniFi AP WiFi 6 Long-Range | Same API surface |
| `UAP-AC-Pro` | UniFi AP AC Pro | Legacy but same API |
| `U6-Pro` | UniFi AP WiFi 6 Pro | Same API |
| Any `uap` type | All APs | `type === "uap"` filter covers all |

### Capabilities (current — minimal)

| Capability ID | Type | Source field |
|---|---|---|
| `connected` | boolean | presence in device list + `state: 1` |
| `ipAddress` | string | `ip` |

### Planned capabilities (v2.6)

| Capability | Source field |
|---|---|
| Number of connected clients | Derived from `/stat/sta` count per `ap_mac` |
| Radio utilisation | `radio_table_stats[].cu_total` |
| Uptime | `uptime` |

---

## Network Switch (`network-switch` driver)

**Source**: `GET /api/s/<site>/stat/device` filtered `type: "usw"`  
**Identity**: `mac` address

### Capabilities

| Capability ID | Type | Source field | Notes |
|---|---|---|---|
| `connected` | boolean | `state: 1` | Device online |
| `ipAddress` | string | `ip` | Management IP |
| `ports` | number | `port_table.length` | Total port count |
| `port.port_N` | boolean | `port_table[N].up` | Per-port up/down (dynamic) |
| `poe` | boolean | Aggregate PoE state | Not currently implemented |

### Dynamic port capabilities

The driver creates `port.port_1` through `port.port_N` capabilities dynamically based on `port_table` length.  
This is done in `_createMissingCapabilities()`.

### WebSocket Events (switch-related)

| Event key | Trigger |
|---|---|
| `EVT_SW_PoeDisconnect` | PoE device disconnected from port |
| `EVT_SW_PoeConnect` | PoE device connected to port |
| `EVT_SW_PortStats` | Port statistics update |

### Control actions

| Action | API call |
|---|---|
| PoE power cycle port | `PUT /api/s/<site>/rest/device/<id>` with `port_overrides[N].poe_mode` off → auto |
| PoE power off port | `PUT /api/s/<site>/rest/device/<id>` with `poe_mode: "off"` |
| PoE power on port | `PUT /api/s/<site>/rest/device/<id>` with `poe_mode: "auto"` |

---

## Gateway / UDM / UXG (no driver — planned v2.6)

**Source**: `GET /api/s/<site>/stat/device` filtered `type: "ugw"` or `type: "udm"`

### Relevant metrics (for future driver)

| Metric | Source field |
|---|---|
| WAN IP | `wan1.ip` / `wan2.ip` |
| WAN uplink status | `uplink.up` |
| WAN throughput | `uplink.rx_bytes` / `uplink.tx_bytes` |
| CPU usage | `sys_stats.cpu` |
| Memory usage | `sys_stats.mem` |
| Uptime | `uptime` |
| WAN speed (Mbps) | `uplink.speed` |

### WebSocket Events (gateway)

| Event key | Description |
|---|---|
| `EVT_WAN_Up` | WAN uplink came up |
| `EVT_WAN_Down` | WAN uplink went down |
| `EVT_AD_*` | IDS/IPS alert events |

---

## Client Entity vs Device Entity

UniFi distinguishes between:

| Entity | API path | Description |
|---|---|---|
| **Active clients** | `/stat/sta` | Currently connected clients (real-time) |
| **All users** | `/stat/alluser` | Historical list of all clients ever seen |
| **Devices** | `/stat/device` | Infrastructure devices (APs, switches, gateways) |

Homey drivers use **active clients** (`/stat/sta`) for presence detection.  
`getAllUsers()` is used for the block/unblock action (to find client by MAC in history).

---

## MAC Address Formats

UniFi uses lowercase colon-separated MAC addresses throughout:  
`aa:bb:cc:dd:ee:ff`

Homey device IDs for client drivers are stored as the MAC address string.  
Always normalise to lowercase before comparison.

