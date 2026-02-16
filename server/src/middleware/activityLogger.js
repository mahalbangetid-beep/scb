/**
 * Activity Logging Middleware
 * 
 * Middleware to automatically log activities for audit trail
 */

const { activityLogService, ACTIONS, CATEGORIES } = require('../services/activityLog');

/**
 * Create activity logging middleware
 */
function createActivityLogger(action, category, getDescription = null) {
    return async (req, res, next) => {
        // Store original end function
        const originalEnd = res.end;
        const startTime = Date.now();

        // Override end to log after response
        res.end = function (...args) {
            const duration = Date.now() - startTime;
            const status = res.statusCode >= 400 ? 'failed' : 'success';

            // Log activity asynchronously (don't wait)
            activityLogService.log({
                userId: req.user?.id || null,
                action,
                category,
                description: getDescription ? getDescription(req) : `${action} - ${req.method} ${req.path}`,
                metadata: {
                    method: req.method,
                    path: req.path,
                    statusCode: res.statusCode,
                    params: req.params,
                    // Don't log sensitive body data
                    bodyKeys: req.body ? Object.keys(req.body).filter(k => !['password', 'apiKey', 'secret', 'token', 'creditCard', 'ssn', 'encryptionKey'].includes(k)) : []
                },
                ipAddress: req.ip || req.headers['x-forwarded-for'],
                userAgent: req.headers['user-agent'],
                status,
                duration
            }).catch(err => {
                console.error('[ActivityLogger] Failed to log:', err.message);
            });

            // Call original end
            return originalEnd.apply(this, args);
        };

        next();
    };
}

/**
 * Log specific actions
 */
const logLogin = createActivityLogger(
    ACTIONS.LOGIN,
    CATEGORIES.AUTH,
    (req) => `Login attempt for ${req.body?.username || req.body?.email || 'unknown'}`
);

const logRegister = createActivityLogger(
    ACTIONS.REGISTER,
    CATEGORIES.AUTH,
    (req) => `Registration for ${req.body?.username || 'unknown'}`
);

const logDeviceCreate = createActivityLogger(
    ACTIONS.DEVICE_CREATE,
    CATEGORIES.DEVICE,
    (req) => `Device created: ${req.body?.name || 'unnamed'}`
);

const logDeviceDelete = createActivityLogger(
    ACTIONS.DEVICE_DELETE,
    CATEGORIES.DEVICE,
    (req) => `Device deleted: ${req.params?.id}`
);

const logPanelAdd = createActivityLogger(
    ACTIONS.PANEL_ADD,
    CATEGORIES.PANEL,
    (req) => `Panel added: ${req.body?.name || 'unnamed'}`
);

const logMessageSend = createActivityLogger(
    ACTIONS.MESSAGE_SEND,
    CATEGORIES.MESSAGE,
    (req) => `Message sent to ${req.body?.to || 'unknown'}`
);

const logAdminAction = (action) => createActivityLogger(
    action,
    CATEGORIES.ADMIN,
    (req) => `Admin action: ${action} on user ${req.params?.id}`
);

module.exports = {
    createActivityLogger,
    logLogin,
    logRegister,
    logDeviceCreate,
    logDeviceDelete,
    logPanelAdd,
    logMessageSend,
    logAdminAction,
    ACTIONS,
    CATEGORIES
};
