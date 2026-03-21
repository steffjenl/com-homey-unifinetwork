# UniFi Network Compatibility

> Created-by: Sonnet 4.6 | 2026-03-21

---

## Controller Deployment Types

| Type | Typical host | Port | UniFi OS? | node-unifi `_unifios` |
|---|---|---|---|---|
| UDM (UniFi Dream Machine) | UDM device | 443 | ✅ Yes | `true` |
| UDM Pro / SE | UDM Pro device | 443 | ✅ Yes | `true` |
| UDR (UniFi Dream Router) | UDR device | 443 | ✅ Yes | `true` |
| UDW (UniFi Dream Wall) | UDW device | 443 | ✅ Yes | `true` |
| Cloud Key Gen2 / Gen2+ | CK device | 443 | ✅ Yes | `true` |
| Cloud Key Gen1 | CK device | 8443 | ❌ No | `false` |
| Docker / self-hosted | Any server | 8443 | ❌ No | `false` |
| UniFi Cloud (hosted by Ubiquiti) | `*.ui.com` | 443 | ✅ Yes | N/A (out of scope) |

`node-unifi` detects UniFi OS by making a probe request to `/` and checking the response.

---

## Network Application Version Matrix

| Network version | UniFi OS version | `/v1/` API | WS events | Notes |
|---|---|---|---|---|
| 6.x | — | ❌ | ✅ (partial) | Legacy only; hostname may be missing from events |
| 7.0–7.4 | 3.x | ✅ (beta) | ✅ | `/v1/` introduced but some endpoints unstable |
| 7.5–7.x | 3.x | ✅ | ✅ | Most `/v1/` endpoints stable |
| 8.0–8.x | 3.x–4.x | ✅ | ✅ | WLAN PATCH confirmed; client actions stable |
| 9.0+ | 4.x | ✅ | ✅ | Current/latest; most stable API surface |

---

## API Path Differences by Controller Type

### Legacy (Docker / Cloud Key Gen1)

```
Auth:     POST https://<host>:8443/api/login
Clients:  GET  https://<host>:8443/api/s/<site>/stat/sta
Devices:  GET  https://<host>:8443/api/s/<site>/stat/device
WS:       WSS  wss://<host>:8443/wss/s/<site>/events
v1 API:   ❌ Not available
```

### UniFi OS (UDM / UDR / CK Gen2+)

```
Auth:     POST https://<host>/api/auth/login
Clients:  GET  https://<host>/proxy/network/api/s/<site>/stat/sta
Devices:  GET  https://<host>/proxy/network/api/s/<site>/stat/device
WS:       WSS  wss://<host>/proxy/network/wss/s/<site>/events
v1 API:   GET  https://<host>/proxy/network/v1/sites
```

`node-unifi` adds the `/proxy/network/` prefix automatically when `_unifios = true`.

---

## Settings: Port Guidance

| Scenario | Port | sslverify |
|---|---|---|
| UniFi OS (UDM, UDR, CK Gen2+) | `443` | `true` (valid Ubiquiti cert) |
| Legacy / Docker | `8443` | `false` (self-signed cert typical) |
| Custom Docker with valid cert | `8443` or custom | `true` |

The settings page defaults `Port` to `443`. Inform users of the 8443 alternative for Docker.

---

## CSRF Token Handling

| Controller type | CSRF required? | How handled |
|---|---|---|
| Legacy | ❌ No | N/A |
| UniFi OS | ✅ Yes | `node-unifi` reads `X-CSRF-Token` from login response and includes it in all state-changing requests automatically |

No manual CSRF handling needed in app code — `node-unifi` manages this.

---

## Known Breaking Changes by Version

### Network 7.0

- Introduced `/v1/` REST API (beta). Some resources (e.g. firewall policies) were in flux.
- `EVT_WU_Connected` payload gained `ap_model`, `ap_name`, `ap_displayName` fields.

### Network 8.0

- `/v1/sites/{siteId}/wifi/broadcasts` PATCH for WLAN enable/disable is stable.
- Client action endpoint `/v1/sites/{siteId}/clients/{clientId}/actions` works for block/unblock.

### Network 9.0 (UniFi OS 4.x)

- UniFi OS moved some management paths. Verify the `/proxy/network/` prefix still applies.
- **Open Question OQ-3**: Which WS event keys changed in 9.x? Needs verification on live controller.
- The `api/auth/login` endpoint path is confirmed stable as of 9.0.

### Docker / self-hosted ≤ v7

- No `/v1/` API.
- Must use legacy `/api/s/<site>/` endpoints only.
- `node-unifi._unifios = false` — the app uses port 8443 paths.

---

## Detection Logic (current in node-unifi)

```js
// node-unifi auto-detect (simplified)
const response = await axios.get(`${this._baseurl.href}`);
if (response.headers['x-csrf-token'] || response.data?.meta?.app === 'network') {
  this._unifios = true; // UniFi OS detected
}
```

The app settings page lets users specify port 443 vs 8443 — this indirectly selects the path style.  
`node-unifi` validates automatically; no manual `_unifios` setting is needed.

---

## Homey Compatibility

| Homey platform | Works? | Notes |
|---|---|---|
| Homey Pro 2019 | ✅ | Requires direct LAN access to controller |
| Homey Pro 2023 | ✅ | Same network or reachable via LAN |
| Homey Pro 2026 | ✅ | Same |
| Homey Pro mini | ✅ | Same |
| Homey Cloud | ❌ | `platforms: ["local"]` only — controller not reachable from cloud |
| Homey Bridge | ❌ | Not local platform |

---

## TLS / SSL Notes

- UDM/UDR/CK Gen2+ use a Ubiquiti-issued certificate. These are trusted by default — `sslverify: true` works.
- Docker / self-hosted typically use self-signed certificates — `sslverify: false` required.
- Cloud Key Gen1 uses a self-signed certificate — `sslverify: false` typical.
- Users can import their own certificate to the controller to enable `sslverify: true` on Docker.

