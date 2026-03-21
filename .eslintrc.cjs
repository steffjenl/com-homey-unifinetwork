'use strict';

module.exports = {
    env: {
        node: true,
        es2022: true,
    },
    extends: [
        'eslint:recommended',
    ],
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'script',
    },
    rules: {
        // Disallow V8 / VM internals (prevents gcManual() pattern from re-appearing)
        'no-restricted-modules': ['error', { name: 'v8', message: 'Do not use V8 internals. Homey manages memory.' }, { name: 'vm', message: 'Do not use vm module in app code.' }],

        // Warn on console.log — use this.homey.log / this.homey.error instead
        'no-console': 'warn',

        // Disallow unreachable code (catches dead return in api.js pattern)
        'no-unreachable': 'error',

        // Require === instead of ==
        'eqeqeq': ['error', 'always'],

        // Allow async functions without await (Homey lifecycle methods are often async without await)
        'require-await': 'off',

        // Prefer const
        'prefer-const': 'warn',

        // No unused variables (warn — some lifecycle args are required by SDK)
        'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }],
    },
    ignorePatterns: [
        '.homeybuild/',
        'node_modules/',
        'specs/',
        'docs/',
        'app.json',
    ],
};

