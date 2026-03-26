/**
 * Two-Factor Authentication Routes (TOTP-based)
 * 
 * Endpoints:
 * - GET  /api/auth/2fa/status  - Check if 2FA is enabled
 * - POST /api/auth/2fa/setup   - Generate QR code + secret for 2FA setup
 * - POST /api/auth/2fa/verify  - Verify OTP and enable 2FA
 * - POST /api/auth/2fa/disable - Disable 2FA (requires password + OTP)
 */

const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const { successResponse } = require('../utils/response');
const { AppError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/encryption');

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/auth/2fa/status
 * Check if 2FA is enabled for current user
 */
router.get('/status', async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { twoFactorEnabled: true }
        });

        successResponse(res, {
            enabled: user?.twoFactorEnabled || false
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/auth/2fa/setup
 * Generate TOTP secret and QR code for setup
 * Returns: { secret, qrCodeUrl }
 */
router.post('/setup', async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, username: true, email: true, twoFactorEnabled: true }
        });

        if (user.twoFactorEnabled) {
            throw new AppError('2FA is already enabled. Disable it first to set up again.', 400);
        }

        // Generate new TOTP secret
        const secret = authenticator.generateSecret();

        // Create otpauth URL for QR code
        const appName = process.env.APP_NAME || 'DICREWA';
        const otpauthUrl = authenticator.keyuri(user.email || user.username, appName, secret);

        // Generate QR code as data URL
        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

        // Store secret temporarily (encrypted) — not enabled yet
        const encryptedSecret = encrypt(secret);
        await prisma.user.update({
            where: { id: req.user.id },
            data: { twoFactorSecret: encryptedSecret }
        });

        successResponse(res, {
            secret, // User can manually enter this if QR scan fails
            qrCodeUrl: qrCodeDataUrl
        }, '2FA setup initiated. Scan the QR code with your authenticator app and verify.');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/auth/2fa/verify
 * Verify OTP code and enable 2FA
 * Body: { code }
 */
router.post('/verify', async (req, res, next) => {
    try {
        const { code } = req.body;

        if (!code) {
            throw new AppError('Verification code is required', 400);
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, twoFactorEnabled: true, twoFactorSecret: true }
        });

        if (user.twoFactorEnabled) {
            throw new AppError('2FA is already enabled', 400);
        }

        if (!user.twoFactorSecret) {
            throw new AppError('Please set up 2FA first before verifying', 400);
        }

        // Decrypt secret and verify TOTP code
        const secret = decrypt(user.twoFactorSecret);
        const isValid = authenticator.verify({ token: String(code), secret });

        if (!isValid) {
            throw new AppError('Invalid verification code. Please try again.', 400);
        }

        // Enable 2FA
        await prisma.user.update({
            where: { id: req.user.id },
            data: { twoFactorEnabled: true }
        });

        console.log(`[2FA] Enabled for user ${req.user.id}`);

        successResponse(res, { enabled: true }, '2FA has been enabled successfully!');
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/auth/2fa/disable
 * Disable 2FA (requires password + current OTP)
 * Body: { password, code }
 */
router.post('/disable', async (req, res, next) => {
    try {
        const { password, code } = req.body;

        if (!password) {
            throw new AppError('Password is required to disable 2FA', 400);
        }

        if (!code) {
            throw new AppError('Current 2FA code is required', 400);
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, password: true, twoFactorEnabled: true, twoFactorSecret: true }
        });

        if (!user.twoFactorEnabled) {
            throw new AppError('2FA is not enabled', 400);
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            throw new AppError('Invalid password', 401);
        }

        // Verify TOTP code
        const secret = decrypt(user.twoFactorSecret);
        const isValid = authenticator.verify({ token: String(code), secret });

        if (!isValid) {
            throw new AppError('Invalid 2FA code', 400);
        }

        // Disable 2FA and clear secret
        await prisma.user.update({
            where: { id: req.user.id },
            data: {
                twoFactorEnabled: false,
                twoFactorSecret: null
            }
        });

        console.log(`[2FA] Disabled for user ${req.user.id}`);

        successResponse(res, { enabled: false }, '2FA has been disabled.');
    } catch (error) {
        next(error);
    }
});

module.exports = router;
