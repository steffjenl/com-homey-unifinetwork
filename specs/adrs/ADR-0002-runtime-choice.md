# ADR-0002 — Node.js / CommonJS as App Runtime

- **Status**: Accepted
- **Date**: 2026-03-21
- **Deciders**: Stèphan Eizinga, Sonnet 4.6
- **Tags**: runtime, language

---

## Context and Problem Statement

Homey Apps SDK v3 supports both Node.js (JavaScript/TypeScript) and Python runtimes.  
This app has an existing JavaScript codebase. A decision is needed on whether to stay with Node.js, migrate to Python, and whether to use CommonJS (CJS) or ES Modules (ESM) within Node.js.

---

## Decision Drivers

- Existing codebase is 100% JavaScript (CommonJS, `'use strict'` + `require()`).
- `node-unifi` — the primary UniFi controller client library — is JavaScript/CJS, already vendored in `.ai/repo-node-unifi/`.
- The Homey developer community's most-used reference apps and SDK samples are Node.js.
- `homey-log`, `ws`, `tough-cookie` are all Node.js libraries already in `package.json`.
- No Python-specific UniFi libraries are required; `aiounifi` (Python) would need a full rewrite.
- ESM migration is possible but requires changing every `require()` to `import`, including all of `node-unifi`'s transitive dependencies — high churn, low benefit right now.

---

## Considered Options

1. **Node.js / CJS** — keep current stack, fix issues in-place
2. **Node.js / ESM** — migrate to `"type": "module"`, async `import()`
3. **Python** — rewrite using Homey Python SDK v3 + `aiounifi`

---

## Decision Outcome

**Chosen option: Option 1 — Node.js / CJS**, because the entire codebase and its dependency tree is already CJS, migration cost to ESM is high with no immediate benefit, and Python would require a full rewrite.

ESM migration is deferred and tracked as a future option in the TODO backlog (low priority).

### Positive Consequences

- Zero breaking changes to existing install base.
- `node-unifi` works out of the box.
- All Homey SDK examples are directly usable as reference.
- CI validation passes without module-system changes.

### Negative Consequences / Trade-offs

- CJS does not support top-level `await` (not needed here).
- Future ESM-only libraries cannot be `require()`d without a dynamic `import()` wrapper.
- `@tsconfig/node12` must be updated to `@tsconfig/node22` separately (tracked TODO-006).

---

## Pros and Cons of the Options

### Option 1 — Node.js / CJS

- ✅ Zero migration effort
- ✅ `node-unifi` fully compatible
- ✅ Homey community sample parity
- ❌ No top-level `await`
- ❌ ESM-only future libs require wrappers

### Option 2 — Node.js / ESM

- ✅ Modern JS standard
- ✅ Top-level `await`
- ❌ Every `require()` must be changed — large diff
- ❌ `node-unifi` is CJS; needs dynamic import or fork
- ❌ Risk of subtle circular-dependency bugs during migration

### Option 3 — Python

- ✅ `aiounifi` is mature, async, well-tested
- ❌ Full rewrite (~800 lines of app logic)
- ❌ Homey Python SDK v3 has fewer community examples
- ❌ Existing `node-unifi` investment wasted

---

## Links

- [Homey Apps SDK v3 — Node.js](https://apps-sdk-v3.developer.homey.app/)
- [Homey Apps SDK v3 — Python](https://python-apps-sdk-v3.developer.homey.app/)
- [node-unifi](https://github.com/jens-maus/node-unifi)

