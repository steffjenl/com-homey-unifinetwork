# Flow Cards

> Created-by: Sonnet 4.6 | 2026-03-21

---

## Triggers

### `a_client_connected` — Device just connected (app-level)
- **Type**: App trigger (not device-specific)
- **Source**: WebSocket `EVT_WU_Connected` (when "Application Flows" enabled in settings)
- **Tokens**: `mac` (string), `name` (string), `essid` (string), `ipAddress` (string)
- **File**: `.homeycompose/flow/triggers/a_client_connected.json`
- **Status**: ✅ Implemented

---

### `a_client_disconnected` — Wifi connection lost (app-level)
- **Type**: App trigger
- **Source**: WebSocket `EVT_WU_Disconnected` (when "Application Flows" enabled)
- **Tokens**: `mac`, `name`, `essid`, `ipAddress`
- **Status**: ✅ Implemented

---

### `wifi_client_connected` — Wi-Fi client connected (device trigger)
- **Type**: Device trigger (`wifi-client` driver)
- **Source**: WebSocket `EVT_WU_Connected` for paired devices
- **Tokens**: `ssid` (string)
- **Status**: ✅ Implemented

---

### `wifi_client_disconnected` — Wi-Fi client disconnected (device trigger)
- **Type**: Device trigger (`wifi-client` driver)
- **Source**: WebSocket `EVT_WU_Disconnected` for paired devices
- **Tokens**: none
- **Status**: ✅ Implemented

---

### `wifi_client_roamed` — Wi-Fi client roamed to another AP (device trigger)
- **Type**: Device trigger (`wifi-client` driver)
- **Source**: WebSocket `EVT_WU_Roamed`
- **Tokens**: `ap` (string — new AP name), `ssid` (string)
- **Status**: ✅ Implemented

---

### `wifi_client_roamed_to_ap` — Wi-Fi client roamed to specific AP (device trigger)
- **Type**: Device trigger (`wifi-client` driver)
- **Source**: WebSocket `EVT_WU_Roamed`
- **Tokens**: `accessPoint` (string), `ap` (string)
- **Status**: ✅ Implemented

---

### `wifi_client_signal_changed` — Signal strength changed (device trigger)
- **Type**: Device trigger (`wifi-client` driver)
- **Source**: Polling delta in `checkDevicesState()`
- **Tokens**: `signal` (number dBm), `rssi` (number)
- **Status**: ✅ Implemented

---

### `cable_client_connected` — Cable client connected (device trigger)
- **Type**: Device trigger (`cable-client` driver)
- **Source**: WebSocket `EVT_WU_Connected` (subsystem: `lan`)
- **Status**: ✅ Implemented

---

### `cable_client_disconnected` — Cable client disconnected (device trigger)
- **Type**: Device trigger (`cable-client` driver)
- **Source**: WebSocket `EVT_WU_Disconnected` (subsystem: `lan`)
- **Status**: ✅ Implemented

---

### `first_device_connected` — First device connected to AP
- **Type**: App trigger
- **Source**: AP client count transition 0 → 1 (checked in `checkAccessPoints()`)
- **Tokens**: `accessPoint` (string — AP name), `last_num` (number), `curr_num` (number)
- **Args**: `accessPoint` (autocomplete from discovered APs)
- **Status**: ✅ Implemented

---

### `last_device_disconnected` — Last device disconnected from AP
- **Type**: App trigger
- **Source**: AP client count transition N → 0
- **Tokens**: `accessPoint`, `last_num`, `curr_num`
- **Status**: ✅ Implemented

---

### `first_device_online` — First tracked device came online
- **Type**: App trigger
- **Source**: `checkNumClientsConnectedTrigger()` — tracked device count 0 → 1
- **Tokens**: `name` (string — device name)
- **Status**: ✅ Implemented

---

### `last_device_offline` — Last tracked device went offline
- **Type**: App trigger
- **Source**: tracked device count N → 0
- **Status**: ✅ Implemented

---

### `wan_up` — WAN uplink came up ❌ PLANNED v2.6
- **Source**: WebSocket `EVT_WAN_Up` or `/v1/` polling
- **Tokens**: `wan_ip` (string), `interface` (string)
- **Note**: Requires gateway driver or app-level polling of `/stat/device`

---

### `wan_down` — WAN uplink went down ❌ PLANNED v2.6
- **Source**: WebSocket `EVT_WAN_Down`
- **Tokens**: `interface` (string), `reason` (string)

---

### `ids_ips_alert` — IDS/IPS threat detected ❌ PLANNED v2.6
- **Source**: WebSocket `EVT_AD_*` events
- **Tokens**: `category` (string), `src_ip`, `dst_ip`, `message`

---

### `rogue_ap_detected` — Rogue AP detected ❌ PLANNED v2.6
- **Source**: WebSocket `EVT_WU_RogueApDetected`
- **Tokens**: `ssid` (string), `bssid` (string), `channel` (number)

---

## Conditions

### `wifi_client_connected` — Is Wi-Fi client connected?
- **Driver**: `wifi-client`
- **Checks**: `device.getCapabilityValue('connected')`
- **Status**: ✅ Implemented

---

### `wifi_client_connected_with_ap` — Is Wi-Fi client connected to specific AP?
- **Driver**: `wifi-client`
- **Args**: `accessPoint` (string — AP MAC or name)
- **Checks**: `device.getCapabilityValue('ap_mac')` or `ap` matches
- **Status**: ✅ Implemented

---

### `wifi_client_blocked` — Is Wi-Fi client blocked?
- **Driver**: `wifi-client`
- **Checks**: `device.getCapabilityValue('blocked')`
- **Status**: ✅ Implemented

---

### `cable_client_blocked` — Is cable client blocked?
- **Driver**: `cable-client`
- **Checks**: `device.getCapabilityValue('blocked')`
- **Status**: ✅ Implemented

---

### `clients_connected` — Are any clients connected?
- **Type**: App condition
- **Checks**: any `wifi-client` device with `connected: true`
- **Status**: ✅ Implemented

---

### `guests_connected` — Are any guests connected?
- **Type**: App condition
- **Source**: `/api/s/<site>/stat/alluser` filtered `is_guest: true`
- **Status**: ✅ Implemented

---

### `ap_has_clients_connected` — Does AP have connected clients?
- **Type**: App condition
- **Args**: `accessPoint` (from AP list)
- **Status**: ✅ Implemented

---

### `device_online` — Is network device online? ❌ PLANNED v2.6
- **Driver**: `access-point` / `network-switch`
- **Checks**: `device.getCapabilityValue('connected')`

---

### `port_poe_on` — Is switch port PoE on? ❌ PLANNED v2.6
- **Driver**: `network-switch`
- **Args**: `port` (number)
- **Checks**: `device.getCapabilityValue('port.port_N')` + PoE state

---

## Actions

### `wifi_block` — Block Wi-Fi client
- **Driver**: `wifi-client`
- **API**: `node-unifi.blockClient(mac)`  → `POST /api/s/<site>/cmd/stamgr {"cmd":"block-sta","mac":"..."}`
- **Status**: ✅ Implemented

---

### `wifi_unblock` — Unblock Wi-Fi client
- **Driver**: `wifi-client`
- **API**: `node-unifi.unblockClient(mac)`
- **Status**: ✅ Implemented

---

### `cable_block` — Block cable client
- **Driver**: `cable-client`
- **API**: `node-unifi.blockClient(mac)`
- **Status**: ✅ Implemented

---

### `cable_unblock` — Unblock cable client
- **Driver**: `cable-client`
- **Status**: ✅ Implemented

---

### `network_switch_power_cycle_port` — PoE power-cycle switch port
- **Driver**: `network-switch`
- **Args**: `device` (Device), `port` (number 1–48)
- **API**: Set `poe_mode: "off"`, wait 500 ms, set `poe_mode: "auto"` via `setDeviceSettingsBase`
- **Status**: ✅ Implemented

---

### `network_switch_power_off_port` — Turn off PoE port
- **Driver**: `network-switch`
- **API**: Set `poe_mode: "off"`
- **Status**: ✅ Implemented

---

### `network_switch_power_on_port` — Turn on PoE port
- **Driver**: `network-switch`
- **API**: Set `poe_mode: "auto"`
- **Status**: ✅ Implemented

---

### `toggle_wlan` — Enable or disable WLAN (SSID) ❌ PLANNED v2.6
- **API (legacy)**: `PUT /api/s/<site>/rest/wlanconf/<wlan_id>` `{"enabled": true/false}`
- **API (v1)**: `PATCH /v1/sites/{siteId}/wifi/broadcasts/{id}` `{"enabled": true/false}`
- **Args**: `wlan` (autocomplete from `/v1/sites/{siteId}/wifi/broadcasts`), `enable` (boolean)
- **Note**: Requires WLAN listing endpoint call for autocomplete

---

### `reconnect_client` — Reconnect (kick) a client ❌ PLANNED v2.6
- **API**: `POST /api/s/<site>/cmd/stamgr {"cmd":"kick-sta","mac":"..."}`
- **Args**: `device` (Device)
- **Note**: Forces the client to re-associate — useful for IP renewal or AP roam forcing

---

## Summary Table

| Category | Implemented | Planned v2.6 | Total |
|---|---|---|---|
| Triggers | 13 | 4 | 17 |
| Conditions | 7 | 2 | 9 |
| Actions | 7 | 2 | 9 |
| **Total** | **27** | **8** | **35** |

