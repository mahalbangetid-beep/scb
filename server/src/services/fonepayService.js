/**
 * FonePay WhatsApp Auto-Verification Service
 * 
 * Handles the complete flow of FonePay payment verification via WhatsApp:
 * 1. Parse payment message (extract TXN ID + amount)
 * 2. Resolve user mapping (WA number → panel username)
 * 3. Anti-fraud checks (rate limit, duplicate, suspicious activity)
 * 4. Verify transaction via Rental Panel Admin API
 * 5. Credit funds to panel user
 * 6. Audit logging
 */

const prisma = require('../utils/prisma');

// ==================== MESSAGE TEMPLATES ====================

const MESSAGES = {
    FORMAT_INVALID: '❌ Format salah. Kirim pesan dengan format:\n\nTXNID: [ID Transaksi]\nAmount: [Jumlah]\n\nContoh:\nTXNID: 123456789\nAmount: 5000',

    NO_MAPPING: '❌ Nomor Anda belum terhubung ke akun panel. Hubungi support untuk menghubungkan nomor WhatsApp Anda.',

    MAPPING_SUSPENDED: '⚠️ Akun Anda sedang disuspend. Hubungi support untuk informasi lebih lanjut.',

    PANEL_NOT_RENTAL: '❌ Fitur verifikasi pembayaran tidak tersedia untuk panel ini.',

    PANEL_FONEPAY_DISABLED: '❌ Fitur FonePay belum diaktifkan untuk panel ini. Hubungi admin.',

    TXN_NOT_FOUND: '❌ Transaksi tidak ditemukan. Periksa kembali ID transaksi Anda.',

    AMOUNT_MISMATCH: '❌ Jumlah yang dimasukkan tidak sesuai dengan catatan pembayaran.',

    ALREADY_PROCESSED: '❌ Transaksi ini sudah digunakan sebelumnya.',

    API_TIMEOUT: '⏳ Verifikasi tertunda. Silakan coba lagi dalam beberapa menit.',

    RATE_LIMITED: '⚠️ Terlalu banyak percobaan verifikasi. Silakan tunggu 1 jam sebelum mencoba lagi.',

    ACKNOWLEDGED: '🔄 Permintaan pembayaran diterima. Verifikasi sedang berlangsung...',

    SUCCESS: (amount, currency = 'NPR') =>
        `✅ Pembayaran terverifikasi! ${currency} ${amount.toLocaleString()} telah dikreditkan ke akun Anda.`,

    CREDIT_FAILED: '❌ Verifikasi berhasil tapi gagal mengkreditkan dana. Admin telah diberitahu. Silakan hubungi support.',

    TXN_EXPIRED: '❌ Transaksi ini sudah melewati batas waktu. Silakan hubungi support.',

    TXN_STATUS_INVALID: '❌ Transaksi ditemukan tapi belum berstatus berhasil/selesai. Coba lagi nanti atau hubungi support.',

    SYSTEM_ERROR: '❌ Terjadi kesalahan sistem. Silakan coba lagi nanti.',
};

// ==================== CONSTANTS (defaults, can be overridden via admin settings) ====================

const DEFAULT_MAX_ATTEMPTS_PER_HOUR = 5;
const SUSPICIOUS_FAILED_THRESHOLD = 3;
const SUSPICIOUS_WINDOW_MINUTES = 30;
const DEFAULT_PAYMENT_EXPIRY_HOURS = 24; // Optional expiry check

class FonepayService {
    constructor() {
        // Lazy-loaded to avoid circular dependency
        this._adminApiService = null;
    }

    /**
     * Get admin API service (lazy-loaded singleton)
     */
    get adminApiService() {
        if (!this._adminApiService) {
            this._adminApiService = require('./adminApiService');
        }
        return this._adminApiService;
    }

    // ==================== SETTINGS FROM DB ====================

    /**
     * Get FonePay settings for a panel owner from DB
     * Falls back to hardcoded defaults if no settings found
     */
    async getFonepaySettings(panelOwnerId) {
        try {
            const settings = await prisma.setting.findMany({
                where: {
                    userId: panelOwnerId,
                    key: { startsWith: 'fonepay' }
                }
            });

            const map = {};
            settings.forEach(s => { map[s.key] = s.value; });

            return {
                // Default to false — FonePay must be explicitly enabled by admin
                globalEnabled: map.fonepayGlobalEnabled === 'true',
                maxAttemptsPerHour: parseInt(map.fonepayMaxAttempts || String(DEFAULT_MAX_ATTEMPTS_PER_HOUR)),
                paymentExpiryHours: parseInt(map.fonepayExpiryHours || String(DEFAULT_PAYMENT_EXPIRY_HOURS))
            };
        } catch (error) {
            console.error('[FonePay] Failed to read settings, using defaults:', error.message);
            return {
                globalEnabled: false, // Default to disabled if settings read fails
                maxAttemptsPerHour: DEFAULT_MAX_ATTEMPTS_PER_HOUR,
                paymentExpiryHours: DEFAULT_PAYMENT_EXPIRY_HOURS
            };
        }
    }

    // ==================== 5a. PARSE PAYMENT MESSAGE ====================

    /**
     * Parse WhatsApp message to extract TXN ID and amount
     * Supports multiple flexible formats
     * @param {string} messageText - Raw message text
     * @returns {{ txnId: string, amount: number } | null}
     */
    parsePaymentMessage(messageText) {
        if (!messageText || typeof messageText !== 'string') return null;

        const text = messageText.trim();

        // Pattern 1: "TXNID: 123456789 Amount: 5000" or "TXNID: 123456789\nAmount: 5000"
        const pattern1 = /TXNID\s*[:\-]?\s*([A-Za-z0-9\-_]+)\s*[\n,;]?\s*Amount\s*[:\-]?\s*(\d+(?:\.\d+)?)/i;
        const match1 = text.match(pattern1);
        if (match1) {
            return { txnId: match1[1], amount: parseFloat(match1[2]) };
        }

        // Pattern 2: "TXN 123456789 5000"
        const pattern2 = /^(?:TXN|TXNID|Transaction)\s+([A-Za-z0-9\-_]+)\s+(\d+(?:\.\d+)?)\s*$/i;
        const match2 = text.match(pattern2);
        if (match2) {
            return { txnId: match2[1], amount: parseFloat(match2[2]) };
        }

        // Pattern 3: "verify 123456789 5000"
        const pattern3 = /^verify\s+([A-Za-z0-9\-_]+)\s+(\d+(?:\.\d+)?)\s*$/i;
        const match3 = text.match(pattern3);
        if (match3) {
            return { txnId: match3[1], amount: parseFloat(match3[2]) };
        }

        // Pattern 4: "Amount: 5000 TXNID: 123456789" (reversed order)
        const pattern4 = /Amount\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*[\n,;]?\s*TXNID\s*[:\-]?\s*([A-Za-z0-9\-_]+)/i;
        const match4 = text.match(pattern4);
        if (match4) {
            return { txnId: match4[2], amount: parseFloat(match4[1]) };
        }

        // Pattern 5: "123456789 5000" (auto-detect — strict: must START with digit, ≥8 chars to reduce false positives)
        // This prevents common words like "selamat 5000" from triggering
        const pattern5 = /^(\d[A-Za-z0-9\-_]{7,})\s+(\d+(?:\.\d+)?)\s*$/;
        const match5 = text.match(pattern5);
        if (match5) {
            const potentialAmount = parseFloat(match5[2]);
            if (potentialAmount > 0) {
                return { txnId: match5[1], amount: potentialAmount };
            }
        }

        return null;
    }

    // ==================== INPUT SANITIZATION ====================

    /**
     * Sanitize and validate TXN ID
     * Only alphanumeric + dash + underscore allowed
     */
    sanitizeTxnId(txnId) {
        if (!txnId || typeof txnId !== 'string') return null;
        const cleaned = txnId.trim().replace(/[^A-Za-z0-9\-_]/g, '');
        if (cleaned.length === 0 || cleaned.length > 100) return null;
        return cleaned;
    }

    /**
     * Sanitize and validate amount
     * Must be positive number
     */
    sanitizeAmount(amount) {
        const num = parseFloat(amount);
        if (isNaN(num) || num <= 0 || !isFinite(num)) return null;
        return num;
    }

    // ==================== 5b. RESOLVE USER MAPPING ====================

    /**
     * Find user mapping from WhatsApp number
     * Username ONLY comes from DB mapping, NEVER from WA message (anti-fraud)
     * @param {string} whatsappNumber - Sender's WA number
     * @param {string} panelOwnerId - Panel owner's user ID
     * @returns {Promise<{ mapping, panel }>}
     */
    async resolveUserMapping(whatsappNumber, panelOwnerId) {
        // Find all mappings for this panel owner
        const mappings = await prisma.userWhatsAppMapping.findMany({
            where: { userId: panelOwnerId }
        });

        // Check if any mapping contains this WA number
        let foundMapping = null;
        for (const mapping of mappings) {
            try {
                const numbers = JSON.parse(mapping.whatsappNumbers || '[]');
                if (numbers.includes(whatsappNumber)) {
                    foundMapping = mapping;
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!foundMapping) {
            return { mapping: null, panel: null, error: 'NO_MAPPING' };
        }

        // Check if mapping is active
        if (!foundMapping.isBotEnabled) {
            return { mapping: foundMapping, panel: null, error: 'MAPPING_DISABLED' };
        }

        if (foundMapping.isAutoSuspended) {
            return { mapping: foundMapping, panel: null, error: 'MAPPING_SUSPENDED' };
        }

        // Find the linked rental panel
        // We need to find which panel this user is associated with
        // The mapping has userId (panel owner) - we need to find their RENTAL panel with fonepay enabled
        const panels = await prisma.smmPanel.findMany({
            where: {
                userId: panelOwnerId,
                panelType: 'RENTAL',
                fonepayEnabled: true,
                isActive: true
            }
        });

        if (panels.length === 0) {
            // Check if there's a rental panel but fonepay is disabled
            const rentalPanels = await prisma.smmPanel.findMany({
                where: { userId: panelOwnerId, panelType: 'RENTAL', isActive: true }
            });

            if (rentalPanels.length === 0) {
                return { mapping: foundMapping, panel: null, error: 'PANEL_NOT_RENTAL' };
            }
            return { mapping: foundMapping, panel: null, error: 'PANEL_FONEPAY_DISABLED' };
        }

        // Use the first active rental panel with fonepay enabled
        const panel = panels[0];

        return { mapping: foundMapping, panel, error: null };
    }

    // ==================== 5d. CHECK DUPLICATE ====================

    /**
     * Check if transaction has already been processed
     * @param {string} txnId - Transaction ID
     * @param {string} panelId - Panel ID
     * @returns {Promise<boolean>}
     */
    async checkDuplicate(txnId, panelId) {
        const existing = await prisma.fonepayTransaction.findUnique({
            where: {
                txnId_panelId: { txnId, panelId }
            }
        });

        return !!existing;
    }

    // ==================== 6a. RATE LIMITING ====================

    /**
     * Check if WA number has exceeded rate limit
     * @param {string} whatsappNumber
     * @param {number} maxAttempts - Max attempts per hour (from settings)
     * @returns {Promise<boolean>} true if rate limited
     */
    async isRateLimited(whatsappNumber, maxAttempts = DEFAULT_MAX_ATTEMPTS_PER_HOUR) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        const recentAttempts = await prisma.fonepayAuditLog.count({
            where: {
                whatsappNumber,
                createdAt: { gte: oneHourAgo }
            }
        });

        return recentAttempts >= maxAttempts;
    }

    // ==================== 6e. SUSPICIOUS ACTIVITY DETECTION ====================

    /**
     * Check for suspicious activity patterns
     * @param {string} whatsappNumber
     * @param {string} txnId
     * @returns {Promise<{ suspicious: boolean, reason: string | null }>}
     */
    async checkSuspiciousActivity(whatsappNumber, txnId) {
        const windowStart = new Date(Date.now() - SUSPICIOUS_WINDOW_MINUTES * 60 * 1000);

        // Check 1: ≥3 failed attempts from same number in 30 minutes
        const failedAttempts = await prisma.fonepayAuditLog.count({
            where: {
                whatsappNumber,
                verificationResult: { not: 'success' },
                createdAt: { gte: windowStart }
            }
        });

        if (failedAttempts >= SUSPICIOUS_FAILED_THRESHOLD) {
            return { suspicious: true, reason: `${failedAttempts} failed attempts in ${SUSPICIOUS_WINDOW_MINUTES} minutes` };
        }

        // Check 2: Different numbers using same TXN ID
        const differentNumbers = await prisma.fonepayAuditLog.findMany({
            where: {
                txnId,
                whatsappNumber: { not: whatsappNumber },
                createdAt: { gte: windowStart }
            },
            select: { whatsappNumber: true },
            distinct: ['whatsappNumber']
        });

        if (differentNumbers.length > 0) {
            return { suspicious: true, reason: `TXN ID ${txnId} used by ${differentNumbers.length + 1} different numbers` };
        }

        // Check 3: Amount mismatches repeatedly (≥3x)
        const amountMismatches = await prisma.fonepayAuditLog.count({
            where: {
                whatsappNumber,
                verificationResult: 'amount_mismatch',
                createdAt: { gte: windowStart }
            }
        });

        if (amountMismatches >= 3) {
            return { suspicious: true, reason: `${amountMismatches} amount mismatches in ${SUSPICIOUS_WINDOW_MINUTES} minutes` };
        }

        return { suspicious: false, reason: null };
    }

    /**
     * Auto-suspend mapping if suspicious activity detected
     */
    async autoSuspendMapping(mappingId, reason) {
        await prisma.userWhatsAppMapping.update({
            where: { id: mappingId },
            data: {
                isAutoSuspended: true,
                suspendReason: `Auto-suspended: ${reason}`,
                suspendedAt: new Date()
            }
        });

        console.warn(`[FonePay] Auto-suspended mapping ${mappingId}: ${reason}`);
    }

    // ==================== 5c. VERIFY TRANSACTION ====================

    /**
     * Verify transaction via Rental Panel Admin API
     * Performs all 6 mandatory validation checks from Section 6.2
     */
    async verifyTransaction(panel, txnId, expectedAmount, expiryHours = DEFAULT_PAYMENT_EXPIRY_HOURS) {
        if (!this.adminApiService) {
            throw new Error('Admin API service not configured');
        }

        try {
            const endpoint = panel.fonepayVerifyEndpoint || '/adminapi/verify-payment';
            const response = await this.adminApiService.makeAdminRequest(
                panel, 'GET', endpoint, { txn_id: txnId }
            );

            // Check if API call itself failed (auth error, network error, etc.)
            if (!response || response.success === false) {
                return {
                    verified: false,
                    reason: 'api_error',
                    message: response?.error || 'Admin API request failed'
                };
            }

            // Validate response has data
            if (!response.data) {
                return {
                    verified: false,
                    reason: 'api_error',
                    message: 'Invalid API response — no data'
                };
            }

            const txnData = response.data;

            // Check 1: Transaction exists
            if (!txnData || txnData.error || !txnData.txn_id) {
                return {
                    verified: false,
                    reason: 'txn_not_found',
                    message: 'Transaction not found in payment system'
                };
            }

            // Check 2: Transaction belongs to same Rental Panel
            // This is inherently enforced because we call panel-specific API endpoint.
            // However, if the API returns panel_id info, cross-check it explicitly.
            if (txnData.panel_id && String(txnData.panel_id) !== String(panel.id)) {
                return {
                    verified: false,
                    reason: 'cross_panel',
                    message: 'Transaction does not belong to this panel'
                };
            }

            // Check 3: Status = SUCCESS/COMPLETED
            const validStatuses = ['success', 'completed', 'SUCCESS', 'COMPLETED'];
            if (!validStatuses.includes(txnData.status)) {
                return {
                    verified: false,
                    reason: 'txn_status_invalid',
                    message: `Transaction status is ${txnData.status}, not completed`
                };
            }

            // Check 4: Amount exact match (NO rounding allowed)
            const apiAmount = parseFloat(txnData.amount);
            if (apiAmount !== expectedAmount) {
                return {
                    verified: false,
                    reason: 'amount_mismatch',
                    apiAmount,
                    message: `Amount mismatch: entered ${expectedAmount}, API shows ${apiAmount}`
                };
            }

            // Check 6: Payment timestamp validity (optional expiry check)
            let paymentTimestamp = null;
            if (txnData.timestamp || txnData.created_at || txnData.payment_date) {
                paymentTimestamp = new Date(txnData.timestamp || txnData.created_at || txnData.payment_date);
                const hoursAgo = (Date.now() - paymentTimestamp.getTime()) / (1000 * 60 * 60);

                if (hoursAgo > expiryHours) {
                    return {
                        verified: false,
                        reason: 'txn_expired',
                        apiAmount,
                        paymentTimestamp,
                        message: `Transaction is ${Math.floor(hoursAgo)} hours old, exceeds ${expiryHours}h limit`
                    };
                }
            }

            // All checks passed
            return {
                verified: true,
                apiAmount,
                paymentTimestamp,
                reason: 'success',
                message: 'Transaction verified successfully'
            };

        } catch (error) {
            if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
                return {
                    verified: false,
                    reason: 'api_timeout',
                    message: 'API request timed out'
                };
            }

            return {
                verified: false,
                reason: 'api_error',
                message: `API error: ${error.message}`
            };
        }
    }

    // ==================== 5e. CREDIT FUNDS ====================

    /**
     * Credit funds to panel user via Admin Add Fund API
     */
    async creditFunds(panel, panelUsername, amount) {
        if (!this.adminApiService) {
            throw new Error('Admin API service not configured');
        }

        const endpoint = panel.fonepayAddFundEndpoint || '/adminapi/add-fund';
        const response = await this.adminApiService.makeAdminRequest(
            panel, 'POST', endpoint, { username: panelUsername, amount }
        );

        // Verify response success
        if (!response || response.success === false || response.error) {
            throw new Error(`Failed to credit funds: ${response?.error || 'Unknown error'}`);
        }

        return response;
    }

    // ==================== AUDIT LOGGING ====================

    /**
     * Create audit log entry
     */
    async createAuditLog({
        whatsappNumber, panelUsername, panelId, userId, txnId,
        amountEntered, amountFromApi, verificationResult,
        failureReason, deviceId, transactionId
    }) {
        try {
            await prisma.fonepayAuditLog.create({
                data: {
                    whatsappNumber: whatsappNumber || 'unknown',
                    panelUsername: panelUsername || 'unknown',
                    panelId,
                    userId,
                    txnId: txnId || 'unknown',
                    amountEntered: amountEntered || 0,
                    amountFromApi,
                    verificationResult,
                    failureReason,
                    deviceId,
                    transactionId
                }
            });
        } catch (error) {
            // Audit log failure should not break the main flow
            console.error('[FonePay] Failed to create audit log:', error.message);
        }
    }

    // ==================== 5f. MAIN ORCHESTRATOR ====================

    /**
     * Main orchestrator — process complete FonePay verification flow
     * @param {string} whatsappNumber - Sender's WA number
     * @param {string} rawTxnId - Raw transaction ID from message
     * @param {number} rawAmount - Raw amount from message
     * @param {string} deviceId - WhatsApp device ID
     * @param {string} panelOwnerId - Panel owner's user ID
     * @returns {Promise<{ success: boolean, message: string }>}
     */
    async processVerification(whatsappNumber, rawTxnId, rawAmount, deviceId, panelOwnerId) {
        // Sanitize inputs
        const txnId = this.sanitizeTxnId(rawTxnId);
        const amount = this.sanitizeAmount(rawAmount);

        if (!txnId || !amount) {
            return { success: false, message: MESSAGES.FORMAT_INVALID };
        }

        // Wrap entire flow in top-level try/catch for fail-safety
        let transaction = null;
        try {

            // Step 0: Check global FonePay enable setting
            const fonepaySettings = await this.getFonepaySettings(panelOwnerId);
            if (!fonepaySettings.globalEnabled) {
                return { success: false, message: '❌ FonePay verification is currently disabled. Please contact admin.' };
            }

            // Step 1: Resolve user mapping
            const { mapping, panel, error: mappingError } = await this.resolveUserMapping(whatsappNumber, panelOwnerId);

            if (mappingError) {
                // Try to find ANY panel for audit logging (Section 9.6: all cases must be logged)
                let auditPanelId = panel?.id;
                if (!auditPanelId) {
                    try {
                        const anyPanel = await prisma.smmPanel.findFirst({
                            where: { userId: panelOwnerId, isActive: true },
                            select: { id: true }
                        });
                        auditPanelId = anyPanel?.id;
                    } catch (e) { /* ignore */ }
                }

                if (auditPanelId) {
                    await this.createAuditLog({
                        whatsappNumber, panelUsername: mapping?.panelUsername || 'unknown',
                        panelId: auditPanelId, userId: panelOwnerId, txnId,
                        amountEntered: amount,
                        verificationResult: mappingError === 'NO_MAPPING' ? 'mapping_not_found' : mappingError.toLowerCase(),
                        failureReason: mappingError, deviceId
                    });
                }

                switch (mappingError) {
                    case 'NO_MAPPING': return { success: false, message: MESSAGES.NO_MAPPING };
                    case 'MAPPING_DISABLED': return { success: false, message: '❌ Akun Anda sedang dinonaktifkan. Hubungi admin untuk mengaktifkan kembali.' };
                    case 'MAPPING_SUSPENDED': return { success: false, message: MESSAGES.MAPPING_SUSPENDED };
                    case 'PANEL_NOT_RENTAL': return { success: false, message: MESSAGES.PANEL_NOT_RENTAL };
                    case 'PANEL_FONEPAY_DISABLED': return { success: false, message: MESSAGES.PANEL_FONEPAY_DISABLED };
                    default: return { success: false, message: MESSAGES.SYSTEM_ERROR };
                }
            }

            const panelUsername = mapping.panelUsername;
            const panelId = panel.id;

            // Step 2: Check duplicate FIRST (cheap check, gives clearer error message)
            const isDuplicate = await this.checkDuplicate(txnId, panelId);
            if (isDuplicate) {
                await this.createAuditLog({
                    whatsappNumber, panelUsername, panelId, userId: panelOwnerId, txnId,
                    amountEntered: amount, verificationResult: 'already_used',
                    failureReason: 'Transaction ID already processed', deviceId
                });
                return { success: false, message: MESSAGES.ALREADY_PROCESSED };
            }

            // Step 3: Check rate limit
            const rateLimited = await this.isRateLimited(whatsappNumber, fonepaySettings.maxAttemptsPerHour);
            if (rateLimited) {
                await this.createAuditLog({
                    whatsappNumber, panelUsername, panelId, userId: panelOwnerId, txnId,
                    amountEntered: amount, verificationResult: 'rate_limited',
                    failureReason: `Exceeded ${fonepaySettings.maxAttemptsPerHour} attempts per hour`, deviceId
                });
                return { success: false, message: MESSAGES.RATE_LIMITED };
            }

            // Step 4: Check suspicious activity
            const { suspicious, reason: suspiciousReason } = await this.checkSuspiciousActivity(whatsappNumber, txnId);
            if (suspicious && mapping) {
                await this.autoSuspendMapping(mapping.id, suspiciousReason);
                await this.createAuditLog({
                    whatsappNumber, panelUsername, panelId, userId: panelOwnerId, txnId,
                    amountEntered: amount, verificationResult: 'suspicious_activity',
                    failureReason: suspiciousReason, deviceId
                });
                return { success: false, message: MESSAGES.MAPPING_SUSPENDED };
            }

            // Step 5: Create transaction record (status: verifying)
            try {
                transaction = await prisma.fonepayTransaction.create({
                    data: {
                        whatsappNumber,
                        panelUsername,
                        panelId,
                        userId: panelOwnerId,
                        txnId,
                        source: 'WHATSAPP_FONEPAY',
                        amountEntered: amount,
                        status: 'verifying'
                    }
                });
            } catch (error) {
                // Unique constraint violation = duplicate (race condition protection)
                if (error.code === 'P2002') {
                    await this.createAuditLog({
                        whatsappNumber, panelUsername, panelId, userId: panelOwnerId, txnId,
                        amountEntered: amount, verificationResult: 'already_used',
                        failureReason: 'Duplicate TXN ID (race condition)', deviceId
                    });
                    return { success: false, message: MESSAGES.ALREADY_PROCESSED };
                }
                throw error;
            }

            // Step 6: Verify via Admin API
            const verifyResult = await this.verifyTransaction(panel, txnId, amount, fonepaySettings.paymentExpiryHours);

            if (!verifyResult.verified) {
                // Update transaction status
                await prisma.fonepayTransaction.update({
                    where: { id: transaction.id },
                    data: {
                        status: 'rejected',
                        rejectionReason: verifyResult.message,
                        amountVerified: verifyResult.apiAmount || null,
                        paymentTimestamp: verifyResult.paymentTimestamp || null
                    }
                });

                await this.createAuditLog({
                    whatsappNumber, panelUsername, panelId, userId: panelOwnerId, txnId,
                    amountEntered: amount, amountFromApi: verifyResult.apiAmount,
                    verificationResult: verifyResult.reason,
                    failureReason: verifyResult.message, deviceId,
                    transactionId: transaction.id
                });

                switch (verifyResult.reason) {
                    case 'txn_not_found': return { success: false, message: MESSAGES.TXN_NOT_FOUND };
                    case 'txn_status_invalid': return { success: false, message: MESSAGES.TXN_STATUS_INVALID };
                    case 'amount_mismatch': return { success: false, message: MESSAGES.AMOUNT_MISMATCH };
                    case 'api_timeout': return { success: false, message: MESSAGES.API_TIMEOUT };
                    case 'txn_expired': return { success: false, message: MESSAGES.TXN_EXPIRED };
                    case 'cross_panel': return { success: false, message: MESSAGES.TXN_NOT_FOUND };
                    default: return { success: false, message: MESSAGES.SYSTEM_ERROR };
                }
            }

            // Step 7: Update to verified
            await prisma.fonepayTransaction.update({
                where: { id: transaction.id },
                data: {
                    status: 'verified',
                    amountVerified: verifyResult.apiAmount,
                    paymentTimestamp: verifyResult.paymentTimestamp,
                    verifiedAt: new Date()
                }
            });

            // Step 8: Credit funds via Admin API
            let creditSuccess = false;
            try {
                await this.creditFunds(panel, panelUsername, amount);
                creditSuccess = true;
            } catch (creditError) {
                // Credit API failed — mark as failed, admin can retry
                console.error(`[FonePay] Credit API failed for TXN ${txnId}:`, creditError.message);

                await prisma.fonepayTransaction.update({
                    where: { id: transaction.id },
                    data: {
                        status: 'failed',
                        rejectionReason: `Credit failed: ${creditError.message}`
                    }
                });

                await this.createAuditLog({
                    whatsappNumber, panelUsername, panelId, userId: panelOwnerId, txnId,
                    amountEntered: amount, amountFromApi: verifyResult.apiAmount,
                    verificationResult: 'credit_failed',
                    failureReason: `Credit API failed: ${creditError.message}`,
                    deviceId, transactionId: transaction.id
                });

                return { success: false, message: MESSAGES.CREDIT_FAILED };
            }

            // Step 9: Mark as credited in DB (credit already happened via API)
            try {
                await prisma.fonepayTransaction.update({
                    where: { id: transaction.id },
                    data: {
                        status: 'credited',
                        creditedAt: new Date()
                    }
                });

                // Section 8.2: Create internal wallet record
                try {
                    await prisma.walletTransaction.create({
                        data: {
                            userId: panelOwnerId,
                            type: 'TOPUP',
                            amount: amount,
                            status: 'COMPLETED',
                            gateway: 'FONEPAY_WHATSAPP',
                            gatewayRef: txnId,
                            description: `FonePay via WhatsApp — TXN: ${txnId}, Panel user: ${panelUsername}`,
                            metadata: JSON.stringify({
                                source: 'WHATSAPP_FONEPAY',
                                txnId,
                                panelUsername,
                                panelId,
                                whatsappNumber,
                                fonepayTransactionId: transaction.id
                            })
                        }
                    });
                } catch (walletErr) {
                    // Wallet record is supplementary — don't block main flow
                    console.error(`[FonePay] Failed to create wallet record for TXN ${txnId}:`, walletErr.message);
                }

                // Audit log: success
                await this.createAuditLog({
                    whatsappNumber, panelUsername, panelId, userId: panelOwnerId, txnId,
                    amountEntered: amount, amountFromApi: verifyResult.apiAmount,
                    verificationResult: 'success', deviceId,
                    transactionId: transaction.id
                });

                return { success: true, message: MESSAGES.SUCCESS(amount, panel.currency || 'NPR') };

            } catch (dbError) {
                // CRITICAL: Money was credited via API but DB update failed
                // DO NOT set status to 'failed' — that could lead to admin re-approving → double credit
                console.error(`[FonePay] CRITICAL: TXN ${txnId} was CREDITED via API but DB update failed:`, dbError.message);

                // Try to set a distinct status so admin knows funds WERE credited
                try {
                    await prisma.fonepayTransaction.update({
                        where: { id: transaction.id },
                        data: {
                            status: 'credit_unconfirmed',
                            rejectionReason: `CRITICAL: Funds were credited via API but DB update failed: ${dbError.message}`,
                            creditedAt: new Date()
                        }
                    });
                } catch (e) {
                    console.error(`[FonePay] DOUBLE CRITICAL: Cannot even update TXN ${txnId} status:`, e.message);
                }

                await this.createAuditLog({
                    whatsappNumber, panelUsername, panelId, userId: panelOwnerId, txnId,
                    amountEntered: amount, amountFromApi: verifyResult.apiAmount,
                    verificationResult: 'credit_unconfirmed',
                    failureReason: `CRITICAL: Credited via API but DB save failed: ${dbError.message}`,
                    deviceId, transactionId: transaction.id
                });

                // Still tell user it succeeded (because their money WAS credited)
                return { success: true, message: MESSAGES.SUCCESS(amount, panel.currency || 'NPR') };
            }

        } catch (unexpectedError) {
            // Top-level catch — prevents unhandled errors from leaving transactions in limbo
            console.error(`[FonePay] UNEXPECTED ERROR in processVerification:`, unexpectedError);

            // Try to mark transaction as failed if it was created
            if (transaction?.id) {
                try {
                    await prisma.fonepayTransaction.update({
                        where: { id: transaction.id },
                        data: {
                            status: 'failed',
                            rejectionReason: `System error: ${unexpectedError.message}`
                        }
                    });
                } catch (e) { /* best effort */ }
            }

            return { success: false, message: MESSAGES.SYSTEM_ERROR };
        }
    }

    /**
     * Check if a message looks like a FonePay payment message
     * Used for auto-detection without requiring command prefix
     */
    isFonepayMessage(messageText) {
        return this.parsePaymentMessage(messageText) !== null;
    }

    /**
     * Quick pre-check: does this WA number have a FonePay-enabled panel?
     * Also checks global FonePay enable setting.
     * Used by botMessageHandler to avoid false-positive auto-detection.
     * Returns true only if: global enabled + active mapping + fonepay-enabled rental panel.
     */
    async hasFonepayMapping(whatsappNumber, panelOwnerId) {
        try {
            // Check global setting first
            const settings = await this.getFonepaySettings(panelOwnerId);
            if (!settings.globalEnabled) return false;

            const { error } = await this.resolveUserMapping(whatsappNumber, panelOwnerId);
            return !error;
        } catch {
            return false;
        }
    }
}

// Export singleton + messages for reuse
const fonepayService = new FonepayService();

module.exports = fonepayService;
module.exports.FonepayService = FonepayService;
module.exports.FONEPAY_MESSAGES = MESSAGES;
