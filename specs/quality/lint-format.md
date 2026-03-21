# Lint and Format Standards

> Created-by: Sonnet 4.6 | 2026-03-21

---

## Current State

| Tool | Status |
|---|---|
| ESLint | ❌ Not installed; no config file |
| Prettier | ❌ Not installed; no config file |
| Pre-commit hooks | ❌ No `.husky/`, no `lint-staged` |
| `npm run lint` script | ❌ Not in `package.json` |

---

## Target State

| Tool | Version | Role |
|---|---|---|
| `eslint` | `^9.x` | Lint JavaScript for errors and style |
| `eslint-plugin-node` | `^11.x` | Node.js-specific rules (module resolution, etc.) |
| `@eslint/js` | latest | Recommended JS rule set |
| `prettier` | `^3.x` | Opinionated formatting |
| `eslint-config-prettier` | `^9.x` | Disable ESLint rules that conflict with Prettier |

---

## Installation

```bash
npm install --save-dev \
  eslint \
  @eslint/js \
  eslint-plugin-n \
  prettier \
  eslint-config-prettier
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "lint":     "eslint .",
    "lint:fix": "eslint . --fix",
    "format":   "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

---

## ESLint Config — `.eslintrc.cjs`

```js
'use strict';

module.exports = {
  env: {
    node: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:n/recommended',
    'prettier',             // must be last — disables conflicting rules
  ],
  plugins: ['n'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'script',  // CJS — not 'module'
  },
  rules: {
    // Disallow V8 / VM internals (targets the gcManual() hack)
    'no-restricted-modules': ['error', 'v8', 'vm'],

    // Warn on console.log (use this.homey.log instead)
    'no-console': 'warn',

    // Disallow unreachable code (catches dead return in api.js)
    'no-unreachable': 'error',

    // Require === instead of ==
    'eqeqeq': ['error', 'always'],

    // Allow async functions without await (some Homey lifecycle methods)
    'require-await': 'off',

    // node-specific
    'n/no-unpublished-require': 'off',  // devDeps used in specs/test
    'n/no-missing-require': 'error',
  },
  ignorePatterns: [
    '.homeybuild/',
    'node_modules/',
    'specs/',
    'docs/',
    'settings/',  // HTML/JS settings page has different style
  ],
};
```

---

## Prettier Config — `.prettierrc`

```json
{
  "singleQuote": true,
  "semi": true,
  "tabWidth": 4,
  "trailingComma": "es5",
  "printWidth": 120,
  "endOfLine": "lf"
}
```

`.prettierignore`:
```
.homeybuild/
node_modules/
app.json
```

---

## Pre-commit Hooks (Optional but Recommended)

```bash
npm install --save-dev husky lint-staged
npx husky init
```

`.husky/pre-commit`:
```sh
npx lint-staged
```

`package.json`:
```json
{
  "lint-staged": {
    "*.js": ["eslint --fix", "prettier --write"],
    "*.json": ["prettier --write"]
  }
}
```

---

## CI Integration

Add to `.github/workflows/homey-validation.yml` after `npm ci`:

```yaml
- name: Lint
  run: npm run lint

- name: Format check
  run: npm run format:check
```

---

## Rules Rationale

| Rule | Why |
|---|---|
| `no-restricted-modules: ['v8','vm']` | Prevents `gcManual()` pattern from re-appearing |
| `no-unreachable` | Catches dead code in `api.js` and future occurrences |
| `n/no-missing-require` | Catches typos in `require()` paths at lint time |
| `eqeqeq` | Homey SDK docs use `===`; avoids subtle type-coercion bugs |
| `no-console` warn | Forces use of `this.homey.log` / `this.homey.error` |

