# Rate Limits and WebSocket Event Architecture

> Created-by: Sonnet 4.6 | 2026-03-21

---

## WebSocket Endpoints

| Controller type | WSS URL | Auth |
|---|---|---|
| Legacy / Docker | `wss://<host>:8443/wss/s/<site>/events` | `Cookie: unifises=...` |
| UniFi OS | `wss://<host>/proxy/network/wss/s/<site>/events` | `Cookie: TOKEN=...` |

Both paths are handled in `library/websocket.js` using the `node-unifi._unifios` flag.

---

## WS Message Envelope

Every WebSocket message from the controller is a JSON object:

```json
{
  "meta": {
    "rc": "ok",
    "message": "events"
  },
  "data": [
    { /* event payload */ },
    { /* event payload */ }
  ]
}
```

Multiple events can arrive in a single message (`data` is always an array).  
The parser in `app.js` iterates over all entries in `data`.

---

## Known Event Keys

### Wi-Fi / WLAN (`subsystem: "wlan"`)

| Key | Description |
|---|---|
| `EVT_WU_Connected` | Client connected to Wi-Fi |
| `EVT_WU_Disconnected` | Client disconnected from Wi-Fi |
| `EVT_WU_Roamed` | Client roamed to a different AP |
| `EVT_WU_RoamedToAp` | Client roamed to a specific AP (with AP details) |
| `EVT_WC_Blocked` | Client was blocked |
| `EVT_WC_Unblocked` | Client was unblocked |
| `EVT_WU_RogueApDetected` | Rogue/unknown AP detected |

### LAN / Cable (`subsystem: "lan"`)

| Key | Description |
|---|---|
| `EVT_WU_Connected` | Wired client connected |
| `EVT_WU_Disconnected` | Wired client disconnected |
| `EVT_LC_Blocked` | Wired client blocked |
| `EVT_LC_Unblocked` | Wired client unblocked |

### WAN (`subsystem: "wan"`)

| Key | Description | v2.6 |
|---|---|---|
| `EVT_WAN_Up` | WAN uplink restored | ❌ Planned |
| `EVT_WAN_Down` | WAN uplink lost | ❌ Planned |

### Infrastructure / IDS

| Key | Description | v2.6 |
|---|---|---|
| `EVT_AD_Threat` | IDS/IPS threat detected | ❌ Planned |
| `EVT_AD_AttackDetected` | Attack detected | ❌ Planned |
| `EVT_SW_PoeDisconnect` | PoE device disconnected from port | Available |
| `EVT_SW_PoeConnect` | PoE device connected to port | Available |

---

## Heartbeat (Ping/Pong)

Current implementation sends a plain string `'ping'` every **3 seconds**:

```js
this._pingPongInterval = 3 * 1000; // Ms
ws.send('ping');
```

The controller responds with `'pong'`. If no `'pong'` is received, the WS `close` or `error` event fires and `_reconnect()` is called.

**Recommendation**: The 3 s ping interval is aggressive. Consider increasing to 10–30 s to reduce overhead.  
Track missed pongs (e.g. 2 consecutive misses) before treating as dead and reconnecting.

---

## Reconnect Strategy — Current (BROKEN)

```js
_reconnect() {
  if (this._isReconnecting === false && this.homey.app.api.unifi._isClosed === false) {
    this._isReconnecting = true;
    setTimeout(async () => {
      this._isReconnecting = false;
      await this.listen();
    }, this._autoReconnectInterval); // fixed 5000 ms
  }
}
```

**Problems**:
1. Fixed 5 s — hammers the controller during an outage (12 reconnects/min indefinitely).
2. No jitter — all Homey instances reconnect simultaneously after a controller restart.
3. No maximum attempt count — runs forever.
4. `_isClosed` check references `node-unifi` internals — fragile.

---

## Reconnect Strategy — Target (Exponential Backoff + Jitter)

Replace `_reconnect()` with:

```js
// Constants
const RECONNECT_BASE_MS  = 2_000;   // 2 s initial wait
const RECONNECT_MAX_MS   = 300_000; // 5 min max wait
const RECONNECT_JITTER_MS = 1_000;  // up to 1 s random jitter

// State (add to constructor)
this._reconnectAttempt = 0;
this._isReconnecting   = false;

// Method
_reconnect() {
  if (this._isReconnecting) return;
  this._isReconnecting = true;

  const delay = Math.min(
    RECONNECT_BASE_MS * Math.pow(2, this._reconnectAttempt),
    RECONNECT_MAX_MS
  ) + Math.random() * RECONNECT_JITTER_MS;

  this._reconnectAttempt++;
  this.homey.app.debug(`WebSocket: reconnect in ${Math.round(delay / 1000)}s (attempt ${this._reconnectAttempt})`);

  setTimeout(async () => {
    this._isReconnecting = false;
    try {
      await this.listen();
    } catch (err) {
      this.homey.error('_reconnect() error: ' + err);
      this._reconnect(); // schedule next attempt
    }
  }, delay);
}

// Reset counter on successful connection (in ws.on('open'))
this._reconnectAttempt = 0;
```

Backoff table:

| Attempt | Wait (s) |
|---|---|
| 0 | 2 |
| 1 | 4 |
| 2 | 8 |
| 3 | 16 |
| 4 | 32 |
| 5 | 64 |
| 6 | 128 |
| 7+ | 300 (max) |

---

## Deduplication / Replay Guard

When the WS reconnects, the controller may replay the last N events.  
Without dedup, flow cards can fire multiple times for the same event.

**Recommended guard** (add to `app.js`):

```js
// In constructor / onInit:
this._recentEventIds = new Set();

// In parseWebsocketMessage():
const eventId = `${entry.key}_${entry.user || entry.client || ''}_${entry.time || ''}`;
if (this._recentEventIds.has(eventId)) {
  this.homey.app.debug(`[dedup] Skipping duplicate event: ${eventId}`);
  return;
}
this._recentEventIds.add(eventId);

// Expire old entries every minute to prevent unbounded memory growth:
// (Use homey.setInterval for proper lifecycle management)
this.homey.setInterval(() => this._recentEventIds.clear(), 60_000);
```

---

## Polling Fallback

`checkDevicesState()` polls `/stat/sta` and `/stat/device` on a configurable interval.

| Setting | Default | Minimum (recommended) |
|---|---|---|
| `settings.interval` | 15 s | 10 s |

**Rationale for 10 s minimum**: UniFi controllers on low-powered hardware (UDR, CK Gen1) can struggle with frequent REST calls. 10 s provides near-real-time presence detection while staying within safe limits.

**Enforcement** (to be added in `_initTimers()`):
```js
const interval = Math.max(10, parseInt(this.settings?.interval ?? 15, 10)) * 1000;
```

---

## API Rate Limits

Ubiquiti does not publish explicit rate limits for the legacy API.  
Based on community observation:

| Scenario | Observed limit |
|---|---|
| REST API calls (legacy) | No published limit; ~60 req/min safe |
| REST API calls (v1) | No published limit; similar to legacy |
| WebSocket connections | 1 per site per session |
| Login attempts | Lockout after ~5 failures (varies) |

**Recommendation**: Batch reads where possible. Use WS events as primary source; only poll for full state sync or when WS is down.

---

## Controller Firmware Version Caveats

| Controller version | Known issue |
|---|---|
| Network < 6.x | `EVT_WU_*` events may not include `hostname` field |
| Network 7.x | `/v1/` API introduced; some endpoints still in beta |
| Network 8.x | `PATCH /v1/...` WLAN toggle confirmed working |
| Network 9.x (UniFi OS 4.x) | Some WS event key names may differ; verify with live controller |
| Docker (self-hosted) | No UniFi OS prefix; `node-unifi` auto-detects via `_unifios = false` |
| Cloud Key Gen1 | Port 8443 only; no `/proxy/network/` prefix |
| Cloud Key Gen2+ | UniFi OS; port 443; `/proxy/network/` prefix |

See also: [`compatibility.md`](compatibility.md).

