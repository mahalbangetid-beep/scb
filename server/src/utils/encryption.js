/**
 * Encryption Utility
 * 
 * For encrypting sensitive data like API keys
 * Uses AES-256-GCM encryption
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get encryption key from environment
 * Must be 32 bytes (64 hex characters)
 */
const getKey = () => {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error('ENCRYPTION_KEY not set in environment');
    }
    // Convert hex string to buffer
    return Buffer.from(key, 'hex');
};

/**
 * Encrypt a string
 * @param {string} text - Text to encrypt
 * @returns {string} - Encrypted string (base64 encoded)
 */
const encrypt = (text) => {
    if (!text) return null;

    try {
        const key = getKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        // Combine iv + authTag + encrypted data
        const combined = Buffer.concat([
            iv,
            authTag,
            Buffer.from(encrypted, 'hex')
        ]);

        return combined.toString('base64');
    } catch (error) {
        console.error('[Encryption] Error encrypting:', error.message);
        throw new Error('Encryption failed');
    }
};

/**
 * Decrypt a string
 * @param {string} encryptedText - Base64 encoded encrypted text
 * @returns {string} - Decrypted string
 */
const decrypt = (encryptedText) => {
    if (!encryptedText) return null;

    try {
        const key = getKey();
        const combined = Buffer.from(encryptedText, 'base64');

        // Extract iv, authTag, and encrypted data
        const iv = combined.slice(0, IV_LENGTH);
        const authTag = combined.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const encrypted = combined.slice(IV_LENGTH + AUTH_TAG_LENGTH);

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, null, 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('[Encryption] Error decrypting:', error.message);
        throw new Error('Decryption failed');
    }
};

/**
 * Hash a string (one-way, for comparison)
 * @param {string} text - Text to hash
 * @returns {string} - Hashed string
 */
const hash = (text) => {
    return crypto.createHash('sha256').update(text).digest('hex');
};

/**
 * Generate a random token
 * @param {number} length - Length in bytes
 * @returns {string} - Random hex string
 */
const generateToken = (length = 32) => {
    return crypto.randomBytes(length).toString('hex');
};

/**
 * Mask a string (for display purposes)
 * @param {string} text - Text to mask
 * @param {number} visibleStart - Characters visible at start
 * @param {number} visibleEnd - Characters visible at end
 * @returns {string} - Masked string
 */
const mask = (text, visibleStart = 4, visibleEnd = 4) => {
    if (!text || text.length <= visibleStart + visibleEnd) {
        return text;
    }
    const start = text.substring(0, visibleStart);
    const end = text.substring(text.length - visibleEnd);
    const masked = '*'.repeat(Math.min(text.length - visibleStart - visibleEnd, 20));
    return `${start}${masked}${end}`;
};

module.exports = {
    encrypt,
    decrypt,
    hash,
    generateToken,
    mask
};
