'use strict';

/**
 * Centralized error handling utilities for API and network errors
 */

function getStatus(error) {
    return error && error.response && typeof error.response.status === 'number' ? error.response.status : null;
}

/**
 * Check if error is a 401 Unauthorized error
 * @param {Error} error
 * @returns {boolean}
 */
function is401Error(error) {
    if (getStatus(error) === 401) {
        return true;
    }
    if (error.message && error.message.includes('401')) {
        return true;
    }
    return false;
}

/**
 * Check if error is a 403 Forbidden error
 * @param {Error} error
 * @returns {boolean}
 */
function isForbiddenError(error) {
    if (getStatus(error) === 403) {
        return true;
    }
    if (error.message && error.message.includes('403')) {
        return true;
    }
    return false;
}

/**
 * Check if error is a 405 Method Not Allowed error
 * @param {Error} error
 * @returns {boolean}
 */
function isMethodNotAllowedError(error) {
    if (getStatus(error) === 405) {
        return true;
    }
    if (error.message && error.message.includes('405')) {
        return true;
    }
    return false;
}

/**
 * Check if error is a 429 Too Many Requests error
 * @param {Error} error
 * @returns {boolean}
 */
function isRateLimitError(error) {
    if (getStatus(error) === 429) {
        return true;
    }
    if (error.message && error.message.includes('429')) {
        return true;
    }
    return false;
}

/**
 * Check if error is a 502/503/504 (upstream/controller temporarily unavailable) error
 * @param {Error} error
 * @returns {boolean}
 */
function isBadGatewayError(error) {
    const status = getStatus(error);
    if (status === 502 || status === 503 || status === 504) {
        return true;
    }
    if (error.message && (error.message.includes('502') || error.message.includes('503') || error.message.includes('504'))) {
        return true;
    }
    return false;
}

/**
 * Check if error is a connection-refused error (controller unreachable)
 * @param {Error} error
 * @returns {boolean}
 */
function isConnRefusedError(error) {
    if (error.code === 'ECONNREFUSED') {
        return true;
    }
    if (error.message && error.message.includes('ECONNREFUSED')) {
        return true;
    }
    return false;
}

/**
 * Check if error is an aborted/reset connection error
 * @param {Error} error
 * @returns {boolean}
 */
function isAbortedError(error) {
    if (error.code === 'ECONNRESET') {
        return true;
    }
    if (error.message === 'aborted') {
        return true;
    }
    return false;
}

/**
 * Check if error is a timeout error
 * @param {Error} error
 * @returns {boolean}
 */
function isTimeoutError(error) {
    if (error.code === 'ECONNABORTED') {
        return true;
    }
    if (error.message && error.message.includes('timeout')) {
        return true;
    }
    if (error.message && error.message.includes('exceeded')) {
        return true;
    }
    return false;
}

/**
 * Fallback English messages, used when no `homey` instance is available for translation.
 */
const FALLBACK_MESSAGES = {
    unauthorized: 'Unauthorized: Check your UniFi credentials in the app settings',
    forbidden: 'Access denied: this UniFi user does not have permission for this action. Check the user\'s role in the controller',
    methodNotAllowed: 'The UniFi controller rejected this request. This may indicate an unsupported controller version or firmware',
    rateLimited: 'Too many requests: the UniFi controller is rate-limiting this connection. If multiple integrations (e.g. Homey and Home Assistant) use the same controller user, create a separate local user for each integration',
    badGateway: 'The UniFi controller is temporarily unavailable. It may be restarting or overloaded — this usually resolves on its own',
    connectionRefused: 'Cannot connect to the UniFi controller: connection refused. Check the IP address/port in the app settings and make sure the controller is powered on and reachable',
    aborted: 'The connection to the UniFi controller was unexpectedly interrupted. This is usually temporary — check your network connection',
    timeout: 'Connection timeout: Check if your UniFi controller is reachable',
    generic: 'An unexpected error occurred',
};

/**
 * Extract a user-friendly, translated error message from an error object
 * @param {Error} error
 * @param {object} [homey] Homey app/device instance, used to translate the message via homey.__()
 * @returns {string}
 */
function getUserFriendlyMessage(error, homey) {
    const translate = (key) => (homey && typeof homey.__ === 'function' ? homey.__(`errors.api.${key}`) : FALLBACK_MESSAGES[key]);

    if (is401Error(error)) {
        return translate('unauthorized');
    }
    if (isRateLimitError(error)) {
        return translate('rateLimited');
    }
    if (isForbiddenError(error)) {
        return translate('forbidden');
    }
    if (isMethodNotAllowedError(error)) {
        return translate('methodNotAllowed');
    }
    if (isBadGatewayError(error)) {
        return translate('badGateway');
    }
    if (isConnRefusedError(error)) {
        return translate('connectionRefused');
    }
    if (isAbortedError(error)) {
        return translate('aborted');
    }
    if (isTimeoutError(error)) {
        return translate('timeout');
    }
    if (error.message) {
        return error.message;
    }
    return homey && typeof homey.__ === 'function' ? homey.__('errors.api.generic') : FALLBACK_MESSAGES.generic || 'An unexpected error occurred';
}

/**
 * Short status label for the settings-page status field (status.connection.<label>)
 * @param {Error} error
 * @returns {string}
 */
function getStatusLabel(error) {
    if (is401Error(error)) return 'Unauthorized';
    if (isRateLimitError(error)) return 'RateLimited';
    if (isForbiddenError(error)) return 'Forbidden';
    if (isMethodNotAllowedError(error)) return 'MethodNotAllowed';
    if (isBadGatewayError(error)) return 'BadGateway';
    if (isConnRefusedError(error)) return 'ConnectionRefused';
    if (isAbortedError(error)) return 'Aborted';
    if (isTimeoutError(error)) return 'Timeout';
    return 'Error';
}

/**
 * Create a standardized error object for handling
 * @param {Error} error
 * @param {object} [homey] Homey app/device instance, used to translate the message via homey.__()
 * @returns {object}
 */
function parseError(error, homey) {
    return {
        isAuthError: is401Error(error),
        isForbidden: isForbiddenError(error),
        isMethodNotAllowed: isMethodNotAllowedError(error),
        isRateLimited: isRateLimitError(error),
        isBadGateway: isBadGatewayError(error),
        isConnRefused: isConnRefusedError(error),
        isAborted: isAbortedError(error),
        isTimeout: isTimeoutError(error),
        message: getUserFriendlyMessage(error, homey),
        statusLabel: getStatusLabel(error),
        originalError: error,
    };
}

module.exports = {
    is401Error,
    isForbiddenError,
    isMethodNotAllowedError,
    isRateLimitError,
    isBadGatewayError,
    isConnRefusedError,
    isAbortedError,
    isTimeoutError,
    getUserFriendlyMessage,
    getStatusLabel,
    parseError,
};
