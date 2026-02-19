/**
 * Staff Routes (User-owned)
 * 
 * Allows regular users to create and manage their own staff members.
 * Staff created by a user can only manage that user's resources.
 * 
 * GET    /api/staff          — List user's staff members
 * POST   /api/staff          — Create a new staff member
 * PUT    /api/staff/:id      — Update staff permissions
 * DELETE /api/staff/:id      — Remove a staff member
 * GET    /api/staff/my-permissions — Get current user's staff permissions (for STAFF users)
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');
const { successResponse, createdResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');

// All routes require authentication
router.use(authenticate);

const VALID_PERMISSIONS = [
    'user_view', 'user_edit', 'user_suspend', 'user_credit',
    'order_view', 'order_manage',
    'payment_view', 'payment_approve',
    'voucher_manage', 'device_manage', 'panel_manage',
    'reports_view', 'support',
    'contacts_view', 'broadcast_manage', 'bot_settings',
    'keyword_view', 'dashboard_view'
];

// GET /api/staff/my-permissions — Get current staff user's permissions
// Used by frontend to determine which pages to show in sidebar
router.get('/my-permissions', async (req, res, next) => {
    try {
        if (req.user.role !== 'STAFF') {
            return successResponse(res, { permissions: [], ownerId: null }, 'Not a staff user');
        }

        const permissions = await prisma.staffPermission.findMany({
            where: { staffId: req.user.id },
            select: {
                permission: true,
                canView: true,
                canEdit: true,
                canDelete: true,
                userId: true
            }
        });

        // Get the owner (user who created this staff)
        const ownerPermission = permissions.find(p => p.userId);

        successResponse(res, {
            permissions: permissions.map(p => ({
                permission: p.permission,
                canView: p.canView,
                canEdit: p.canEdit,
                canDelete: p.canDelete
            })),
            permissionKeys: permissions.map(p => p.permission),
            ownerId: ownerPermission?.userId || null
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/staff — List staff members created by the current user
router.get('/', async (req, res, next) => {
    try {
        // Find all staff permissions where userId = current user (staff scoped to this user)
        const staffPermissions = await prisma.staffPermission.findMany({
            where: { userId: req.user.id },
            select: { staffId: true }
        });

        const staffIds = [...new Set(staffPermissions.map(p => p.staffId))];

        if (staffIds.length === 0) {
            return successResponse(res, []);
        }

        const staff = await prisma.user.findMany({
            where: { id: { in: staffIds }, role: 'STAFF' },
            select: {
                id: true,
                username: true,
                email: true,
                name: true,
                status: true,
                isActive: true,
                createdAt: true,
                lastLoginAt: true,
                staffPermissions: {
                    where: { userId: req.user.id },
                    select: {
                        id: true,
                        permission: true,
                        canView: true,
                        canEdit: true,
                        canDelete: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        successResponse(res, staff);
    } catch (error) {
        next(error);
    }
});

// POST /api/staff — Create a new staff member (owned by current user)
router.post('/', async (req, res, next) => {
    try {
        const { username, email, password, name, permissions } = req.body;

        if (!username || !email || !password || !name) {
            throw new AppError('Username, email, password, and name are required', 400);
        }

        if (username.length < 3 || username.length > 30) {
            throw new AppError('Username must be 3-30 characters', 400);
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

        // Validate permissions
        const validPerms = (permissions || []).filter(p => VALID_PERMISSIONS.includes(p));

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create staff user with permissions scoped to the creating user
        const staff = await prisma.user.create({
            data: {
                username: username.toLowerCase(),
                email: email.toLowerCase(),
                password: hashedPassword,
                name,
                role: 'STAFF',
                status: 'ACTIVE',
                staffPermissions: {
                    create: validPerms.map(p => ({
                        permission: p,
                        userId: req.user.id, // Scope to the creating user
                        canView: true,
                        canEdit: ['order_manage', 'user_edit', 'payment_approve', 'voucher_manage', 'device_manage', 'panel_manage', 'support'].includes(p),
                        canDelete: false
                    }))
                }
            },
            select: {
                id: true,
                username: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
                staffPermissions: {
                    select: {
                        permission: true,
                        canView: true,
                        canEdit: true
                    }
                }
            }
        });

        createdResponse(res, staff, 'Staff member created successfully');
    } catch (error) {
        next(error);
    }
});

// PUT /api/staff/:id — Update staff permissions
router.put('/:id', async (req, res, next) => {
    try {
        const { permissions } = req.body;

        // Verify this staff belongs to the current user
        const existingPerms = await prisma.staffPermission.findFirst({
            where: {
                staffId: req.params.id,
                userId: req.user.id
            }
        });

        if (!existingPerms) {
            throw new AppError('Staff member not found or not owned by you', 404);
        }

        // Verify the user is a staff
        const staffUser = await prisma.user.findUnique({
            where: { id: req.params.id }
        });

        if (!staffUser || staffUser.role !== 'STAFF') {
            throw new AppError('Staff member not found', 404);
        }

        // Delete existing permissions for this user scope
        await prisma.staffPermission.deleteMany({
            where: {
                staffId: req.params.id,
                userId: req.user.id
            }
        });

        // Create new permissions
        const validPerms = (permissions || []).filter(p => VALID_PERMISSIONS.includes(p));
        if (validPerms.length > 0) {
            await prisma.staffPermission.createMany({
                data: validPerms.map(p => ({
                    staffId: req.params.id,
                    userId: req.user.id,
                    permission: p,
                    canView: true,
                    canEdit: ['order_manage', 'user_edit', 'payment_approve', 'voucher_manage', 'device_manage', 'panel_manage', 'support'].includes(p),
                    canDelete: false
                }))
            });
        }

        // Get updated staff with permissions
        const updated = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: {
                id: true,
                username: true,
                name: true,
                staffPermissions: {
                    where: { userId: req.user.id },
                    select: { permission: true, canView: true, canEdit: true }
                }
            }
        });

        successResponse(res, updated, 'Staff permissions updated');
    } catch (error) {
        next(error);
    }
});

// DELETE /api/staff/:id — Remove a staff member
router.delete('/:id', async (req, res, next) => {
    try {
        // Verify this staff belongs to the current user
        const existingPerms = await prisma.staffPermission.findFirst({
            where: {
                staffId: req.params.id,
                userId: req.user.id
            }
        });

        if (!existingPerms) {
            throw new AppError('Staff member not found or not owned by you', 404);
        }

        // Delete the staff user's permissions for this owner
        await prisma.staffPermission.deleteMany({
            where: {
                staffId: req.params.id,
                userId: req.user.id
            }
        });

        // Check if staff has any other permissions (from other users)
        const remaining = await prisma.staffPermission.count({
            where: { staffId: req.params.id }
        });

        // If no more permissions, soft-delete the user (deactivate instead of hard delete)
        if (remaining === 0) {
            await prisma.user.update({
                where: { id: req.params.id },
                data: {
                    isActive: false,
                    status: 'INACTIVE',
                    role: 'USER' // Reset role to prevent stale admin/staff access
                }
            });
        }

        successResponse(res, null, 'Staff member removed');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
