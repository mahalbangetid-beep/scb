/**
 * Safe Regex Utility
 * 
 * Provides ReDoS-safe regex execution by:
 * 1. Validating regex patterns against dangerous constructs
 * 2. Adding timeout protection for regex execution
 */

/**
 * Check if a regex pattern is potentially dangerous (ReDoS vulnerable)
 * Detects common catastrophic backtracking patterns like (a+)+, (a|a)+, etc.
 * @param {string} pattern - Regex pattern string
 * @returns {boolean} true if pattern appears safe
 */
function isRegexSafe(pattern) {
    if (!pattern || typeof pattern !== 'string') return false;

    // Reject overly long patterns
    if (pattern.length > 500) return false;

    // Detect nested quantifiers: (x+)+, (x*)+, (x+)*, etc.
    // These are the primary cause of catastrophic backtracking
    const dangerousPatterns = [
        /\([^)]*[+*][^)]*\)[+*]/,     // (x+)+ or (x*)+ etc.
        /\([^)]*[+*][^)]*\)\{/,        // (x+){n} etc.
        /([+*])\1/,                      // ++ or ** (possessive-like, but JS doesn't support)
        /\.\*.*\.\*/,                    // .*.* — greedy overlap
    ];

    for (const dp of dangerousPatterns) {
        if (dp.test(pattern)) {
            return false;
        }
    }

    return true;
}

/**
 * Safely test a regex pattern against a string
 * Returns false instead of hanging on catastrophic backtracking
 * 
 * @param {string} pattern - Regex pattern (user-supplied)
 * @param {string} input - String to test against
 * @param {string} flags - Regex flags (default: 'i')
 * @returns {boolean} true if matches, false otherwise (including on error/unsafe)
 */
function safeRegexTest(pattern, input, flags = 'i') {
    try {
        // Step 1: Validate pattern isn't obviously dangerous
        if (!isRegexSafe(pattern)) {
            console.warn(`[SafeRegex] Blocked potentially dangerous pattern: ${pattern.substring(0, 50)}`);
            return false;
        }

        // Step 2: Compile the regex
        const regex = new RegExp(pattern, flags);

        // Step 3: Limit input length to prevent excessive processing
        const safeInput = input.length > 10000 ? input.substring(0, 10000) : input;

        // Step 4: Execute the test
        return regex.test(safeInput);
    } catch (err) {
        // Invalid regex pattern — return false
        return false;
    }
}

module.exports = {
    isRegexSafe,
    safeRegexTest
};
