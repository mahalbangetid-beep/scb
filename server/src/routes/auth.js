const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const prisma = require('../utils/prisma');
const { successResponse, createdResponse, paginatedResponse, parsePagination } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { encrypt, mask } = require('../utils/encryption');
const { authLimiter } = require('../middleware/rateLimiter');
const { logLoginActivity } = require('../middleware/logger');
const { activityLogService, ACTIONS, CATEGORIES } = require('../services/activityLog');
const crypto = require('crypto');

/**
 * Generate JWT Token
 */
const generateToken = (userId) => {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

/**
 * Generate API Key
 */
const generateApiKey = () => {
    const prefix = process.env.API_KEY_PREFIX || 'dk_';
    const key = crypto.randomBytes(32).toString('hex');
    return `${prefix}${key}`;
};

/**
 * Get client IP address
 */
const getClientIp = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        'unknown';
};

/**
 * Log login attempt
 */
const logLogin = async (userId, ipAddress, userAgent, status, failReason = null) => {
    try {
        await prisma.loginHistory.create({
            data: {
                userId,
                ipAddress,
                userAgent: userAgent?.substring(0, 500),
                status,
                failReason
            }
        });
    } catch (error) {
        console.error('[Auth] Failed to log login:', error.message);
    }
};

// ==================== REGISTRATION ====================

// POST /api/auth/register
// Rate limited to prevent abuse
router.post('/register', authLimiter, async (req, res, next) => {
    try {
        const {
            username,
            email,
            password,
            name,
            whatsappNumber,
            telegramUsername,
            smmPanelUrl,
            panelApiKey
        } = req.body;

        // Validation
        if (!username || !email || !password || !name) {
            throw new AppError('Username, email, password, and name are required', 400);
        }

        if (username.length < 3 || username.length > 30) {
            throw new AppError('Username must be between 3 and 30 characters', 400);
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            throw new AppError('Username can only contain letters, numbers, and underscores', 400);
        }

        if (password.length < 6) {
            throw new AppError('Password must be at least 6 characters', 400);
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new AppError('Invalid email format', 400);
        }

        // Check if username exists
        const existingUsername = await prisma.user.findUnique({
            where: { username: username.toLowerCase() }
        });

        if (existingUsername) {
            throw new AppError('Username already taken', 400);
        }

        // Check if email exists
        const existingEmail = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (existingEmail) {
            throw new AppError('Email already registered', 400);
        }

        // Get client IP
        const registrationIp = getClientIp(req);

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Encrypt panel API key if provided
        const encryptedPanelKey = panelApiKey ? encrypt(panelApiKey) : null;

        // Get default credit from env
        const defaultCredit = parseFloat(process.env.DEFAULT_USER_CREDIT) || 0;

        // Create user
        const user = await prisma.user.create({
            data: {
                username: username.toLowerCase(),
                email: email.toLowerCase(),
                password: hashedPassword,
                name,
                role: 'USER',
                status: 'ACTIVE',
                whatsappNumber: whatsappNumber || null,
                telegramUsername: telegramUsername || null,
                primaryPanelUrl: smmPanelUrl || null,
                primaryPanelKey: encryptedPanelKey,
                creditBalance: defaultCredit,
                registrationIp
            },
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
                createdAt: true
            }
        });

        // Generate token
        const token = generateToken(user.id);

        // Generate default API key
        const apiKey = await prisma.apiKey.create({
            data: {
                key: generateApiKey(),
                name: 'Default API Key',
                userId: user.id
            }
        });

        // Log initial credit transaction if credit was given
        if (defaultCredit > 0) {
            await prisma.creditTransaction.create({
                data: {
                    userId: user.id,
                    type: 'CREDIT',
                    amount: defaultCredit,
                    balanceBefore: 0,
                    balanceAfter: defaultCredit,
                    description: 'Welcome bonus credit',
                    reference: 'REGISTRATION'
                }
            });
        }

        // Log registration as login
        await logLogin(user.id, registrationIp, req.headers['user-agent'], 'SUCCESS');

        createdResponse(res, {
            user,
            token,
            apiKey: apiKey.key
        }, 'Registration successful');
    } catch (error) {
        next(error);
    }
});

// ==================== LOGIN ====================

// POST /api/auth/login
// Rate limited to prevent brute force attacks
router.post('/login', authLimiter, async (req, res, next) => {
    try {
        const { username, email, password } = req.body;

        // Support login with username or email
        const loginIdentifier = username || email;

        if (!loginIdentifier || !password) {
            throw new AppError('Username/email and password are required', 400);
        }

        const ipAddress = getClientIp(req);
        const userAgent = req.headers['user-agent'];

        // Find user by username or email
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { username: loginIdentifier.toLowerCase() },
                    { email: loginIdentifier.toLowerCase() }
                ]
            }
        });

        if (!user) {
            throw new AppError('Invalid credentials', 401);
        }

        // Check user status
        if (user.status === 'BANNED') {
            await logLogin(user.id, ipAddress, userAgent, 'BLOCKED', 'Account banned');
            throw new AppError('Your account has been banned. Contact support for assistance.', 403);
        }

        if (user.status === 'SUSPENDED') {
            await logLogin(user.id, ipAddress, userAgent, 'BLOCKED', 'Account suspended');
            throw new AppError('Your account is suspended. Contact support for assistance.', 403);
        }

        if (!user.isActive) {
            await logLogin(user.id, ipAddress, userAgent, 'BLOCKED', 'Account deactivated');
            throw new AppError('Account is deactivated', 401);
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            await logLogin(user.id, ipAddress, userAgent, 'FAILED', 'Invalid password');
            throw new AppError('Invalid credentials', 401);
        }

        // Update last login info
        await prisma.user.update({
            where: { id: user.id },
            data: {
                lastLoginIp: ipAddress,
                lastLoginAt: new Date()
            }
        });

        // Log successful login
        await logLogin(user.id, ipAddress, userAgent, 'SUCCESS');

        // Generate token
        const token = generateToken(user.id);

        successResponse(res, {
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                name: user.name,
                role: user.role,
                status: user.status,
                creditBalance: user.creditBalance,
                whatsappNumber: user.whatsappNumber,
                telegramUsername: user.telegramUsername
            },
            token
        }, 'Login successful');
    } catch (error) {
        next(error);
    }
});

// ==================== CURRENT USER ====================

// GET /api/auth/me - Get current user
router.get('/me', authenticate, async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
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
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
                apiKeys: {
                    select: {
                        id: true,
                        name: true,
                        key: true,
                        isActive: true,
                        lastUsed: true,
                        createdAt: true
                    }
                },
                _count: {
                    select: {
                        devices: true,
                        smmPanels: true,
                        contacts: true
                    }
                }
            }
        });

        // Mask API keys
        user.apiKeys = user.apiKeys.map(key => ({
            ...key,
            key: mask(key.key, 10, 4)
        }));

        successResponse(res, user);
    } catch (error) {
        next(error);
    }
});

// PUT /api/auth/me - Update current user
router.put('/me', authenticate, async (req, res, next) => {
    try {
        const { name, avatar, whatsappNumber, telegramUsername } = req.body;

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: {
                ...(name && { name }),
                ...(avatar && { avatar }),
                ...(whatsappNumber !== undefined && { whatsappNumber }),
                ...(telegramUsername !== undefined && { telegramUsername })
            },
            select: {
                id: true,
                username: true,
                email: true,
                name: true,
                avatar: true,
                role: true,
                whatsappNumber: true,
                telegramUsername: true
            }
        });

        successResponse(res, user, 'Profile updated');
    } catch (error) {
        next(error);
    }
});

// ==================== PASSWORD ====================

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            throw new AppError('Current password and new password are required', 400);
        }

        if (newPassword.length < 6) {
            throw new AppError('New password must be at least 6 characters', 400);
        }

        // Get user with password
        const user = await prisma.user.findUnique({
            where: { id: req.user.id }
        });

        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
            throw new AppError('Current password is incorrect', 400);
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        await prisma.user.update({
            where: { id: req.user.id },
            data: { password: hashedPassword }
        });

        successResponse(res, null, 'Password changed successfully');
    } catch (error) {
        next(error);
    }
});

// ==================== API KEYS ====================

// POST /api/auth/api-keys - Generate new API key
router.post('/api-keys', authenticate, async (req, res, next) => {
    try {
        const { name } = req.body;

        const apiKey = await prisma.apiKey.create({
            data: {
                key: generateApiKey(),
                name: name || 'API Key',
                userId: req.user.id
            }
        });

        // Return full key only on creation
        createdResponse(res, {
            id: apiKey.id,
            name: apiKey.name,
            key: apiKey.key,
            createdAt: apiKey.createdAt
        }, 'API key created. Save this key, it will not be shown again.');
    } catch (error) {
        next(error);
    }
});

// GET /api/auth/api-keys - List API keys
router.get('/api-keys', authenticate, async (req, res, next) => {
    try {
        const apiKeys = await prisma.apiKey.findMany({
            where: { userId: req.user.id },
            select: {
                id: true,
                name: true,
                key: true,
                isActive: true,
                lastUsed: true,
                createdAt: true
            },
            orderBy: { createdAt: 'desc' }
        });

        // Mask keys
        const maskedKeys = apiKeys.map(key => ({
            ...key,
            key: mask(key.key, 10, 4)
        }));

        successResponse(res, maskedKeys);
    } catch (error) {
        next(error);
    }
});

// DELETE /api/auth/api-keys/:id - Revoke API key
router.delete('/api-keys/:id', authenticate, async (req, res, next) => {
    try {
        const apiKey = await prisma.apiKey.findFirst({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });

        if (!apiKey) {
            throw new AppError('API key not found', 404);
        }

        await prisma.apiKey.delete({
            where: { id: req.params.id }
        });

        successResponse(res, null, 'API key revoked');
    } catch (error) {
        next(error);
    }
});

// ==================== LOGIN HISTORY ====================

// GET /api/auth/login-history
router.get('/login-history', authenticate, async (req, res, next) => {
    try {
        const { page, limit, skip } = parsePagination(req.query);

        const [history, total] = await Promise.all([
            prisma.loginHistory.findMany({
                where: { userId: req.user.id },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip
            }),
            prisma.loginHistory.count({
                where: { userId: req.user.id }
            })
        ]);

        paginatedResponse(res, history, { page, limit, total });
    } catch (error) {
        next(error);
    }
});

// ==================== TOKEN ====================

// POST /api/auth/refresh - Refresh token
router.post('/refresh', authenticate, async (req, res, next) => {
    try {
        const token = generateToken(req.user.id);
        successResponse(res, { token }, 'Token refreshed');
    } catch (error) {
        next(error);
    }
});

// POST /api/auth/logout - Logout (optional, mainly for logging)
router.post('/logout', authenticate, async (req, res, next) => {
    try {
        // Log logout if needed
        successResponse(res, null, 'Logged out successfully');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
