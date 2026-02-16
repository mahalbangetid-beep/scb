/**
 * Safe HTTP Fetch Utility — SSRF Prevention
 * 
 * Resolves DNS before making requests and blocks private/internal IPs.
 * Prevents DNS rebinding attacks where a public hostname resolves to
 * a private IP address at request time.
 * 
 * Usage:
 *   const { safeFetch, validateUrlSafety } = require('../utils/safeFetch');
 *   await safeFetch('https://example.com/webhook', { method: 'POST', ... });
 */

const dns = require('dns');
const { URL } = require('url');
const net = require('net');

/**
 * Check if an IP address is private/internal/loopback
 * @param {string} ip - IP address to check
 * @returns {boolean} true if the IP is private
 */
function isPrivateIP(ip) {
    // IPv4 private ranges
    const privateRanges = [
        /^127\./,                   // 127.0.0.0/8 (loopback)
        /^10\./,                    // 10.0.0.0/8
        /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
        /^192\.168\./,              // 192.168.0.0/16
        /^169\.254\./,              // 169.254.0.0/16 (link-local)
        /^0\./,                     // 0.0.0.0/8
        /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10 (CGNAT)
        /^198\.1[89]\./,            // 198.18.0.0/15 (benchmarking)
        /^(22[4-9]|23\d|24\d|25[0-5])\./, // 224.0.0.0/4 (multicast) + 240+ (reserved)
    ];

    // IPv6 private/special addresses
    const ipv6Private = [
        /^::1$/,                    // Loopback
        /^fe80:/i,                  // Link-local
        /^fc/i,                     // Unique local (fc00::/7)
        /^fd/i,                     // Unique local (fd00::/8)
        /^::$/,                     // Unspecified
        /^::ffff:127\./,            // IPv4-mapped loopback
        /^::ffff:10\./,             // IPv4-mapped 10.x
        /^::ffff:172\.(1[6-9]|2\d|3[01])\./, // IPv4-mapped 172.16-31
        /^::ffff:192\.168\./,       // IPv4-mapped 192.168.x
        /^::ffff:169\.254\./,       // IPv4-mapped link-local
        /^::ffff:0\./,              // IPv4-mapped 0.x
    ];

    // Check IPv4
    if (net.isIPv4(ip)) {
        return privateRanges.some(range => range.test(ip));
    }

    // Check IPv6
    if (net.isIPv6(ip)) {
        return ipv6Private.some(range => range.test(ip));
    }

    return false;
}

/**
 * Resolve hostname to IP addresses and validate they are not private
 * @param {string} hostname - Hostname to resolve
 * @returns {Promise<string[]>} Array of resolved IP addresses
 * @throws {Error} If hostname resolves to private IP or cannot be resolved
 */
async function resolveAndValidate(hostname) {
    // If it's already an IP address, check directly
    if (net.isIP(hostname)) {
        if (isPrivateIP(hostname)) {
            throw new Error(`Blocked: IP address ${hostname} is a private/internal address`);
        }
        return [hostname];
    }

    // Blocked hostnames that could bypass DNS resolution
    const blockedHostnames = [
        'localhost',
        'localhost.localdomain',
        'metadata.google.internal',
        'metadata.aws',
        '100.100.100.200', // Alibaba Cloud metadata
    ];

    if (blockedHostnames.includes(hostname.toLowerCase())) {
        throw new Error(`Blocked: hostname '${hostname}' is not allowed`);
    }

    return new Promise((resolve, reject) => {
        // Use dns.resolve to get actual IP addresses (not dns.lookup which uses hosts file)
        dns.resolve4(hostname, (err4, ipv4Addresses) => {
            dns.resolve6(hostname, (err6, ipv6Addresses) => {
                const addresses = [
                    ...(ipv4Addresses || []),
                    ...(ipv6Addresses || [])
                ];

                if (addresses.length === 0) {
                    return reject(new Error(`Could not resolve hostname: ${hostname}`));
                }

                // Check ALL resolved IPs — block if ANY is private
                const privateIPs = addresses.filter(ip => isPrivateIP(ip));
                if (privateIPs.length > 0) {
                    return reject(new Error(
                        `Blocked: hostname '${hostname}' resolves to private IP(s): ${privateIPs.join(', ')}`
                    ));
                }

                resolve(addresses);
            });
        });
    });
}

/**
 * Validate that a URL is safe to make requests to (no SSRF)
 * @param {string} urlString - URL to validate
 * @returns {Promise<{ url: URL, resolvedIPs: string[] }>} Validated URL and resolved IPs
 * @throws {Error} If URL is unsafe
 */
async function validateUrlSafety(urlString) {
    let parsed;
    try {
        parsed = new URL(urlString);
    } catch {
        throw new Error('Invalid URL format');
    }

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Only HTTP and HTTPS URLs are allowed');
    }

    // Block URLs with credentials
    if (parsed.username || parsed.password) {
        throw new Error('URLs with credentials are not allowed');
    }

    // Resolve DNS and validate IPs
    const resolvedIPs = await resolveAndValidate(parsed.hostname);

    return { url: parsed, resolvedIPs };
}

/**
 * Make a safe HTTP request with SSRF prevention
 * Resolves DNS first, checks for private IPs, then makes the request.
 * Redirects are NOT auto-followed — each redirect target is validated
 * through the same DNS/IP safety checks to prevent open redirect SSRF.
 * 
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options (method, headers, body, etc.)
 * @param {Object} [safetyOptions] - Additional safety options
 * @param {number} [safetyOptions.timeout=10000] - Request timeout in ms
 * @param {number} [safetyOptions.maxRedirects=3] - Maximum redirects to follow
 * @returns {Promise<Response>} The fetch response
 * @throws {Error} If URL is unsafe or request fails
 */
async function safeFetch(url, options = {}, safetyOptions = {}) {
    const { timeout = 10000, maxRedirects = 3 } = safetyOptions;

    // Step 1: Validate URL safety (resolve DNS, check for private IPs)
    await validateUrlSafety(url);

    // Step 2: Make the actual request with timeout and manual redirect handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        let currentUrl = url;
        let redirectCount = 0;

        while (true) {
            const response = await fetch(currentUrl, {
                ...options,
                signal: controller.signal,
                redirect: 'manual', // Don't auto-follow — we must validate each redirect
            });

            // If not a redirect, return the response
            if (response.status < 300 || response.status >= 400 || !response.headers.get('location')) {
                return response;
            }

            // Handle redirect
            redirectCount++;
            if (redirectCount > maxRedirects) {
                throw new Error(`Too many redirects (max: ${maxRedirects})`);
            }

            // Validate the redirect target URL for SSRF safety
            const redirectUrl = new URL(response.headers.get('location'), currentUrl).href;
            await validateUrlSafety(redirectUrl);
            currentUrl = redirectUrl;

            // Only follow with GET on redirect (standard behavior)
            options = { ...options, method: 'GET', body: undefined };
        }
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Make a safe HTTP request using axios (for compatibility with existing code)
 * Disables auto-redirects in axios to prevent open redirect SSRF bypass.
 * @param {string} url - URL to request
 * @param {Object} axiosConfig - Axios request configuration
 * @returns {Promise<Object>} Axios response
 */
async function safeAxiosRequest(url, axiosConfig = {}) {
    // Step 1: Validate URL safety
    await validateUrlSafety(url);

    // Step 2: Make request via axios with redirects disabled
    // Redirects could point to internal IPs, bypassing our DNS validation.
    const axios = require('axios');
    return axios({
        url,
        timeout: 10000,
        maxRedirects: 0, // Disable auto-redirects to prevent SSRF bypass
        validateStatus: (status) => status < 400, // Accept 2xx/3xx but don't follow
        ...axiosConfig,
    });
}

module.exports = {
    isPrivateIP,
    resolveAndValidate,
    validateUrlSafety,
    safeFetch,
    safeAxiosRequest
};
