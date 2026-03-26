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
        const responseTemplateService = require('./responseTemplateService');
        const promptMessage = await responseTemplateService.getResponse(userId, 'VERIFY_USERNAME_PROMPT', { order_id: String(orderId) }) || this.getUsernamePromptMessage(orderId);
        return {
            conversation,
            message: promptMessage
        };
    }

    /**
     * Process username verification response
     */
    async processUsernameVerification(conversation, providedUsername) {
        const context = conversation.context;
        const expectedUsername = context.orderUsername;
        const responseTemplateService = require('./responseTemplateService');

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
                message: await responseTemplateService.getResponse(conversation.userId, 'VERIFY_USERNAME_SUCCESS') || '✅ Username verified! Processing your request...',
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
                message: await responseTemplateService.getResponse(conversation.userId, 'VERIFY_USERNAME_MAX_ATTEMPTS', {
                    max_attempts: String(context.maxAttempts),
                    order_id: String(context.orderId)
                }) || `❌ Verification failed. Maximum attempts (${context.maxAttempts}) reached.\n\nThe username you provided does not match our records for Order #${context.orderId}.\n\nPlease contact support if you believe this is an error.`,
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
            message: await responseTemplateService.getResponse(conversation.userId, 'VERIFY_USERNAME_MISMATCH', {
                remaining_attempts: String(remainingAttempts)
            }) || `❌ Username does not match.\n\nPlease enter your panel username exactly as registered.\n\n⚠️ Attempts remaining: ${remainingAttempts}`,
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

        // Must look like a valid username: 2-100 chars, alphanumeric + common special chars, no spaces
        // Supports: john123, user_name, user.name, user@email.com, Avi@06, user-name, SPK~OFFICIAL
        if (/^[a-zA-Z0-9_.@~+#!-]{2,100}$/.test(text)) {
            return true;
        }

        return false;
    }

    // ==================== REGISTRATION FLOW ====================

    /**
     * Load custom registration messages from BotFeatureToggles
     * Falls back to defaults if not set
     */
    async _getRegistrationMessages(userId) {
        let toggles = {};
        try {
            const botFeatureService = require('./botFeatureService');
            toggles = await botFeatureService.getToggles(userId, {});
        } catch (e) { /* use defaults */ }
        return {
            prompt: toggles?.registrationPromptMsg || null,
            success: toggles?.registrationSuccessMsg || null,
            notFound: toggles?.registrationNotFoundMsg || null,
            alreadyLinked: toggles?.registrationAlreadyLinkedMsg || null,
            supportNumber: toggles?.supportContactNumber || ''
        };
    }

    /**
     * Replace template variables in a message
     */
    _replaceVars(template, vars = {}) {
        let msg = template;
        for (const [key, value] of Object.entries(vars)) {
            msg = msg.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
        }
        return msg;
    }

    /**
     * Start registration flow for unregistered users
     * Called when WA-first lookup finds no mapping for sender's number
     */
    async startRegistration(params) {
        const { senderPhone, userId, platform = 'WHATSAPP', deviceId, panelIds, defaultPanelId } = params;

        const context = {
            deviceId,
            panelIds: panelIds || [],
            defaultPanelId: defaultPanelId || null,  // Device's default panel for DM
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

        // Load custom prompt message
        const msgs = await this._getRegistrationMessages(userId);
        const responseTemplateService = require('./responseTemplateService');
        const templatePrompt = await responseTemplateService.getResponse(userId, 'REGISTRATION_PROMPT');
        // Priority: template > custom toggle > hardcoded fallback
        const promptMsg = templatePrompt
            || (msgs.prompt ? this._replaceVars(msgs.prompt, {}) : null)
            || this.getRegistrationPromptMessage();

        return {
            conversation,
            message: promptMsg
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
            const responseTemplateService = require('./responseTemplateService');
            return {
                success: false,
                message: await responseTemplateService.getResponse(userId, 'REGISTRATION_INVALID_USERNAME') || '❌ Please send a valid username.'
            };
        }

        console.log(`[Registration] Processing registration for WA ${senderPhone}: username="${normalizedUsername}"`);

        const userMappingService = require('./userMappingService');

        // Step 1: Check if username already linked to another WA number
        // Only block for SAME panel — cross-panel registration is allowed
        const existingMapping = await userMappingService.findByUsername(userId, normalizedUsername);
        if (existingMapping) {
            const existingNumbers = existingMapping.whatsappNumbers || [];
            const normalizedSender = userMappingService.normalizePhone(senderPhone);

            // If already linked to THIS number, just complete
            if (existingNumbers.includes(normalizedSender)) {
                await this.completeConversation(conversation.id);
                const responseTemplateService = require('./responseTemplateService');
                return {
                    success: true,
                    message: await responseTemplateService.getResponse(userId, 'REGISTRATION_ALREADY_LINKED') || '✅ Your number is already registered with this username. You can now use commands.'
                };
            }

            // Linked to another number — only block if SAME panel (cross-panel is allowed)
            const targetPanelIds = context.panelIds || [];
            const existingPanelId = existingMapping.panelId;
            const isSamePanel = targetPanelIds.length === 0 || targetPanelIds.includes(existingPanelId);

            if (isSamePanel) {
                await this.completeConversation(conversation.id);

                // Load custom messages
                const msgs = await this._getRegistrationMessages(userId);
                const supportMsg = msgs.supportNumber
                    ? `Please contact WhatsApp support team at ${msgs.supportNumber}.`
                    : 'Please contact the support team.';

                const responseTemplateService = require('./responseTemplateService');
                const templateMsg = await responseTemplateService.getResponse(userId, 'REGISTRATION_USERNAME_TAKEN', { username: normalizedUsername });
                // Priority: template > custom toggle > hardcoded fallback
                const alreadyLinkedMsg = templateMsg
                    || (msgs.alreadyLinked ? this._replaceVars(msgs.alreadyLinked, { username: normalizedUsername, support_number: msgs.supportNumber }) : null)
                    || `❌ This username is already linked with another WhatsApp number.\n\n${supportMsg}`;

                return {
                    success: false,
                    message: alreadyLinkedMsg
                };
            }
            // Different panel — allow registration to continue
            console.log(`[Registration] Username "${normalizedUsername}" exists on panel ${existingPanelId} but target panels are [${targetPanelIds.join(', ')}] — allowing cross-panel registration`);
        }

        // Step 2: Validate username exists in panel via Admin API
        let usernameValid = false;
        let matchedPanelId = null;  // Track which panel the username belongs to
        const panelIds = context.panelIds || [];

        if (panelIds.length > 0) {
            console.log(`[Registration] Validating username "${normalizedUsername}" across ${panelIds.length} panel(s): [${panelIds.join(', ')}]`);
            try {
                const adminApiService = require('./adminApiService');
                const prismaClient = require('../utils/prisma');

                for (const pId of panelIds) {
                    const panel = await prismaClient.smmPanel.findUnique({ where: { id: pId } });
                    if (!panel) {
                        console.log(`[Registration] Panel ${pId} not found in DB — skipping`);
                        continue;
                    }
                    if (!panel.adminApiKey) {
                        console.log(`[Registration] Panel ${panel.alias || panel.name} (${pId}) has NO adminApiKey — skipping`);
                        continue;
                    }
                    console.log(`[Registration] Checking panel ${panel.alias || panel.name} (${pId}), type=${panel.panelType}, hasAdminApiKey=true`);
                    const result = await adminApiService.validateUsername(panel, normalizedUsername);
                    console.log(`[Registration] validateUsername result for "${normalizedUsername}" on ${panel.alias || panel.name}: ${JSON.stringify(result)}`);
                    if (result.exists) {
                        usernameValid = true;
                        matchedPanelId = pId;
                        console.log(`[Registration] ✅ Username "${normalizedUsername}" validated on panel ${panel.alias || panel.name} (${pId})`);
                        break;
                    } else if (result.noValidation) {
                        // Panel doesn't support user validation — allow registration
                        // Security check at command time (checkUserMappingOwnership) will catch mismatches
                        usernameValid = true;
                        matchedPanelId = pId;
                        console.log(`[Registration] ⚠️ Panel ${panel.alias || panel.name} doesn't support username validation — allowing registration (security at command time)`);
                        break;
                    } else {
                        console.log(`[Registration] ❌ Username "${normalizedUsername}" NOT found on panel ${panel.alias || panel.name} (uncertain: ${result.uncertain || false})`);
                    }
                }
            } catch (err) {
                console.error(`[Registration] Username validation error:`, err.message);
                usernameValid = false;
                console.log(`[Registration] Admin API validation failed — rejecting registration (try again)`);
            }
        } else {
            usernameValid = false;
            console.log(`[Registration] No panel IDs available — cannot validate username, blocking registration`);
        }

        if (!usernameValid) {
            // Username not found in any panel
            // Load custom messages
            const msgs = await this._getRegistrationMessages(userId);

            if (context.attempts >= context.maxAttempts) {
                await this.completeConversation(conversation.id);
                const responseTemplateService = require('./responseTemplateService');
                return {
                    success: false,
                    message: await responseTemplateService.getResponse(userId, 'REGISTRATION_NOT_FOUND_MAX', {
                        max_attempts: String(context.maxAttempts)
                    }) || `❌ Username not found. Maximum attempts (${context.maxAttempts}) reached.\n\nPlease contact support if you need help.`
                };
            }

            await this.updateConversation(conversation.id, {
                context,
                extendExpiry: true
            });

            const remaining = context.maxAttempts - context.attempts;
            const responseTemplateService = require('./responseTemplateService');
            const templateNotFound = await responseTemplateService.getResponse(userId, 'REGISTRATION_NOT_FOUND', {
                username: normalizedUsername,
                remaining_attempts: String(remaining)
            });
            // Priority: template > custom toggle > hardcoded fallback
            const notFoundMsg = templateNotFound
                || (msgs.notFound ? this._replaceVars(msgs.notFound, { username: normalizedUsername, remaining: String(remaining), max_attempts: String(context.maxAttempts) }) : null)
                || `❌ Username "${normalizedUsername}" not found in the panel.\n\nPlease check and send your correct username.\n\n⚠️ Attempts remaining: ${remaining}`;
            return {
                success: false,
                message: notFoundMsg
            };
        }

        // Step 3: Create mapping
        try {
            const normalizedSender = userMappingService.normalizePhone(senderPhone);
            // Use matchedPanelId (panel where username was FOUND) > defaultPanelId (device setting) > first panel
            const targetPanelId = matchedPanelId || context.defaultPanelId || (panelIds.length > 0 ? panelIds[0] : null);
            console.log(`[Registration] Creating mapping with panelId: ${targetPanelId} (matched: ${matchedPanelId}, default: ${context.defaultPanelId}, first: ${panelIds[0] || 'none'})`);
            const newMapping = await userMappingService.createMapping(userId, {
                panelUsername: normalizedUsername,
                panelId: targetPanelId,
                whatsappNumbers: [normalizedSender],
                whatsappName: null,
                isBotEnabled: true,
                isVerified: false,
                adminNotes: `Self-registered via WhatsApp DM`
            });

            console.log(`[Registration] Created mapping ID ${newMapping.id}: username="${normalizedUsername}", WA=${normalizedSender}`);

            await this.completeConversation(conversation.id);

            // Load custom success message
            const msgs2 = await this._getRegistrationMessages(userId);
            const responseTemplateService = require('./responseTemplateService');
            const templateSuccess = await responseTemplateService.getResponse(userId, 'REGISTRATION_SUCCESS', { username: normalizedUsername });
            // Priority: template > custom toggle > hardcoded fallback
            const successMsg = templateSuccess
                || (msgs2.success ? this._replaceVars(msgs2.success, { username: normalizedUsername }) : null)
                || `✅ Registration successful!\n\nYour username *${normalizedUsername}* is now linked with your WhatsApp number.\n\nYou can now use bot commands.`;

            return {
                success: true,
                message: successMsg,
                mapping: newMapping
            };
        } catch (createErr) {
            console.error(`[Registration] Failed to create mapping:`, createErr.message);
            await this.completeConversation(conversation.id);
            const responseTemplateService = require('./responseTemplateService');
            return {
                success: false,
                message: await responseTemplateService.getResponse(userId, 'REGISTRATION_FAILED') || '❌ Registration failed. Please try again later or contact support.'
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
