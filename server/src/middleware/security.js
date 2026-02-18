/**
 * Security Headers & CORS Configuration
 * Enhanced security middleware for the application
 */

/**
 * Security headers middleware
 */
function securityHeaders(options = {}) {
    const {
        contentSecurityPolicy = true,
        frameOptions = 'DENY',
        xssFilter = true,
        noSniff = true,
        hsts = true,
        referrerPolicy = 'strict-origin-when-cross-origin'
    } = options;

    return (req, res, next) => {
        // X-Content-Type-Options - Prevents MIME type sniffing
        if (noSniff) {
            res.setHeader('X-Content-Type-Options', 'nosniff');
        }

        // X-Frame-Options - Prevents clickjacking
        if (frameOptions) {
            res.setHeader('X-Frame-Options', frameOptions);
        }

        // X-XSS-Protection - XSS filter in older browsers
        if (xssFilter) {
            res.setHeader('X-XSS-Protection', '1; mode=block');
        }

        // Strict-Transport-Security - Forces HTTPS
        if (hsts && process.env.NODE_ENV === 'production') {
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        // Referrer-Policy - Controls referrer information
        if (referrerPolicy) {
            res.setHeader('Referrer-Policy', referrerPolicy);
        }

        // Content-Security-Policy - Prevents XSS and data injection
        if (contentSecurityPolicy) {
            const csp = [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline'",
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                "font-src 'self' https://fonts.gstatic.com",
                "img-src 'self' data: https:",
                "connect-src 'self' ws: wss:",
                "frame-ancestors 'none'"
            ].join('; ');
            res.setHeader('Content-Security-Policy', csp);
        }

        // Permissions-Policy - Controls browser features
        res.setHeader('Permissions-Policy',
            'camera=(), microphone=(), geolocation=(), payment=()'
        );

        // Remove X-Powered-By header
        res.removeHeader('X-Powered-By');

        next();
    };
}

/**
 * CORS configuration for different environments
 */
function configureCors(options = {}) {
    const {
        allowedOrigins = [],
        allowCredentials = true,
        allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders = ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
        exposedHeaders = ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
        maxAge = 86400 // 24 hours
    } = options;

    // Default allowed origins based on environment
    const defaultOrigins = process.env.NODE_ENV === 'production'
        ? [process.env.FRONTEND_URL].filter(Boolean)
        : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];

    const origins = allowedOrigins.length > 0 ? allowedOrigins : defaultOrigins;

    return {
        origin: (origin, callback) => {
            // Allow requests with no origin (like mobile apps or Postman)
            if (!origin) return callback(null, true);

            // Check if origin is allowed
            if (origins.includes(origin) || origins.includes('*')) {
                callback(null, true);
            } else {
                console.warn(`[CORS] Blocked request from origin: ${origin}`);
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: allowCredentials,
        methods: allowedMethods,
        allowedHeaders: allowedHeaders,
        exposedHeaders: exposedHeaders,
        maxAge: maxAge,
        optionsSuccessStatus: 204
    };
}

/**
 * API Key validation middleware
 * For external API access
 */
function validateApiKey(options = {}) {
    const {
        headerName = 'X-API-Key',
        queryParam = 'api_key',
        required = true
    } = options;

    return async (req, res, next) => {
        // Get API key from header or query
        const apiKey = req.headers[headerName.toLowerCase()] || req.query[queryParam];

        if (!apiKey) {
            if (required) {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: 'API_KEY_REQUIRED',
                        message: 'API key is required'
                    }
                });
            }
            return next();
        }

        try {
            // Validate API key format
            const expectedPrefix = process.env.API_KEY_PREFIX || 'dk_';

            if (!apiKey.startsWith(expectedPrefix)) {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: 'INVALID_API_KEY',
                        message: 'Invalid API key format'
                    }
                });
            }

            // Validate against database (keys stored as SHA-256 hashes)
            const { hash } = require('../utils/encryption');
            const prisma = require('../utils/prisma');
            const hashedKey = hash(apiKey);
            const apiKeyRecord = await prisma.apiKey.findUnique({
                where: { key: hashedKey },
                include: { user: { select: { id: true, isActive: true, status: true, role: true } } }
            });

            if (!apiKeyRecord || !apiKeyRecord.isActive) {
                return res.status(401).json({
                    success: false,
                    error: {
                        code: 'INVALID_API_KEY',
                        message: 'Invalid or inactive API key'
                    }
                });
            }

            if (!apiKeyRecord.user.isActive || apiKeyRecord.user.status === 'BANNED') {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'ACCOUNT_INACTIVE',
                        message: 'Associated account is inactive'
                    }
                });
            }

            // Attach user and API key to request for downstream handlers
            req.user = apiKeyRecord.user;
            req.apiKey = apiKeyRecord;

            // Update last used timestamp (non-blocking)
            prisma.apiKey.update({
                where: { id: apiKeyRecord.id },
                data: { lastUsed: new Date() }
            }).catch(() => { }); // Don't block on analytics update

            next();
        } catch (error) {
            console.error('[API Key Validation Error]', error);
            return res.status(500).json({
                success: false,
                error: {
                    code: 'API_KEY_VALIDATION_ERROR',
                    message: 'Failed to validate API key'
                }
            });
        }
    };
}

/**
 * IP Whitelist/Blacklist middleware
 */
function ipFilter(options = {}) {
    const {
        whitelist = [],
        blacklist = [],
        mode = 'blacklist' // 'whitelist' or 'blacklist'
    } = options;

    return (req, res, next) => {
        // Use req.ip — Express handles X-Forwarded-For based on 'trust proxy' setting.
        // Do NOT read X-Forwarded-For manually — it can be spoofed by clients.
        const clientIP = req.ip || req.connection?.remoteAddress || '0.0.0.0';

        // Normalize IP (remove ::ffff: prefix for IPv4)
        const normalizedIP = clientIP.replace(/^::ffff:/, '');

        if (mode === 'whitelist') {
            // Only allow whitelisted IPs
            if (whitelist.length > 0 && !whitelist.includes(normalizedIP)) {
                console.warn(`[IP Filter] Blocked IP not in whitelist: ${normalizedIP}`);
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'IP_NOT_ALLOWED',
                        message: 'Your IP address is not authorized'
                    }
                });
            }
        } else {
            // Block blacklisted IPs
            if (blacklist.includes(normalizedIP)) {
                console.warn(`[IP Filter] Blocked blacklisted IP: ${normalizedIP}`);
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'IP_BLOCKED',
                        message: 'Your IP address has been blocked'
                    }
                });
            }
        }

        next();
    };
}

/**
 * Request timeout middleware
 */
function requestTimeout(timeoutMs = 30000) {
    return (req, res, next) => {
        // Set timeout on request
        req.setTimeout(timeoutMs, () => {
            if (!res.headersSent) {
                res.status(408).json({
                    success: false,
                    error: {
                        code: 'REQUEST_TIMEOUT',
                        message: 'Request timeout'
                    }
                });
            }
        });

        // Set timeout on response
        res.setTimeout(timeoutMs, () => {
            if (!res.headersSent) {
                res.status(408).json({
                    success: false,
                    error: {
                        code: 'RESPONSE_TIMEOUT',
                        message: 'Response timeout'
                    }
                });
            }
        });

        next();
    };
}

/**
 * Maintenance mode middleware
 */
function maintenanceMode(options = {}) {
    const {
        enabled = false,
        message = 'Service is under maintenance. Please try again later.',
        allowedPaths = ['/health', '/api/health'],
        allowedIPs = []
    } = options;

    return (req, res, next) => {
        if (!enabled) return next();

        // Allow certain paths
        if (allowedPaths.some(path => req.path.startsWith(path))) {
            return next();
        }

        // Allow certain IPs (admin access)
        const clientIP = req.ip?.replace(/^::ffff:/, '');
        if (allowedIPs.includes(clientIP)) {
            return next();
        }

        return res.status(503).json({
            success: false,
            error: {
                code: 'MAINTENANCE_MODE',
                message
            }
        });
    };
}

module.exports = {
    securityHeaders,
    configureCors,
    validateApiKey,
    ipFilter,
    requestTimeout,
    maintenanceMode
};
