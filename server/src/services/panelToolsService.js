/**
 * Panel Tools Service
 * 
 * Handles 3 features per panel:
 * 1. Manual Services — add services not from API
 * 2. Failed Orders — view/manage failed orders per panel
 * 3. Service Forward Rules — per-service-ID forwarding to support
 */

const prisma = require('../utils/prisma');

class PanelToolsService {


    // ==================== FAILED ORDERS ====================

    async getFailedOrders(userId, panelId, { page = 1, limit = 50 } = {}) {
        const where = {
            userId,
            panelId,
            OR: [
                { status: { in: ['CANCELLED', 'PARTIAL', 'REFUNDED'] } },
                {
                    commands: {
                        some: { status: 'FAILED' }
                    }
                }
            ]
        };

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                include: {
                    commands: {
                        where: { status: 'FAILED' },
                        orderBy: { createdAt: 'desc' },
                        take: 3
                    }
                },
                orderBy: { updatedAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.order.count({ where })
        ]);

        return { orders, total, page, totalPages: Math.ceil(total / limit) };
    }

    // ==================== SERVICE FORWARD RULES ====================

    async getServiceForwardRules(userId, panelId) {
        return prisma.serviceForwardRule.findMany({
            where: { userId, panelId },
            orderBy: { createdAt: 'desc' }
        });
    }

    async createServiceForwardRule(userId, panelId, data) {
        return prisma.serviceForwardRule.create({
            data: {
                userId,
                panelId,
                serviceId: data.serviceId,
                serviceName: data.serviceName || null,
                forwardRefill: data.forwardRefill !== undefined ? data.forwardRefill : true,
                forwardCancel: data.forwardCancel !== undefined ? data.forwardCancel : true,
                forwardToGroup: data.forwardToGroup || null,
                forwardToNumber: data.forwardToNumber || null,
                forwardToChat: data.forwardToChat || null,
                reason: data.reason || null,
                isActive: true
            }
        });
    }

    async updateServiceForwardRule(id, userId, data) {
        const existing = await prisma.serviceForwardRule.findFirst({ where: { id, userId } });
        if (!existing) throw new Error('Service forward rule not found');

        return prisma.serviceForwardRule.update({
            where: { id },
            data: {
                serviceId: data.serviceId !== undefined ? data.serviceId : existing.serviceId,
                serviceName: data.serviceName !== undefined ? data.serviceName : existing.serviceName,
                forwardRefill: data.forwardRefill !== undefined ? data.forwardRefill : existing.forwardRefill,
                forwardCancel: data.forwardCancel !== undefined ? data.forwardCancel : existing.forwardCancel,
                forwardToGroup: data.forwardToGroup !== undefined ? data.forwardToGroup : existing.forwardToGroup,
                forwardToNumber: data.forwardToNumber !== undefined ? data.forwardToNumber : existing.forwardToNumber,
                forwardToChat: data.forwardToChat !== undefined ? data.forwardToChat : existing.forwardToChat,
                reason: data.reason !== undefined ? data.reason : existing.reason,
                isActive: data.isActive !== undefined ? data.isActive : existing.isActive
            }
        });
    }

    async deleteServiceForwardRule(id, userId) {
        const existing = await prisma.serviceForwardRule.findFirst({ where: { id, userId } });
        if (!existing) throw new Error('Service forward rule not found');
        return prisma.serviceForwardRule.delete({ where: { id } });
    }

    /**
     * Check if a service ID has a forward rule (used by commandHandler)
     * @returns {Object|null} Rule if found, null if not
     */
    async getForwardRuleForService(userId, panelId, serviceId) {
        if (!serviceId) return null;
        return prisma.serviceForwardRule.findFirst({
            where: { userId, panelId, serviceId: String(serviceId), isActive: true }
        });
    }
}

module.exports = new PanelToolsService();
