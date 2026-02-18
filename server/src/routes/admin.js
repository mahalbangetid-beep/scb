const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const prisma = require('../utils/prisma');
const { successResponse, createdResponse, paginatedResponse, parsePagination, parseSort } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');
const { authenticate, requireAdmin, requireMasterAdmin, ROLES } = require('../middleware/auth');
const creditService = require('../services/creditService');

// All routes require admin authentication
router.use(authenticate);
router.use(requireAdmin);

// ==================== USER MANAGEMENT ====================

// GET /api/admin/users - List all users
router.get('/users', async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { search, status, role } = req.query;

        // Build where clause
        const where = {};

        if (search) {
            where.OR = [
                { username: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
                { whatsappNumber: { contains: search, mode: 'insensitive' } }
            ];
        }

        if (status) {
            where.status = status;
        }

        // Non-master admins cannot see master admins
        if (req.user.role !== ROLES.MASTER_ADMIN) {
            if (role && role !== ROLES.MASTER_ADMIN) {
                where.role = role;  // Use the filter, but prevent filtering TO master admin
            } else {
                where.role = { not: ROLES.MASTER_ADMIN };
            }
        } else if (role) {
            where.role = role;
        }

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    username: true,
                    email: true,
                    name: true,
                    role: true,
                    status: true,
                    whatsappNumber: true,
                    telegramUsername: true,
                    creditBalance: true,
                    discountRate: true,
                    registrationIp: true,
                    lastLoginIp: true,
                    lastLoginAt: true,
                    isActive: true,
                    createdAt: true,
                    _count: {
                        select: {
                            devices: true,
                            smmPanels: true,
                            orders: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip
            }),
            prisma.user.count({ where })
        ]);

        paginatedResponse(res, users, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// GET /api/admin/users/:id - Get user details
router.get('/users/:id', async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: {
                id: true,
                username: true,
                email: true,
                name: true,
                role: true,
                status: true,
                avatar: true,
                whatsappNumber: true,
                telegramUsername: true,
                primaryPanelUrl: true,
                creditBalance: true,
                discountRate: true,
                customWaRate: true,
                customTgRate: true,
                customGroupRate: true,
                registrationIp: true,
                lastLoginIp: true,
                lastLoginAt: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        devices: true,
                        telegramBots: true,
                        smmPanels: true,
                        orders: true,
                        contacts: true,
                        autoReplyRules: true,
                        creditTransactions: true,
                        loginHistory: true
                    }
                }
            }
        });

        if (!user) {
            throw new AppError('User not found', 404);
        }

        // Non-master admins cannot see master admins
        if (user.role === ROLES.MASTER_ADMIN && req.user.role !== ROLES.MASTER_ADMIN) {
            throw new AppError('Not authorized', 403);
        }

        successResponse(res, user);
    } catch (error) {
        next(error);
    }
});

// PUT /api/admin/users/:id - Update user
router.put('/users/:id', async (req, res, next) => {
    try {
        const {
            name,
            status,
            role,
            creditBalance,
            discountRate,
            customWaRate,
            customTgRate,
            customGroupRate,
            isActive
        } = req.body;

        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { id: req.params.id }
        });

        if (!existingUser) {
            throw new AppError('User not found', 404);
        }

        // Only Master Admin can modify other admins
        if (existingUser.role === ROLES.MASTER_ADMIN && req.user.role !== ROLES.MASTER_ADMIN) {
            throw new AppError('Cannot modify Master Admin', 403);
        }

        if (existingUser.role === ROLES.ADMIN && req.user.role !== ROLES.MASTER_ADMIN) {
            throw new AppError('Only Master Admin can modify Admin users', 403);
        }

        // Only Master Admin can set admin roles
        if (role && (role === ROLES.MASTER_ADMIN || role === ROLES.ADMIN)) {
            if (req.user.role !== ROLES.MASTER_ADMIN) {
                throw new AppError('Only Master Admin can assign admin roles', 403);
            }
        }

        // Validate creditBalance if provided
        const oldBalance = existingUser.creditBalance || 0;
        let creditAdjustment = null;

        if (creditBalance !== undefined) {
            const newBalance = parseFloat(creditBalance);
            if (isNaN(newBalance) || newBalance < 0) {
                throw new AppError('Credit balance must be a non-negative number', 400);
            }
            creditAdjustment = newBalance - oldBalance;
        }

        // Update user (without credit balance - that will be handled atomically)
        const user = await prisma.user.update({
            where: { id: req.params.id },
            data: {
                ...(name && { name }),
                ...(status && { status }),
                ...(role && { role }),
                ...(discountRate !== undefined && { discountRate: parseFloat(discountRate) }),
                ...(customWaRate !== undefined && { customWaRate: customWaRate ? parseFloat(customWaRate) : null }),
                ...(customTgRate !== undefined && { customTgRate: customTgRate ? parseFloat(customTgRate) : null }),
                ...(customGroupRate !== undefined && { customGroupRate: customGroupRate ? parseFloat(customGroupRate) : null }),
                ...(isActive !== undefined && { isActive })
            },
            select: {
                id: true,
                username: true,
                email: true,
                name: true,
                role: true,
                status: true,
                creditBalance: true,
                discountRate: true
            }
        });

        // Handle credit adjustment atomically using creditService
        if (creditAdjustment !== null && creditAdjustment !== 0) {
            const description = `Admin adjustment by ${req.user.username}`;
            const reference = `ADMIN_${req.user.id}`;

            if (creditAdjustment > 0) {
                await creditService.addCredit(req.params.id, creditAdjustment, description, reference);
            } else {
                await creditService.deductCredit(req.params.id, Math.abs(creditAdjustment), description, reference);
            }

            // Refresh user data to get updated balance
            user.creditBalance = parseFloat(creditBalance);
        }

        successResponse(res, user, 'User updated successfully');
    } catch (error) {
        next(error);
    }
});

// POST /api/admin/users/:id/adjust-credit - Adjust user credit (ATOMIC)
router.post('/users/:id/adjust-credit', async (req, res, next) => {
    try {
        const { amount, type, description } = req.body;

        // Validate amount is a positive number
        const adjustAmount = parseFloat(amount);
        if (!amount || isNaN(adjustAmount) || adjustAmount <= 0) {
            throw new AppError('Amount must be a positive number', 400);
        }

        if (!type || !['CREDIT', 'DEBIT'].includes(type)) {
            throw new AppError('Type must be CREDIT or DEBIT', 400);
        }

        // Verify user exists
        const user = await prisma.user.findUnique({
            where: { id: req.params.id }
        });

        if (!user) {
            throw new AppError('User not found', 404);
        }

        // Use creditService for atomic operations
        let result;
        const adminDescription = description || `Admin ${type.toLowerCase()} by ${req.user.username}`;
        const reference = `ADMIN_${req.user.id}`;

        if (type === 'CREDIT') {
            result = await creditService.addCredit(
                req.params.id,
                adjustAmount,
                adminDescription,
                reference
            );
        } else {
            result = await creditService.deductCredit(
                req.params.id,
                adjustAmount,
                adminDescription,
                reference
            );
        }

        successResponse(res, {
            transaction: result.transaction,
            newBalance: result.balanceAfter,
            balanceBefore: result.balanceBefore
        }, `Successfully ${type === 'CREDIT' ? 'added' : 'deducted'} ${adjustAmount} credits`);

        // Send payment email for admin credits (non-blocking)
        if (type === 'CREDIT' && user.email) {
            try {
                const emailService = require('../services/emailService');
                emailService.sendTemplateEmail('payment_completed', user.email, {
                    username: user.username,
                    amount: adjustAmount.toFixed(2),
                    method: 'Admin Top-Up',
                    balance: result.balanceAfter.toFixed(2),
                    date: new Date().toLocaleDateString()
                }, user.id).catch(() => { });
            } catch (e) { /* non-critical */ }
        }
    } catch (error) {
        next(error);
    }
});

// POST /api/admin/users/:id/suspend - Suspend user
router.post('/users/:id/suspend', async (req, res, next) => {
    try {
        const { reason } = req.body;

        const user = await prisma.user.findUnique({
            where: { id: req.params.id }
        });

        if (!user) {
            throw new AppError('User not found', 404);
        }

        if (user.role === ROLES.MASTER_ADMIN) {
            throw new AppError('Cannot suspend Master Admin', 403);
        }

        await prisma.user.update({
            where: { id: req.params.id },
            data: { status: 'SUSPENDED' }
        });

        successResponse(res, null, 'User suspended successfully');
    } catch (error) {
        next(error);
    }
});

// POST /api/admin/users/:id/ban - Ban user
router.post('/users/:id/ban', requireMasterAdmin, async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id }
        });

        if (!user) {
            throw new AppError('User not found', 404);
        }

        if (user.role === ROLES.MASTER_ADMIN) {
            throw new AppError('Cannot ban Master Admin', 403);
        }

        await prisma.user.update({
            where: { id: req.params.id },
            data: { status: 'BANNED' }
        });

        successResponse(res, null, 'User banned successfully');
    } catch (error) {
        next(error);
    }
});

// POST /api/admin/users/:id/activate - Activate user
router.post('/users/:id/activate', async (req, res, next) => {
    try {
        await prisma.user.update({
            where: { id: req.params.id },
            data: {
                status: 'ACTIVE',
                isActive: true
            }
        });

        successResponse(res, null, 'User activated successfully');
    } catch (error) {
        next(error);
    }
});

// POST /api/admin/users/:id/impersonate - Login as user (Admin/Master Admin only)
router.post('/users/:id/impersonate', async (req, res, next) => {
    try {
        const targetUserId = req.params.id;
        const adminUser = req.user;

        // Fetch target user
        const targetUser = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: {
                id: true,
                username: true,
                email: true,
                name: true,
                role: true,
                status: true,
                creditBalance: true
            }
        });

        if (!targetUser) {
            throw new AppError('User not found', 404);
        }

        // Security: Cannot impersonate MASTER_ADMIN
        if (targetUser.role === ROLES.MASTER_ADMIN) {
            throw new AppError('Cannot impersonate Master Admin', 403);
        }

        // Security: Admin cannot impersonate other Admins (only Master Admin can)
        if (targetUser.role === ROLES.ADMIN && adminUser.role !== ROLES.MASTER_ADMIN) {
            throw new AppError('Only Master Admin can impersonate Admin users', 403);
        }

        // Security: Cannot impersonate yourself
        if (targetUser.id === adminUser.id) {
            throw new AppError('Cannot impersonate yourself', 400);
        }

        // Security: Target user must be active
        if (targetUser.status === 'BANNED') {
            throw new AppError('Cannot impersonate banned users', 400);
        }

        // Generate impersonation token (short-lived: 1 hour)
        const impersonationToken = jwt.sign(
            {
                userId: targetUser.id,
                impersonatedBy: adminUser.id,
                isImpersonation: true
            },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Log impersonation action
        await prisma.activityLog.create({
            data: {
                userId: adminUser.id,
                action: 'USER_IMPERSONATION',
                category: 'admin',
                description: `Admin ${adminUser.username} logged in as user ${targetUser.username}`,
                metadata: JSON.stringify({
                    targetUserId: targetUser.id,
                    targetUsername: targetUser.username,
                    adminId: adminUser.id,
                    adminUsername: adminUser.username
                }),
                ipAddress: req.headers['x-forwarded-for']?.split(',')[0] || req.connection?.remoteAddress || 'unknown'
            }
        });

        console.log(`[Admin] Impersonation: ${adminUser.username} (${adminUser.role}) logged in as ${targetUser.username}`);

        successResponse(res, {
            token: impersonationToken,
            user: targetUser,
            impersonatedBy: {
                id: adminUser.id,
                username: adminUser.username,
                role: adminUser.role
            },
            expiresIn: '1 hour'
        }, `Successfully impersonating user: ${targetUser.username}`);
    } catch (error) {
        next(error);
    }
});

// GET /api/admin/users/:id/login-history - Get user login history
router.get('/users/:id/login-history', async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);

        const [history, total] = await Promise.all([
            prisma.loginHistory.findMany({
                where: { userId: req.params.id },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip
            }),
            prisma.loginHistory.count({
                where: { userId: req.params.id }
            })
        ]);

        paginatedResponse(res, history, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// GET /api/admin/users/:id/credit-history - Get user credit history
router.get('/users/:id/credit-history', async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);

        const [transactions, total] = await Promise.all([
            prisma.creditTransaction.findMany({
                where: { userId: req.params.id },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip
            }),
            prisma.creditTransaction.count({
                where: { userId: req.params.id }
            })
        ]);

        paginatedResponse(res, transactions, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// ==================== STAFF MANAGEMENT ====================

// GET /api/admin/staff - List all staff
router.get('/staff', async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);

        const [staff, total] = await Promise.all([
            prisma.user.findMany({
                where: { role: ROLES.STAFF },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    name: true,
                    status: true,
                    isActive: true,
                    createdAt: true,
                    staffPermissions: {
                        select: {
                            id: true,
                            permission: true,
                            canView: true,
                            canEdit: true,
                            canDelete: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip
            }),
            prisma.user.count({
                where: { role: ROLES.STAFF }
            })
        ]);

        paginatedResponse(res, staff, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// POST /api/admin/staff - Create staff account
router.post('/staff', async (req, res, next) => {
    try {
        const { username, email, password, name, permissions } = req.body;

        if (!username || !email || !password || !name) {
            throw new AppError('Username, email, password, and name are required', 400);
        }

        // Check if username/email exists
        const existing = await prisma.user.findFirst({
            where: {
                OR: [
                    { username: username.toLowerCase() },
                    { email: email.toLowerCase() }
                ]
            }
        });

        if (existing) {
            throw new AppError('Username or email already exists', 400);
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create staff user with permissions
        const staff = await prisma.user.create({
            data: {
                username: username.toLowerCase(),
                email: email.toLowerCase(),
                password: hashedPassword,
                name,
                role: ROLES.STAFF,
                status: 'ACTIVE',
                staffPermissions: permissions ? {
                    create: permissions.map(p => ({
                        permission: p.permission,
                        canView: p.canView ?? true,
                        canEdit: p.canEdit ?? false,
                        canDelete: p.canDelete ?? false
                    }))
                } : undefined
            },
            select: {
                id: true,
                username: true,
                email: true,
                name: true,
                role: true,
                staffPermissions: true
            }
        });

        createdResponse(res, staff, 'Staff account created successfully');
    } catch (error) {
        next(error);
    }
});

// PUT /api/admin/staff/:id/permissions - Update staff permissions
router.put('/staff/:id/permissions', requireMasterAdmin, async (req, res, next) => {
    try {
        const { permissions } = req.body;

        // Verify user is staff
        const user = await prisma.user.findUnique({
            where: { id: req.params.id }
        });

        if (!user || user.role !== ROLES.STAFF) {
            throw new AppError('Staff member not found', 404);
        }

        // Delete existing permissions
        await prisma.staffPermission.deleteMany({
            where: { staffId: req.params.id }
        });

        // Create new permissions (handle both string array and object array formats)
        if (permissions && permissions.length > 0) {
            await prisma.staffPermission.createMany({
                data: permissions.map(p => {
                    // Support both string format ['order_view'] and object format [{permission: 'order_view', ...}]
                    const permKey = typeof p === 'string' ? p : p.permission;
                    return {
                        staffId: req.params.id,
                        permission: permKey,
                        canView: typeof p === 'string' ? true : (p.canView ?? true),
                        canEdit: typeof p === 'string' ? false : (p.canEdit ?? false),
                        canDelete: typeof p === 'string' ? false : (p.canDelete ?? false)
                    };
                })
            });
        }

        // Get updated staff with permissions
        const staff = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: {
                id: true,
                username: true,
                name: true,
                staffPermissions: true
            }
        });

        successResponse(res, staff, 'Permissions updated successfully');
    } catch (error) {
        next(error);
    }
});

// DELETE /api/admin/staff/:id - Delete staff account
router.delete('/staff/:id', requireMasterAdmin, async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id }
        });

        if (!user || user.role !== ROLES.STAFF) {
            throw new AppError('Staff member not found', 404);
        }

        await prisma.user.delete({
            where: { id: req.params.id }
        });

        successResponse(res, null, 'Staff account deleted');
    } catch (error) {
        next(error);
    }
});

// ==================== SYSTEM STATS ====================

// GET /api/admin/stats - Get system statistics
router.get('/stats', async (req, res, next) => {
    try {
        const [
            totalUsers,
            activeUsers,
            totalDevices,
            connectedDevices,
            totalMessages,
            totalOrders,
            totalPanels
        ] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { status: 'ACTIVE' } }),
            prisma.device.count(),
            prisma.device.count({ where: { status: 'connected' } }),
            prisma.message.count(),
            prisma.order.count(),
            prisma.smmPanel.count()
        ]);

        // Get today's stats
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
            todayMessages,
            todayUsers,
            todayLogins
        ] = await Promise.all([
            prisma.message.count({
                where: { createdAt: { gte: today } }
            }),
            prisma.user.count({
                where: { createdAt: { gte: today } }
            }),
            prisma.loginHistory.count({
                where: { createdAt: { gte: today }, status: 'SUCCESS' }
            })
        ]);

        successResponse(res, {
            users: {
                total: totalUsers,
                active: activeUsers
            },
            devices: {
                total: totalDevices,
                connected: connectedDevices
            },
            messages: {
                total: totalMessages,
                today: todayMessages
            },
            orders: {
                total: totalOrders
            },
            panels: {
                total: totalPanels
            },
            today: {
                newUsers: todayUsers,
                logins: todayLogins,
                messages: todayMessages
            }
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/admin/dashboard-stats - Comprehensive dashboard for Master Admin
router.get('/dashboard-stats', async (req, res, next) => {
    try {
        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);

        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // ── Core counts ──
        const [
            totalUsers,
            activeUsers,
            newUsersToday,
            newUsersThisWeek,
            totalDevices,
            connectedDevices,
            systemBotDevices,
            totalTelegramBots,
            activeTelegramBots,
            totalPanels,
            totalOrders,
            todayOrders,
            totalMessages,
            todayMessagesSent,
            todayMessagesReceived,
            failedMessages
        ] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { status: 'ACTIVE' } }),
            prisma.user.count({ where: { createdAt: { gte: today } } }),
            prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
            prisma.device.count({ where: { isSystemBot: false } }),
            prisma.device.count({ where: { status: 'connected', isSystemBot: false } }),
            prisma.device.count({ where: { isSystemBot: true } }),
            prisma.telegramBot.count(),
            prisma.telegramBot.count({ where: { status: 'connected' } }),
            prisma.smmPanel.count(),
            prisma.order.count(),
            prisma.order.count({ where: { createdAt: { gte: today } } }),
            prisma.message.count(),
            prisma.message.count({ where: { createdAt: { gte: today }, type: 'outgoing' } }),
            prisma.message.count({ where: { createdAt: { gte: today }, type: 'incoming' } }),
            prisma.message.count({ where: { status: 'failed' } })
        ]);

        // ── Financial stats ──
        const [
            totalPaymentsReceived,
            totalCreditsDeducted,
            pendingPayments,
            monthlyPayments
        ] = await Promise.all([
            prisma.payment.aggregate({
                _sum: { amount: true },
                where: { status: 'COMPLETED' }
            }),
            prisma.creditTransaction.aggregate({
                _sum: { amount: true },
                where: { type: 'DEBIT' }
            }),
            prisma.payment.count({ where: { status: 'PENDING' } }),
            prisma.payment.aggregate({
                _sum: { amount: true },
                where: { status: 'COMPLETED', completedAt: { gte: thirtyDaysAgo } }
            })
        ]);

        // ── System bot stats ──
        let systemBotStats = { totalSubscribers: 0, activeSubscribers: 0, monthlyRevenue: 0 };
        try {
            const [totalSubs, activeSubs, sbRevenue] = await Promise.all([
                prisma.systemBotSubscription.count(),
                prisma.systemBotSubscription.count({ where: { status: 'ACTIVE' } }),
                prisma.systemBotSubscription.aggregate({
                    _sum: { monthlyFee: true },
                    where: { status: 'ACTIVE' }
                })
            ]);
            systemBotStats = {
                totalSubscribers: totalSubs,
                activeSubscribers: activeSubs,
                monthlyRevenue: sbRevenue._sum.monthlyFee || 0
            };
        } catch (e) {
            // SystemBotSubscription model might not exist yet if migration not run
        }

        // ── Users with active bots (has at least 1 connected device) ──
        const usersWithActiveBots = await prisma.user.count({
            where: {
                devices: {
                    some: { status: 'connected' }
                }
            }
        });

        // ── Monthly subscription stats ──
        let subscriptionStats = { active: 0, revenue: 0 };
        try {
            const [activeMonthlySubs, subRevenue] = await Promise.all([
                prisma.monthlySubscription.count({ where: { status: 'ACTIVE' } }),
                prisma.monthlySubscription.aggregate({
                    _sum: { monthlyFee: true },
                    where: { status: 'ACTIVE' }
                })
            ]);
            subscriptionStats = {
                active: activeMonthlySubs,
                revenue: subRevenue._sum.monthlyFee || 0
            };
        } catch (e) { }

        // ── 7-day trend (messages per day) ──
        const weeklyTrend = [];
        for (let i = 6; i >= 0; i--) {
            const dayStart = new Date(now);
            dayStart.setDate(dayStart.getDate() - i);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(dayStart);
            dayEnd.setHours(23, 59, 59, 999);

            const [sent, received, orders, newUsers] = await Promise.all([
                prisma.message.count({ where: { createdAt: { gte: dayStart, lte: dayEnd }, type: 'outgoing' } }),
                prisma.message.count({ where: { createdAt: { gte: dayStart, lte: dayEnd }, type: 'incoming' } }),
                prisma.order.count({ where: { createdAt: { gte: dayStart, lte: dayEnd } } }),
                prisma.user.count({ where: { createdAt: { gte: dayStart, lte: dayEnd } } })
            ]);

            weeklyTrend.push({
                date: dayStart.toISOString().split('T')[0],
                label: dayStart.toLocaleDateString('en', { weekday: 'short' }),
                sent,
                received,
                orders,
                newUsers
            });
        }

        // ── Recent activity ──
        const recentPayments = await prisma.payment.findMany({
            where: { status: 'COMPLETED' },
            orderBy: { completedAt: 'desc' },
            take: 5,
            select: {
                id: true,
                amount: true,
                method: true,
                completedAt: true,
                user: { select: { username: true, name: true } }
            }
        });

        const recentRegistrations = await prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { id: true, username: true, name: true, email: true, createdAt: true, status: true }
        });

        // ── System health ──
        const memUsage = process.memoryUsage();
        const systemHealth = {
            uptime: process.uptime(),
            uptimeHuman: formatUptime(process.uptime()),
            memory: {
                rss: Math.round(memUsage.rss / 1024 / 1024),
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                heapPercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
            },
            nodeVersion: process.version,
            platform: process.platform
        };

        successResponse(res, {
            users: {
                total: totalUsers,
                active: activeUsers,
                withActiveBots: usersWithActiveBots,
                newToday: newUsersToday,
                newThisWeek: newUsersThisWeek
            },
            devices: {
                whatsapp: { total: totalDevices, connected: connectedDevices, offline: totalDevices - connectedDevices },
                telegram: { total: totalTelegramBots, active: activeTelegramBots },
                systemBots: systemBotDevices
            },
            panels: { total: totalPanels },
            orders: { total: totalOrders, today: todayOrders },
            messages: {
                total: totalMessages,
                todaySent: todayMessagesSent,
                todayReceived: todayMessagesReceived,
                failed: failedMessages
            },
            finance: {
                totalReceived: totalPaymentsReceived._sum.amount || 0,
                totalCreditsUsed: totalCreditsDeducted._sum.amount || 0,
                pendingPayments,
                monthlyRevenue: monthlyPayments._sum.amount || 0,
                subscriptions: subscriptionStats,
                systemBots: systemBotStats
            },
            weeklyTrend,
            recentPayments,
            recentRegistrations,
            systemHealth
        });
    } catch (error) {
        next(error);
    }
});

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

// ==================== SYSTEM CONFIG (Master Admin Only) ====================

// GET /api/admin/config - Get system configuration
router.get('/config', requireMasterAdmin, async (req, res, next) => {
    try {
        const configs = await prisma.systemConfig.findMany({
            orderBy: { category: 'asc' }
        });

        // Group by category with safe JSON parsing
        const grouped = configs.reduce((acc, config) => {
            if (!acc[config.category]) {
                acc[config.category] = [];
            }

            // Safely parse JSON value
            let parsedValue;
            try {
                parsedValue = JSON.parse(config.value);
            } catch (e) {
                // If JSON parse fails, use raw value
                parsedValue = config.value;
            }

            acc[config.category].push({
                key: config.key,
                value: parsedValue
            });
            return acc;
        }, {});

        successResponse(res, grouped);
    } catch (error) {
        next(error);
    }
});

// PUT /api/admin/config - Update system configuration
router.put('/config', requireMasterAdmin, async (req, res, next) => {
    try {
        const { key, value, category } = req.body;

        if (!key || value === undefined) {
            throw new AppError('Key and value are required', 400);
        }

        const config = await prisma.systemConfig.upsert({
            where: { key },
            update: {
                value: JSON.stringify(value),
                category: category || 'general'
            },
            create: {
                key,
                value: JSON.stringify(value),
                category: category || 'general'
            }
        });

        successResponse(res, {
            key: config.key,
            value: JSON.parse(config.value)
        }, 'Configuration updated');
    } catch (error) {
        next(error);
    }
});

// PUT /api/admin/config/bulk - Bulk update system configuration (much faster)
router.put('/config/bulk', requireMasterAdmin, async (req, res, next) => {
    try {
        const { items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new AppError('Items array is required', 400);
        }

        // Use a single transaction for all updates
        const results = await prisma.$transaction(
            items.map(item =>
                prisma.systemConfig.upsert({
                    where: { key: item.key },
                    update: {
                        value: typeof item.value === 'string' ? item.value : JSON.stringify(item.value),
                        category: item.category || 'general'
                    },
                    create: {
                        key: item.key,
                        value: typeof item.value === 'string' ? item.value : JSON.stringify(item.value),
                        category: item.category || 'general'
                    }
                })
            )
        );

        successResponse(res, { updated: results.length }, `Updated ${results.length} configuration items`);
    } catch (error) {
        next(error);
    }
});

// ==================== SYSTEM BOT DEFAULT AUTO-REPLY (1.1) ====================

// GET /api/admin/system-bot/auto-reply - Get System Bot default auto-reply settings
router.get('/system-bot/auto-reply', requireMasterAdmin, async (req, res, next) => {
    try {
        const config = await prisma.systemConfig.findUnique({
            where: { key: 'system_bot_auto_reply' }
        });

        const defaults = {
            enabled: true,
            message: 'This is only a bot. We cannot reply manually. This WhatsApp is used for bot replies only. For SMM Bot queries, please contact our official support.',
            triggerType: 'all', // personal, group, all
            callEnabled: true,
            callMessage: '📵 This is an automated bot. We cannot answer calls. Please send a text message instead.'
        };

        const settings = config ? { ...defaults, ...JSON.parse(config.value) } : defaults;
        successResponse(res, settings, 'System Bot auto-reply settings retrieved');
    } catch (error) {
        next(error);
    }
});

// PUT /api/admin/system-bot/auto-reply - Update System Bot default auto-reply settings
router.put('/system-bot/auto-reply', requireMasterAdmin, async (req, res, next) => {
    try {
        const { enabled, message, triggerType, callEnabled, callMessage } = req.body;

        // Read existing config first to merge (avoid losing fields on partial update)
        const existing = await prisma.systemConfig.findUnique({
            where: { key: 'system_bot_auto_reply' }
        });
        const currentSettings = existing ? JSON.parse(existing.value) : {
            enabled: true,
            message: 'This is only a bot. We cannot reply manually. This WhatsApp is used for bot replies only.',
            triggerType: 'all',
            callEnabled: true,
            callMessage: '📵 This is an automated bot. We cannot answer calls. Please send a text message instead.'
        };

        // Merge updates into existing settings
        if (enabled !== undefined) currentSettings.enabled = Boolean(enabled);
        if (message !== undefined) currentSettings.message = String(message);
        if (triggerType !== undefined) {
            if (!['personal', 'group', 'all'].includes(triggerType)) {
                throw new AppError('triggerType must be personal, group, or all', 400);
            }
            currentSettings.triggerType = triggerType;
        }
        if (callEnabled !== undefined) currentSettings.callEnabled = Boolean(callEnabled);
        if (callMessage !== undefined) currentSettings.callMessage = String(callMessage);

        const config = await prisma.systemConfig.upsert({
            where: { key: 'system_bot_auto_reply' },
            update: { value: JSON.stringify(currentSettings), category: 'system_bot' },
            create: { key: 'system_bot_auto_reply', value: JSON.stringify(currentSettings), category: 'system_bot' }
        });

        successResponse(res, JSON.parse(config.value), 'System Bot auto-reply settings updated');
    } catch (error) {
        next(error);
    }
});

// ==================== USER DEVICES MANAGEMENT ====================

// GET /api/admin/users/:id/devices - Get user's devices
router.get('/users/:id/devices', async (req, res, next) => {
    try {
        const devices = await prisma.device.findMany({
            where: { userId: req.params.id },
            orderBy: { createdAt: 'desc' }
        });

        successResponse(res, devices);
    } catch (error) {
        next(error);
    }
});

// POST /api/admin/users/:id/disconnect-devices - Force disconnect all user devices
router.post('/users/:id/disconnect-devices', async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            include: { devices: true }
        });

        if (!user) {
            throw new AppError('User not found', 404);
        }

        // Get WhatsApp service from app
        const whatsappService = req.app.get('whatsapp');

        let disconnectedCount = 0;
        for (const device of user.devices) {
            try {
                // Try to disconnect via WhatsApp service
                if (whatsappService) {
                    await whatsappService.logout(device.id);
                }
                disconnectedCount++;
            } catch (err) {
                console.error(`[Admin] Failed to disconnect device ${device.id}:`, err.message);
            }
        }

        // Update all devices to disconnected status
        await prisma.device.updateMany({
            where: { userId: req.params.id },
            data: { status: 'disconnected' }
        });

        successResponse(res, { disconnectedCount }, `Disconnected ${disconnectedCount} device(s)`);
    } catch (error) {
        next(error);
    }
});

// POST /api/admin/devices/:id/disconnect - Force disconnect a specific device
router.post('/devices/:id/disconnect', async (req, res, next) => {
    try {
        const device = await prisma.device.findUnique({
            where: { id: req.params.id }
        });

        if (!device) {
            throw new AppError('Device not found', 404);
        }

        // Get WhatsApp service from app
        const whatsappService = req.app.get('whatsapp');

        if (whatsappService) {
            try {
                await whatsappService.logout(device.id);
            } catch (err) {
                console.error(`[Admin] Failed to disconnect device ${device.id}:`, err.message);
            }
        }

        // Update device status
        await prisma.device.update({
            where: { id: req.params.id },
            data: { status: 'disconnected' }
        });

        successResponse(res, null, 'Device disconnected successfully');
    } catch (error) {
        next(error);
    }
});

// ==================== MASTER ADMIN: MESSAGE INSPECTION ====================

// GET /api/admin/messages - Get all messages (Master Admin only)
router.get('/messages', requireMasterAdmin, async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { userId, deviceId, platform, type, search } = req.query;

        const where = {};

        if (userId) {
            // Get devices for user first
            const devices = await prisma.device.findMany({
                where: { userId },
                select: { id: true }
            });
            where.deviceId = { in: devices.map(d => d.id) };
        }

        if (deviceId) {
            where.deviceId = deviceId;
        }

        if (platform) {
            where.platform = platform;
        }

        if (type) {
            where.type = type;
        }

        if (search) {
            where.OR = [
                { message: { contains: search, mode: 'insensitive' } },
                { to: { contains: search, mode: 'insensitive' } },
                { from: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [messages, total] = await Promise.all([
            prisma.message.findMany({
                where,
                include: {
                    device: {
                        select: {
                            id: true,
                            name: true,
                            phoneNumber: true,
                            user: {
                                select: {
                                    id: true,
                                    username: true,
                                    name: true
                                }
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip
            }),
            prisma.message.count({ where })
        ]);

        paginatedResponse(res, messages, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// ==================== MASTER ADMIN: CONTACT BACKUP ====================

// GET /api/admin/contacts/backup - Get all contacts for backup (Master Admin only)
router.get('/contacts/backup', requireMasterAdmin, async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { userId } = req.query;

        const where = userId ? { userId } : {};

        const [contacts, total] = await Promise.all([
            prisma.contact.findMany({
                where,
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            name: true
                        }
                    }
                },
                orderBy: { updatedAt: 'desc' },
                take: limit,
                skip
            }),
            prisma.contact.count({ where })
        ]);

        paginatedResponse(res, contacts, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// POST /api/admin/contacts/export - Export all contacts as JSON (Master Admin only)
router.post('/contacts/export', requireMasterAdmin, async (req, res, next) => {
    try {
        const contacts = await prisma.contact.findMany({
            include: {
                user: {
                    select: {
                        id: true,
                        username: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const exportData = {
            exportedAt: new Date().toISOString(),
            totalContacts: contacts.length,
            exportedBy: req.user.username,
            contacts: contacts.map(c => ({
                name: c.name,
                phone: c.phone,
                email: c.email,
                username: c.user.username,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt
            }))
        };

        successResponse(res, exportData, `Exported ${contacts.length} contacts`);
    } catch (error) {
        next(error);
    }
});

// ==================== MASTER ADMIN: USER MONITORING ====================

// GET /api/admin/users/:id/activity - Get detailed user activity (Master Admin only)
router.get('/users/:id/activity', requireMasterAdmin, async (req, res, next) => {
    try {
        const userId = req.params.id;

        // Get recent logins
        const recentLogins = await prisma.loginHistory.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        // Get recent credit transactions
        const recentTransactions = await prisma.creditTransaction.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        // Get recent messages (via devices)
        const devices = await prisma.device.findMany({
            where: { userId },
            select: { id: true }
        });

        const recentMessages = await prisma.message.findMany({
            where: {
                deviceId: { in: devices.map(d => d.id) }
            },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        // Get recent orders
        const recentOrders = await prisma.order.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
                panel: {
                    select: { name: true, alias: true }
                }
            }
        });

        // Get stats
        const [
            totalMessages,
            totalOrders,
            totalTransactions,
            totalLogins
        ] = await Promise.all([
            prisma.message.count({
                where: { deviceId: { in: devices.map(d => d.id) } }
            }),
            prisma.order.count({ where: { userId } }),
            prisma.creditTransaction.count({ where: { userId } }),
            prisma.loginHistory.count({ where: { userId } })
        ]);

        successResponse(res, {
            stats: {
                totalMessages,
                totalOrders,
                totalTransactions,
                totalLogins
            },
            recentLogins,
            recentTransactions,
            recentMessages,
            recentOrders
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/admin/online-users - Get currently online/active users (Master Admin only)
router.get('/online-users', requireMasterAdmin, async (req, res, next) => {
    try {
        // Get users with connected devices
        const onlineUsers = await prisma.user.findMany({
            where: {
                devices: {
                    some: {
                        status: 'connected'
                    }
                }
            },
            select: {
                id: true,
                username: true,
                name: true,
                lastLoginAt: true,
                lastLoginIp: true,
                devices: {
                    where: { status: 'connected' },
                    select: {
                        id: true,
                        name: true,
                        phoneNumber: true,
                        status: true
                    }
                }
            }
        });

        successResponse(res, {
            count: onlineUsers.length,
            users: onlineUsers
        });
    } catch (error) {
        next(error);
    }
});

// ==================== ACTIVITY LOGS (Master Admin Only) ====================

const { activityLogService } = require('../services/activityLog');

// GET /api/admin/activity-logs - Get activity logs
router.get('/activity-logs', requireMasterAdmin, async (req, res, next) => {
    try {
        const { page, limit } = parsePagination(req.query);
        const { userId, action, category, status, startDate, endDate } = req.query;

        const result = await activityLogService.getLogs({
            userId,
            action,
            category,
            status,
            startDate,
            endDate,
            page,
            limit
        });

        paginatedResponse(res, result.logs, result.pagination);
    } catch (error) {
        next(error);
    }
});

// GET /api/admin/activity-logs/stats - Get activity log statistics
router.get('/activity-logs/stats', requireMasterAdmin, async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        const stats = await activityLogService.getStats(startDate, endDate);
        successResponse(res, stats);
    } catch (error) {
        next(error);
    }
});

// DELETE /api/admin/activity-logs/cleanup - Clean old logs
router.delete('/activity-logs/cleanup', requireMasterAdmin, async (req, res, next) => {
    try {
        const { daysToKeep = 30 } = req.body;
        const deletedCount = await activityLogService.cleanOldLogs(parseInt(daysToKeep));
        successResponse(res, { deletedCount }, `Cleaned ${deletedCount} old log entries`);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
