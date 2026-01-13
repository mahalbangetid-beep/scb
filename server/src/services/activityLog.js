/**
 * Activity Logging Service
 * 
 * Comprehensive activity audit logging for security and monitoring
 */

const prisma = require('../utils/prisma');

// Activity action types
const ACTIONS = {
    // Auth actions
    LOGIN: 'LOGIN',
    LOGIN_FAILED: 'LOGIN_FAILED',
    LOGOUT: 'LOGOUT',
    REGISTER: 'REGISTER',
    PASSWORD_CHANGE: 'PASSWORD_CHANGE',

    // Device actions
    DEVICE_CREATE: 'DEVICE_CREATE',
    DEVICE_DELETE: 'DEVICE_DELETE',
    DEVICE_CONNECT: 'DEVICE_CONNECT',
    DEVICE_DISCONNECT: 'DEVICE_DISCONNECT',

    // Message actions
    MESSAGE_SEND: 'MESSAGE_SEND',
    MESSAGE_RECEIVE: 'MESSAGE_RECEIVE',
    BROADCAST_SEND: 'BROADCAST_SEND',

    // SMM Panel actions
    PANEL_ADD: 'PANEL_ADD',
    PANEL_DELETE: 'PANEL_DELETE',
    PANEL_SYNC: 'PANEL_SYNC',

    // Order actions
    ORDER_CREATE: 'ORDER_CREATE',
    ORDER_REFILL: 'ORDER_REFILL',
    ORDER_CANCEL: 'ORDER_CANCEL',
    ORDER_STATUS: 'ORDER_STATUS',

    // Admin actions
    USER_SUSPEND: 'USER_SUSPEND',
    USER_BAN: 'USER_BAN',
    USER_ACTIVATE: 'USER_ACTIVATE',
    CREDIT_ADJUST: 'CREDIT_ADJUST',
    CONFIG_UPDATE: 'CONFIG_UPDATE',

    // System actions
    SYSTEM_START: 'SYSTEM_START',
    SYSTEM_ERROR: 'SYSTEM_ERROR',
    API_CALL: 'API_CALL'
};

// Categories
const CATEGORIES = {
    AUTH: 'auth',
    DEVICE: 'device',
    MESSAGE: 'message',
    ORDER: 'order',
    ADMIN: 'admin',
    SYSTEM: 'system',
    PANEL: 'panel'
};

class ActivityLogService {
    /**
     * Log an activity
     */
    async log({
        userId = null,
        action,
        category = 'general',
        description = null,
        metadata = null,
        ipAddress = null,
        userAgent = null,
        status = 'success',
        duration = null
    }) {
        try {
            const log = await prisma.activityLog.create({
                data: {
                    userId,
                    action,
                    category,
                    description,
                    metadata: metadata ? JSON.stringify(metadata) : null,
                    ipAddress,
                    userAgent,
                    status,
                    duration
                }
            });
            return log;
        } catch (error) {
            console.error('[ActivityLog] Failed to log activity:', error.message);
            // Don't throw - logging should not break the application
            return null;
        }
    }

    /**
     * Log auth activity
     */
    async logAuth(action, userId, req, metadata = {}) {
        return this.log({
            userId,
            action,
            category: CATEGORIES.AUTH,
            description: `Auth action: ${action}`,
            metadata,
            ipAddress: req?.ip || req?.headers?.['x-forwarded-for'],
            userAgent: req?.headers?.['user-agent'],
            status: metadata.success === false ? 'failed' : 'success'
        });
    }

    /**
     * Log device activity
     */
    async logDevice(action, userId, deviceId, req, metadata = {}) {
        return this.log({
            userId,
            action,
            category: CATEGORIES.DEVICE,
            description: `Device ${deviceId}: ${action}`,
            metadata: { deviceId, ...metadata },
            ipAddress: req?.ip,
            userAgent: req?.headers?.['user-agent']
        });
    }

    /**
     * Log message activity
     */
    async logMessage(action, userId, messageInfo, req = null) {
        return this.log({
            userId,
            action,
            category: CATEGORIES.MESSAGE,
            description: `Message ${action}`,
            metadata: messageInfo,
            ipAddress: req?.ip
        });
    }

    /**
     * Log admin activity
     */
    async logAdmin(action, adminId, targetId, req, metadata = {}) {
        return this.log({
            userId: adminId,
            action,
            category: CATEGORIES.ADMIN,
            description: `Admin action on user ${targetId}`,
            metadata: { targetUserId: targetId, ...metadata },
            ipAddress: req?.ip,
            userAgent: req?.headers?.['user-agent']
        });
    }

    /**
     * Log order activity
     */
    async logOrder(action, userId, orderId, metadata = {}) {
        return this.log({
            userId,
            action,
            category: CATEGORIES.ORDER,
            description: `Order ${orderId}: ${action}`,
            metadata: { orderId, ...metadata }
        });
    }

    /**
     * Log system activity
     */
    async logSystem(action, description, metadata = {}) {
        return this.log({
            userId: null,
            action,
            category: CATEGORIES.SYSTEM,
            description,
            metadata,
            status: metadata.error ? 'failed' : 'success'
        });
    }

    /**
     * Get activity logs with filters
     */
    async getLogs({
        userId = null,
        action = null,
        category = null,
        status = null,
        startDate = null,
        endDate = null,
        page = 1,
        limit = 50
    }) {
        const where = {};

        if (userId) where.userId = userId;
        if (action) where.action = action;
        if (category) where.category = category;
        if (status) where.status = status;

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        const [logs, total] = await Promise.all([
            prisma.activityLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: (page - 1) * limit
            }),
            prisma.activityLog.count({ where })
        ]);

        return {
            logs: logs.map(log => {
                let parsedMetadata = null;
                if (log.metadata) {
                    try {
                        parsedMetadata = JSON.parse(log.metadata);
                    } catch (e) {
                        parsedMetadata = { _raw: log.metadata, _parseError: true };
                    }
                }
                return {
                    ...log,
                    metadata: parsedMetadata
                };
            }),
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Get activity stats
     */
    async getStats(startDate = null, endDate = null) {
        const where = {};

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) where.createdAt.gte = new Date(startDate);
            if (endDate) where.createdAt.lte = new Date(endDate);
        }

        const [byAction, byCategory, byStatus, total] = await Promise.all([
            prisma.activityLog.groupBy({
                by: ['action'],
                where,
                _count: true,
                orderBy: { _count: { action: 'desc' } },
                take: 10
            }),
            prisma.activityLog.groupBy({
                by: ['category'],
                where,
                _count: true
            }),
            prisma.activityLog.groupBy({
                by: ['status'],
                where,
                _count: true
            }),
            prisma.activityLog.count({ where })
        ]);

        return {
            total,
            byAction: byAction.map(a => ({ action: a.action, count: a._count })),
            byCategory: byCategory.map(c => ({ category: c.category, count: c._count })),
            byStatus: byStatus.map(s => ({ status: s.status, count: s._count }))
        };
    }

    /**
     * Clean old logs (for maintenance)
     */
    async cleanOldLogs(daysToKeep = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        const result = await prisma.activityLog.deleteMany({
            where: {
                createdAt: { lt: cutoffDate }
            }
        });

        return result.count;
    }
}

// Export singleton
const activityLogService = new ActivityLogService();

module.exports = {
    activityLogService,
    ACTIONS,
    CATEGORIES
};
