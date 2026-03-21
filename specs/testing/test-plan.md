# Test Plan

> Created-by: Sonnet 4.6 | 2026-03-21

---

## Overview

Testing strategy for `com.ubnt.unifi` covers three layers:

| Layer | Tool | Scope |
|---|---|---|
| **Unit** | Jest | `library/` modules in isolation — mocked Homey & controller |
| **Integration** | Jest + WS mock | Full app flow from WebSocket event to Homey trigger |
| **Device simulation** | `homey app run` | Live run on Homey Pro; manual smoke test |

---

## Setup

### Install Jest

```bash
npm install --save-dev jest @jest/globals
```

Add to `package.json`:
```json
{
  "scripts": {
    "test": "jest --testPathPattern='specs/testing|test' --forceExit"
  },
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/test/**/*.test.js", "**/specs/testing/**/*.test.js"]
  }
}
```

---

## Unit Tests

### `test/library/apiclient.test.js`

```js
// Mock node-unifi
jest.mock('node-unifi', () => ({
  Controller: jest.fn().mockImplementation(() => ({
    login: jest.fn().mockResolvedValue(true),
    logout: jest.fn().mockResolvedValue(true),
    getClientDevices: jest.fn().mockResolvedValue([
      { mac: 'aa:bb:cc:dd:ee:ff', is_wired: false, essid: 'TestSSID', hostname: 'MyPhone' }
    ]),
    getAccessDevices: jest.fn().mockResolvedValue([
      { mac: '11:22:33:44:55:66', type: 'uap', adopted: true, name: 'LivingRoomAP' }
    ]),
    blockClient: jest.fn().mockResolvedValue(true),
    unblockClient: jest.fn().mockResolvedValue(true),
  }))
}));

const ApiClient = require('../../library/apiclient');

test('getWiFiDevices returns only wireless clients', async () => { ... });
test('getCableDevices returns only wired clients', async () => { ... });
test('getAccessPoints returns only adopted UAPs', async () => { ... });
test('getDeviceName falls back to hostname then mac', () => { ... });
test('powerCycleDevice sets poe_mode off then auto', async () => { ... });
```

### `test/library/websocket.test.js`

```js
// Real WebSocket event payloads recorded from a live controller (see below)
test('listen() parses EVT_WU_Connected payload', async () => { ... });
test('listen() parses EVT_WU_Disconnected payload', async () => { ... });
test('_reconnect() uses exponential backoff', async () => { ... });
test('dedup guard ignores duplicate event within 500ms', async () => { ... });
```

### `test/library/constants.test.js`

```js
const c = require('../../library/constants');
test('all event constants are non-empty strings', () => {
  Object.values(c).forEach(v => expect(typeof v).toBe('string'));
});
```

---

## Recorded WebSocket Payloads

The following real payloads were captured from a live UniFi controller (source: `app.js` inline comments).  
Use these as fixtures in unit tests.

### `EVT_WU_Disconnected`
```json
{
  "user": "82:74:71:f9:15:25",
  "ssid": "MonkeySoft",
  "hostname": "2001-1c04-352c-6900-4990-fde6-f18d-3d8f.cable.dynamic.v6.ziggo.nl",
  "ap": "d0:21:f9:89:df:f9",
  "duration": 1058,
  "bytes": 2527451,
  "ap_model": "UAP6MP",
  "ap_name": "BenedenAP",
  "ap_displayName": "BenedenAP",
  "key": "EVT_WU_Disconnected",
  "subsystem": "wlan",
  "is_negative": false,
  "site_id": "6550cbaad28ec670541702d5",
  "time": 1761598537000,
  "datetime": "2025-10-27T20:55:37Z",
  "msg": "User[82:74:71:f9:15:25] disconnected from \"MonkeySoft\""
}
```

### `EVT_WU_Connected`
```json
{
  "user": "ea:5b:28:b2:00:b5",
  "ssid": "Ziggo6322902",
  "ap": "d0:21:f9:89:df:f9",
  "radio": "na",
  "channel": "40",
  "channelWidth": "80",
  "hostname": "iPhone",
  "ap_model": "UAP6MP",
  "ap_name": "BenedenAP",
  "ap_displayName": "BenedenAP",
  "key": "EVT_WU_Connected",
  "subsystem": "wlan",
  "is_negative": false,
  "site_id": "6550cbaad28ec670541702d5",
  "time": 1761598567827,
  "datetime": "2025-10-27T20:56:07Z",
  "msg": "User[ea:5b:28:b2:00:b5] has connected to AP[d0:21:f9:89:df:f9]"
}
```

### WS message envelope
```json
{
  "meta": { "rc": "ok", "message": "events" },
  "data": [ { "<event payload>" } ]
}
```

---

## Integration Test: WebSocket → Flow Trigger

```
[WS server mock] → emits EVT_WU_Connected message
         ↓
[WebsocketClient.listen()] parses message
         ↓
[app.parseWebsocketMessage()] dispatches to wifi-client driver
         ↓
[WiFiDevice.onIsConnected(true, ssid)] updates capability
         ↓
[app._clientConnected.trigger(tokens)] → assert trigger called with correct tokens
```

### Mock setup using `ws` package

```js
const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ port: 18443 });
wss.on('connection', ws => {
  ws.send(JSON.stringify({
    meta: { rc: 'ok', message: 'events' },
    data: [EVT_WU_Connected_FIXTURE]
  }));
});
```

---

## Device Simulation — `homey app run`

### Steps

1. Ensure Homey Pro is on the same network.
2. Run:
   ```bash
   homey app run
   ```
3. Open Homey app → UniFi Network → Settings → configure controller IP, port, credentials, site.
4. Click **Test credentials** — verify success response.
5. Pair a Wi-Fi device (your phone).
6. Disconnect your phone from Wi-Fi — verify `wifi_client_disconnected` trigger fires in the flow editor.
7. Reconnect — verify `wifi_client_connected` fires.
8. Verify WebSocket status shows "Connected" on the settings page.

### Attach Chrome Debugger

```bash
homey app run --clean
```

Open `chrome://inspect` → Remote Target → select the Homey app process.  
Set breakpoints in `parseWebsocketMessage()` and `checkDevicesState()`.

### Capture Logs

```bash
homey app run 2>&1 | tee specs/diagnostics/run-$(date +%Y%m%d-%H%M%S).log
```

---

## Mocking UniFi Events Locally (without a controller)

1. Start a local HTTPS + WS server using `node test/fixtures/mock-unifi-server.js`.
2. Configure app settings to point to `localhost:18443`.
3. The mock server emits pre-recorded payloads on a timer.
4. This allows full flow-card testing without a physical UniFi controller.

Mock server skeleton (`test/fixtures/mock-unifi-server.js`) to be created as part of TODO-005.

---

## CI Integration

Add to `.github/workflows/homey-validation.yml`:

```yaml
- name: Install dependencies
  run: npm ci
- name: Run tests
  run: npm test
- name: Lint
  run: npm run lint
```

