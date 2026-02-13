/**
 * Manual Payment Approval Service
 * For bank transfer and other manual payment methods
 * 
 * Flow:
 * 1. User submits payment request with proof
 * 2. Admin reviews in dashboard
 * 3. Admin approves/rejects
 * 4. User wallet credited on approval
 */

const prisma = require('../../utils/prisma');
const path = require('path');
const fs = require('fs');

class ManualPaymentService {
    constructor() {
        // Upload directory for payment proofs
        this.uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads/payment-proofs');

        // Ensure upload directory exists
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }

        console.log('[ManualPayment] Service initialized');
    }

    /**
     * Create a manual payment request
     * @param {Object} params - Payment parameters
     * @returns {Object} Payment request data
     */
    async createPaymentRequest(params) {
        const { userId, amount, paymentMethod, proofUrl, notes } = params;

        // Generate reference number
        const refNumber = `MAN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

        try {
            const transaction = await prisma.walletTransaction.create({
                data: {
                    userId,
                    type: 'TOPUP',
                    amount: parseFloat(amount),
                    status: 'PENDING_APPROVAL',
                    gateway: 'MANUAL',
                    gatewayRef: refNumber,
                    description: `Manual payment via ${paymentMethod}`,
                    metadata: JSON.stringify({
                        paymentMethod,
                        proofUrl,
                        notes,
                        submittedAt: new Date().toISOString()
                    })
                }
            });

            return {
                success: true,
                refNumber,
                transactionId: transaction.id,
                status: 'PENDING_APPROVAL',
                message: 'Payment request submitted. Awaiting admin approval.'
            };
        } catch (error) {
            console.error('[ManualPayment] Create request error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get all pending payment requests (Admin)
     * @returns {Array} Pending payments
     */
    async getPendingPayments() {
        try {
            const payments = await prisma.walletTransaction.findMany({
                where: {
                    gateway: 'MANUAL',
                    status: 'PENDING_APPROVAL'
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                            phone: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            });

            return payments.map(p => {
                let parsedMetadata = {};
                if (p.metadata) {
                    try {
                        parsedMetadata = JSON.parse(p.metadata);
                    } catch (e) {
                        parsedMetadata = { _parseError: true };
                    }
                }
                return {
                    ...p,
                    metadata: parsedMetadata
                };
            });
        } catch (error) {
            console.error('[ManualPayment] Get pending error:', error);
            return [];
        }
    }

    /**
     * Approve a payment request (Admin)
     * @param {string} transactionId - Transaction ID
     * @param {string} adminId - Admin user ID
     * @param {string} adminNotes - Optional admin notes
     * @returns {Object} Result
     */
    async approvePayment(transactionId, adminId, adminNotes = '') {
        try {
            const transaction = await prisma.walletTransaction.findUnique({
                where: { id: transactionId },
                include: { user: true }
            });

            if (!transaction) {
                return { success: false, error: 'Transaction not found' };
            }

            if (transaction.status !== 'PENDING_APPROVAL') {
                return { success: false, error: 'Transaction already processed' };
            }

            // Update transaction status
            // Parse metadata safely
            let existingMetadata = {};
            try {
                existingMetadata = JSON.parse(transaction.metadata || '{}');
            } catch (e) {
                existingMetadata = {};
            }
            await prisma.walletTransaction.update({
                where: { id: transactionId },
                data: {
                    status: 'COMPLETED',
                    metadata: JSON.stringify({
                        ...existingMetadata,
                        approvedBy: adminId,
                        approvedAt: new Date().toISOString(),
                        adminNotes
                    })
                }
            });

            // Credit user wallet
            await prisma.user.update({
                where: { id: transaction.userId },
                data: {
                    creditBalance: {
                        increment: transaction.amount
                    }
                }
            });

            // Log admin activity
            await prisma.activityLog.create({
                data: {
                    userId: adminId,
                    action: 'APPROVE_PAYMENT',
                    category: 'admin',
                    description: `Approved payment ${transactionId}`,
                    metadata: JSON.stringify({
                        transactionId,
                        amount: transaction.amount,
                        targetUserId: transaction.userId
                    }),
                    ipAddress: 'system'
                }
            });

            console.log(`[ManualPayment] Approved: ${transactionId}, credited ${transaction.amount} to ${transaction.userId}`);

            // Auto-generate invoice
            try {
                const invoiceService = require('../invoiceService');
                await invoiceService.createFromPayment({
                    userId: transaction.userId,
                    amount: transaction.amount,
                    currency: 'USD',
                    method: 'MANUAL',
                    description: `Credit Top-Up via Manual Payment`,
                    metadata: { gateway: 'manual', approvedBy: adminId }
                });
            } catch (invoiceError) {
                console.error('[ManualPayment] Invoice generation failed:', invoiceError.message);
            }

            return {
                success: true,
                transactionId,
                amount: transaction.amount,
                userId: transaction.userId
            };
        } catch (error) {
            console.error('[ManualPayment] Approve error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Reject a payment request (Admin)
     * @param {string} transactionId - Transaction ID
     * @param {string} adminId - Admin user ID
     * @param {string} reason - Rejection reason
     * @returns {Object} Result
     */
    async rejectPayment(transactionId, adminId, reason = '') {
        try {
            const transaction = await prisma.walletTransaction.findUnique({
                where: { id: transactionId }
            });

            if (!transaction) {
                return { success: false, error: 'Transaction not found' };
            }

            if (transaction.status !== 'PENDING_APPROVAL') {
                return { success: false, error: 'Transaction already processed' };
            }

            // Update transaction status
            // Parse metadata safely
            let existingMetadata = {};
            try {
                existingMetadata = JSON.parse(transaction.metadata || '{}');
            } catch (e) {
                existingMetadata = {};
            }
            await prisma.walletTransaction.update({
                where: { id: transactionId },
                data: {
                    status: 'REJECTED',
                    metadata: JSON.stringify({
                        ...existingMetadata,
                        rejectedBy: adminId,
                        rejectedAt: new Date().toISOString(),
                        rejectionReason: reason
                    })
                }
            });

            // Log admin activity
            await prisma.activityLog.create({
                data: {
                    userId: adminId,
                    action: 'REJECT_PAYMENT',
                    category: 'admin',
                    description: `Rejected payment ${transactionId}`,
                    metadata: JSON.stringify({
                        transactionId,
                        reason
                    }),
                    ipAddress: 'system'
                }
            });

            console.log(`[ManualPayment] Rejected: ${transactionId}, reason: ${reason}`);

            return {
                success: true,
                transactionId,
                status: 'REJECTED'
            };
        } catch (error) {
            console.error('[ManualPayment] Reject error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get payment methods for manual payments
     */
    getPaymentMethods() {
        // These can be configured via admin settings
        return [
            {
                id: 'bank_transfer',
                name: 'Bank Transfer',
                icon: '🏦',
                instructions: 'Transfer to our bank account and upload the receipt',
                details: {
                    bankName: process.env.BANK_NAME || 'Example Bank',
                    accountName: process.env.BANK_ACCOUNT_NAME || 'SMMChatBot LLC',
                    accountNumber: process.env.BANK_ACCOUNT_NUMBER || 'XXXX-XXXX-XXXX'
                }
            },
            {
                id: 'paypal',
                name: 'PayPal',
                icon: '💳',
                instructions: 'Send payment to our PayPal and share transaction ID',
                details: {
                    email: process.env.PAYPAL_EMAIL || 'payments@example.com'
                }
            },
            {
                id: 'wise',
                name: 'Wise (TransferWise)',
                icon: '💸',
                instructions: 'Transfer via Wise and upload confirmation',
                details: {
                    email: process.env.WISE_EMAIL || 'payments@example.com'
                }
            }
        ];
    }

    /**
     * Get gateway info
     */
    async getGatewayInfo() {
        return {
            id: 'manual',
            name: 'Manual Payment',
            description: 'Bank Transfer, PayPal, or other manual methods',
            icon: '🏦',
            currency: 'USD',
            minAmount: 5,
            maxAmount: 10000,
            isAvailable: true,
            requiresProof: true,
            processingTime: '1-24 hours'
        };
    }
}

module.exports = new ManualPaymentService();
