/**
 * Conversation State Service
 * 
 * Manages multi-step conversation flows like username verification
 * Tracks conversation state and handles step progression
 */

const prisma = require('../utils/prisma');

// Conversation state types
const STATE_TYPES = {
    USERNAME_VERIFICATION: 'USERNAME_VERIFICATION',
    EMAIL_VERIFICATION: 'EMAIL_VERIFICATION',
    REGISTRATION: 'REGISTRATION'
};

// Conversation steps
const STEPS = {
    AWAITING_USERNAME: 'AWAITING_USERNAME',
    AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED'
};

// Default expiry time (5 minutes)
const DEFAULT_EXPIRY_MINUTES = 5;

class ConversationStateService {
    /**
     * Check if there's an active conversation for this sender
     */
    async getActiveConversation(senderPhone, userId, stateType = null) {
        const where = {
            senderPhone,
            userId,
            expiresAt: { gt: new Date() }
        };

        if (stateType) {
            where.stateType = stateType;
        }

        const conversation = await prisma.conversationState.findFirst({
            where,
            orderBy: { createdAt: 'desc' }
        });

        if (conversation) {
            try {
                conversation.context = JSON.parse(conversation.contextData || '{}');
            } catch {
                conversation.context = {};
            }
        }

        return conversation;
    }

    /**
     * Create a new conversation state
     */
    async createConversation(params) {
        const {
            senderPhone,
            userId,
            platform = 'WHATSAPP',
            stateType,
            currentStep,
            context = {},
            expiryMinutes = DEFAULT_EXPIRY_MINUTES
        } = params;

        // Delete any existing conversation of this type
        await prisma.conversationState.deleteMany({
            where: { senderPhone, userId, stateType }
        });

        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

        const conversation = await prisma.conversationState.create({
            data: {
                senderPhone,
                userId,
                platform,
                stateType,
                currentStep,
                contextData: JSON.stringify(context),
                expiresAt
            }
        });

        conversation.context = context;
        return conversation;
    }

    /**
     * Update conversation state
     */
    async updateConversation(conversationId, updates) {
        const data = {};

        if (updates.currentStep) {
            data.currentStep = updates.currentStep;
        }

        if (updates.context) {
            data.contextData = JSON.stringify(updates.context);
        }

        if (updates.extendExpiry) {
            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + (updates.expiryMinutes || DEFAULT_EXPIRY_MINUTES));
            data.expiresAt = expiresAt;
        }

        const conversation = await prisma.conversationState.update({
            where: { id: conversationId },
            data
        });

        try {
            conversation.context = JSON.parse(conversation.contextData || '{}');
        } catch {
            conversation.context = {};
        }

        return conversation;
    }

    /**
     * Delete/complete a conversation
     */
    async completeConversation(conversationId) {
        await prisma.conversationState.delete({
            where: { id: conversationId }
        });
    }

    /**
     * Delete conversation by sender
     */
    async deleteConversation(senderPhone, userId, stateType = null) {
        const where = { senderPhone, userId };
        if (stateType) {
            where.stateType = stateType;
        }

        await prisma.conversationState.deleteMany({ where });
    }

    /**
     * Clean up expired conversations
     */
    async cleanupExpired() {
        const result = await prisma.conversationState.deleteMany({
            where: {
                expiresAt: { lt: new Date() }
            }
        });

        return result.count;
    }

    // ==================== USERNAME VERIFICATION FLOW ====================

    /**
     * Start username verification flow
     */
    async startUsernameVerification(params) {
        const { senderPhone, userId, platform, orderId, command, orderUsername } = params;

        const context = {
            orderId,
            command,
            orderUsername, // The username from order record
            attempts: 0,
            maxAttempts: 3
        };

        const conversation = await this.createConversation({
            senderPhone,
            userId,
            platform,
            stateType: STATE_TYPES.USERNAME_VERIFICATION,
            currentStep: STEPS.AWAITING_USERNAME,
            context
        });

        // Return the prompt message
        return {
            conversation,
            message: this.getUsernamePromptMessage(orderId)
        };
    }

    /**
     * Process username verification response
     */
    async processUsernameVerification(conversation, providedUsername) {
        const context = conversation.context;
        const expectedUsername = context.orderUsername;

        // Normalize usernames for comparison (case-insensitive, trim whitespace)
        const normalizedProvided = (providedUsername || '').trim().toLowerCase();
        const normalizedExpected = (expectedUsername || '').trim().toLowerCase();

        // DEBUG: Log what's being compared
        console.log(`[UsernameVerification] Order: ${context.orderId}`);
        console.log(`[UsernameVerification] Expected username (raw): "${expectedUsername}"`);
        console.log(`[UsernameVerification] Provided username (raw): "${providedUsername}"`);
        console.log(`[UsernameVerification] Expected (normalized): "${normalizedExpected}"`);
        console.log(`[UsernameVerification] Provided (normalized): "${normalizedProvided}"`);
        console.log(`[UsernameVerification] Match: ${normalizedProvided === normalizedExpected}`);

        context.attempts = (context.attempts || 0) + 1;

        // Check if username matches
        if (normalizedProvided === normalizedExpected) {
            // Success! Mark as verified
            await this.completeConversation(conversation.id);

            return {
                success: true,
                verified: true,
                message: '✅ Username verified! Processing your request...',
                canProceed: true,
                context
            };
        }

        // Username doesn't match
        if (context.attempts >= context.maxAttempts) {
            // Max attempts reached
            await this.completeConversation(conversation.id);

            return {
                success: false,
                verified: false,
                message: `❌ Verification failed. Maximum attempts (${context.maxAttempts}) reached.\n\nThe username you provided does not match our records for Order #${context.orderId}.\n\nPlease contact support if you believe this is an error.`,
                canProceed: false,
                context
            };
        }

        // Update attempts and prompt again
        await this.updateConversation(conversation.id, {
            context,
            extendExpiry: true
        });

        const remainingAttempts = context.maxAttempts - context.attempts;
        return {
            success: false,
            verified: false,
            message: `❌ Username does not match.\n\nPlease enter your panel username exactly as registered.\n\n⚠️ Attempts remaining: ${remainingAttempts}`,
            canProceed: false,
            context
        };
    }

    /**
     * Get username prompt message
     */
    getUsernamePromptMessage(orderId) {
        return `🔐 *Username Verification Required*

To process Order #${orderId}, please verify your identity.

📝 *Reply with your panel username:*

Example: If your username is "john123", just reply:
john123

⏱️ This verification expires in 5 minutes.`;
    }

    /**
     * Check if a message is a verification response
     * (Not a command, just plain text that could be a username)
     */
    isVerificationResponse(message) {
        const text = (message || '').trim();

        // If it looks like a command (contains order IDs and command words), it's not a verification response
        const commandPattern = /^\d+[\s,]+\w+|^\d+\s+(refill|cancel|status|speed)/i;
        if (commandPattern.test(text)) {
            return false;
        }

        // If it's a single word or short phrase, it could be a username
        // Usernames are typically alphanumeric, possibly with underscores/dots
        if (text.length > 0 && text.length <= 50 && !text.includes('\n')) {
            return true;
        }

        return false;
    }

    // ==================== REGISTRATION FLOW ====================

    /**
     * Start registration flow for unregistered users
     * Called when WA-first lookup finds no mapping for sender's number
     */
    async startRegistration(params) {
        const { senderPhone, userId, platform = 'WHATSAPP', deviceId, panelIds } = params;

        const context = {
            deviceId,
            panelIds: panelIds || [],
            attempts: 0,
            maxAttempts: 3
        };

        const conversation = await this.createConversation({
            senderPhone,
            userId,
            platform,
            stateType: STATE_TYPES.REGISTRATION,
            currentStep: STEPS.AWAITING_USERNAME,
            context
        });

        return {
            conversation,
            message: this.getRegistrationPromptMessage()
        };
    }

    /**
     * Process registration response (user sends their panel username)
     */
    async processRegistration(conversation, providedUsername, userId) {
        const context = conversation.context;
        context.attempts = (context.attempts || 0) + 1;
        const senderPhone = conversation.senderPhone;

        const normalizedUsername = (providedUsername || '').trim();
        if (!normalizedUsername) {
            return {
                success: false,
                message: '❌ Please send a valid username.'
            };
        }

        console.log(`[Registration] Processing registration for WA ${senderPhone}: username="${normalizedUsername}"`);

        const userMappingService = require('./userMappingService');

        // Step 1: Check if username already linked to another WA number
        const existingMapping = await userMappingService.findByUsername(userId, normalizedUsername);
        if (existingMapping) {
            const existingNumbers = existingMapping.whatsappNumbers || [];
            const normalizedSender = userMappingService.normalizePhone(senderPhone);

            // If already linked to THIS number, just complete
            if (existingNumbers.includes(normalizedSender)) {
                await this.completeConversation(conversation.id);
                return {
                    success: true,
                    message: '✅ Your number is already registered with this username. You can now use commands.'
                };
            }

            // Linked to another number
            await this.completeConversation(conversation.id);

            // Get support number from settings
            let supportNumber = '';
            try {
                const botFeatureService = require('./botFeatureService');
                const toggles = await botFeatureService.getToggles(userId, {});
                supportNumber = toggles?.supportContactNumber || '';
            } catch (e) { /* non-critical */ }

            const supportMsg = supportNumber
                ? `Please contact WhatsApp support team at ${supportNumber}.`
                : 'Please contact the support team.';

            return {
                success: false,
                message: `❌ This username is already linked with another WhatsApp number.\n\n${supportMsg}`
            };
        }

        // Step 2: Validate username exists in panel via Admin API
        let usernameValid = false;
        const panelIds = context.panelIds || [];

        if (panelIds.length > 0) {
            try {
                const adminApiService = require('./adminApiService');
                const prismaClient = require('../utils/prisma');

                for (const panelId of panelIds) {
                    const panel = await prismaClient.smmPanel.findUnique({ where: { id: panelId } });
                    if (panel && panel.adminApiKey) {
                        const result = await adminApiService.validateUsername(panel, normalizedUsername);
                        if (result.exists) {
                            usernameValid = true;
                            console.log(`[Registration] Username "${normalizedUsername}" validated on panel ${panel.alias || panel.name}`);
                            break;
                        }
                    }
                }
            } catch (err) {
                console.error(`[Registration] Username validation error:`, err.message);
                // If Admin API fails, allow registration anyway (graceful degradation)
                usernameValid = true;
                console.log(`[Registration] Admin API validation failed — allowing registration as fallback`);
            }
        } else {
            // No panels configured — skip validation
            usernameValid = true;
            console.log(`[Registration] No panel IDs available — skipping username validation`);
        }

        if (!usernameValid) {
            // Username not found in any panel
            if (context.attempts >= context.maxAttempts) {
                await this.completeConversation(conversation.id);
                return {
                    success: false,
                    message: `❌ Username not found. Maximum attempts (${context.maxAttempts}) reached.\n\nPlease contact support if you need help.`
                };
            }

            await this.updateConversation(conversation.id, {
                context,
                extendExpiry: true
            });

            const remaining = context.maxAttempts - context.attempts;
            return {
                success: false,
                message: `❌ Username "${normalizedUsername}" not found in the panel.\n\nPlease check and send your correct username.\n\n⚠️ Attempts remaining: ${remaining}`
            };
        }

        // Step 3: Create mapping
        try {
            const normalizedSender = userMappingService.normalizePhone(senderPhone);
            const newMapping = await userMappingService.createMapping(userId, {
                panelUsername: normalizedUsername,
                panelId: panelIds.length > 0 ? panelIds[0] : null,
                whatsappNumbers: [normalizedSender],
                whatsappName: null,
                isBotEnabled: true,
                isVerified: false,
                adminNotes: `Self-registered via WhatsApp DM`
            });

            console.log(`[Registration] Created mapping ID ${newMapping.id}: username="${normalizedUsername}", WA=${normalizedSender}`);

            await this.completeConversation(conversation.id);

            return {
                success: true,
                message: `✅ Registration successful!\n\nYour username *${normalizedUsername}* is now linked with your WhatsApp number.\n\nYou can now use bot commands.`,
                mapping: newMapping
            };
        } catch (createErr) {
            console.error(`[Registration] Failed to create mapping:`, createErr.message);
            await this.completeConversation(conversation.id);
            return {
                success: false,
                message: '❌ Registration failed. Please try again later or contact support.'
            };
        }
    }

    /**
     * Get registration prompt message
     */
    getRegistrationPromptMessage() {
        return `📝 *Registration Required*

Your WhatsApp number is not registered yet.

Please send your *panel username* to register:

Example: If your username is "john123", just reply:
john123

⏱️ This registration expires in 5 minutes.`;
    }
}

// Export singleton and constants
const conversationStateService = new ConversationStateService();
module.exports = conversationStateService;
module.exports.STATE_TYPES = STATE_TYPES;
module.exports.STEPS = STEPS;
