# Threat Model — UniFi Network Homey App

> Created-by: Sonnet 4.6 | 2026-03-21  
> Methodology: STRIDE-lite (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege)

---

## System Overview

```
┌──────────────────────────────────────────────────────────┐
│  Homey Pro (local network)                               │
│                                                          │
│  ┌─────────────────────────────┐                        │
│  │  com.ubnt.unifi Homey App   │                        │
│  │                             │                        │
│  │  app.js ──► apiclient.js   │                        │
│  │              │  │           │                        │
│  │         node-unifi  WsClient│                        │
│  │              │  │           │                        │
│  └──────────────┼──┼───────────┘                        │
│                 │  │                                     │
│           HTTPS │  │ WSS                                │
└─────────────────┼──┼─────────────────────────────────── ┘
                  │  │
         ┌────────▼──▼─────────┐
         │  UniFi Controller   │
         │  (UDM / CK / Docker)│
         │  LAN / VLAN segment │
         └─────────────────────┘
```

**Data flows:**

| Flow | Protocol | Data |
|---|---|---|
| Login | HTTPS POST | username, password (plaintext in TLS body) |
| Session cookie | HTTPS Cookie | `unifises`, `TOKEN`, CSRF token |
| REST API calls | HTTPS | Device state JSON, client MAC, block/unblock commands |
| WebSocket | WSS | Event stream: client connect/disconnect, IDS alerts |
| Homey settings | Encrypted local storage | host, port, username, password, site, sslverify |
| Realtime API | Homey internal | Status strings pushed to settings page |
| Logs | Homey log service (homey-log) | Debug messages (see DLP concern below) |

---

## Assets

| Asset | Sensitivity | Location |
|---|---|---|
| Controller username/password | 🔴 HIGH | `this.homey.settings` |
| Session cookie / TOKEN | 🔴 HIGH | `node-unifi` in-memory `tough-cookie` jar |
| Controller IP / hostname | 🟡 MEDIUM | `this.homey.settings` |
| API Key (future v2.6) | 🔴 HIGH | `this.homey.settings` |
| Client MAC addresses | 🟡 MEDIUM | In-memory, flow card tokens |
| WS event stream | 🟡 MEDIUM | In-memory only; not persisted |

---

## Threats

### T-1 — Credentials exposed in logs (Information Disclosure)

**Threat**: Developer accidentally logs `settings.pass` or session cookies via `this.homey.log()` or `homey-log`.  
**Current mitigations**: `debug()` is gated behind a debug flag. `homey-log` is the Sentry-based log service — logs go to cloud.  
**Residual risk**: 🔴 **HIGH** — `homey-log` (Sentry) could capture stack traces containing credential values if they appear in Error objects.  
**Recommended fix**: Scrub credentials before any log/error call. Add ESLint rule `no-secrets` or manual review gate.  
**Acceptance criterion**: Grep codebase for `settings.pass`, `settings.user` in log calls — zero occurrences.

---

### T-2 — TLS disabled by default (Tampering / Information Disclosure)

**Threat**: `sslverify: false` hardcoded in `apiclient.js` disables TLS certificate verification.  
A MITM attacker on the LAN could intercept credentials and controller traffic.  
**Current mitigations**: App is `local` platform only; attacker must be on the same LAN.  
**Residual risk**: 🟠 **MEDIUM** — LAN MITM is a real threat (ARP spoofing, rogue AP on home network).  
**Recommended fix**: Expose `sslverify` as a user setting; default to `true` for new installs; document self-signed cert exception in setup guide.  
**ADR reference**: ADR-0003 Gap G-5.

---

### T-3 — Session cookie theft (Spoofing / Elevation of Privilege)

**Threat**: The `tough-cookie` jar is in-memory. If an attacker can dump the Homey app process memory or access `this.homey.app.api.unifi._cookieJar`, they obtain a valid session.  
**Current mitigations**: Homey OS isolates app processes; cookie jar is not persisted to disk.  
**Residual risk**: 🟡 **LOW-MEDIUM** — only exploitable with Homey OS process-level access.  
**Recommended fix**: Prefer API-key auth (v2.6) which avoids session cookies entirely for REST calls.

---

### T-4 — Rate limiting / DoS on controller (Denial of Service)

**Threat**: `checkDevicesState()` runs every 15 s (configurable by user to any value). A user setting interval to 1 s could overwhelm a small controller (CloudKey, UDR).  
**Current mitigations**: None — no minimum interval enforced.  
**Residual risk**: 🟠 **MEDIUM** — user-configurable, but no guardrail.  
**Recommended fix**: Enforce minimum interval of 10 s in settings validation. Document recommendation of 15–30 s in setup guide.

---

### T-5 — WebSocket reconnect storm (Denial of Service)

**Threat**: Current `_reconnect()` uses a fixed 5 s interval. If the controller is under load and closing connections, the app will hammer it with reconnection attempts.  
**Current mitigations**: `_isReconnecting` flag prevents concurrent reconnects.  
**Residual risk**: 🟠 **MEDIUM** — fixed 5 s could still produce 12 reconnect attempts/minute.  
**Recommended fix**: Replace with exponential backoff (2→4→8→…→300 s) + jitter. See TODO-002.

---

### T-6 — Block/unblock action without authorisation check (Elevation of Privilege)

**Threat**: Any Homey user (including guests via Homey app shared access) can trigger `wifi_block` / `cable_block` action cards that block network clients.  
**Current mitigations**: Homey's own flow permission system.  
**Residual risk**: 🟡 **MEDIUM** — depends on Homey household access controls.  
**Recommended fix**: Document in setup guide that block/unblock cards should be placed in flows with appropriate conditions (e.g. Homey user identity check).

---

### T-7 — Unrestricted controller access (Elevation of Privilege)

**Threat**: The controller admin account used by this app has full admin privileges. If the password is leaked, an attacker can manage the entire network.  
**Current mitigations**: None — app does not enforce least-privilege.  
**Recommended fix**: In setup guide, instruct users to create a **read-only + limited** admin account (Network role: `Network-Only`), not a Super Admin. For PoE/block actions, a `Network-Admin` role is needed.

---

## Homey Permissions (app.json)

Current permissions in `app.json` — review for necessity:

| Permission | Necessity |
|---|---|
| None declared in `app.json` | ✅ Minimal — Homey SDK v3 does not require explicit permission declarations for `settings`, `flow`, `drivers` |

The app accesses `this.homey.settings`, `this.homey.flow`, `this.homey.drivers` — all are internal SDK v3 capabilities, no additional permissions needed.

---

## Secrets Handling Summary

| Secret | Storage | Transmission | Logging risk |
|---|---|---|---|
| Username | `this.homey.settings` (encrypted) | HTTPS POST body | 🔴 Risk if logged |
| Password | `this.homey.settings` (encrypted) | HTTPS POST body | 🔴 Risk if logged |
| Session cookie | In-memory (`tough-cookie`) | HTTPS Cookie header | 🟡 Risk in stack traces |
| API Key (v2.6) | `this.homey.settings` (encrypted) | HTTPS Authorization header | 🔴 Risk if logged |

---

## DLP (Data Loss Prevention) Considerations

- `homey-log` (Sentry integration) must **never** receive objects containing passwords or tokens.
- Wrap all `this.homeyLog.*` calls to strip sensitive keys from objects before logging.
- Recommended: a `sanitise(obj)` utility that removes `pass`, `password`, `token`, `apiKey`, `cookie` keys recursively.

---

## Residual Risk Register

| ID | Risk | Severity | Status |
|---|---|---|---|
| T-1 | Credentials in logs | HIGH | Open — TODO-007 |
| T-2 | TLS disabled by default | MEDIUM | Open — TODO-007 (ADR-0003 G-5) |
| T-3 | Cookie theft | LOW | Accepted — mitigated by OS isolation |
| T-4 | Polling DoS | MEDIUM | Open — add min interval guard |
| T-5 | WS reconnect storm | MEDIUM | Open — TODO-002 |
| T-6 | Block action without authz | MEDIUM | Accepted — user documentation |
| T-7 | Over-privileged controller account | MEDIUM | Open — setup guide |

