/**
 * Input Validation & Sanitization Middleware
 * Provides request validation, sanitization, and security checks
 */

const { AppError } = require('./errorHandler');

// Dangerous patterns to detect potential attacks
const DANGEROUS_PATTERNS = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // Script tags
    /javascript:/gi, // JavaScript protocol
    /on\w+\s*=/gi, // Event handlers
    /\beval\s*\(/gi, // eval()
    /\bexec\s*\(/gi, // exec()
    /\$\{.*\}/g, // Template literals
    /__proto__/gi, // Prototype pollution
    /constructor\s*\[/gi, // Constructor access
    /\.\.\//g, // Path traversal
    /%2e%2e%2f/gi, // Encoded path traversal
    /union\s+select/gi, // SQL injection
    /;\s*drop\s+/gi, // SQL drop
    /;\s*delete\s+/gi, // SQL delete
    /'\s*or\s+'1'\s*=\s*'1/gi, // SQL injection
    /<!--.*-->/g // HTML comments
];

// Common XSS payloads
const XSS_PATTERNS = [
    /<img[^>]+onerror/gi,
    /<svg[^>]+onload/gi,
    /<body[^>]+onload/gi,
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
    /document\.(cookie|domain|write)/gi,
    /window\.(location|open)/gi,
    /\balert\s*\(/gi,
    /\bconfirm\s*\(/gi,
    /\bprompt\s*\(/gi
];

/**
 * Sanitize a string value
 */
function sanitizeString(value) {
    if (typeof value !== 'string') return value;

    // Trim whitespace
    value = value.trim();

    // Encode HTML entities
    value = value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');

    return value;
}

/**
 * Check if value contains dangerous patterns
 */
function containsDangerousPattern(value) {
    if (typeof value !== 'string') return false;

    for (const pattern of [...DANGEROUS_PATTERNS, ...XSS_PATTERNS]) {
        if (pattern.test(value)) {
            return true;
        }
    }
    return false;
}

/**
 * Deep sanitize an object
 */
function sanitizeObject(obj, options = {}) {
    const {
        maxDepth = 10,
        currentDepth = 0,
        allowHtml = false,
        skipFields = []
    } = options;

    if (currentDepth > maxDepth) {
        throw new AppError('Object nesting too deep', 400);
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item, {
            ...options,
            currentDepth: currentDepth + 1
        }));
    }

    if (obj && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            // Skip __proto__ and constructor keys
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                continue;
            }

            // Skip specified fields
            if (skipFields.includes(key)) {
                sanitized[key] = value;
                continue;
            }

            sanitized[key] = sanitizeObject(value, {
                ...options,
                currentDepth: currentDepth + 1
            });
        }
        return sanitized;
    }

    if (typeof obj === 'string') {
        // Check for dangerous patterns unless HTML is allowed
        if (!allowHtml && containsDangerousPattern(obj)) {
            return sanitizeString(obj);
        }
        return allowHtml ? obj : sanitizeString(obj);
    }

    return obj;
}

/**
 * Validation schemas
 */
const validators = {
    email: (value) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(value);
    },

    phone: (value) => {
        const phoneRegex = /^\+?[\d\s\-()]{10,20}$/;
        return phoneRegex.test(value);
    },

    username: (value) => {
        const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
        return usernameRegex.test(value);
    },

    password: (value) => {
        // At least 8 characters
        return typeof value === 'string' && value.length >= 8;
    },

    url: (value) => {
        try {
            new URL(value);
            return true;
        } catch {
            return false;
        }
    },

    uuid: (value) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(value);
    },

    positiveNumber: (value) => {
        const num = parseFloat(value);
        return !isNaN(num) && num > 0;
    },

    nonNegativeNumber: (value) => {
        const num = parseFloat(value);
        return !isNaN(num) && num >= 0;
    },

    integer: (value) => {
        return Number.isInteger(Number(value));
    },

    orderId: (value) => {
        // Order ID format: alphanumeric with optional dashes
        const orderIdRegex = /^[a-zA-Z0-9\-_]{1,50}$/;
        return orderIdRegex.test(value);
    },

    whatsappNumber: (value) => {
        // WhatsApp number format: + followed by digits
        const waRegex = /^\+?[1-9]\d{6,14}$/;
        return waRegex.test(value.replace(/[\s\-()]/g, ''));
    },

    apiKey: (value) => {
        // API key format: alphanumeric with optional underscores/dashes
        const apiKeyRegex = /^[a-zA-Z0-9_\-]{16,128}$/;
        return apiKeyRegex.test(value);
    }
};

/**
 * Validate request body against schema
 */
function validateSchema(schema) {
    return (req, res, next) => {
        const errors = [];

        for (const [field, rules] of Object.entries(schema)) {
            const value = req.body[field];

            // Check required
            if (rules.required && (value === undefined || value === null || value === '')) {
                errors.push(`${field} is required`);
                continue;
            }

            // Skip validation if field is not present and not required
            if (value === undefined || value === null) continue;

            // Check type
            if (rules.type) {
                const actualType = Array.isArray(value) ? 'array' : typeof value;
                if (actualType !== rules.type) {
                    errors.push(`${field} must be of type ${rules.type}`);
                    continue;
                }
            }

            // Check validator function
            if (rules.validator && validators[rules.validator]) {
                if (!validators[rules.validator](value)) {
                    errors.push(rules.message || `${field} is invalid`);
                }
            }

            // Check custom validation function
            if (rules.validate && typeof rules.validate === 'function') {
                const result = rules.validate(value);
                if (result !== true) {
                    errors.push(result || `${field} validation failed`);
                }
            }

            // Check min length
            if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
                errors.push(`${field} must be at least ${rules.minLength} characters`);
            }

            // Check max length
            if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
                errors.push(`${field} must be at most ${rules.maxLength} characters`);
            }

            // Check min value
            if (rules.min !== undefined && parseFloat(value) < rules.min) {
                errors.push(`${field} must be at least ${rules.min}`);
            }

            // Check max value
            if (rules.max !== undefined && parseFloat(value) > rules.max) {
                errors.push(`${field} must be at most ${rules.max}`);
            }

            // Check enum
            if (rules.enum && !rules.enum.includes(value)) {
                errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
            }

            // Check pattern
            if (rules.pattern && !rules.pattern.test(value)) {
                errors.push(rules.message || `${field} format is invalid`);
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Validation failed',
                    details: errors
                }
            });
        }

        next();
    };
}

/**
 * Sanitize request middleware
 */
function sanitizeRequest(options = {}) {
    return (req, res, next) => {
        try {
            // Sanitize body
            if (req.body && typeof req.body === 'object') {
                req.body = sanitizeObject(req.body, options);
            }

            // Sanitize query
            if (req.query && typeof req.query === 'object') {
                req.query = sanitizeObject(req.query, options);
            }

            // Sanitize params
            if (req.params && typeof req.params === 'object') {
                req.params = sanitizeObject(req.params, options);
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Security check middleware - blocks requests with dangerous patterns
 */
function securityCheck(req, res, next) {
    const checkValue = (value, path = '') => {
        if (typeof value === 'string') {
            for (const pattern of DANGEROUS_PATTERNS) {
                if (pattern.test(value)) {
                    console.warn(`[Security] Blocked request with dangerous pattern at ${path}:`, {
                        ip: req.ip,
                        method: req.method,
                        url: req.originalUrl,
                        pattern: pattern.toString()
                    });
                    return false;
                }
            }
        } else if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                if (!checkValue(value[i], `${path}[${i}]`)) return false;
            }
        } else if (value && typeof value === 'object') {
            for (const [key, val] of Object.entries(value)) {
                if (!checkValue(val, `${path}.${key}`)) return false;
            }
        }
        return true;
    };

    // Check body, query, and params
    const isBodySafe = checkValue(req.body, 'body');
    const isQuerySafe = checkValue(req.query, 'query');
    const isParamsSafe = checkValue(req.params, 'params');

    if (!isBodySafe || !isQuerySafe || !isParamsSafe) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'SECURITY_VIOLATION',
                message: 'Request contains potentially dangerous content'
            }
        });
    }

    next();
}

/**
 * Content length limiter
 */
function contentLengthLimit(maxBytes = 1024 * 1024) { // 1MB default
    return (req, res, next) => {
        const contentLength = parseInt(req.headers['content-length'] || '0', 10);

        if (contentLength > maxBytes) {
            return res.status(413).json({
                success: false,
                error: {
                    code: 'PAYLOAD_TOO_LARGE',
                    message: `Request body exceeds ${maxBytes} bytes limit`
                }
            });
        }

        next();
    };
}

module.exports = {
    sanitizeString,
    sanitizeObject,
    containsDangerousPattern,
    validateSchema,
    sanitizeRequest,
    securityCheck,
    contentLengthLimit,
    validators
};
