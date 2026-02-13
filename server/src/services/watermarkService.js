/**
 * Message Watermark Service
 * 
 * Generates and detects invisible watermarks in outbound messages
 * using Zero-Width Unicode characters for anti-spam tracking.
 * 
 * Watermark Encoding:
 * - Uses Zero-Width Space (U+200B) = binary 0
 * - Uses Zero-Width Non-Joiner (U+200C) = binary 1
 * - Framed with Zero-Width Joiner (U+200D) as start/end delimiter
 * - The watermark code is encoded as binary → ZWC string
 */

const prisma = require('../utils/prisma');
const crypto = require('crypto');

// Zero-Width Characters
const ZWS = '\u200B';  // Zero-width space = 0
const ZWNJ = '\u200C'; // Zero-width non-joiner = 1
const ZWJ = '\u200D';  // Zero-width joiner = delimiter

class WatermarkService {
    /**
     * Generate a short unique watermark code
     */
    generateCode() {
        // 8 char alphanumeric code (case-insensitive for easier lookup)
        return crypto.randomBytes(4).toString('hex');
    }

    /**
     * Encode a watermark code into zero-width characters
     */
    encodeToZWC(code) {
        // Convert each character to 8-bit binary, then to ZWC
        let zwcString = ZWJ; // Start delimiter
        for (const char of code) {
            const binary = char.charCodeAt(0).toString(2).padStart(8, '0');
            for (const bit of binary) {
                zwcString += bit === '0' ? ZWS : ZWNJ;
            }
        }
        zwcString += ZWJ; // End delimiter
        return zwcString;
    }

    /**
     * Decode zero-width characters back to watermark code
     */
    decodeFromZWC(text) {
        // Find ZWJ delimiters
        const startIdx = text.indexOf(ZWJ);
        if (startIdx === -1) return null;

        const endIdx = text.indexOf(ZWJ, startIdx + 1);
        if (endIdx === -1) return null;

        const zwcContent = text.substring(startIdx + 1, endIdx);
        if (zwcContent.length === 0) return null;

        // Convert ZWC back to binary then to characters
        let binary = '';
        for (const char of zwcContent) {
            if (char === ZWS) binary += '0';
            else if (char === ZWNJ) binary += '1';
            else continue; // Skip unexpected characters
        }

        // Binary must be multiple of 8
        if (binary.length % 8 !== 0 || binary.length === 0) return null;

        let code = '';
        for (let i = 0; i < binary.length; i += 8) {
            const byte = binary.substring(i, i + 8);
            code += String.fromCharCode(parseInt(byte, 2));
        }

        return code;
    }

    /**
     * Check if text contains zero-width watermark characters
     */
    hasWatermark(text) {
        return text && text.includes(ZWJ) && (text.includes(ZWS) || text.includes(ZWNJ));
    }

    /**
     * Embed watermark into a message text
     * Inserts the invisible watermark after the first word
     */
    embedWatermark(text, watermarkCode) {
        const zwcWatermark = this.encodeToZWC(watermarkCode);

        // Insert after first space, or at end if no space
        const firstSpace = text.indexOf(' ');
        if (firstSpace > 0) {
            return text.substring(0, firstSpace) + zwcWatermark + text.substring(firstSpace);
        }
        return text + zwcWatermark;
    }

    /**
     * Remove watermark from text (for clean display)
     */
    stripWatermark(text) {
        if (!text) return text;
        // Remove all zero-width characters
        return text.replace(/[\u200B\u200C\u200D]/g, '');
    }

    /**
     * Create watermark record and embed in message
     * Returns { watermarkedText, watermark }
     */
    async createAndEmbed({
        text,
        userId,
        deviceId = null,
        recipientId = null,
        broadcastId = null,
        platform = 'WHATSAPP'
    }) {
        const code = this.generateCode();

        // Store in DB
        const watermark = await prisma.messageWatermark.create({
            data: {
                code,
                userId,
                deviceId,
                recipientId,
                messagePreview: text ? text.substring(0, 100) : null,
                broadcastId,
                platform
            }
        });

        // Embed in text
        const watermarkedText = this.embedWatermark(text, code);

        return { watermarkedText, watermark };
    }

    /**
     * Detect and lookup watermark from received text
     * Returns watermark record if found, null otherwise
     */
    async detectWatermark(text) {
        if (!this.hasWatermark(text)) return null;

        const code = this.decodeFromZWC(text);
        if (!code) return null;

        const watermark = await prisma.messageWatermark.findUnique({
            where: { code }
        });

        if (watermark) {
            // Increment detection counter and return updated record
            const updated = await prisma.messageWatermark.update({
                where: { id: watermark.id },
                data: {
                    detectedCount: { increment: 1 },
                    lastDetectedAt: new Date()
                }
            });
            return updated;
        }

        return watermark;
    }

    /**
     * Get watermark stats for a user
     */
    async getUserStats(userId) {
        const [total, detected, recent] = await Promise.all([
            prisma.messageWatermark.count({ where: { userId } }),
            prisma.messageWatermark.count({
                where: { userId, detectedCount: { gt: 0 } }
            }),
            prisma.messageWatermark.findMany({
                where: { userId, detectedCount: { gt: 0 } },
                orderBy: { lastDetectedAt: 'desc' },
                take: 10
            })
        ]);

        return {
            totalWatermarks: total,
            detectedForwards: detected,
            recentDetections: recent
        };
    }

    /**
     * Get watermarks for a user with pagination
     */
    async getUserWatermarks(userId, { page = 1, limit = 20, onlyDetected = false }) {
        const where = { userId };
        if (onlyDetected) {
            where.detectedCount = { gt: 0 };
        }

        const [watermarks, total] = await Promise.all([
            prisma.messageWatermark.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: (page - 1) * limit
            }),
            prisma.messageWatermark.count({ where })
        ]);

        return { watermarks, total, page, limit };
    }
}

const watermarkService = new WatermarkService();

module.exports = { watermarkService, WatermarkService };
