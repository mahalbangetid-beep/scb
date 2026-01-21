/**
 * Logger Utility
 * 
 * Centralized logging with environment-aware output
 * In production, only errors and warnings are logged
 * In development, all logs are shown
 */

const isDev = process.env.NODE_ENV !== 'production';

const logger = {
    /**
     * Debug log - only in development
     */
    debug: (...args) => {
        if (isDev) {
            console.log('[DEBUG]', ...args);
        }
    },

    /**
     * Info log - only in development
     */
    info: (...args) => {
        if (isDev) {
            console.log('[INFO]', ...args);
        }
    },

    /**
     * Log with prefix - only in development
     */
    log: (prefix, ...args) => {
        if (isDev) {
            console.log(`[${prefix}]`, ...args);
        }
    },

    /**
     * Warning log - always shown
     */
    warn: (...args) => {
        console.warn('[WARN]', ...args);
    },

    /**
     * Error log - always shown
     */
    error: (...args) => {
        console.error('[ERROR]', ...args);
    },

    /**
     * Service-specific logger factory
     * @param {string} serviceName - Name of the service
     * @returns {Object} Logger with service prefix
     */
    service: (serviceName) => ({
        debug: (...args) => logger.debug(`[${serviceName}]`, ...args),
        info: (...args) => logger.info(`[${serviceName}]`, ...args),
        log: (...args) => logger.log(serviceName, ...args),
        warn: (...args) => logger.warn(`[${serviceName}]`, ...args),
        error: (...args) => logger.error(`[${serviceName}]`, ...args)
    })
};

module.exports = logger;
