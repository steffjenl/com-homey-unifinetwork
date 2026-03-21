'use strict';

const js = require('@eslint/js');
const pluginN = require('eslint-plugin-n');
const prettier = require('eslint-config-prettier');

module.exports = [
    js.configs.recommended,
    pluginN.configs['flat/recommended'],
    prettier,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                require: 'readonly',
                module: 'readonly',
                exports: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                process: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
            },
        },
        settings: {
            node: {
                version: '>=22.0.0',
            },
        },
        rules: {
            // Warn on console.log — use this.homey.log / this.homey.error instead
            'no-console': 'warn',

            // Disallow unreachable code
            'no-unreachable': 'error',

            // Require === instead of ==
            eqeqeq: ['error', 'always'],

            // Allow async functions without await (Homey lifecycle methods)
            'require-await': 'off',

            // Prefer const
            'prefer-const': 'warn',

            // No unused variables (warn — some lifecycle args are required by SDK)
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

            // node-specific: allow devDeps in test/specs
            'n/no-unpublished-require': 'off',
            'n/no-missing-require': 'error',

            // Allow process.exit in scripts
            'n/no-process-exit': 'off',

            // Ignore hashbang warnings
            'n/hashbang': 'off',
        },
    },
    // Jest environment for test files
    {
        files: ['test/**/*.js'],
        languageOptions: {
            globals: {
                require: 'readonly',
                module: 'readonly',
                exports: 'readonly',
                jest: 'readonly',
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
            },
        },
        rules: {
            'n/no-missing-require': 'off',
        },
    },
    {
        // Ignore generated / non-app files
        ignores: [
            '.homeybuild/**',
            '.ai/**',
            'node_modules/**',
            'specs/**',
            'docs/**',
            'app.json',
            'eslint.config.js',
        ],
    },
];
