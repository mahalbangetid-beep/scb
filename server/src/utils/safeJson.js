/**
 * Safe JSON Utilities
 * 
 * Safe JSON parsing and stringifying with error handling
 * Prevents crashes from malformed JSON
 */

/**
 * Safely parse JSON string
 * @param {string} str - JSON string to parse
 * @param {*} fallback - Fallback value if parsing fails (default: null)
 * @returns {*} Parsed value or fallback
 */
function safeJsonParse(str, fallback = null) {
    if (str === null || str === undefined) {
        return fallback;
    }

    if (typeof str !== 'string') {
        return str; // Already an object
    }

    try {
        return JSON.parse(str);
    } catch (error) {
        // Only log in development
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[SafeJSON] Parse failed:', error.message, '| Input:', str.substring(0, 100));
        }
        return fallback;
    }
}

/**
 * Safely stringify to JSON
 * @param {*} obj - Object to stringify
 * @param {string} fallback - Fallback value if stringify fails (default: '{}')
 * @returns {string} JSON string or fallback
 */
function safeJsonStringify(obj, fallback = '{}') {
    if (obj === null || obj === undefined) {
        return fallback;
    }

    if (typeof obj === 'string') {
        return obj; // Already a string
    }

    try {
        return JSON.stringify(obj);
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[SafeJSON] Stringify failed:', error.message);
        }
        return fallback;
    }
}

/**
 * Parse JSON array safely
 * @param {string} str - JSON array string
 * @returns {Array} Parsed array or empty array
 */
function safeParseArray(str) {
    const result = safeJsonParse(str, []);
    return Array.isArray(result) ? result : [];
}

/**
 * Parse JSON object safely
 * @param {string} str - JSON object string
 * @returns {Object} Parsed object or empty object
 */
function safeParseObject(str) {
    const result = safeJsonParse(str, {});
    return result && typeof result === 'object' && !Array.isArray(result) ? result : {};
}

module.exports = {
    safeJsonParse,
    safeJsonStringify,
    safeParseArray,
    safeParseObject,
    // Aliases
    parse: safeJsonParse,
    stringify: safeJsonStringify
};
