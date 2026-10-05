'use strict';

/**
 * Centralized error handling utilities for API and network errors
 */

/**
 * Check if error is a 401 Unauthorized error
 * @param {Error} error
 * @returns {boolean}
 */
function is401Error(error) {
    if (error.response && error.response.status === 401) {
        return true;
    }
    if (error.message && error.message.includes('401')) {
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
 * Extract a user-friendly error message from an error object
 * @param {Error} error
 * @returns {string}
 */
function getUserFriendlyMessage(error) {
    if (is401Error(error)) {
        return 'Unauthorized: Check your UniFi credentials in the app settings';
    }
    if (isTimeoutError(error)) {
        return 'Connection timeout: Check if your UniFi controller is reachable';
    }
    if (error.message) {
        return error.message;
    }
    return 'An unexpected error occurred';
}

/**
 * Create a standardized error object for handling
 * @param {Error} error
 * @returns {object}
 */
function parseError(error) {
    return {
        isAuthError: is401Error(error),
        isTimeout: isTimeoutError(error),
        message: getUserFriendlyMessage(error),
        originalError: error,
    };
}

module.exports = {
    is401Error,
    isTimeoutError,
    getUserFriendlyMessage,
    parseError,
};

