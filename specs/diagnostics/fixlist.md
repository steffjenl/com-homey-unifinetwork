# Fix List — Diagnostics

> Created-by: Sonnet 4.6 | 2026-03-21  
> Format: Each entry has Root Cause → Fix → Test → Status

---

## FIX-001 — `package.json` version `2.3.6` ≠ `app.json` `2.5.5`

**Root cause**: Developer bumped `app.json` version through Homey tooling but forgot to sync `package.json`.  
**Fix**: Set `package.json` `"version"` to `"2.5.5"`.  
**Test**: `node -e "const p=require('./package.json'),a=require('./app.json');console.assert(p.version===a.version,'mismatch')"` exits 0.  
**Status**: ✅ Fixed (this session)  
**File**: `package.json`

---

## FIX-002 — `tsconfig.json` extends `@tsconfig/node12` but `@types/node ^22` installed

**Root cause**: tsconfig was not updated when Node.js target was bumped from 12 to 22.  
**Fix**: Install `@tsconfig/node22`; update `tsconfig.json` `extends` field; remove `@tsconfig/node12`.  
**Test**: `npx tsc --noEmit` exits 0.  
**Status**: ✅ Fixed (this session)  
**File**: `tsconfig.json`, `package.json`

---

## FIX-003 — `gcManual()` uses V8 internals `setFlagsFromString` / `runInNewContext`

**Root cause**: Attempt to manually trigger GC due to memory pressure. Uses Node.js V8 internals that are fragile across versions and likely to crash on Node 22.  
**Fix**: Remove `gcManual()`, its call site in `checkDevicesState()`, and both `require()` imports (`v8`, `vm`). Homey manages app memory; manual GC is not permitted.  
**Test**: App starts without error; `checkDevicesState()` completes. ESLint `no-restricted-modules` rule passes.  
**Status**: ✅ Fixed (this session)  
**File**: `app.js`

---

## FIX-004 — Dead unreachable code in `api.js`

**Root cause**: `testCredentials()` has a `return { status: 'failure' }` block after the closing `}` of the `try/catch`, which is unreachable.  
**Fix**: Remove the 4 unreachable lines.  
**Test**: ESLint `no-unreachable` rule passes on `api.js`.  
**Status**: ✅ Fixed (this session)  
**File**: `api.js`

---

## FIX-005 — `node-unifi` pinned to `github:#master`

**Root cause**: Developer used GitHub reference for latest features during development; never pinned to release.  
**Fix**: Change to `"node-unifi": "^2.5.1"` in `package.json`; run `npm install`.  
**Test**: `npm ls node-unifi` shows `node-unifi@2.5.x`.  
**Status**: ✅ Fixed (this session)  
**File**: `package.json`

---

## FIX-006 — `sslverify: false` hardcoded in `apiclient.js`

**Root cause**: Default chosen for compatibility with self-signed certs; never made configurable.  
**Fix**: Read `settings.sslverify` with migration shim (default `false` for existing installs); expose checkbox in settings page.  
**Test**: With valid cert + `sslverify: true`, connection works. With self-signed + `sslverify: false`, connection works. With self-signed + `sslverify: true`, meaningful TLS error returned.  
**Status**: 🔴 Open — tracked as TODO-001  
**File**: `library/apiclient.js`, `settings/index.html`

---

## FIX-007 — WebSocket reconnect uses fixed 5 s interval (no backoff)

**Root cause**: Simple implementation for initial release; never revisited.  
**Fix**: Replace `_reconnect()` with exponential backoff + jitter (spec in rate-limits-and-events.md).  
**Test**: Unit test verifies wait times: attempt 0 = ~2 s, attempt 1 = ~4 s, attempt 3 = ~16 s, capped at 300 s.  
**Status**: 🔴 Open — tracked as TODO-002  
**File**: `library/websocket.js`

---

## FIX-008 — No ESLint or Prettier configuration

**Root cause**: Tooling was never set up.  
**Fix**: Add `.eslintrc.cjs`, `.prettierrc`, `lint` and `format` scripts.  
**Test**: `npm run lint` exits 0 after FIX-003 and FIX-004 are applied.  
**Status**: 🟡 Partially fixed (config specified in specs/quality/lint-format.md) — implementation tracked as TODO-005  
**File**: `.eslintrc.cjs` (new), `.prettierrc` (new), `package.json`

---

## FIX-009 — `settings/index.html` says "UniFi Protect" in instruction text

**Root cause**: Copy-paste from a related app (UniFi Protect).  
**Fix**: Change "Please read first the instructions and create a separate user for UniFi Protect" to "Please read first the instructions and create a dedicated local admin user for UniFi Network."  
**Test**: Settings page shows correct product name.  
**Status**: ✅ Fixed (this session)  
**File**: `settings/index.html`

---

## FIX-010 — `homey.api.realtime(debugMessage)` called without event name argument

**Root cause**: `debug()` method in `app.js` calls `this.homey.api.realtime(debugMessage)` with a single argument. The SDK v3 signature is `realtime(event, data)`.  
**Fix**: Change to `this.homey.api.realtime(UnifiConstants.REALTIME_DEBUG, debugMessage)`.  
**Test**: Debug messages appear correctly in settings page event log.  
**Status**: ✅ Fixed (this session)  
**File**: `app.js`

