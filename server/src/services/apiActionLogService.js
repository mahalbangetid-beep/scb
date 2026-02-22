/**
 * API Action Log Service
 * 
 * Logs all API requests to providers (refill, cancel, status, speed_up)
 * Provides detailed audit trail of what was sent and received
 */

const prisma = require('../utils/prisma');

class ApiActionLogService {
    /**
     * Log an API action
     */
    async log({ userId, orderId, panelId, action, provider, endpoint, requestData, responseData, statusCode, success, errorMessage, duration }) {
        try {
            return await prisma.apiActionLog.create({
                data: {
                    userId,
                    orderId: orderId || null,
                    panelId: panelId || null,
                    action: action || 'UNKNOWN',
                    provider: provider || null,
                    endpoint: endpoint || null,
                    requestData: requestData ? JSON.stringify(requestData) : null,
                    responseData: responseData ? JSON.stringify(responseData) : null,
                    statusCode: statusCode || null,
                    success: success || false,
                    errorMessage: errorMessage || null,
                    duration: duration || null
                }
            });
        } catch (e) {
            console.error('[ApiActionLog] Failed to log:', e.message);
            return null;
        }
    }

    /**
     * Get logs for a user (with pagination)
     */
    async getLogs(userId, { page = 1, limit = 50, action, orderId } = {}) {
        const where = { userId };
        if (action) where.action = action;
        if (orderId) where.orderId = orderId;

        const [logs, total] = await Promise.all([
            prisma.apiActionLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.apiActionLog.count({ where })
        ]);

        return { logs, total, page, totalPages: Math.ceil(total / limit) };
    }

    /**
     * Get logs for a specific order
     */
    async getOrderLogs(orderId) {
        return prisma.apiActionLog.findMany({
            where: { orderId },
            orderBy: { createdAt: 'desc' }
        });
    }

    /**
     * Clean up old logs (keep last 30 days)
     */
    async cleanup(daysToKeep = 30) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysToKeep);

        const result = await prisma.apiActionLog.deleteMany({
            where: { createdAt: { lt: cutoff } }
        });

        return result.count;
    }
}

module.exports = new ApiActionLogService();
