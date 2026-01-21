/**
 * Request Logger Middleware
 * Logs all requests for monitoring and debugging
 */

const prisma = require('../utils/prisma');
const { getClientIP } = require('./rateLimiter');

// In-memory log buffer for batch writing
let logBuffer = [];
const BUFFER_SIZE = 100;
const FLUSH_INTERVAL = 30000; // 30 seconds

// Flush logs periodically
setInterval(() => {
    flushLogs();
}, FLUSH_INTERVAL);

/**
 * Flush log buffer to console/storage
 */
async function flushLogs() {
    if (logBuffer.length === 0) return;

    const logsToWrite = [...logBuffer];
    logBuffer = [];

    // In production, you might want to write to a database or log service
    // For now, just console output for critical logs
    const criticalLogs = logsToWrite.filter(log =>
        log.statusCode >= 400 || log.responseTime > 5000
    );

    if (criticalLogs.length > 0) {
        console.log('[RequestLogger] Critical requests:', criticalLogs.length);
    }
}

/**
 * Create request log entry
 */
function createLogEntry(req, res, responseTime) {
    return {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        path: req.path,
        statusCode: res.statusCode,
        responseTime,
        ip: getClientIP(req),
        userAgent: req.headers['user-agent'],
        userId: req.user?.id || null,
        contentLength: res.get('content-length') || 0,
        referer: req.headers['referer'] || null
    };
}

/**
 * Request logger middleware
 */
function requestLogger(options = {}) {
    const {
        skipPaths = ['/health', '/favicon.ico'],
        logBody = false,
        logSuccessful = true,
        logLevel = 'info'
    } = options;

    return (req, res, next) => {
        // Skip certain paths
        if (skipPaths.some(path => req.path.startsWith(path))) {
            return next();
        }

        const startTime = Date.now();

        // Capture response
        const originalSend = res.send;
        res.send = function (body) {
            res.send = originalSend;
            res.body = body;
            return originalSend.call(this, body);
        };

        // Log on response finish
        res.on('finish', () => {
            const responseTime = Date.now() - startTime;
            const logEntry = createLogEntry(req, res, responseTime);

            // Skip successful requests if configured
            if (!logSuccessful && res.statusCode < 400) {
                return;
            }

            // Add to buffer
            logBuffer.push(logEntry);

            // Flush if buffer is full
            if (logBuffer.length >= BUFFER_SIZE) {
                flushLogs();
            }

            // Console log based on status and level
            const logMessage = `${logEntry.method} ${logEntry.url} ${logEntry.statusCode} ${responseTime}ms`;

            if (res.statusCode >= 500) {
                console.error(`[ERROR] ${logMessage}`, {
                    ip: logEntry.ip,
                    userId: logEntry.userId
                });
            } else if (res.statusCode >= 400) {
                console.warn(`[WARN] ${logMessage}`, {
                    ip: logEntry.ip,
                    userId: logEntry.userId
                });
            } else if (responseTime > 1000) {
                console.warn(`[SLOW] ${logMessage}`);
            } else if (logLevel === 'debug') {
                console.log(`[DEBUG] ${logMessage}`);
            }
        });

        next();
    };
}

/**
 * Activity logger - logs specific user actions
 */
async function logActivity(options) {
    const {
        userId,
        action,
        resourceType,
        resourceId,
        details = {},
        ip = null,
        status = 'SUCCESS'
    } = options;

    try {
        // Log to console
        console.log(`[Activity] User ${userId}: ${action} ${resourceType}/${resourceId} - ${status}`);

        // In production, save to database
        // await prisma.activityLog.create({
        //     data: {
        //         userId,
        //         action,
        //         resourceType,
        //         resourceId,
        //         details: JSON.stringify(details),
        //         ip,
        //         status,
        //         createdAt: new Date()
        //     }
        // });
    } catch (error) {
        console.error('[Activity Logger Error]', error);
    }
}

/**
 * Login activity logger
 */
async function logLoginActivity(req, userId, success, reason = null) {
    const ip = getClientIP(req);
    const userAgent = req.headers['user-agent'];

    console.log(`[Login] User ${userId}: ${success ? 'SUCCESS' : 'FAILED'} from ${ip}`);

    try {
        // Update or create login history
        await prisma.loginHistory.create({
            data: {
                userId,
                ipAddress: ip,
                userAgent: userAgent?.substring(0, 255) || null,
                success,
                failureReason: reason,
                loginAt: new Date()
            }
        });
    } catch (error) {
        console.error('[Login Logger Error]', error);
    }
}

/**
 * Suspicious activity detector
 */
function detectSuspiciousActivity(req) {
    const ip = getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';

    const suspiciousPatterns = {
        noUserAgent: !userAgent,
        botUserAgent: /bot|crawler|spider|scraper/i.test(userAgent),
        curlRequest: /curl/i.test(userAgent),
        sqlInjection: /(\bor\b|\band\b).*[=<>]/i.test(JSON.stringify(req.body)),
        pathTraversal: /\.\.\/|\.\.\\/.test(req.url),
        unusualMethod: !['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)
    };

    const isSuspicious = Object.values(suspiciousPatterns).some(v => v === true);

    if (isSuspicious) {
        console.warn('[Suspicious Activity]', {
            ip,
            method: req.method,
            url: req.originalUrl,
            patterns: Object.entries(suspiciousPatterns)
                .filter(([_, v]) => v)
                .map(([k]) => k)
        });
    }

    return {
        isSuspicious,
        patterns: suspiciousPatterns
    };
}

/**
 * Performance monitor middleware
 */
function performanceMonitor(thresholdMs = 1000) {
    return (req, res, next) => {
        const startTime = process.hrtime();

        res.on('finish', () => {
            const [seconds, nanoseconds] = process.hrtime(startTime);
            const durationMs = seconds * 1000 + nanoseconds / 1e6;

            if (durationMs > thresholdMs) {
                console.warn('[Performance] Slow request detected:', {
                    method: req.method,
                    url: req.originalUrl,
                    duration: `${durationMs.toFixed(2)}ms`,
                    threshold: `${thresholdMs}ms`,
                    userId: req.user?.id
                });
            }
        });

        next();
    };
}

module.exports = {
    requestLogger,
    logActivity,
    logLoginActivity,
    detectSuspiciousActivity,
    performanceMonitor,
    flushLogs
};
