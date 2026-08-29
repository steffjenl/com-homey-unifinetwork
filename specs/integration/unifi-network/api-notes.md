# UniFi Network API Notes

> Created-by: Sonnet 4.6 | 2026-03-21

---

## Two API Surfaces

### Surface A — Legacy "Classic" API

Available on **all** controller types (v4+). Used by `node-unifi`.

| Controller type | Base URL |
|---|---|
| Legacy / Docker / self-hosted | `https://<host>:8443/` |
| UniFi OS (UDM, UDR, UDW, CK Gen2+) | `https://<host>:443/proxy/network/` |

`node-unifi` auto-detects UniFi OS by issuing `GET /` and checking for the UniFi OS portal response, setting `_unifios = true` accordingly.

**Path scoping**:
```
# Legacy
https://<host>:8443/api/s/<site>/stat/sta        ← all clients
https://<host>:8443/api/s/<site>/stat/device     ← all devices

# UniFi OS (proxy prefix prepended by node-unifi)
https://<host>:443/proxy/network/api/s/<site>/stat/sta
https://<host>:443/proxy/network/api/s/<site>/stat/device
```

### Surface B — Official Network Integration API

Available on **UniFi OS ≥ 7.x** (UniFi Network 9.x+ / UniFi OS 9.3.43+ recommended). Auth via API key in the `X-API-KEY` header.

```
Base URL:  https://<host>/proxy/network/integration/
Endpoints: /v1/sites
           /v1/sites/{siteId}/devices
           /v1/sites/{siteId}/clients
           /v1/sites/{siteId}/clients/{clientId}/actions
           /v1/sites/{siteId}/wifi/broadcasts
           ...
```

Full endpoint list: see [`../unifi-network-api-cheatsheet.md`](../../unifi-network-api-cheatsheet.md).

---

## Authentication

### Session Cookie (Legacy — Path A)

#### Legacy controller (port 8443)

```http
POST https://<host>:8443/api/login
Content-Type: application/json

{ "username": "admin", "password": "password", "remember": true }
```

Response sets `unifises` cookie. Include in all subsequent requests.

#### UniFi OS controller (port 443)

```http
POST https://<host>/api/auth/login
Content-Type: application/json
Origin: https://<host>

{ "username": "admin", "password": "password", "rememberMe": true }
```

Response sets `TOKEN` cookie. Also returns `X-CSRF-Token` header.

**CSRF**: All state-changing requests on UniFi OS **must** include `X-CSRF-Token` header with the token from the login response or the `TOKEN` cookie decoded. `node-unifi` handles this automatically.

#### Session expiry

Sessions expire after approximately 24 hours (or less, depending on controller config).  
Current app re-authenticates every 1 hour via `refreshAuthTokens()` — this is safe.

### API Key (Integration API — Path B)

```http
GET https://<host>/proxy/network/integration/v1/sites
X-API-KEY: <api_key>
```

- API keys are created in UniFi OS: **Settings → API Keys → Create API Key**.
- Keys do not expire (until manually revoked).
- No CSRF required.
- Only works on UniFi OS ≥ 7.x (not legacy Docker/self-hosted).

---

## Site Scoping

Almost all API calls are scoped to a **site**. The default site name is `default`.

```
# Legacy path pattern
/api/s/<site_name>/...

# Example:
/api/s/default/stat/sta           ← all connected clients
/api/s/mysite/stat/device         ← all devices on site "mysite"
```

To find available site names:
```http
GET /api/s/default/stat/sites     ← legacy
GET /v1/sites                      ← v1 REST
```

The app exposes a **Sites** tab in the settings page that lists discovered site IDs.

---

## Key Endpoints (Legacy API — node-unifi wraps these)

| Operation | Method | Path |
|---|---|---|
| List all clients | GET | `/api/s/<site>/stat/sta` |
| List all devices | GET | `/api/s/<site>/stat/device` |
| List all users (ever connected) | GET | `/api/s/<site>/stat/alluser` |
| Block client | POST | `/api/s/<site>/cmd/stamgr` `{"cmd":"block-sta","mac":"..."}` |
| Unblock client | POST | `/api/s/<site>/cmd/stamgr` `{"cmd":"unblock-sta","mac":"..."}` |
| Reconnect client | POST | `/api/s/<site>/cmd/stamgr` `{"cmd":"kick-sta","mac":"..."}` |
| Set device config | PUT | `/api/s/<site>/rest/device/<device_id>` |
| Get sites | GET | `/api/stat/sites` |
| Get sysinfo | GET | `/api/s/<site>/stat/sysinfo` |

---

## Key Endpoints (v1 REST API)

| Operation | Method | Path |
|---|---|---|
| List sites | GET | `/v1/sites` |
| List devices | GET | `/v1/sites/{siteId}/devices` |
| Device actions | POST | `/v1/sites/{siteId}/devices/{deviceId}/actions` |
| List clients | GET | `/v1/sites/{siteId}/clients` |
| Client actions (block/unblock) | POST | `/v1/sites/{siteId}/clients/{clientId}/actions` |
| List WiFi broadcasts (SSIDs) | GET | `/v1/sites/{siteId}/wifi/broadcasts` |
| Update WiFi broadcast (enable/disable) | PATCH | `/v1/sites/{siteId}/wifi/broadcasts/{id}` |

---

## WebSocket Endpoint

| Controller type | WebSocket URL |
|---|---|
| Legacy / Docker | `wss://<host>:8443/wss/s/<site>/events` |
| UniFi OS | `wss://<host>/proxy/network/wss/s/<site>/events` |

Authentication: include session cookie in WS handshake `Cookie` header.  
Both paths are already handled in `library/websocket.js` via the `_unifios` flag from `node-unifi`.

---

## Pagination (v1 REST)

```
GET /v1/sites/{siteId}/clients?offset=0&limit=100
```

Response:
```json
{
  "offset": 0,
  "limit": 100,
  "count": 100,
  "totalCount": 350,
  "data": [ ... ]
}
```

Always paginate when `totalCount > limit`. Never assume all data fits on page 1.

---

## Error Model (v1 REST)

```json
{
  "statusCode": 400,
  "statusName": "BAD_REQUEST",
  "code": "VALIDATION_ERROR",
  "message": "Field 'mac' is required",
  "requestId": "abc123"
}
```

Transient errors: retry on `5xx` with exponential backoff. Do not retry `4xx` (client error).

---

## Filtering (v1 REST)

The v1 API supports server-side filtering via URL-safe filter expressions:

```
GET /v1/sites/{siteId}/clients?filter=isWired:eq:false
GET /v1/sites/{siteId}/devices?filter=type:eq:uap
```

Reduces response payload — use where possible.

---

## Important Caveats

1. **`sslverify: false`** is currently hardcoded. For production use with valid certs, set `sslverify: true`.
2. The `site` value in settings must match the UniFi **site name** (e.g. `default`), not the display name. Find it on the Sites tab.
3. Legacy API uses `mac` as device identifier; v1 REST uses a UUID `_id` / `deviceId`. Map carefully.
4. On Docker/self-hosted, the `/proxy/network/` prefix does **not** apply — `node-unifi` auto-detects this.
5. UniFi OS 4.x (Network 9.x) may change some endpoint paths. See [`compatibility.md`](compatibility.md).

