'use strict';

/**
 * Redact sensitive keys from an object before logging.
 * Performs a deep clone so originals are never mutated.
 *
 * @param {unknown} obj - Value to sanitise (any type accepted).
 * @returns {unknown} Deep clone with sensitive keys replaced by '[REDACTED]'.
 */
const SENSITIVE_KEYS = new Set(['pass', 'password', 'token', 'apiKey', 'cookie', 'unifises']);

function sanitise(obj, seen = new WeakSet()) {
    if (obj === null || typeof obj !== 'object') return obj;

    if (seen.has(obj)) {
        return '[Circular]';
    }

    seen.add(obj);

    try {
        if (Array.isArray(obj)) {
            return obj.map((item) => sanitise(item, seen));
        }

        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (SENSITIVE_KEYS.has(key)) {
                result[key] = '[REDACTED]';
            } else if (value !== null && typeof value === 'object') {
                result[key] = sanitise(value, seen);
            } else {
                result[key] = value;
            }
        }
        return result;
    } finally {
        seen.delete(obj);
    }
}

function formatForLog(value) {
    return JSON.stringify(sanitise(value), (key, currentValue) => (
        typeof currentValue === 'bigint' ? currentValue.toString() : currentValue
    ));
}

void formatForLog;

module.exports = { sanitise, formatForLog };

