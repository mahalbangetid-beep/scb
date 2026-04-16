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
                    },
                    smmPanels: {
                        select: {
                            id: true,
                            name: true,
                            alias: true,
                            url: true,
                            panelType: true,
                            supportsAdminApi: true,
                            isActive: true
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

        // Only Master Admin can change any user's role
        if (role && role !== existingUser.role) {
            if (req.user.role !== ROLES.MASTER_ADMIN) {
                throw new AppError('Only Master Admin can change user roles', 403);
            }
        }

        // Validate creditBalance if provided
        const oldBalance = existingUser.creditBalance || 0;
        let creditAdjustment = null;
        let parsedCreditBalance = null;

        if (creditBalance !== undefined) {
            parsedCreditBalance = parseFloat(creditBalance);
            if (isNaN(parsedCreditBalance) || parsedCreditBalance < 0) {
                throw new AppError('Credit balance must be a non-negative number', 400);
            }
            creditAdjustment = parsedCreditBalance - oldBalance;
        }

        // Build profile update data
        const profileUpdateData = {
            ...(name && { name }),
            ...(status && { status }),
            ...(role && { role }),
            ...(discountRate !== undefined && { discountRate: parseFloat(discountRate) }),
            ...(customWaRate !== undefined && { customWaRate: customWaRate ? parseFloat(customWaRate) : null }),
            ...(customTgRate !== undefined && { customTgRate: customTgRate ? parseFloat(customTgRate) : null }),
            ...(customGroupRate !== undefined && { customGroupRate: customGroupRate ? parseFloat(customGroupRate) : null }),
            ...(isActive !== undefined && { isActive })
        };

        // Atomic transaction: profile update + credit adjustment together
        const user = await prisma.$transaction(async (tx) => {
            // 1. Handle credit adjustment first (can fail if insufficient balance)
            if (creditAdjustment !== null && creditAdjustment !== 0) {
                const description = `Admin adjustment by ${req.user.username}`;
                const reference = `ADMIN_${req.user.id}`;

                // Read current balance inside transaction
                const currentUser = await tx.user.findUnique({
                    where: { id: req.params.id },
                    select: { creditBalance: true }
                });
                const balanceBefore = currentUser.creditBalance || 0;
                const newBalance = balanceBefore + creditAdjustment;

                if (newBalance < 0) {
                    throw new AppError('Insufficient balance for deduction', 400);
                }

                // Update credit balance
                profileUpdateData.creditBalance = newBalance;

                // Create transaction record
                await tx.creditTransaction.create({
                    data: {
                        userId: req.params.id,
                        type: creditAdjustment > 0 ? 'CREDIT' : 'DEBIT',
                        amount: Math.abs(creditAdjustment),
                        balanceBefore,
                        balanceAfter: newBalance,
                        description,
                        reference
                    }
                });
            }

            // 2. Update user profile + credit balance atomically
            const updatedUser = await tx.user.update({
                where: { id: req.params.id },
                data: profileUpdateData,
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

            return { updatedUser, creditAdjustment, balanceBefore: currentUser?.creditBalance || oldBalance, newBalance: updatedUser.creditBalance };
        });

        successResponse(res, user.updatedUser, 'User updated successfully');

        // Send WhatsApp notification for credit adjustment (fire-and-forget)
        if (user.creditAdjustment && user.creditAdjustment > 0) {
            try {
                const userNotificationService = require('../services/userNotificationService');
                // req.user.id = admin who owns the devices & mappings (no effectiveUserId in admin routes)
                userNotificationService.sendPaymentNotification(req.user.id, user.updatedUser.username, {
                    amount: Math.abs(user.creditAdjustment),
                    type: 'credit',
                    method: 'Admin Top-Up',
                    newBalance: user.updatedUser.creditBalance,
                    currency: 'USD'
                }).catch(e => console.log('[Admin] Payment notification failed:', e.message));
            } catch (notifErr) { /* non-critical */ }
        }
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

        // Send WhatsApp notification for credit adjustment (fire-and-forget)
        if (type === 'CREDIT') {
            try {
                console.log(`[Admin] 🔔 Triggering payment notification: adminId=${req.user.id}, targetUser=${user.username}, amount=${adjustAmount}`);
                const userNotificationService = require('../services/userNotificationService');
                // req.user.id = admin who owns the devices & mappings (no effectiveUserId in admin routes)
                userNotificationService.sendPaymentNotification(req.user.id, user.username, {
                    amount: adjustAmount,
                    type: 'credit',
                    method: 'Admin Top-Up',
                    newBalance: result.balanceAfter,
                    currency: 'USD'
                }).catch(e => console.log('[Admin] Payment notification failed:', e.message));
            } catch (notifErr) { /* non-critical */ }
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

        if (req.params.id === req.user.id) {
            throw new AppError('Cannot suspend yourself', 400);
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

        if (req.params.id === req.user.id) {
            throw new AppError('Cannot ban yourself', 400);
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
        const user = await prisma.user.findUnique({
            where: { id: req.params.id }
        });

        if (!user) {
            throw new AppError('User not found', 404);
        }

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
                            canDelete: true,
                            userId: true,
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
        const { username, email, password, name, permissions, scopeUserId } = req.body;

        if (!username || !email || !password || !name) {
            throw new AppError('Username, email, password, and name are required', 400);
        }

        if (password.length < 8) {
            throw new AppError('Password must be at least 8 characters', 400);
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

        // Validate scopeUserId if provided
        if (scopeUserId) {
            const scopeUser = await prisma.user.findUnique({ where: { id: scopeUserId } });
            if (!scopeUser) {
                throw new AppError('Scope user not found', 404);
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create staff user with permissions
        // userId = scopeUserId (specific user) or null (global — can manage all users)
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
                        userId: scopeUserId || null,
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

        // Validate permissions BEFORE deleting existing ones (to avoid data loss on invalid input)
        const { scopeUserId } = req.body;
        if (permissions && permissions.length > 0) {
            const VALID_PERMISSIONS = [
                'user_view', 'user_edit', 'user_suspend', 'user_credit',
                'order_view', 'order_manage',
                'payment_view', 'payment_approve',
                'voucher_manage', 'device_manage', 'panel_manage',
                'reports_view', 'support',
                'contacts_view', 'broadcast_manage', 'bot_settings',
                'keyword_view', 'dashboard_view'
            ];

            const permKeys = permissions.map(p => typeof p === 'string' ? p : p.permission);
            const invalid = permKeys.filter(k => !VALID_PERMISSIONS.includes(k));
            if (invalid.length > 0) {
                throw new AppError(`Invalid permissions: ${invalid.join(', ')}`, 400);
            }
        }

        // Delete existing and create new in sequence (validation already passed)
        await prisma.staffPermission.deleteMany({
            where: { staffId: req.params.id }
        });

        if (permissions && permissions.length > 0) {
            await prisma.staffPermission.createMany({
                data: permissions.map(p => {
                    const permKey = typeof p === 'string' ? p : p.permission;
                    return {
                        staffId: req.params.id,
                        userId: scopeUserId || null,
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

        // ── 7-day trend (messages per day) — optimized: 3 queries instead of 28 ──
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - 6);
        weekStart.setHours(0, 0, 0, 0);

        const [messagesByDay, ordersByDayRaw, usersByDayRaw] = await Promise.all([
            prisma.$queryRaw`
                SELECT DATE("createdAt") as day, type, COUNT(*)::int as count
                FROM "Message"
                WHERE "createdAt" >= ${weekStart}
                GROUP BY DATE("createdAt"), type
                ORDER BY day
            `.catch(() => []),
            prisma.$queryRaw`
                SELECT DATE("createdAt") as day, COUNT(*)::int as count
                FROM "Order"
                WHERE "createdAt" >= ${weekStart}
                GROUP BY DATE("createdAt")
                ORDER BY day
            `.catch(() => []),
            prisma.$queryRaw`
                SELECT DATE("createdAt") as day, COUNT(*)::int as count
                FROM "User"
                WHERE "createdAt" >= ${weekStart}
                GROUP BY DATE("createdAt")
                ORDER BY day
            `.catch(() => [])
        ]);

        // Build lookup maps from raw query results
        const sentByDay = {};
        const receivedByDay = {};
        const ordersMap = {};
        const usersMap = {};

        for (const row of (messagesByDay || [])) {
            const dayStr = new Date(row.day).toISOString().split('T')[0];
            if (row.type === 'outgoing') sentByDay[dayStr] = row.count;
            if (row.type === 'incoming') receivedByDay[dayStr] = row.count;
        }
        for (const row of (ordersByDayRaw || [])) {
            const dayStr = new Date(row.day).toISOString().split('T')[0];
            ordersMap[dayStr] = row.count;
        }
        for (const row of (usersByDayRaw || [])) {
            const dayStr = new Date(row.day).toISOString().split('T')[0];
            usersMap[dayStr] = row.count;
        }

        const weeklyTrend = [];
        for (let i = 6; i >= 0; i--) {
            const day = new Date(now);
            day.setDate(day.getDate() - i);
            day.setHours(0, 0, 0, 0);
            const dayStr = day.toISOString().split('T')[0];

            weeklyTrend.push({
                date: dayStr,
                label: day.toLocaleDateString('en', { weekday: 'short' }),
                sent: sentByDay[dayStr] || 0,
                received: receivedByDay[dayStr] || 0,
                orders: ordersMap[dayStr] || 0,
                newUsers: usersMap[dayStr] || 0
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

// ==================== DEFAULT CHARGES PAGE (Section 14) ====================

// GET /api/admin/charges - Get all charges & rates in one place
router.get('/charges', requireMasterAdmin, async (req, res, next) => {
    try {
        // 1. Message rates from SystemConfig (category: pricing)
        const pricingConfigs = await prisma.systemConfig.findMany({
            where: { category: 'pricing' }
        });

        const pricingMap = {};
        for (const c of pricingConfigs) {
            try { pricingMap[c.key] = JSON.parse(c.value); }
            catch { pricingMap[c.key] = c.value; }
        }

        // 2. Subscription fees (try SystemConfig, fallback to defaults)
        const subscriptionKeys = ['SUBSCRIPTION_FEE_DEVICE', 'SUBSCRIPTION_FEE_TELEGRAM_BOT', 'SUBSCRIPTION_FEE_SMM_PANEL'];
        const subConfigs = await prisma.systemConfig.findMany({
            where: { key: { in: subscriptionKeys } }
        });
        const subMap = {};
        for (const c of subConfigs) {
            try { subMap[c.key] = JSON.parse(c.value); }
            catch { subMap[c.key] = parseFloat(c.value) || 0; }
        }

        // 3. Credit packages
        const creditPackages = await prisma.creditPackage.findMany({
            orderBy: { sortOrder: 'asc' }
        });

        // 4. Per-message type rates (Section 2.1)
        const creditServiceInstance = require('../services/creditService');
        const typeDefaults = creditServiceInstance.constructor.MESSAGE_TYPE_DEFAULTS || {};
        const messageTypeRates = {};
        for (const [key, defaultVal] of Object.entries(typeDefaults)) {
            // If admin has configured this type, use it; otherwise use default
            if (pricingMap[key] && typeof pricingMap[key] === 'object') {
                messageTypeRates[key] = pricingMap[key];
            } else {
                messageTypeRates[key] = { ...defaultVal };
            }
        }

        // Build unified response
        const charges = {
            messageRates: {
                wa_message_rate: pricingMap.wa_message_rate ?? 0.01,
                tg_message_rate: pricingMap.tg_message_rate ?? 0.01,
                group_message_rate: pricingMap.group_message_rate ?? 0.02,
            },
            loginFees: {
                wa_login_fee: pricingMap.wa_login_fee ?? 5.00,
                tg_login_fee: pricingMap.tg_login_fee ?? 5.00,
            },
            subscriptionFees: {
                DEVICE: subMap.SUBSCRIPTION_FEE_DEVICE ?? 5.00,
                TELEGRAM_BOT: subMap.SUBSCRIPTION_FEE_TELEGRAM_BOT ?? 3.00,
                SMM_PANEL: subMap.SUBSCRIPTION_FEE_SMM_PANEL ?? 2.00,
            },
            creditPackages: creditPackages.map(p => ({
                id: p.id,
                name: p.name,
                description: p.description,
                category: p.category,
                price: p.price,
                credits: p.credits,
                bonusCredits: p.bonusCredits,
                discountPct: p.discountPct,
                isActive: p.isActive,
                isFeatured: p.isFeatured,
                sortOrder: p.sortOrder,
            })),
            messageTypeRates,
            other: {
                low_balance_threshold: pricingMap.low_balance_threshold ?? 5.00,
                low_credit_notify_enabled: pricingMap.low_credit_notify_enabled ?? true,
                low_credit_notify_threshold: pricingMap.low_credit_notify_threshold ?? 50,
                default_user_credit: pricingMap.default_user_credit ?? 0,
                free_signup_credits: pricingMap.free_signup_credits ?? 100,
                free_signup_support_credits: pricingMap.free_signup_support_credits ?? pricingMap.free_signup_credits ?? 100,
                free_signup_whatsapp_credits: pricingMap.free_signup_whatsapp_credits ?? 0,
                free_signup_telegram_credits: pricingMap.free_signup_telegram_credits ?? 0,
            }
        };

        successResponse(res, charges);
    } catch (error) {
        next(error);
    }
});

// PUT /api/admin/charges - Update all charges at once
router.put('/charges', requireMasterAdmin, async (req, res, next) => {
    try {
        const { messageRates, loginFees, subscriptionFees, other } = req.body;

        const upserts = [];

        // Validate and build upserts for message rates
        if (messageRates) {
            for (const [key, value] of Object.entries(messageRates)) {
                const num = parseFloat(value);
                if (isNaN(num) || num < 0) {
                    throw new AppError(`Invalid value for ${key}: must be a non-negative number`, 400);
                }
                upserts.push(prisma.systemConfig.upsert({
                    where: { key },
                    update: { value: JSON.stringify(num), category: 'pricing' },
                    create: { key, value: JSON.stringify(num), category: 'pricing' }
                }));
            }
        }

        // Login fees
        if (loginFees) {
            for (const [key, value] of Object.entries(loginFees)) {
                const num = parseFloat(value);
                if (isNaN(num) || num < 0) {
                    throw new AppError(`Invalid value for ${key}: must be a non-negative number`, 400);
                }
                upserts.push(prisma.systemConfig.upsert({
                    where: { key },
                    update: { value: JSON.stringify(num), category: 'pricing' },
                    create: { key, value: JSON.stringify(num), category: 'pricing' }
                }));
            }
        }

        // Subscription fees
        if (subscriptionFees) {
            for (const [rtype, value] of Object.entries(subscriptionFees)) {
                const num = parseFloat(value);
                if (isNaN(num) || num < 0) {
                    throw new AppError(`Invalid subscription fee for ${rtype}: must be a non-negative number`, 400);
                }
                const key = `SUBSCRIPTION_FEE_${rtype}`;
                upserts.push(prisma.systemConfig.upsert({
                    where: { key },
                    update: { value: JSON.stringify(num), category: 'pricing' },
                    create: { key, value: JSON.stringify(num), category: 'pricing' }
                }));
            }
        }

        // Other settings
        if (other) {
            for (const [key, value] of Object.entries(other)) {
                // Support boolean values (e.g., low_credit_notify_enabled)
                if (typeof value === 'boolean') {
                    upserts.push(prisma.systemConfig.upsert({
                        where: { key },
                        update: { value: JSON.stringify(value), category: 'pricing' },
                        create: { key, value: JSON.stringify(value), category: 'pricing' }
                    }));
                    continue;
                }
                const num = parseFloat(value);
                if (isNaN(num) || num < 0) {
                    throw new AppError(`Invalid value for ${key}: must be a non-negative number`, 400);
                }
                upserts.push(prisma.systemConfig.upsert({
                    where: { key },
                    update: { value: JSON.stringify(num), category: 'pricing' },
                    create: { key, value: JSON.stringify(num), category: 'pricing' }
                }));
            }
        }

        // Per-message type rates (Section 2.1)
        const { messageTypeRates } = req.body;
        if (messageTypeRates) {
            for (const [key, config] of Object.entries(messageTypeRates)) {
                if (typeof config !== 'object') {
                    throw new AppError(`Invalid config for ${key}: must be an object with {enabled, rate}`, 400);
                }
                const rate = parseFloat(config.rate);
                if (isNaN(rate) || rate < 0) {
                    throw new AppError(`Invalid rate for ${key}: must be a non-negative number`, 400);
                }
                const value = JSON.stringify({ enabled: config.enabled !== false, rate });
                upserts.push(prisma.systemConfig.upsert({
                    where: { key },
                    update: { value, category: 'pricing' },
                    create: { key, value, category: 'pricing' }
                }));
            }
        }

        if (upserts.length === 0) {
            throw new AppError('No charges to update', 400);
        }

        // Atomic transaction
        await prisma.$transaction(upserts);

        // Invalidate credit service caches so new prices take effect immediately
        try {
            const creditService = require('../services/creditService');
            creditService.clearCache();
        } catch (e) { /* ignore */ }
        try {
            const messageCreditService = require('../services/messageCreditService');
            messageCreditService.clearCache();
        } catch (e) { /* ignore */ }

        successResponse(res, { updated: upserts.length }, `Updated ${upserts.length} charge settings`);
    } catch (error) {
        next(error);
    }
});

// ==================== CREDIT DEDUCTION LOG (Section 2.1) ====================
// Running log of credit deductions per message type for admin review

// GET /api/admin/credit-deduction-log - Global credit deduction log with filters
router.get('/credit-deduction-log', requireMasterAdmin, async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);
        const { type, userId, from, to, search } = req.query;

        const where = { type: 'DEBIT' };

        // Filter by user
        if (userId) {
            where.userId = userId;
        }

        // Filter by message type keyword in description
        if (type && type !== 'all') {
            where.description = { contains: type.replace(/_/g, ' '), mode: 'insensitive' };
        }

        // Search in description
        if (search) {
            where.description = { contains: search, mode: 'insensitive' };
        }

        // Date range filter
        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(from);
            if (to) {
                const toDate = new Date(to);
                toDate.setHours(23, 59, 59, 999);
                where.createdAt.lte = toDate;
            }
        }

        const [transactions, total, summary] = await Promise.all([
            prisma.creditTransaction.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip,
                include: {
                    user: { select: { id: true, username: true, name: true, email: true } }
                }
            }),
            prisma.creditTransaction.count({ where }),
            // Summary: total deducted amount
            prisma.creditTransaction.aggregate({
                where,
                _sum: { amount: true },
                _count: true
            })
        ]);

        paginatedResponse(res, {
            transactions,
            summary: {
                totalDeducted: summary._sum.amount || 0,
                totalTransactions: summary._count || 0
            }
        }, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// GET /api/admin/credit-deduction-summary - Aggregate deductions by message type
router.get('/credit-deduction-summary', requireMasterAdmin, async (req, res, next) => {
    try {
        const { from, to } = req.query;
        const where = { type: 'DEBIT' };

        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(from);
            if (to) {
                const toDate = new Date(to);
                toDate.setHours(23, 59, 59, 999);
                where.createdAt.lte = toDate;
            }
        }

        // Get all debit transactions and group by description keyword
        const transactions = await prisma.creditTransaction.findMany({
            where,
            select: { description: true, amount: true }
        });

        // Group by message type extracted from description
        const byType = {};
        for (const tx of transactions) {
            // Description format: "WHATSAPP wa keyword response" or "TELEGRAM tg forward"
            const key = tx.description || 'unknown';
            if (!byType[key]) {
                byType[key] = { count: 0, total: 0 };
            }
            byType[key].count++;
            byType[key].total += tx.amount;
        }

        // Sort by total descending
        const sorted = Object.entries(byType)
            .map(([type, data]) => ({ type, count: data.count, total: Math.round(data.total * 100) / 100 }))
            .sort((a, b) => b.total - a.total);

        successResponse(res, {
            breakdown: sorted,
            totalTypes: sorted.length,
            grandTotal: Math.round(sorted.reduce((sum, s) => sum + s.total, 0) * 100) / 100
        });
    } catch (error) {
        next(error);
    }
});

// ==================== INVOICE TEMPLATE (Master Admin Only) ====================

// GET /api/admin/invoice-template - Get invoice template config
router.get('/invoice-template', requireMasterAdmin, async (req, res, next) => {
    try {
        const config = await prisma.systemConfig.findUnique({
            where: { key: 'invoice_template' }
        });

        const defaults = {
            companyName: 'DICREWA',
            tagline: 'SMM Automation Platform',
            address: '',
            phone: '',
            email: 'support@dicrewa.com',
            website: '',
            logoUrl: '',
            accentColor: '#6c5ce7',
            footerText: 'Thank you for your payment!',
            footerSubtext: 'This invoice was generated automatically.',
        };

        const settings = config ? { ...defaults, ...JSON.parse(config.value) } : defaults;
        successResponse(res, settings);
    } catch (error) {
        next(error);
    }
});

// PUT /api/admin/invoice-template - Update invoice template config
router.put('/invoice-template', requireMasterAdmin, async (req, res, next) => {
    try {
        const {
            companyName, tagline, address, phone, email, website,
            logoUrl, accentColor, footerText, footerSubtext
        } = req.body;

        // Validate accent color format
        if (accentColor && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
            throw new AppError('Accent color must be a valid hex code (e.g. #6c5ce7)', 400);
        }

        // Read existing config first to merge
        const existing = await prisma.systemConfig.findUnique({
            where: { key: 'invoice_template' }
        });
        const current = existing ? JSON.parse(existing.value) : {};

        // Merge updates
        const updated = { ...current };
        if (companyName !== undefined) updated.companyName = String(companyName).slice(0, 200);
        if (tagline !== undefined) updated.tagline = String(tagline).slice(0, 200);
        if (address !== undefined) updated.address = String(address).slice(0, 500);
        if (phone !== undefined) updated.phone = String(phone).slice(0, 50);
        if (email !== undefined) updated.email = String(email).slice(0, 200);
        if (website !== undefined) updated.website = String(website).slice(0, 200);
        if (logoUrl !== undefined) updated.logoUrl = String(logoUrl).slice(0, 500);
        if (accentColor !== undefined) updated.accentColor = accentColor;
        if (footerText !== undefined) updated.footerText = String(footerText).slice(0, 300);
        if (footerSubtext !== undefined) updated.footerSubtext = String(footerSubtext).slice(0, 300);

        await prisma.systemConfig.upsert({
            where: { key: 'invoice_template' },
            update: { value: JSON.stringify(updated), category: 'invoice' },
            create: { key: 'invoice_template', value: JSON.stringify(updated), category: 'invoice' }
        });

        // Clear cached template in invoiceService
        try {
            const invoiceService = require('../services/invoiceService');
            invoiceService._templateConfig = null;
        } catch { /* ignore */ }

        successResponse(res, updated, 'Invoice template updated');
    } catch (error) {
        next(error);
    }
});

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
                            phone: true,
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

// POST /api/admin/contacts/export - Export all contacts as CSV stream (Master Admin only)
router.post('/contacts/export', requireMasterAdmin, async (req, res, next) => {
    try {
        const MAX_EXPORT = 500000; // Safety cap
        const BATCH_SIZE = 1000;

        // Get total count first
        const totalContacts = await prisma.contact.count();
        if (totalContacts > MAX_EXPORT) {
            throw new AppError(`Too many contacts to export (${totalContacts}). Maximum is ${MAX_EXPORT}`, 400);
        }

        // Set CSV response headers
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="contacts_export_${new Date().toISOString().split('T')[0]}.csv"`);

        // Write CSV header
        res.write('name,phone,email,username,createdAt,updatedAt\n');

        // Stream contacts in batches to avoid OOM
        let cursor = undefined;
        let exported = 0;

        while (true) {
            const batch = await prisma.contact.findMany({
                take: BATCH_SIZE,
                ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
                include: {
                    user: {
                        select: { username: true }
                    }
                },
                orderBy: { id: 'asc' }
            });

            if (batch.length === 0) break;

            // Write CSV rows
            for (const c of batch) {
                const row = [
                    `"${(c.name || '').replace(/"/g, '""')}"`,
                    `"${(c.phone || '').replace(/"/g, '""')}"`,
                    `"${(c.email || '').replace(/"/g, '""')}"`,
                    `"${(c.user?.username || '').replace(/"/g, '""')}"`,
                    c.createdAt ? c.createdAt.toISOString() : '',
                    c.updatedAt ? c.updatedAt.toISOString() : ''
                ].join(',');
                res.write(row + '\n');
            }

            exported += batch.length;
            cursor = batch[batch.length - 1].id;

            if (batch.length < BATCH_SIZE) break;
        }

        res.end();
    } catch (error) {
        // If headers already sent, can't use normal error handler
        if (res.headersSent) {
            res.end();
            return;
        }
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
                        phone: true,
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
        // Read from query params (preferred for DELETE) or body (backward compatible)
        const daysToKeep = parseInt(req.query.daysToKeep || req.body?.daysToKeep || 30);
        const deletedCount = await activityLogService.cleanOldLogs(daysToKeep);
        successResponse(res, { deletedCount }, `Cleaned ${deletedCount} old log entries`);
    } catch (error) {
        next(error);
    }
});

// ==================== SPAM BAN MANAGEMENT ====================

// GET /api/admin/spam-bans - List active spam bans
router.get('/spam-bans', async (req, res, next) => {
    try {
        const botMessageHandler = require('../services/botMessageHandler');
        const bans = botMessageHandler.getDisabledUsers();
        successResponse(res, { bans, total: bans.length });
    } catch (error) {
        next(error);
    }
});

// DELETE /api/admin/spam-bans/:userId/:senderNumber - Unban specific user
router.delete('/spam-bans/:userId/:senderNumber', async (req, res, next) => {
    try {
        const botMessageHandler = require('../services/botMessageHandler');
        const { userId, senderNumber } = req.params;
        const wasRemoved = botMessageHandler.unbanUser(userId, senderNumber);
        successResponse(res, { removed: wasRemoved }, wasRemoved ? 'User unbanned' : 'User was not banned');
    } catch (error) {
        next(error);
    }
});

// DELETE /api/admin/spam-bans - Clear all spam bans
router.delete('/spam-bans', async (req, res, next) => {
    try {
        const botMessageHandler = require('../services/botMessageHandler');
        const count = botMessageHandler.clearAllBans();
        successResponse(res, { cleared: count }, `Cleared ${count} spam bans`);
    } catch (error) {
        next(error);
    }
});

// ==================== PROVIDER PANEL OVERVIEW (Section 10) ====================

// GET /api/admin/panels - List all SMM panels across all users (Master Admin)
router.get('/panels', requireMasterAdmin, async (req, res, next) => {
    try {
        const { search } = req.query;

        const where = {};
        if (search) {
            where.OR = [
                { alias: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
                { url: { contains: search, mode: 'insensitive' } }
            ];
        }

        const panels = await prisma.smmPanel.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                alias: true,
                name: true,
                url: true,
                panelType: true,
                apiFormat: true,
                supportsAdminApi: true,
                balance: true,
                currency: true,
                isActive: true,
                isPrimary: true,
                lastSyncAt: true,
                capabilities: true,
                createdAt: true,
                user: { select: { id: true, username: true, email: true } },
                providerGroups: {
                    select: { providerName: true, groupName: true, type: true, isActive: true },
                    orderBy: { providerName: 'asc' }
                },
                _count: {
                    select: {
                        orders: true,
                        providerGroups: true,
                        devices: true
                    }
                }
            }
        });

        // Extract domain from URL for display (never expose full API keys)
        const panelList = panels.map(p => {
            let domain = p.url;
            try {
                domain = new URL(p.url).hostname;
            } catch { /* use raw url */ }

            return {
                id: p.id,
                alias: p.alias,
                name: p.name,
                domain,
                url: p.url,
                panelType: p.panelType,
                apiFormat: p.apiFormat,
                hasAdminApi: p.supportsAdminApi,
                balance: p.balance,
                currency: p.currency,
                isActive: p.isActive,
                isPrimary: p.isPrimary,
                lastSyncAt: p.lastSyncAt,
                capabilities: p.capabilities,
                createdAt: p.createdAt,
                owner: p.user,
                providerAliases: (p.providerGroups || []).map(pg => ({
                    name: pg.providerName || 'Default',
                    group: pg.groupName,
                    type: pg.type,
                    active: pg.isActive
                })),
                stats: {
                    orders: p._count.orders,
                    providerGroups: p._count.providerGroups,
                    devices: p._count.devices
                }
            };
        });

        successResponse(res, { panels: panelList, total: panelList.length });
    } catch (error) {
        next(error);
    }
});

// ==================== SERVICE LIST MANAGEMENT (Section 3.2a) ====================

// GET /api/admin/service-list - Get the admin-configured service list
router.get('/service-list', async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Check user-specific setting first
        const userSetting = await prisma.setting.findFirst({
            where: { userId, key: 'service_list' }
        });

        if (userSetting && userSetting.value) {
            try {
                const parsed = JSON.parse(userSetting.value);
                return successResponse(res, { content: parsed.content || parsed, source: 'user' });
            } catch {
                return successResponse(res, { content: userSetting.value, source: 'user' });
            }
        }

        // Fallback to system config
        const systemSetting = await prisma.systemConfig.findUnique({
            where: { key: 'service_list' }
        });

        if (systemSetting && systemSetting.value) {
            try {
                const parsed = JSON.parse(systemSetting.value);
                return successResponse(res, { content: parsed.content || parsed, source: 'system' });
            } catch {
                return successResponse(res, { content: systemSetting.value, source: 'system' });
            }
        }

        successResponse(res, { content: '', source: 'none' });
    } catch (error) {
        next(error);
    }
});

// PUT /api/admin/service-list - Update the service list content
router.put('/service-list', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { content } = req.body;

        if (typeof content !== 'string') {
            throw new AppError('Content must be a string', 400);
        }

        // Store as user-specific setting
        const existing = await prisma.setting.findFirst({
            where: { userId, key: 'service_list' }
        });

        if (existing) {
            await prisma.setting.update({
                where: { id: existing.id },
                data: { value: JSON.stringify({ content, updatedAt: new Date().toISOString() }) }
            });
        } else {
            await prisma.setting.create({
                data: { userId, key: 'service_list', value: JSON.stringify({ content, updatedAt: new Date().toISOString() }) }
            });
        }

        successResponse(res, { message: 'Service list updated successfully' });
    } catch (error) {
        next(error);
    }
});

// ==================== CUSTOM COMMAND ALIASES MANAGEMENT (Section 3.2c) ====================

// GET /api/admin/command-aliases - Get custom command aliases
router.get('/command-aliases', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const commandParser = require('../services/commandParser');

        // Get user-specific custom aliases
        const customSetting = await prisma.setting.findFirst({
            where: { userId, key: 'custom_command_aliases' }
        });

        let customAliases = {};
        if (customSetting && customSetting.value) {
            try {
                customAliases = JSON.parse(customSetting.value);
            } catch { /* empty */ }
        }

        // Also return default aliases for reference
        const defaults = {};
        for (const [command, aliases] of Object.entries(commandParser.commands)) {
            defaults[command] = [...aliases];
        }

        successResponse(res, { defaults, custom: customAliases });
    } catch (error) {
        next(error);
    }
});

// PUT /api/admin/command-aliases - Update custom command aliases
router.put('/command-aliases', async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { aliases } = req.body;

        if (!aliases || typeof aliases !== 'object') {
            throw new AppError('Aliases must be an object mapping command names to arrays of alias strings', 400);
        }

        // Validate: only allow known commands
        const commandParser = require('../services/commandParser');
        const validCommands = Object.keys(commandParser.commands);
        const cleaned = {};

        for (const [command, aliasList] of Object.entries(aliases)) {
            if (!validCommands.includes(command.toLowerCase())) continue;
            if (!Array.isArray(aliasList)) continue;
            cleaned[command.toLowerCase()] = aliasList
                .filter(a => typeof a === 'string' && a.trim())
                .map(a => a.trim().toLowerCase());
        }

        // Store as user setting
        const existing = await prisma.setting.findFirst({
            where: { userId, key: 'custom_command_aliases' }
        });

        if (existing) {
            await prisma.setting.update({
                where: { id: existing.id },
                data: { value: JSON.stringify(cleaned) }
            });
        } else {
            await prisma.setting.create({
                data: { userId, key: 'custom_command_aliases', value: JSON.stringify(cleaned) }
            });
        }

        // Clear command parser cache for this user
        commandParser._userLookupCache.delete(userId);
        commandParser._userLookupCacheExpiry.delete(userId);

        successResponse(res, { message: 'Command aliases updated successfully', aliases: cleaned });
    } catch (error) {
        next(error);
    }
});

// ==================== AFFILIATE SYSTEM (Section 6.7) ====================

// GET /api/admin/affiliate/stats - Affiliate overview stats
router.get('/affiliate/stats', async (req, res, next) => {
    try {
        // Total users with referrals
        const totalReferrals = await prisma.user.count({
            where: { referredBy: { not: null } }
        });

        // Total commission paid
        const commissionTxns = await prisma.creditTransaction.findMany({
            where: { reference: { startsWith: 'AFFILIATE_' } },
            select: { amount: true }
        });
        const totalCommission = commissionTxns.reduce((sum, t) => sum + t.amount, 0);

        // Top referrers
        const topReferrers = await prisma.user.findMany({
            where: {
                referrals: { some: {} }
            },
            select: {
                id: true,
                username: true,
                referralCode: true,
                _count: { select: { referrals: true } }
            },
            orderBy: { referrals: { _count: 'desc' } },
            take: 10
        });

        // Get commission per referrer
        const referrerStats = [];
        for (const ref of topReferrers) {
            const txns = await prisma.creditTransaction.findMany({
                where: { userId: ref.id, reference: { startsWith: 'AFFILIATE_' } },
                select: { amount: true }
            });
            referrerStats.push({
                id: ref.id,
                username: ref.username,
                referralCode: ref.referralCode,
                totalReferrals: ref._count.referrals,
                totalEarned: txns.reduce((s, t) => s + t.amount, 0)
            });
        }

        // Get commission config
        const commConfig = await prisma.systemConfig.findUnique({
            where: { key: 'affiliate_commission_pct' }
        });
        const commissionPct = commConfig ? parseFloat(JSON.parse(commConfig.value)) : 0;

        successResponse(res, {
            totalReferrals,
            totalCommission: parseFloat(totalCommission.toFixed(2)),
            commissionPct,
            topReferrers: referrerStats
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/admin/affiliate/history - Paginated affiliate commission history
router.get('/affiliate/history', async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [transactions, total] = await Promise.all([
            prisma.creditTransaction.findMany({
                where: { reference: { startsWith: 'AFFILIATE_' } },
                include: {
                    user: { select: { id: true, username: true, email: true } }
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip
            }),
            prisma.creditTransaction.count({
                where: { reference: { startsWith: 'AFFILIATE_' } }
            })
        ]);

        paginatedResponse(res, transactions, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// ==================== COMPLAINT QUEUE (Section 16.1) ====================

const complaintQueueService = require('../services/complaintQueueService');

// GET /api/admin/complaint-queue/stats - Queue statistics
router.get('/complaint-queue/stats', async (req, res, next) => {
    try {
        const stats = await complaintQueueService.getQueueStats();
        successResponse(res, stats);
    } catch (error) {
        next(error);
    }
});

// GET /api/admin/complaint-queue - List queue items
router.get('/complaint-queue', async (req, res, next) => {
    try {
        const { status = 'QUEUED', limit = 50, page = 1 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const result = await complaintQueueService.getQueueItems(null, {
            status,
            limit: parseInt(limit),
            skip
        });
        successResponse(res, result);
    } catch (error) {
        next(error);
    }
});

// POST /api/admin/complaint-queue/:id/retry - Retry a queued item
router.post('/complaint-queue/:id/retry', async (req, res, next) => {
    try {
        // Find the ticket to get its userId
        const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
        if (!ticket) {
            throw new AppError('Queue item not found', 404);
        }
        const result = await complaintQueueService.retryItem(req.params.id, ticket.userId);
        successResponse(res, result, result.message);
    } catch (error) {
        next(error);
    }
});

// POST /api/admin/complaint-queue/:id/dismiss - Dismiss a queued item
router.post('/complaint-queue/:id/dismiss', async (req, res, next) => {
    try {
        const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
        if (!ticket) {
            throw new AppError('Queue item not found', 404);
        }
        const result = await complaintQueueService.dismissItem(req.params.id, ticket.userId);
        successResponse(res, result, result.message);
    } catch (error) {
        next(error);
    }
});

// ==================== ANNOUNCEMENTS (Section 6.4) ====================

const crypto = require('crypto');

// GET /api/admin/announcements - Get all announcements
router.get('/announcements', async (req, res, next) => {
    try {
        const config = await prisma.systemConfig.findUnique({
            where: { key: 'admin_announcements' }
        });
        const announcements = config ? JSON.parse(config.value) : [];
        successResponse(res, announcements);
    } catch (error) {
        next(error);
    }
});

// POST /api/admin/announcements - Create announcement
router.post('/announcements', async (req, res, next) => {
    try {
        const { title, body, expiresAt } = req.body;

        if (!title || !body) {
            throw new AppError('Title and body are required', 400);
        }

        const config = await prisma.systemConfig.findUnique({
            where: { key: 'admin_announcements' }
        });
        const announcements = config ? JSON.parse(config.value) : [];

        const newAnnouncement = {
            id: crypto.randomUUID(),
            title,
            body,
            expiresAt: expiresAt || null,
            isActive: true,
            createdBy: req.user.username,
            createdAt: new Date().toISOString()
        };

        announcements.unshift(newAnnouncement);

        await prisma.systemConfig.upsert({
            where: { key: 'admin_announcements' },
            update: { value: JSON.stringify(announcements) },
            create: { key: 'admin_announcements', value: JSON.stringify(announcements), category: 'notifications' }
        });

        createdResponse(res, newAnnouncement, 'Announcement created');
    } catch (error) {
        next(error);
    }
});

// PUT /api/admin/announcements/:id - Update announcement
router.put('/announcements/:id', async (req, res, next) => {
    try {
        const { title, body, expiresAt, isActive } = req.body;
        const config = await prisma.systemConfig.findUnique({
            where: { key: 'admin_announcements' }
        });
        const announcements = config ? JSON.parse(config.value) : [];
        const idx = announcements.findIndex(a => a.id === req.params.id);
        if (idx === -1) {
            throw new AppError('Announcement not found', 404);
        }

        if (title !== undefined) announcements[idx].title = title;
        if (body !== undefined) announcements[idx].body = body;
        if (expiresAt !== undefined) announcements[idx].expiresAt = expiresAt;
        if (isActive !== undefined) announcements[idx].isActive = isActive;

        await prisma.systemConfig.update({
            where: { key: 'admin_announcements' },
            data: { value: JSON.stringify(announcements) }
        });

        successResponse(res, announcements[idx], 'Announcement updated');
    } catch (error) {
        next(error);
    }
});

// DELETE /api/admin/announcements/:id - Delete announcement
router.delete('/announcements/:id', async (req, res, next) => {
    try {
        const config = await prisma.systemConfig.findUnique({
            where: { key: 'admin_announcements' }
        });
        const announcements = config ? JSON.parse(config.value) : [];
        const filtered = announcements.filter(a => a.id !== req.params.id);

        if (filtered.length === announcements.length) {
            throw new AppError('Announcement not found', 404);
        }

        await prisma.systemConfig.update({
            where: { key: 'admin_announcements' },
            data: { value: JSON.stringify(filtered) }
        });

        successResponse(res, null, 'Announcement deleted');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
