# TODO — Prioritised Backlog

> Created-by: Sonnet 4.6 | 2026-03-21  
> Max 12 items. Each item has a clear Definition of Done (DoD).

---

## TODO-001 — Expose `sslverify` as user setting

**Priority**: High  
**ADR**: [ADR-0003 Gap G-5](../adrs/ADR-0003-sdkv3-migration.md)  
**Threat**: [T-2 THREAT_MODEL](../security/THREAT_MODEL.md)

**Problem**: `sslverify: false` is hardcoded in `library/apiclient.js`. Users with valid TLS certs on their UDM are silently insecure.

**Acceptance Criteria**:
- `settings/index.html` has a new checkbox "Verify SSL certificate" (default: checked for new installs)
- `library/apiclient.js` reads `settings.sslverify` (migration shim: if `undefined`, default to `false`)
- Both `Unifi.Controller` and `WebsocketClient` receive the `sslverify` value
- `locales/en.json` updated with new label
- Setup guide documents when to uncheck (self-signed cert scenario)

---

## TODO-002 — Replace fixed WS reconnect with exponential backoff + jitter

**Priority**: High  
**ADR**: [ADR-0004](../adrs/ADR-0004-unifi-network-integration-strategy.md)  
**Spec**: [rate-limits-and-events.md](../integration/unifi-network/rate-limits-and-events.md)

**Problem**: `_reconnect()` in `library/websocket.js` uses a fixed 5 s interval. A controller restart causes 12 reconnect attempts/minute indefinitely.

**Acceptance Criteria**:
- Backoff: `min(2^(attempt+1) * 1000, 300_000)` ms + `random * 1000` ms jitter
- Attempt counter resets to 0 on successful `ws.on('open')`
- `_isReconnecting` guard preserved
- Debug log shows attempt number and wait time
- Unit test verifies backoff sequence (mock `setTimeout`)

---

## TODO-003 — Add WebSocket event deduplication guard

**Priority**: Medium  
**Spec**: [rate-limits-and-events.md](../integration/unifi-network/rate-limits-and-events.md)

**Problem**: WS reconnect can cause duplicate events → double flow-card triggers.

**Acceptance Criteria**:
- `_recentEventIds` Set in `app.js`; key = `${key}_${user||client}_${time}`
- Duplicate within the same Set is skipped and debug-logged
- Set is cleared every 60 s via `this.homey.setInterval()`
- Unit test: same payload sent twice → trigger fires once

---

## TODO-004 — Add missing flow cards: WAN up/down + WLAN toggle (v2.6)

**Priority**: Medium  
**ADR**: [ADR-0004](../adrs/ADR-0004-unifi-network-integration-strategy.md)  
**Spec**: [flow-cards.md](../integration/unifi-network/flow-cards.md)

**Problem**: No WAN up/down trigger; no WLAN toggle action. These are frequently requested by users.

**Acceptance Criteria**:
- `wan_up` and `wan_down` trigger cards in `.homeycompose/flow/triggers/`
- Trigger fires from WS `EVT_WAN_Up` / `EVT_WAN_Down` events (or polling `/stat/device` WAN status as fallback)
- `toggle_wlan` action card in `.homeycompose/flow/actions/`
- Action uses `PATCH /v1/sites/{siteId}/wifi/broadcasts/{id} {"enabled": bool}`
- WLAN list autocomplete in the action card
- All new cards have English titles and tokens

---

## TODO-005 — Add ESLint, Prettier, and first unit test

**Priority**: Medium  
**Spec**: [lint-format.md](../quality/lint-format.md), [test-plan.md](../testing/test-plan.md)

**Problem**: No linting or test infrastructure. Regressions are caught only at runtime.

**Acceptance Criteria**:
- `npm run lint` executes ESLint with `.eslintrc.cjs` config (zero errors on current codebase after G-3 and G-6 are fixed)
- `npm run format:check` executes Prettier check
- `npm test` runs Jest
- At least one test: `test/library/apiclient.test.js` covers `getWiFiDevices`, `getCableDevices`, `getDeviceName`
- CI `homey-validation.yml` extended with lint and test steps

---

## TODO-006 — Fix version mismatch and upgrade tsconfig

**Priority**: High  
**ADR**: [ADR-0003 Gap G-1 + G-2](../adrs/ADR-0003-sdkv3-migration.md)

**Problem**: `package.json` is `2.3.6`, `app.json` is `2.5.5`. `tsconfig.json` targets Node 12.

**Acceptance Criteria**:
- `package.json` `"version"` set to `"2.5.5"`
- `@tsconfig/node12` removed; `@tsconfig/node22` installed
- `tsconfig.json` extends `@tsconfig/node22/tsconfig.json`
- `npx tsc --noEmit` produces zero errors
- Version-match assertion in CI: `node -e "..."` (see release-checklist.md)

---

## TODO-007 — Remove V8 GC hack + dead code in api.js

**Priority**: High  
**ADR**: [ADR-0003 Gap G-3 + G-6](../adrs/ADR-0003-sdkv3-migration.md)

**Problem**: `gcManual()` uses `require('v8')` / `require('vm')` V8 internals. `api.js` has an unreachable return.

**Acceptance Criteria**:
- `gcManual()` removed from `app.js`
- Its call site in `checkDevicesState()` removed
- `require('v8')` and `require('vm')` imports removed from `app.js`
- Unreachable `return { status: 'failure' }` block removed from `api.js`
- `npm run lint` no-restricted-modules and no-unreachable rules pass

---

## TODO-008 — Pin node-unifi to npm tagged release

**Priority**: Medium  
**ADR**: [ADR-0003 Gap G-4](../adrs/ADR-0003-sdkv3-migration.md)

**Problem**: `"node-unifi": "github:jens-maus/node-unifi#master"` is unpinned.

**Acceptance Criteria**:
- `package.json` updated to `"node-unifi": "^2.5.1"`
- `npm install` fetches from npm registry
- `npm ls node-unifi` shows a semver version
- CI `npm ci` passes reproducibly

---

## TODO-009 — Dual-path auth: add Bearer API-key option (v2.6)

**Priority**: Medium  
**ADR**: [ADR-0004](../adrs/ADR-0004-unifi-network-integration-strategy.md)

**Problem**: Session-cookie auth expires and requires re-login every hour. UniFi OS ≥ 7.x supports stable API keys.

**Acceptance Criteria**:
- New optional "API Key" field in `settings/index.html`
- When `settings.apiKey` is set, `/v1/` calls use `Authorization: Bearer <apiKey>`
- Legacy session-cookie path still used for WS and fallback REST calls
- `library/apiclient.js` has a `_callV1(method, path, body)` helper that injects the Bearer header
- Setup guide documents how to create an API key in UniFi OS
- API key is never logged

---

## TODO-010 — Add minimum polling interval guard

**Priority**: Low  
**Threat**: [T-4 THREAT_MODEL](../security/THREAT_MODEL.md)

**Problem**: User can set interval to 1 s, overwhelming a small controller.

**Acceptance Criteria**:
- `_initTimers()` enforces `Math.max(10, parseInt(settings.interval, 10)) * 1000`
- Settings page `txt_interval` input has `min="10"` attribute
- `locales/en.json` note updated: "Minimum 10 seconds"

---

## TODO-011 — Improve credentials security: sanitise log output

**Priority**: Medium  
**Threat**: [T-1 THREAT_MODEL](../security/THREAT_MODEL.md)

**Problem**: `homey-log` (Sentry) could capture stack traces with credentials if they appear in Error objects.

**Acceptance Criteria**:
- `sanitise(obj)` utility in `library/` removes keys: `pass`, `password`, `token`, `apiKey`, `cookie`, `unifises`
- All `homey-log` calls wrap objects through `sanitise()`
- Grep check: `settings.pass` and `settings.password` do not appear in any `log()` or `error()` call
- Unit test for `sanitise()` covers nested objects

---

## TODO-012 — Write user setup guide + screenshots (docs/setup-guide.md)

**Priority**: High  
**Spec**: [docs/setup-guide.md](../../docs/setup-guide.md)

**Problem**: New users do not know how to create a UniFi user, find the site ID, or configure the app.

**Acceptance Criteria**:
- `docs/setup-guide.md` exists and covers all 6 sections (see file)
- Screenshot placeholders use descriptive filenames in `docs/screenshots/`
- Guide is linked from root `README.md`
- Guide covers both port-443 (UniFi OS) and port-8443 (Docker) scenarios
- Guide documents how to create an API key for v2.6 readiness

---

## Backlog Summary

| # | Title | Priority | Milestone |
|---|---|---|---|
| 001 | Expose sslverify as user setting | High | v2.5.6 |
| 002 | WS exponential backoff | High | v2.5.6 |
| 003 | WS event dedup guard | Medium | v2.5.6 |
| 004 | WAN + WLAN flow cards | Medium | v2.6.0 |
| 005 | ESLint + Prettier + Jest | Medium | v2.5.6 |
| 006 | Version sync + tsconfig upgrade | High | v2.5.6 |
| 007 | Remove V8 GC hack + dead code | High | v2.5.6 |
| 008 | Pin node-unifi to npm release | Medium | v2.5.6 |
| 009 | Bearer API-key auth (dual-path) | Medium | v2.6.0 |
| 010 | Min polling interval guard | Low | v2.5.6 |
| 011 | Credential sanitisation in logs | Medium | v2.5.6 |
| 012 | User setup guide | High | v2.5.6 |

