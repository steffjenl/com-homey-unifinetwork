# SDK v3 Migration Plan

> Created-by: Sonnet 4.6 | 2026-03-21  
> See also: [ADR-0003](../adrs/ADR-0003-sdkv3-migration.md)

---

## Status

The app was **migrated to SDK v3 in version 2.3.0** (changelog entry).  
Core structure is correct and the app runs on Homey Pro with SDK v3.  
This document tracks the **remaining gaps** that need to be resolved.

---

## Already Done ✅

| Item | Evidence |
|---|---|
| `"sdk": 3` in `app.json` and `.homeycompose/app.json` | Verified |
| `Homey.App` / `Homey.Driver` / `Homey.Device` class hierarchy | `app.js`, `drivers/*/driver.js`, `drivers/*/device.js` |
| `this.homey.*` manager usage (no legacy `Homey.ManagerXxx`) | All source files |
| Homey Compose plugin active (`/.homeyplugins.json`) | `[{"id":"compose"}]` |
| Flow cards in `.homeycompose/flow/` | triggers, conditions, actions folders exist |
| Custom capabilities in `.homeycompose/capabilities/` | 15 capability files |
| `homey.settings` for secure storage | `library/apiclient.js`, `app.js` |
| `homey.setInterval` / `homey.clearInterval` | `app.js` — not native `setInterval` |
| `homey.setTimeout` | `drivers/*/device.js` |

---

## Remaining Gaps

### Gap G-1 — version mismatch (HIGH)

**Problem**: `package.json` version is `2.3.6`; `app.json` (and `.homeycompose/app.json`) version is `2.5.5`.  
`homey app validate` reads `package.json` for the version; mismatch causes confusing tooling output.

**Fix**:
```jsonc
// package.json
{
  "version": "2.5.5"
}
```

**Test**: `node -e "const p=require('./package.json');const a=require('./app.json');console.assert(p.version===a.version,'version mismatch')"` must pass.

---

### Gap G-2 — tsconfig targets Node 12 (HIGH)

**Problem**: `tsconfig.json` extends `@tsconfig/node12` but `@types/node ^22.9.0` is installed.  
This causes TypeScript to flag modern Node 22 APIs as unknown.

**Fix**:
```bash
npm install --save-dev @tsconfig/node22
```
```jsonc
// tsconfig.json
{
  "extends": "@tsconfig/node22/tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "outDir": ".homeybuild/"
  }
}
```

**Remove**: `@tsconfig/node12` from devDependencies.

**Test**: `npx tsc --noEmit` produces zero errors.

---

### Gap G-3 — V8 GC hack (HIGH)

**Problem**: `gcManual()` in `app.js` uses Node.js V8 internals:
```js
const {setFlagsFromString} = require('v8');
const {runInNewContext} = require('vm');
// ...
gcManual() {
  setFlagsFromString('--expose_gc');
  const gc = runInNewContext('gc');
  gc();
}
```
This is fragile, can crash on Node 22, and triggers lint `no-restricted-modules` rules.  
Homey manages memory at the platform level; apps should not call GC manually.

**Fix**: Remove `gcManual()`, remove its call site in `checkDevicesState()`, remove both `require()` imports.

**Test**: App starts without error; `checkDevicesState()` completes without calling `gcManual`.

---

### Gap G-4 — node-unifi pinned to git master (MEDIUM)

**Problem**: `package.json` contains:
```json
"node-unifi": "github:jens-maus/node-unifi#master"
```
This is not reproducible. `npm install` on CI can get a different commit than locally.

**Fix**:
```bash
npm install node-unifi@^2.5.1
```
Latest tagged release is `2.5.1` (verified in `.ai/repo-node-unifi/package.json`).

**Test**: `npm ls node-unifi` shows a pinned semver version.

---

### Gap G-5 — sslverify hardcoded to false (MEDIUM)

**Problem**: `library/apiclient.js` hardcodes `sslverify: false` for both the REST client and WebSocket.  
Users with valid TLS certificates are silently insecure.

**Fix**:
1. Add `sslverify` checkbox to `settings/index.html` (default checked = `true` for new installs).
2. Migration shim: if `settings.sslverify` is `undefined`, default to `false` to preserve existing behaviour.
3. Read in `apiclient.js`:
```js
const sslverify = settings.sslverify ?? false; // false = legacy compat default
this.unifi = new Unifi.Controller({ host, port, sslverify, site });
```
4. Pass `sslverify` to `WebsocketClient` options.

**Test**: With `sslverify: true` and a self-signed cert, connection fails with a meaningful error; with `sslverify: false` it connects.

---

### Gap G-6 — dead code in api.js (LOW)

**Problem**: `api.js` `testCredentials()` has an unreachable `return { status: 'failure' }` after the `try/catch` closing brace. This will never execute and confuses static analysis.

**Fix**: Delete the unreachable block (the 4 lines after the closing `}` of `try/catch`).

**Test**: ESLint `no-unreachable` rule catches this; after fix, no lint error.

---

### Gap G-7 — no ESLint / Prettier (MEDIUM)

**Problem**: No `.eslintrc.*`, no Prettier config, no lint script in `package.json`.  
Code style is inconsistent; AI tools cannot auto-fix.

**Fix**: See [`specs/quality/lint-format.md`](../quality/lint-format.md).

---

### Gap G-8 — no test suite (MEDIUM)

**Problem**: No Jest/Vitest/Mocha setup; no tests exist.

**Fix**: See [`specs/testing/test-plan.md`](../testing/test-plan.md).

---

## Validation Command

After all gaps are closed, run:

```bash
homey app validate --level=publish
```

Expected output: `✓ App is valid` with zero blocking errors.  
Output is logged to `specs/diagnostics/validate-<timestamp>.log`.

---

## Homey Compose — Already Active

Homey Compose is already in use (`.homeyplugins.json`, `.homeycompose/`).  
The generated `app.json` in the project root is regenerated by `homey app build`.  
**Do not edit `app.json` directly** — edit `.homeycompose/app.json` and driver `driver.compose.json` files instead.

---

## Node 22 Compatibility Notes

| Feature | Node 22 | Action |
|---|---|---|
| `fetch` global | ✅ Native | Use `fetch` instead of `axios` in new code (optional) |
| `WebSocket` global | ✅ Native (v22.4+) | Can replace `ws` package in future |
| `timers/promises` | ✅ | Available for `setInterval` async patterns |
| `v8.setFlagsFromString` | ✅ (but dangerous) | **Removed** per Gap G-3 |
| `vm.runInNewContext` | ✅ | **Removed** per Gap G-3 |
| Top-level `await` | ❌ (CJS) | Not needed; use async IIFE |

