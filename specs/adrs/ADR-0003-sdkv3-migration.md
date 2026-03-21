# ADR-0003 — SDK v3 Migration Scope and Remaining Gaps

- **Status**: Accepted
- **Date**: 2026-03-21
- **Deciders**: Stèphan Eizinga, Sonnet 4.6
- **Tags**: sdk, migration, quality

---

## Context and Problem Statement

The app was migrated from SDK v2 to SDK v3 (changelog entry `2.3.0`).  
The core structure is correct, but several technical debts remain from the migration that need to be resolved before the app can be considered fully SDK-v3 production-ready.

---

## Decision Drivers

- Homey App Store requires `"sdk": 3` with zero blocking validation errors.
- Node 22 is the Homey runtime baseline for new apps; `tsconfig.json` still targets Node 12.
- `package.json` version (`2.3.6`) does not match `app.json` version (`2.5.5`) — breaks tooling.
- The `gcManual()` function uses V8 internals (`setFlagsFromString`, `runInNewContext`) which are fragile across Node versions and trigger lint errors.
- `node-unifi` is installed from `github:jens-maus/node-unifi#master` — unpinned, reproducibility risk.
- `sslverify: false` is hardcoded in `apiclient.js`, which is a security issue for users who *can* verify TLS.

---

## Considered Options

1. **Fix in-place** — patch each gap as a focused change, keep CJS
2. **Full ESM migration** — fix everything in one big rewrite
3. **Defer all fixes** — ship as-is, accept the debt

---

## Decision Outcome

**Chosen option: Option 1 — Fix in-place**, keeping CJS (aligned with ADR-0002).  
Each gap is tracked as an individual TODO item so it can be reviewed and merged independently.

### Gaps to Close (in priority order)

| # | Gap | Fix | Priority |
|---|---|---|---|
| G-1 | `package.json` version `2.3.6` ≠ `app.json` `2.5.5` | Set `package.json` version to `2.5.5` | High |
| G-2 | `tsconfig.json` extends `@tsconfig/node12` | Replace with `@tsconfig/node22`; add `@tsconfig/node22` devDep | High |
| G-3 | `gcManual()` uses `v8` / `vm` Node.js internals | Remove the function; Homey manages memory; call `this.homey.gc()` if needed (SDK v3 offers no public GC hook — simply remove) | High |
| G-4 | `node-unifi` pinned to `github:#master` | Pin to latest tagged release (`npm:node-unifi@^2.5.1`) | Medium |
| G-5 | `sslverify: false` hardcoded | Read from settings; default `true` for new installs; migration shim preserves `false` for existing | Medium |
| G-6 | Dead code in `api.js` (unreachable `return` after try/catch) | Remove unreachable return | Low |
| G-7 | No ESLint or Prettier config | Add to devDeps; add `.eslintrc.cjs` and `.prettierrc` | Medium |
| G-8 | No test suite | Add Jest; first test covers `library/apiclient.js` | Medium |

### Positive Consequences

- Homey validation passes cleanly at `--level=publish`.
- Reproducible builds (`node-unifi` pinned).
- Node 22 type checking works correctly.
- V8 internals removed — no crash on future Node upgrades.

### Negative Consequences / Trade-offs

- `sslverify` default change (G-5) may break existing installs with self-signed certs if migration shim is missing — must be handled carefully.

---

## Migration Steps Detail

### G-1 — version sync
```json
// package.json
"version": "2.5.5"
```

### G-2 — tsconfig upgrade
```bash
npm install --save-dev @tsconfig/node22
```
```jsonc
// tsconfig.json
{ "extends": "@tsconfig/node22/tsconfig.json" }
```

### G-3 — remove gcManual()
Delete the `gcManual()` method and all call sites in `app.js`.  
Remove `const {setFlagsFromString} = require('v8')` and `const {runInNewContext} = require('vm')` imports.

### G-4 — pin node-unifi
```json
// package.json dependencies
"node-unifi": "^2.5.1"
```
```bash
npm install node-unifi@^2.5.1
```

### G-5 — sslverify from settings
Read `settings.sslverify` (boolean, default `true`) in `apiclient.js`:
```js
const sslverify = typeof settings.sslverify !== 'undefined' ? settings.sslverify : true;
this.unifi = new Unifi.Controller({ host, port, sslverify, site });
```
Add the field to `settings/index.html` and `locales/en.json`.

### G-6 — dead code in api.js
Remove the second unreachable `return { status: 'failure' }` block after the closing brace of the `try/catch`.

---

## Links

- [Homey Apps SDK v3 upgrade guide](https://apps.developer.homey.app/the-basics/app/sdk-v3-migration)
- [node-unifi releases](https://github.com/jens-maus/node-unifi/releases)
- [`@tsconfig/node22`](https://www.npmjs.com/package/@tsconfig/node22)

