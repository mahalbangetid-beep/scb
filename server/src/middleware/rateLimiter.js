/**
 * Rate Limiter Middleware
 * Implements per-user and per-IP rate limiting with Redis-compatible in-memory store
 */

// In-memory store for rate limiting (use Redis in production)
const rateLimitStore = new Map();

// Cleanup old entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
        if (now - data.windowStart > data.windowMs * 2) {
            rateLimitStore.delete(key);
        }
    }
}, 5 * 60 * 1000);

/**
 * Creates a rate limiter middleware
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum requests per window
 * @param {string} options.keyGenerator - 'ip', 'user', or 'combined'
 * @param {string} options.message - Error message when rate limited
 * @param {boolean} options.skipSuccessfulRequests - Don't count successful requests
 * @param {Function} options.skip - Function to skip rate limiting for certain requests
 */
function createRateLimiter(options = {}) {
    const {
        windowMs = 60 * 1000, // 1 minute default
        max = 100, // 100 requests per window default
        keyGenerator = 'ip',
        message = 'Too many requests, please try again later.',
        skipSuccessfulRequests = false,
        skip = null,
        handler = null
    } = options;

    return (req, res, next) => {
        // Skip if skip function returns true
        if (skip && skip(req)) {
            return next();
        }

        // Generate key based on strategy
        let key;
        switch (keyGenerator) {
            case 'user':
                key = req.user?.id ? `user:${req.user.id}` : `ip:${getClientIP(req)}`;
                break;
            case 'combined':
                const userId = req.user?.id || 'anonymous';
                key = `combined:${userId}:${getClientIP(req)}`;
                break;
            case 'ip':
            default:
                key = `ip:${getClientIP(req)}`;
        }

        // Add route-specific key suffix
        const routeKey = `${key}:${req.method}:${req.baseUrl}${req.path}`;

        const now = Date.now();
        let record = rateLimitStore.get(routeKey);

        if (!record || now - record.windowStart > windowMs) {
            // New window
            record = {
                count: 0,
                windowStart: now,
                windowMs
            };
        }

        record.count++;
        rateLimitStore.set(routeKey, record);

        // Set rate limit headers
        const remaining = Math.max(0, max - record.count);
        const resetTime = Math.ceil((record.windowStart + windowMs - now) / 1000);

        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', resetTime);

        if (record.count > max) {
            res.setHeader('Retry-After', resetTime);

            if (handler) {
                return handler(req, res, next);
            }

            return res.status(429).json({
                success: false,
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message,
                    retryAfter: resetTime
                }
            });
        }

        // If skipSuccessfulRequests is true, decrement count on successful response
        if (skipSuccessfulRequests) {
            const originalSend = res.send;
            res.send = function (body) {
                if (res.statusCode < 400) {
                    record.count = Math.max(0, record.count - 1);
                    rateLimitStore.set(routeKey, record);
                }
                return originalSend.call(this, body);
            };
        }

        next();
    };
}

/**
 * Get client IP address from request
 */
function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
        req.headers['x-real-ip'] ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        req.ip ||
        'unknown';
}

// Pre-configured rate limiters for different use cases

// Strict rate limiter for auth endpoints (prevent brute force)
const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per 15 minutes
    message: 'Too many login attempts, please try again after 15 minutes.',
    keyGenerator: 'ip'
});

// Standard API rate limiter
const apiLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'API rate limit exceeded. Please slow down your requests.',
    keyGenerator: 'user'
});

// Strict limiter for sensitive operations (payments, settings)
const sensitiveLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute
    message: 'Too many requests for this operation.',
    keyGenerator: 'user'
});

// Webhook/external API limiter (more lenient)
const webhookLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 200, // 200 requests per minute
    message: 'Webhook rate limit exceeded.',
    keyGenerator: 'ip'
});

// Message sending limiter
const messageLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 messages per minute
    message: 'Message sending rate limit exceeded. Please wait before sending more messages.',
    keyGenerator: 'user'
});

// Bulk operations limiter
const bulkLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 bulk operations per minute
    message: 'Too many bulk operations. Please wait before trying again.',
    keyGenerator: 'user'
});

module.exports = {
    createRateLimiter,
    authLimiter,
    apiLimiter,
    sensitiveLimiter,
    webhookLimiter,
    messageLimiter,
    bulkLimiter,
    getClientIP
};
