const jwt = require('jsonwebtoken');
const { AppError } = require('./errorHandler');
const prisma = require('../utils/prisma');

// User roles hierarchy
const ROLES = {
    MASTER_ADMIN: 'MASTER_ADMIN',
    ADMIN: 'ADMIN',
    USER: 'USER',
    STAFF: 'STAFF'
};

// Role hierarchy (higher index = more permissions)
const ROLE_HIERARCHY = {
    'USER': 1,
    'STAFF': 2,
    'ADMIN': 3,
    'MASTER_ADMIN': 4
};

/**
 * Middleware to verify JWT token
 */
const authenticate = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new AppError('No token provided. Authorization header must be: Bearer <token>', 401);
        }

        const token = authHeader.split(' ')[1];

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Check if user still exists
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                username: true,
                email: true,
                name: true,
                role: true,
                status: true,
                isActive: true,
                creditBalance: true,
                discountRate: true
            }
        });

        if (!user) {
            throw new AppError('User no longer exists', 401);
        }

        if (!user.isActive) {
            throw new AppError('User account is deactivated', 401);
        }

        // Check user status
        if (user.status === 'BANNED') {
            throw new AppError('Your account has been banned', 403);
        }

        if (user.status === 'SUSPENDED') {
            throw new AppError('Your account is suspended', 403);
        }

        // Attach user to request
        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return next(new AppError('Invalid token', 401));
        }
        if (error.name === 'TokenExpiredError') {
            return next(new AppError('Token expired', 401));
        }
        next(error);
    }
};

/**
 * Middleware to verify API Key
 */
const authenticateApiKey = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new AppError('No API key provided', 401);
        }

        const apiKey = authHeader.split(' ')[1];

        // Check if it's an API key (starts with prefix)
        const prefix = process.env.API_KEY_PREFIX || 'dk_';
        if (!apiKey.startsWith(prefix)) {
            // Not an API key, might be JWT - pass to authenticate middleware
            return authenticate(req, res, next);
        }

        // Find API key in database
        const keyRecord = await prisma.apiKey.findUnique({
            where: { key: apiKey },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        name: true,
                        role: true,
                        status: true,
                        isActive: true,
                        creditBalance: true
                    }
                }
            }
        });

        if (!keyRecord) {
            throw new AppError('Invalid API key', 401);
        }

        if (!keyRecord.isActive) {
            throw new AppError('API key is deactivated', 401);
        }

        if (!keyRecord.user.isActive) {
            throw new AppError('User account is deactivated', 401);
        }

        if (keyRecord.user.status === 'BANNED' || keyRecord.user.status === 'SUSPENDED') {
            throw new AppError('User account is not active', 403);
        }

        // Update last used
        await prisma.apiKey.update({
            where: { id: keyRecord.id },
            data: { lastUsed: new Date() }
        });

        // Attach user to request
        req.user = keyRecord.user;
        req.apiKey = keyRecord;
        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Middleware to check user role
 * @param {...string} roles - Allowed roles
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Not authenticated', 401));
        }

        if (!roles.includes(req.user.role)) {
            return next(new AppError('Not authorized to access this resource', 403));
        }

        next();
    };
};

/**
 * Middleware to require specific role or higher in hierarchy
 * @param {string|string[]} minRole - Minimum required role OR array of allowed roles
 */
const requireRole = (minRole) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Not authenticated', 401));
        }

        // Handle array of allowed roles
        if (Array.isArray(minRole)) {
            if (minRole.includes(req.user.role)) {
                return next();
            }
            return next(new AppError(`Requires one of: ${minRole.join(', ')}`, 403));
        }

        // Handle single role with hierarchy check
        const userRoleLevel = ROLE_HIERARCHY[req.user.role] || 0;
        const requiredRoleLevel = ROLE_HIERARCHY[minRole] || 0;

        if (userRoleLevel < requiredRoleLevel) {
            return next(new AppError(`Requires ${minRole} role or higher`, 403));
        }

        next();
    };
};


/**
 * Middleware to require Master Admin only
 */
const requireMasterAdmin = (req, res, next) => {
    if (!req.user) {
        return next(new AppError('Not authenticated', 401));
    }

    if (req.user.role !== ROLES.MASTER_ADMIN) {
        return next(new AppError('Master Admin access required', 403));
    }

    next();
};

/**
 * Middleware to require Admin or Master Admin
 */
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return next(new AppError('Not authenticated', 401));
    }

    if (req.user.role !== ROLES.MASTER_ADMIN && req.user.role !== ROLES.ADMIN) {
        return next(new AppError('Admin access required', 403));
    }

    next();
};

/**
 * Middleware to check staff permissions
 * @param {string} permission - Required permission type
 * @param {string} action - Required action (view, edit, delete)
 */
const requireStaffPermission = (permission, action = 'view') => {
    return async (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Not authenticated', 401));
        }

        // Master Admin and Admin bypass permission check
        if (req.user.role === ROLES.MASTER_ADMIN || req.user.role === ROLES.ADMIN) {
            return next();
        }

        // Staff needs specific permission
        if (req.user.role === ROLES.STAFF) {
            const staffPermission = await prisma.staffPermission.findFirst({
                where: {
                    staffId: req.user.id,
                    permission: permission
                }
            });

            if (!staffPermission) {
                return next(new AppError(`No permission for ${permission}`, 403));
            }

            // Check action level
            if (action === 'edit' && !staffPermission.canEdit) {
                return next(new AppError(`No edit permission for ${permission}`, 403));
            }

            if (action === 'delete' && !staffPermission.canDelete) {
                return next(new AppError(`No delete permission for ${permission}`, 403));
            }

            // Attach permission to request
            req.staffPermission = staffPermission;
            return next();
        }

        // Regular users don't have access
        return next(new AppError('Not authorized', 403));
    };
};

/**
 * Optional authentication - continues even if no token
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                username: true,
                email: true,
                name: true,
                role: true,
                status: true,
                isActive: true
            }
        });

        if (user && user.isActive && user.status === 'ACTIVE') {
            req.user = user;
        }

        next();
    } catch (error) {
        // Token invalid but continue anyway
        next();
    }
};

/**
 * Check if user has sufficient credit balance
 * @param {number} requiredAmount - Required credit amount
 */
const requireCredit = (requiredAmount = 0) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new AppError('Not authenticated', 401));
        }

        // Admin roles bypass credit check
        if (req.user.role === ROLES.MASTER_ADMIN || req.user.role === ROLES.ADMIN) {
            return next();
        }

        if ((req.user.creditBalance || 0) < requiredAmount) {
            return next(new AppError('Insufficient credit balance. Please top up your credits.', 402));
        }

        next();
    };
};

module.exports = {
    ROLES,
    ROLE_HIERARCHY,
    authenticate,
    authenticateApiKey,
    authorize,
    requireRole,
    requireMasterAdmin,
    requireAdmin,
    requireStaffPermission,
    optionalAuth,
    requireCredit
};
