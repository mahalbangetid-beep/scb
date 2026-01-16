/**
 * Unregistered User Service
 * 
 * Service for handling new users who are not yet registered in the mapping system
 * Phase 1: Username & User Validation System - Unregistered User Flow
 * 
 * Features:
 * - Detect unregistered users when they send commands
 * - Start username collection conversation flow
 * - Self-registration with verification
 * - Integration with conversationState for multi-step flows
 */

const prisma = require('../utils/prisma');
const userMappingService = require('./userMappingService');

class UnregisteredUserService {
    constructor() {
        // Messages for different scenarios
        this.messages = {
            welcome: `👋 *Welcome!*

It looks like this is your first time using our bot. To continue, I need to verify your account.

*Please reply with your panel username:*`,

            usernameReceived: (username) => `📝 You entered: *${username}*

Is this correct? Reply *YES* to confirm or type a different username.`,

            usernameConfirmed: (username) => `✅ *Great!* Your username has been registered.

*Username:* ${username}

You can now use all bot commands. Type *HELP* to see available commands.`,

            usernameExists: (username) => `⚠️ The username *${username}* is already registered with a different phone number.

Please contact the admin if you believe this is an error, or enter a different username.`,

            invalidUsername: `❌ Invalid username. Please enter a valid panel username (letters, numbers, and underscores only).`,

            registrationDisabled: `❌ Self-registration is currently disabled. Please contact the admin to register.`,

            spamWarning: `⚠️ Too many registration attempts. Please wait a few minutes before trying again.`,

            blocked: `❌ Your number has been blocked from using this bot. Please contact the admin.`
        };

        // Rate limiting for registration attempts
        this.maxAttemptsPerHour = 10;
        this.attemptCache = new Map(); // phone -> { attempts, lastAttempt }
    }

    /**
     * Check if a sender is unregistered
     * @returns {Object} { isUnregistered, mapping, reason }
     */
    async checkIfUnregistered(userId, senderPhone, isGroup = false, groupId = null) {
        const checkResult = await userMappingService.checkSenderAllowed(
            userId,
            senderPhone,
            isGroup,
            groupId
        );

        return {
            isUnregistered: checkResult.isUnregistered || false,
            mapping: checkResult.mapping,
            reason: checkResult.reason,
            allowed: checkResult.allowed
        };
    }

    /**
     * Start registration flow for unregistered user
     * @returns {Object} { success, message, stateType }
     */
    async startRegistrationFlow(userId, senderPhone, platform = 'WHATSAPP') {
        // Check rate limiting
        if (this.isRateLimited(senderPhone)) {
            return {
                success: false,
                message: this.messages.spamWarning
            };
        }

        // Check if self-registration is enabled for this user
        const userSettings = await prisma.userBotSettings.findUnique({
            where: { userId }
        });

        // Default to allowing self-registration if not explicitly disabled
        const allowSelfRegistration = userSettings?.allowSelfRegistration !== false;

        if (!allowSelfRegistration) {
            return {
                success: false,
                message: this.messages.registrationDisabled
            };
        }

        // Create conversation state for username collection
        const conversationStateService = require('./conversationStateService');

        await conversationStateService.createState({
            senderPhone,
            userId,
            platform,
            stateType: 'USERNAME_REGISTRATION',
            data: {
                step: 'AWAITING_USERNAME',
                attempts: 0,
                startedAt: new Date().toISOString()
            },
            expiresInMinutes: 15 // 15 minute timeout
        });

        // Record attempt for rate limiting
        this.recordAttempt(senderPhone);

        return {
            success: true,
            message: this.messages.welcome,
            stateType: 'USERNAME_REGISTRATION'
        };
    }

    /**
     * Process response in registration flow
     * @returns {Object} { success, message, completed, nextStep }
     */
    async processRegistrationResponse(userId, senderPhone, message, conversationState) {
        const data = conversationState.data || {};
        const step = data.step || 'AWAITING_USERNAME';

        switch (step) {
            case 'AWAITING_USERNAME':
                return this.processUsernameInput(userId, senderPhone, message, conversationState);

            case 'AWAITING_CONFIRMATION':
                return this.processConfirmation(userId, senderPhone, message, conversationState);

            default:
                return {
                    success: false,
                    message: 'Unknown registration step. Please start over.',
                    completed: true
                };
        }
    }

    /**
     * Process username input
     */
    async processUsernameInput(userId, senderPhone, message, conversationState) {
        const username = message.trim();

        // Validate username format
        if (!this.isValidUsername(username)) {
            return {
                success: false,
                message: this.messages.invalidUsername,
                completed: false,
                nextStep: 'AWAITING_USERNAME'
            };
        }

        // Check if username already exists with different phone
        const existingMapping = await userMappingService.findByUsername(userId, username);

        if (existingMapping) {
            const phones = existingMapping.whatsappNumbers || [];
            const normalizedPhone = userMappingService.normalizePhone(senderPhone);

            if (!phones.includes(normalizedPhone)) {
                return {
                    success: false,
                    message: this.messages.usernameExists(username),
                    completed: false,
                    nextStep: 'AWAITING_USERNAME'
                };
            } else {
                // Phone already registered with this username
                return {
                    success: true,
                    message: this.messages.usernameConfirmed(username),
                    completed: true
                };
            }
        }

        // Update conversation state to await confirmation
        const conversationStateService = require('./conversationStateService');

        await conversationStateService.updateState(conversationState.id, {
            data: {
                ...conversationState.data,
                step: 'AWAITING_CONFIRMATION',
                pendingUsername: username
            }
        });

        return {
            success: true,
            message: this.messages.usernameReceived(username),
            completed: false,
            nextStep: 'AWAITING_CONFIRMATION'
        };
    }

    /**
     * Process confirmation response
     */
    async processConfirmation(userId, senderPhone, message, conversationState) {
        const response = message.trim().toUpperCase();
        const pendingUsername = conversationState.data?.pendingUsername;

        if (!pendingUsername) {
            return {
                success: false,
                message: 'No pending username. Please start over.',
                completed: true
            };
        }

        if (response === 'YES' || response === 'Y' || response === 'CONFIRM') {
            // Create the mapping
            try {
                await userMappingService.createMapping(userId, {
                    panelUsername: pendingUsername,
                    whatsappNumbers: [senderPhone],
                    isBotEnabled: true,
                    isVerified: false, // Needs manual verification by admin
                    verifiedBy: 'SELF'
                });

                // Clear conversation state
                const conversationStateService = require('./conversationStateService');
                await conversationStateService.clearState(conversationState.id);

                return {
                    success: true,
                    message: this.messages.usernameConfirmed(pendingUsername),
                    completed: true
                };
            } catch (error) {
                console.error('[UnregisteredUserService] Failed to create mapping:', error);
                return {
                    success: false,
                    message: `Failed to register: ${error.message}. Please try again or contact admin.`,
                    completed: false,
                    nextStep: 'AWAITING_USERNAME'
                };
            }
        } else {
            // User wants to enter different username
            const conversationStateService = require('./conversationStateService');

            await conversationStateService.updateState(conversationState.id, {
                data: {
                    ...conversationState.data,
                    step: 'AWAITING_USERNAME',
                    pendingUsername: null
                }
            });

            return {
                success: true,
                message: 'Please enter your correct panel username:',
                completed: false,
                nextStep: 'AWAITING_USERNAME'
            };
        }
    }

    /**
     * Auto-register from order username
     * When an unregistered user sends a command and we know the order username
     */
    async autoRegisterFromOrder(userId, senderPhone, orderUsername) {
        // Check if already exists
        const existing = await userMappingService.findByPhone(userId, senderPhone);
        if (existing) return existing;

        try {
            const mapping = await userMappingService.createMapping(userId, {
                panelUsername: orderUsername,
                whatsappNumbers: [senderPhone],
                isBotEnabled: true,
                isVerified: false,
                verifiedBy: 'AUTO'
            });

            console.log(`[UnregisteredUserService] Auto-registered ${orderUsername} with phone ${senderPhone}`);

            return userMappingService.parseMapping(mapping);
        } catch (error) {
            console.error('[UnregisteredUserService] Auto-register failed:', error);
            return null;
        }
    }

    // ==================== HELPER METHODS ====================

    /**
     * Validate username format
     */
    isValidUsername(username) {
        if (!username || username.length < 2 || username.length > 50) {
            return false;
        }
        // Allow letters, numbers, underscores, dots
        return /^[a-zA-Z0-9_\.]+$/.test(username);
    }

    /**
     * Check if sender is rate limited
     */
    isRateLimited(phone) {
        const attempts = this.attemptCache.get(phone);
        if (!attempts) return false;

        const hourAgo = Date.now() - 60 * 60 * 1000;
        if (attempts.lastAttempt < hourAgo) {
            // Reset if more than an hour ago
            this.attemptCache.delete(phone);
            return false;
        }

        return attempts.count >= this.maxAttemptsPerHour;
    }

    /**
     * Record registration attempt
     */
    recordAttempt(phone) {
        const existing = this.attemptCache.get(phone) || { count: 0, lastAttempt: 0 };
        const hourAgo = Date.now() - 60 * 60 * 1000;

        if (existing.lastAttempt < hourAgo) {
            // Reset if more than an hour ago
            this.attemptCache.set(phone, { count: 1, lastAttempt: Date.now() });
        } else {
            this.attemptCache.set(phone, {
                count: existing.count + 1,
                lastAttempt: Date.now()
            });
        }
    }

    /**
     * Get registration status for a phone
     */
    async getRegistrationStatus(userId, senderPhone) {
        const mapping = await userMappingService.findByPhone(userId, senderPhone);

        if (!mapping) {
            return {
                isRegistered: false,
                mapping: null
            };
        }

        return {
            isRegistered: true,
            mapping,
            isVerified: mapping.isVerified,
            isBotEnabled: mapping.isBotEnabled,
            isSuspended: mapping.isAutoSuspended
        };
    }
}

module.exports = new UnregisteredUserService();
