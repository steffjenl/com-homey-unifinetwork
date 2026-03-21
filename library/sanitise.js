'use strict';

/**
 * Redact sensitive keys from an object before logging.
 * Performs a deep clone so originals are never mutated.
 *
 * @param {unknown} obj - Value to sanitise (any type accepted).
 * @returns {unknown} Deep clone with sensitive keys replaced by '[REDACTED]'.
 */
const SENSITIVE_KEYS = new Set(['pass', 'password', 'token', 'apiKey', 'cookie', 'unifises']);

function sanitise(obj) {
    if (obj === null || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
        return obj.map(sanitise);
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE_KEYS.has(key)) {
            result[key] = '[REDACTED]';
        } else if (value !== null && typeof value === 'object') {
            result[key] = sanitise(value);
        } else {
            result[key] = value;
        }
    }
    return result;
}

module.exports = { sanitise };

