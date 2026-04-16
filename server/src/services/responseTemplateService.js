/**
 * Response Template Service
 * 
 * Manages customizable bot response templates for commands
 * Feature 1: Customizable Bot Responses
 * 
 * Variables supported:
 * {order_id}     - Order ID
 * {status}       - Order status
 * {service}      - Service name
 * {link}         - Order link
 * {remains}      - Remaining count
 * {start_count}  - Start count
 * {charge}       - Order charge
 * {provider}     - Provider name
 * {date}         - Order date
 * {guarantee}    - Guarantee days
 * {error}        - Error message
 * {quantity}     - Order quantity
 */

const prisma = require('../utils/prisma');

class ResponseTemplateService {
    constructor() {
        // Default templates - used when user hasn't customized
        this.defaultTemplates = {
            // ==================== STATUS RESPONSES ====================
            'STATUS_SUCCESS': {
                template: `✅ *Order #{order_id}*\n\n📦 Service: {service}\n📊 Status: {status}\n🔢 Quantity: {quantity}\n📍 Start Count: {start_count}\n📉 Remains: {remains}\n📈 Final Quantity: {final_quantity}\n💰 Charge: ${'{charge}'}\n🔗 Link: {link}`,
                description: 'Successful status check response',
                variables: ['order_id', 'service', 'status', 'quantity', 'start_count', 'remains', 'final_quantity', 'charge', 'link']
            },
            'STATUS_NOT_FOUND': {
                template: `❌ Order #{order_id} not found in this panel.\n\nPlease check the order ID and try again.`,
                description: 'Order not found response',
                variables: ['order_id']
            },
            'STATUS_ERROR': {
                template: `❌ Error checking order #{order_id}: {error}`,
                description: 'Error during status check',
                variables: ['order_id', 'error']
            },

            // ==================== REFILL RESPONSES ====================
            'REFILL_SUCCESS': {
                template: `✅ *Refill Submitted!*\n\nOrder #{order_id} refill request has been sent.\n📦 Service: {service}\n⏳ Please wait for processing.`,
                description: 'Refill request submitted successfully',
                variables: ['order_id', 'service']
            },
            'REFILL_PENDING': {
                template: `⏳ Order #{order_id}: Refill request is pending.\n\nA previous refill request is still being processed.`,
                description: 'Refill already pending',
                variables: ['order_id']
            },
            'REFILL_STATUS_INVALID': {
                template: `❌ Order #{order_id}: Your order is {status}.`,
                description: 'Order status not eligible for refill (cancelled, partial, etc)',
                variables: ['order_id', 'status']
            },
            'REFILL_NO_GUARANTEE': {
                template: `❌ Order #{order_id}: This is not possible to refill.\n\nThis is a no-refill, no-support service.`,
                description: 'Service has no guarantee/refill',
                variables: ['order_id']
            },
            'REFILL_EXPIRED': {
                template: `❌ Order #{order_id}: Refill period has expired.\n\nThe {guarantee}-day guarantee period has ended.`,
                description: 'Guarantee period expired',
                variables: ['order_id', 'guarantee']
            },
            'REFILL_FORWARDED': {
                template: `✅ Order #{order_id}: Refill request forwarded to provider.\n\n📦 Service: {service}\n🔢 Provider Order: {provider_order_id}`,
                description: 'Refill forwarded to provider',
                variables: ['order_id', 'service', 'provider_order_id']
            },
            'REFILL_ERROR': {
                template: `❌ Order #{order_id}: Refill failed.\n\nError: {error}`,
                description: 'Refill request failed',
                variables: ['order_id', 'error']
            },

            // ==================== CANCEL RESPONSES ====================
            'CANCEL_SUCCESS': {
                template: `✅ *Cancel Submitted!*\n\nOrder #{order_id} cancel request has been sent.\n💰 Refund will be processed if approved.`,
                description: 'Cancel request submitted',
                variables: ['order_id']
            },
            'CANCEL_STATUS_INVALID': {
                template: `❌ Order #{order_id}: Your order is {status}.`,
                description: 'Order status not eligible for cancel (cancelled, completed, partial)',
                variables: ['order_id', 'status']
            },
            'CANCEL_ERROR': {
                template: `❌ Order #{order_id}: Cancel failed.\n\nError: {error}`,
                description: 'Cancel request failed',
                variables: ['order_id', 'error']
            },

            // ==================== SPEEDUP RESPONSES ====================
            'SPEEDUP_SUCCESS': {
                template: `✅ *Speed-up Requested!*\n\nOrder #{order_id} has been prioritized.`,
                description: 'Speedup request submitted',
                variables: ['order_id']
            },
            'SPEEDUP_ERROR': {
                template: `❌ Order #{order_id}: Speed-up failed.\n\nError: {error}`,
                description: 'Speedup request failed',
                variables: ['order_id', 'error']
            },

            // ==================== GENERAL RESPONSES ====================
            'COOLDOWN': {
                template: `⏱️ Please wait before sending another command.\n\nYou can try again in a few seconds.`,
                description: 'User is on cooldown',
                variables: []
            },
            'DISABLED': {
                template: `❌ This command is currently disabled.\n\nPlease contact admin for assistance.`,
                description: 'Command is disabled',
                variables: []
            },
            'ACCESS_DENIED': {
                template: `❌ Access denied.\n\nYou don't have permission to manage this order.`,
                description: 'User doesn\'t have access to order',
                variables: []
            },

            // ==================== BULK ORDER RESPONSES ====================
            'BULK_HEADER': {
                template: `📋 {command} Results\n━━━━━━━━━━━━━━━━`,
                description: 'Header for bulk order responses',
                variables: ['command']
            },
            'BULK_SUCCESS_ITEM': {
                template: `• {order_id}`,
                description: 'Each successful order in bulk response',
                variables: ['order_id', 'status', 'service']
            },
            'BULK_FAILED_ITEM': {
                template: `• {order_id}: {error}`,
                description: 'Each failed order in bulk response',
                variables: ['order_id', 'error', 'reason']
            },
            'BULK_SUMMARY': {
                template: `━━━━━━━━━━━━━━━━\nTotal: {total} | ✅ {success_count} | ❌ {failed_count}`,
                description: 'Summary footer for bulk responses',
                variables: ['total', 'success_count', 'failed_count']
            },

            // ==================== BULK STATUS GROUP LABELS ====================
            'BULK_SUCCESS_LABEL': {
                template: `✅ *These orders are added to {command} support queue:*`,
                description: 'Label for successfully queued orders in bulk response',
                variables: ['command']
            },
            'BULK_ALREADY_CANCELLED': {
                template: `🔴 *Already Cancelled – Cannot Be Cancelled Again:*`,
                description: 'Label for already cancelled orders in bulk response',
                variables: []
            },
            'BULK_ALREADY_COMPLETED': {
                template: `🔴 *Already Completed – Cannot Be Processed:*`,
                description: 'Label for already completed orders in bulk response',
                variables: []
            },
            'BULK_PARTIAL_REFUND': {
                template: `🔴 *Partially Refunded – Not Possible:*`,
                description: 'Label for partially refunded orders in bulk response',
                variables: []
            },
            'BULK_COOLDOWN': {
                template: `⏳ *These support requests are already in progress:*`,
                description: 'Label for in-progress/cooldown orders in bulk response',
                variables: []
            },
            'BULK_COOLDOWN_HINT': {
                template: `_For each order you can request support per 12 hour. If support request is already in queue you can't create a new support request with same order._`,
                description: 'Hint text shown under cooldown section',
                variables: []
            },
            'BULK_NOT_FOUND': {
                template: `❌ *These orders are not found or not belong to you:*`,
                description: 'Label for not-found orders in bulk response',
                variables: []
            },
            'BULK_OTHER_ERRORS': {
                template: `⚠️ *Other errors:*`,
                description: 'Label for other errors in bulk response',
                variables: []
            },

            // ==================== BULK STATUS GROUP LABELS (EXTENDED) ====================
            'BULK_GUARANTEE_EXPIRED': {
                template: `🔴 *Order Not Eligible for Refill ( Refill Time Period Expired ):*`,
                description: 'Label for orders with expired guarantee period in bulk response',
                variables: []
            },
            'BULK_NO_GUARANTEE': {
                template: `🔴 *Order Not Eligible for Refill ( No Refill/ No Guarantee ):*`,
                description: 'Label for no-guarantee/no-refill orders in bulk response',
                variables: []
            },
            'BULK_VERIFY_FAILED': {
                template: `⚠️ *Verification temporarily failed (please retry):*`,
                description: 'Label for orders where verification temporarily failed in bulk response',
                variables: []
            },

            // ==================== UTILITY COMMAND RESPONSES ====================
            'UTIL_GROUPID_NOT_GROUP': {
                template: `❌ This command only works in groups.`,
                description: 'Error when .groupid is used outside of a group chat',
                variables: []
            },
            'UTIL_GROUPID_SUCCESS': {
                template: `📱 *Group Information*\n\n🆔 Group JID: \`{group_jid}\`\n📍 Device: {device_name}\n👤 Your Number: {sender_number}`,
                description: 'Response for .groupid command showing group info',
                variables: ['group_jid', 'device_name', 'sender_number']
            },
            'UTIL_PING': {
                template: `🏓 *Pong!*\n\n⏱️ Uptime: {uptime}\n📱 Device: {device_id}`,
                description: 'Response for .ping command showing bot is alive',
                variables: ['uptime', 'device_id']
            },
            'UTIL_DEVICEID': {
                template: `📱 *Device Information*\n\n🆔 Device ID: \`{device_id}\`\n📛 Name: {device_name}\n📞 Phone: {device_phone}`,
                description: 'Response for .deviceid command showing device info',
                variables: ['device_id', 'device_name', 'device_phone']
            },
            'UTIL_HELP': {
                template: `📚 *Available Commands*\n\n*Utility:*\n• \`.ping\` - Check bot status\n• \`.groupid\` - Get group ID (groups only)\n• \`.deviceid\` - Get device info\n• \`.help\` - Show this help\n\n*SMM Commands:*\n• \`[order_id] status\` - Check order status\n• \`[order_id] refill\` - Request refill\n• \`[order_id] cancel\` - Request cancel\n• \`status [order_id]\` - Alternative format\n\n*Support:*\n• \`ticket\` - View your tickets\n• \`ticket [TICKET_NUMBER]\` - Check ticket status`,
                description: 'Response for .help command showing all available commands',
                variables: []
            },

            // ==================== SYSTEM MESSAGES ====================
            'FALLBACK_MESSAGE': {
                template: `I didn't understand your message.\n\n📋 *Available Commands:*\n• \`[Order ID] status\` - Check order status\n• \`[Order ID] refill\` - Request refill\n• \`[Order ID] cancel\` - Cancel order\n• \`ticket\` - View your tickets\n• \`.help\` - Show all commands\n\nExample: \`12345 status\``,
                description: 'Default reply when bot does not understand the message (DM only)',
                variables: []
            },
            'MULTI_PANEL_WARNING': {
                template: `⚠️ This bot is connected to multiple panels but no default panel is set for DM support.\n\nPlease ask the admin to set a *Default Panel for DM* in Device Settings, or use group commands instead.`,
                description: 'Warning when bot has multiple panels but no default panel for DM',
                variables: []
            },
            'DM_COMMANDS_DISABLED': {
                template: `❌ Commands can only be used in groups.\n\nPlease send your command in the group chat.`,
                description: 'Response when DM commands are disabled and user must use group chat',
                variables: []
            },
            'INSUFFICIENT_CREDITS': {
                template: `⚠️ Your message credits are low ({credits} credits remaining). Please buy more credits to continue using the bot.\n\nVisit your dashboard to top up.`,
                description: 'Warning when user has insufficient message credits',
                variables: ['credits']
            },
            'INSUFFICIENT_BALANCE': {
                template: `⚠️ Your credit balance is low (${'{balance}'}). Please top up to continue using the bot.`,
                description: 'Warning when user has insufficient dollar balance',
                variables: ['balance']
            },
            'ASYNC_BULK_ACK': {
                template: `⏳ Processing {order_count} orders for *{command}*...\n\n_Results will be sent shortly. Please wait._`,
                description: 'Instant acknowledgment when processing bulk orders asynchronously',
                variables: ['order_count', 'command']
            },
            'LOW_CREDITS_KEYWORD': {
                template: `⚠️ Low message credits. Please top up to enable keyword responses.`,
                description: 'Warning when credits are too low for keyword auto-reply responses',
                variables: []
            },
            'LOW_CREDITS_AUTOREPLY': {
                template: `⚠️ Low message credits. Please top up to enable auto-replies.`,
                description: 'Warning when credits are too low for auto-reply responses',
                variables: []
            },
            'LOW_CREDIT_NOTIFICATION': {
                template: `⚠️ *Low Balance Alert*\n\nYour balance has dropped to *{balance}*.\nThreshold: {threshold}\n\nPlease top up to continue using bot services without interruption.\n\n💳 Top up here: {topup_url}`,
                description: 'Proactive notification sent via WhatsApp/Telegram when balance drops below threshold',
                variables: ['balance', 'threshold', 'topup_url']
            },
            'USAGE_LIMIT_REACHED': {
                template: `⚠️ Usage limit reached ({usage_count}/{usage_limit} messages this period). Please wait for the next billing cycle or upgrade your plan.`,
                description: 'Warning when system bot usage limit is reached',
                variables: ['usage_count', 'usage_limit']
            },

            // ==================== SPAM PROTECTION ====================
            'SPAM_WARNING': {
                template: `⚠️ *Spam Detected*\n\nYou have sent the same message {spam_count} times.\nIf you continue, the bot will stop responding to you for {disable_duration} minutes.`,
                description: 'First warning when spam is detected',
                variables: ['spam_count', 'disable_duration']
            },
            'SPAM_DISABLED': {
                template: `🚫 *Bot Disabled*\n\nDue to repeated spam, the bot will not respond to your messages for {disable_duration} minutes.`,
                description: 'Message when bot is disabled for a user due to repeated spam',
                variables: ['disable_duration']
            },

            // ==================== VERIFICATION & REGISTRATION ====================
            'VERIFY_USERNAME_SUCCESS': {
                template: `✅ Username verified! Processing your request...`,
                description: 'Success message after username verification',
                variables: []
            },
            'VERIFY_USERNAME_MAX_ATTEMPTS': {
                template: `❌ Verification failed. Maximum attempts ({max_attempts}) reached.\n\nThe username you provided does not match our records for Order #{order_id}.\n\nPlease contact support if you believe this is an error.`,
                description: 'Error when username verification fails after max attempts',
                variables: ['max_attempts', 'order_id']
            },
            'VERIFY_USERNAME_MISMATCH': {
                template: `❌ Username does not match.\n\nPlease enter your panel username exactly as registered.\n\n⚠️ Attempts remaining: {remaining_attempts}`,
                description: 'Error when username does not match with remaining attempts',
                variables: ['remaining_attempts']
            },
            'VERIFY_USERNAME_PROMPT': {
                template: `🔐 *Username Verification Required*\n\nTo process Order #{order_id}, please verify your identity.\n\n📝 *Reply with your panel username:*\n\nExample: If your username is "john123", just reply:\njohn123\n\n⏱️ This verification expires in 5 minutes.`,
                description: 'Prompt asking user to verify their panel username',
                variables: ['order_id']
            },
            'REGISTRATION_PROMPT': {
                template: `📝 *Registration Required*\n\nYour WhatsApp number is not registered yet.\n\nPlease send your *panel username* to register:\n\nExample: If your username is "john123", just reply:\njohn123\n\n⏱️ This registration expires in 5 minutes.`,
                description: 'Prompt asking unregistered users to send their panel username',
                variables: []
            },
            'REGISTRATION_INVALID_USERNAME': {
                template: `❌ Please send a valid username.`,
                description: 'Error when user sends empty or invalid username during registration',
                variables: []
            },
            'REGISTRATION_ALREADY_LINKED': {
                template: `✅ Your number is already registered with this username. You can now use commands.`,
                description: 'Message when user number is already registered with the username',
                variables: []
            },
            'REGISTRATION_USERNAME_TAKEN': {
                template: `❌ This username is already linked with another WhatsApp number.\n\nPlease contact the support team.`,
                description: 'Error when username is already linked to a different WhatsApp number',
                variables: ['username']
            },
            'REGISTRATION_NOT_FOUND': {
                template: `❌ Username "{username}" not found in the panel.\n\nPlease check and send your correct username.\n\n⚠️ Attempts remaining: {remaining_attempts}`,
                description: 'Error when username is not found in the panel during registration',
                variables: ['username', 'remaining_attempts']
            },
            'REGISTRATION_NOT_FOUND_MAX': {
                template: `❌ Username not found. Maximum attempts ({max_attempts}) reached.\n\nPlease contact support if you need help.`,
                description: 'Error when username not found and max registration attempts reached',
                variables: ['max_attempts']
            },
            'REGISTRATION_SUCCESS': {
                template: `✅ Registration successful!\n\nYour username *{username}* is now linked with your WhatsApp number.\n\nYou can now use bot commands.`,
                description: 'Success message after completing registration',
                variables: ['username']
            },
            'REGISTRATION_FAILED': {
                template: `❌ Registration failed. Please try again later or contact support.`,
                description: 'Error when registration fails due to a technical issue',
                variables: []
            },

            // ==================== COMMAND HANDLER MESSAGES ====================
            'COMMAND_DISABLED': {
                template: `❌ The "{command}" command is currently disabled. Please enable it in Bot Settings.`,
                description: 'Error when a specific command type is disabled',
                variables: ['command']
            },
            'USER_COMMAND_DISABLED': {
                template: `❌ {command_name} is currently disabled. Please enable it in Bot Settings.`,
                description: 'Error when user commands (verify/account/ticket) are disabled',
                variables: ['command_name']
            },
            'VERIFY_PAYMENT_PROMPT': {
                template: `💳 *Payment Verification*\n\nPlease provide your Transaction ID:\n\`verify YOUR_TRANSACTION_ID\`\n\nExample: \`verify TXN123456789\`\n\nFor FonePay: \`verify TXN123456789 5000\``,
                description: 'Prompt when user runs verify command without a transaction ID',
                variables: []
            },
            'VERIFY_PAYMENT_NOT_FOUND': {
                template: `❌ *Payment Not Found*\n\nNo payment found with ID: \`{transaction_id}\`\n\nYou don't have any recent payments on record.`,
                description: 'Error when no payment found and user has no recent payments',
                variables: ['transaction_id']
            },
            'VERIFY_PAYMENT_ERROR': {
                template: `❌ Error checking payment: {error}`,
                description: 'Error when payment verification encounters a technical issue',
                variables: ['error']
            },
            'ACCOUNT_NOT_FOUND': {
                template: `❌ User not found`,
                description: 'Error when user account is not found',
                variables: []
            },
            'ACCOUNT_DETAILS_ERROR': {
                template: `❌ Error fetching account details: {error}`,
                description: 'Error when fetching account details fails',
                variables: ['error']
            },
            'TICKET_EMPTY': {
                template: `📋 *Your Tickets*\n\nNo tickets found for your number.\n\nTo create a ticket, contact support or use a command that requires support (e.g., refill for unsupported orders).`,
                description: 'Message when user has no tickets',
                variables: []
            },
            'TICKET_NOT_FOUND': {
                template: `❌ Ticket *#{ticket_number}* not found.\n\nMake sure you entered the correct ticket number.\nTo see your tickets list, send: *TICKET*`,
                description: 'Error when a specific ticket number is not found',
                variables: ['ticket_number']
            },
            'TICKET_ERROR': {
                template: `❌ Error fetching ticket status: {error}`,
                description: 'Error when fetching ticket status fails',
                variables: ['error']
            },

            // ==================== TELEGRAM MESSAGES ====================
            'TELEGRAM_WELCOME': {
                template: `👋 *Welcome, {first_name}!*\n\nI'm *{bot_name}* - your SMM order assistant.\n\n📌 *Quick Start:*\nSend your order IDs followed by a command:\n• \`123456 status\` - Check order status\n• \`123,456 refill\` - Request refill\n\nType /help for all commands.`,
                description: 'Telegram /start welcome message',
                variables: ['first_name', 'bot_name']
            },
            'TELEGRAM_HELP': {
                template: `📚 *{bot_name} - Command Reference*\n\n*Order Commands:*\nSend order IDs followed by a command:\n\n🔄 *Refill* - Request order refill\n   \`123456 refill\` or \`123456 rf\`\n\n❌ *Cancel* - Request order cancellation\n   \`123456 cancel\` or \`123456 cn\`\n\n📊 *Status* - Check order status\n   \`123456 status\` or \`123456 st\`\n\n⚡ *Speed Up* - Speed up order processing\n   \`123456 speed\` or \`123456 sp\`\n\n*Multiple Orders:*\nUse commas or spaces to separate:\n   \`123, 456, 789 refill\`\n   \`123 456 789 status\`\n\n*Tips:*\n• Commands are case-insensitive\n• You can use short aliases (rf, cn, st, sp)\n• Results will show status for each order`,
                description: 'Telegram /help command reference',
                variables: ['bot_name']
            },
            'TELEGRAM_INSUFFICIENT_BALANCE': {
                template: `⚠️ *Insufficient Balance*\n\nYour credit balance is low ({balance}).\nPlease top up to continue using the bot.`,
                description: 'Warning when Telegram user has insufficient credit balance',
                variables: ['balance']
            },
            'TELEGRAM_PROCESSING': {
                template: `⏳ Processing your command...`,
                description: 'Processing indicator while Telegram command is being handled',
                variables: []
            },
            'TELEGRAM_ERROR': {
                template: `❌ *Error processing command*\n\n{error}\n\nPlease try again or contact support.`,
                description: 'Generic error message when Telegram command processing fails',
                variables: ['error']
            },

            // ==================== SECURITY MESSAGES ====================
            'SECURITY_RATE_LIMITED': {
                template: `⏳ Too many commands. Please wait {remaining_seconds} seconds.`,
                description: 'Warning when user sends too many commands (rate limited)',
                variables: ['remaining_seconds']
            },
            'SECURITY_COOLDOWN': {
                template: `⏳ {command} command for this order has already been processed.\n\nPlease wait {remaining_minutes} minutes before trying again.`,
                description: 'Warning when command for a specific order is on cooldown',
                variables: ['command', 'remaining_minutes']
            },
            'SECURITY_GROUP_DISABLED': {
                template: `🔒 Group commands are disabled.\n\nPlease DM me to use commands.`,
                description: 'Error when group commands are disabled',
                variables: []
            },
            'SECURITY_GROUP_NOT_VERIFIED': {
                template: `⚠️ This order is not yet verified.\n\nPlease DM me to verify your order first before using commands in groups.`,
                description: 'Warning when order is not verified for group command usage',
                variables: []
            },
            'SECURITY_GROUP_VERIFY_REQUIRED': {
                template: `🔐 *Username Verification Required*\n\nPlease DM me first to verify your username before using commands in groups.`,
                description: 'Prompt to DM for username verification before group commands',
                variables: []
            },
            'SECURITY_NOT_REGISTERED_GROUP': {
                template: `❌ Your number is not registered. Please DM the bot to register first.`,
                description: 'Error when unregistered user tries to use commands in group',
                variables: []
            },
            'SECURITY_NOT_REGISTERED_DM': {
                template: `📝 Your number is not registered.\n\nPlease send your *panel username* to register.`,
                description: 'Prompt for unregistered user in DM to start registration',
                variables: []
            },
            'SECURITY_BOT_DISABLED': {
                template: `🔒 Bot is disabled for your account. Please contact admin.`,
                description: 'Error when bot is disabled for user mapping',
                variables: []
            },
            'SECURITY_ALREADY_CLAIMED': {
                template: `❌ This order has already been claimed by another number.`,
                description: 'Error when order is claimed by a different phone number',
                variables: []
            },
            'SECURITY_CLAIM_GROUP': {
                template: `⚠️ This order is not yet verified.\n\nPlease DM me with the same command to verify your order first.`,
                description: 'Prompt to verify order via DM when attempting from group',
                variables: []
            },
            'SECURITY_CLAIM_EMAIL': {
                template: `📧 Please send the email you used when ordering for verification.\n\nFormat: \`verify [ORDER_ID] [EMAIL]\``,
                description: 'Prompt for email verification to claim order',
                variables: []
            },
            'SECURITY_EMAIL_UNAVAILABLE': {
                template: `❌ Cannot verify. Email information is not available for this order.`,
                description: 'Error when order has no customer email for verification',
                variables: []
            },
            'SECURITY_EMAIL_MISMATCH': {
                template: `❌ Email does not match order data. Please try again.`,
                description: 'Error when provided email does not match order',
                variables: []
            },
            'SECURITY_EMAIL_VERIFIED': {
                template: `✅ Verification successful! This order is now linked to your number.`,
                description: 'Success message after email verification',
                variables: []
            },
            'SECURITY_USERNAME_UNAVAILABLE': {
                template: `❌ Cannot verify. Username information not available for this order.`,
                description: 'Error when order has no customer username for verification',
                variables: []
            },
            'SECURITY_USERNAME_VERIFIED': {
                template: `✅ Username verified successfully!`,
                description: 'Success message after username verification',
                variables: []
            },
            'SECURITY_USERNAME_MISMATCH': {
                template: `❌ Username does not match our records.`,
                description: 'Error when provided username does not match order',
                variables: []
            },
            'SECURITY_SUSPENDED': {
                template: `⛔ Your account has been suspended due to too many violations.`,
                description: 'Error when user mapping is auto-suspended',
                variables: []
            },
            'SECURITY_NOT_YOUR_ORDER': {
                template: `❌ This order does not belong to you.`,
                description: 'Error when order ownership verification fails',
                variables: []
            },
            'SECURITY_VERIFY_ERROR': {
                template: `⚠️ Unable to verify your account. Please try again later.`,
                description: 'Generic error during account verification',
                variables: []
            },

            // ==================== FONEPAY MESSAGES ====================
            'FONEPAY_FORMAT_INVALID': {
                template: `❌ Invalid format. Please send in the following format:\n\nTXNID: [Transaction ID]\nAmount: [Amount]\n\nExample:\nTXNID: 123456789\nAmount: 5000`,
                description: 'Error when FonePay message format is invalid',
                variables: []
            },
            'FONEPAY_NO_MAPPING': {
                template: `❌ Your number is not linked to a panel account. Please contact support to link your WhatsApp number.`,
                description: 'Error when WA number has no panel mapping for FonePay',
                variables: []
            },
            'FONEPAY_MAPPING_SUSPENDED': {
                template: `⚠️ Your account has been suspended. Please contact support for more information.`,
                description: 'Error when FonePay mapping is suspended',
                variables: []
            },
            'FONEPAY_PANEL_NOT_RENTAL': {
                template: `❌ Payment verification is not available for this panel.`,
                description: 'Error when panel is not a rental panel for FonePay',
                variables: []
            },
            'FONEPAY_DISABLED': {
                template: `❌ FonePay has not been enabled for this panel. Please contact admin.`,
                description: 'Error when FonePay is not enabled for the panel',
                variables: []
            },
            'FONEPAY_TXN_NOT_FOUND': {
                template: `❌ Transaction not found. Please check your transaction ID.`,
                description: 'Error when FonePay transaction ID is not found',
                variables: []
            },
            'FONEPAY_AMOUNT_MISMATCH': {
                template: `❌ The amount entered does not match the payment record.`,
                description: 'Error when FonePay amount does not match',
                variables: []
            },
            'FONEPAY_ALREADY_PROCESSED': {
                template: `❌ This transaction has already been used.`,
                description: 'Error when FonePay transaction was already used',
                variables: []
            },
            'FONEPAY_API_TIMEOUT': {
                template: `⏳ Verification pending. Please try again in a few minutes.`,
                description: 'Error when FonePay API request times out',
                variables: []
            },
            'FONEPAY_RATE_LIMITED': {
                template: `⚠️ Too many verification attempts. Please wait 1 hour before trying again.`,
                description: 'Error when FonePay verification is rate limited',
                variables: []
            },
            'FONEPAY_ACKNOWLEDGED': {
                template: `🔄 Payment request received. Verification in progress...`,
                description: 'Acknowledgment while FonePay verification is in progress',
                variables: []
            },
            'FONEPAY_SUCCESS': {
                template: `✅ Payment verified! {currency} {amount} has been credited to your account.`,
                description: 'Success message after FonePay payment is verified and credited',
                variables: ['currency', 'amount']
            },
            'FONEPAY_CREDIT_FAILED': {
                template: `❌ Verification passed but failed to credit funds. Admin has been notified. Please contact support.`,
                description: 'Error when FonePay verification passed but crediting failed',
                variables: []
            },
            'FONEPAY_TXN_EXPIRED': {
                template: `❌ This transaction has expired. Please contact support.`,
                description: 'Error when FonePay transaction has expired',
                variables: []
            },
            'FONEPAY_TXN_STATUS_INVALID': {
                template: `❌ Transaction found but status is not completed. Please try again later or contact support.`,
                description: 'Error when FonePay transaction exists but status is not completed',
                variables: []
            },
            'FONEPAY_SYSTEM_ERROR': {
                template: `❌ A system error occurred. Please try again later.`,
                description: 'Generic FonePay system error',
                variables: []
            },
            'FONEPAY_GLOBAL_DISABLED': {
                template: `❌ FonePay verification is currently disabled. Please contact admin.`,
                description: 'Error when FonePay is globally disabled',
                variables: []
            },
            'FONEPAY_MAPPING_DISABLED': {
                template: `❌ Your account is currently disabled. Please contact admin to reactivate.`,
                description: 'Error when FonePay mapping is disabled',
                variables: []
            },

            // ==================== TELEGRAM MESSAGES ====================
            'TELEGRAM_WELCOME': {
                template: `👋 *Welcome, {first_name}!*\n\nI'm *{bot_name}* - your SMM order assistant.\n\n📌 *Quick Start:*\nSend your order IDs followed by a command:\n• \`123456 status\` - Check order status\n• \`123,456 refill\` - Request refill\n\nType /help for all commands.`,
                description: 'Welcome message for /start command in Telegram',
                variables: ['first_name', 'bot_name']
            },
            'TELEGRAM_HELP': {
                template: `📚 *{bot_name} - Command Reference*\n\n*Order Commands:*\nSend order IDs followed by a command:\n\n🔄 *Refill* - Request order refill\n   \`123456 refill\` or \`123456 rf\`\n\n❌ *Cancel* - Request order cancellation\n   \`123456 cancel\` or \`123456 cn\`\n\n📊 *Status* - Check order status\n   \`123456 status\` or \`123456 st\`\n\n⚡ *Speed Up* - Speed up order processing\n   \`123456 speed\` or \`123456 sp\`\n\n*Multiple Orders:*\nUse commas or spaces to separate:\n   \`123, 456, 789 refill\`\n   \`123 456 789 status\`\n\n*Tips:*\n• Commands are case-insensitive\n• You can use short aliases (rf, cn, st, sp)\n• Results will show status for each order`,
                description: 'Help/command reference message for /help in Telegram',
                variables: ['bot_name']
            },
            'TELEGRAM_ERROR_GENERIC': {
                template: `Sorry, an error occurred processing your message.`,
                description: 'Generic error message when Telegram message handler fails',
                variables: []
            },
            'TELEGRAM_INSUFFICIENT_BALANCE': {
                template: `⚠️ *Insufficient Balance*\n\nYour credit balance is low ({balance}).\nPlease top up to continue using the bot.`,
                description: 'Error when user has insufficient credit balance for Telegram',
                variables: ['balance']
            },
            'TELEGRAM_PROCESSING': {
                template: `⏳ Processing your command...`,
                description: 'Processing indicator message shown while command is being executed',
                variables: []
            },
            'TELEGRAM_COMMAND_ERROR': {
                template: `❌ *Error processing command*\n\n{error}\n\nPlease try again or contact support.`,
                description: 'Error message when command processing fails in Telegram',
                variables: ['error']
            },

            // ==================== ORDER ID SMART HANDLING (Section 3.1) ====================
            'ORDER_ACTION_MENU': {
                template: `🔢 *What would you like to do with order {order_id}?*\n\n1️⃣ Speed Up\n2️⃣ Refill\n3️⃣ Cancel\n4️⃣ Check Status\n\n_Reply with the number (1-4) to proceed._`,
                description: 'Action menu shown when user sends a bare order ID without a command',
                variables: ['order_id']
            },

            // ==================== .LIST COMMAND (Section 3.2a) ====================
            'UTIL_LIST_DEFAULT': {
                template: `📋 *Available Services*\n\nNo service list has been configured yet.\n\nPlease contact the admin to set up the services list.`,
                description: 'Default response for .list command when no services are configured',
                variables: []
            },

            // ==================== CUSTOM FOOTER PER COMMAND (Section 3.3) ====================
            'BULK_FOOTER_CANCEL': {
                template: `_Note: Cancellation may take up to 24 hours to be approved._`,
                description: 'Custom footer text shown at the bottom of bulk cancel results only',
                variables: []
            },
            'BULK_FOOTER_REFILL': {
                template: `_Note: Refill requests are processed automatically. Please allow time for completion._`,
                description: 'Custom footer text shown at the bottom of bulk refill results only',
                variables: []
            },
            'BULK_FOOTER_SPEEDUP': {
                template: `_Note: Speed-up requests help prioritize your order processing._`,
                description: 'Custom footer text shown at the bottom of bulk speed-up results only',
                variables: []
            },
            'BULK_FOOTER_STATUS': {
                template: ``,
                description: 'Custom footer text shown at the bottom of bulk status results only',
                variables: []
            },

            // ==================== SMART REFILL RESULT PARSING (Section 3.6) ====================
            'REFILL_RESULT_SUCCESS': {
                template: `✅ Your order *{order_id}* has been refilled with *{quantity}* quantity.`,
                description: 'Message sent to order owner when refill result is successful',
                variables: ['order_id', 'quantity']
            },
            'REFILL_RESULT_OVERFLOW': {
                template: `⚠️ Your order *{order_id}* does not need a refill (already has excess quantity).`,
                description: 'Message sent to order owner when refill result shows overflow',
                variables: ['order_id']
            },
            'REFILL_RESULT_RECENTLY': {
                template: `⏳ Your order *{order_id}* was refilled recently. Please wait before requesting again.`,
                description: 'Message sent to order owner when refill was recently done',
                variables: ['order_id']
            },
            'REFILL_RESULT_FAILED': {
                template: `❌ Your order *{order_id}* refill could not be completed: {reason}`,
                description: 'Message sent to order owner when refill fails',
                variables: ['order_id', 'reason']
            }
        };
    }

    /**
     * Get template for a specific command
     * Checks user's custom templates first, falls back to default
     */
    async getTemplate(userId, command) {
        // Try to find user's custom template (default scope: no device/panel)
        const customTemplate = await prisma.commandTemplate.findFirst({
            where: {
                userId,
                command,
                deviceId: null,
                panelId: null
            }
        });

        if (customTemplate && customTemplate.isActive) {
            return customTemplate.template;
        }

        // Fall back to default
        const defaultTemplate = this.defaultTemplates[command];
        return defaultTemplate?.template || null;
    }

    /**
     * Format a template with variables
     */
    formatTemplate(template, variables = {}) {
        if (!template) return null;

        let formatted = template;

        // Replace all variables
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\{${key}\\}`, 'gi');
            formatted = formatted.replace(regex, value ?? 'N/A');
        }

        // Clean up any remaining unreplaced variables
        formatted = formatted.replace(/\{[a-z_]+\}/gi, 'N/A');

        return formatted;
    }

    /**
     * Get formatted response for a command
     */
    async getResponse(userId, command, variables = {}) {
        const template = await this.getTemplate(userId, command);
        if (!template) {
            console.log(`[ResponseTemplate] No template found for command: ${command}`);
            return null;
        }
        return this.formatTemplate(template, variables);
    }

    /**
     * Get a localized response — tries language-specific template first,
     * then falls back to default English template.
     * Section 12.1 — Multi-Language Support
     * 
     * @param {string} userId - User ID
     * @param {string} command - Template key (e.g., 'STATUS_SUCCESS')
     * @param {Object} variables - Template variables
     * @param {string} language - Language code from languageDetectionService (e.g., 'hi', 'ne', 'ar')
     * @returns {string|null} Formatted response
     */
    async getLocalizedResponse(userId, command, variables = {}, language = 'en') {
        if (language && language !== 'en') {
            // Try language-specific template first (e.g., STATUS_SUCCESS_HI)
            const langSuffix = language.replace('-', '_').toUpperCase();
            const localizedKey = `${command}_${langSuffix}`;
            const localizedTemplate = await this.getTemplate(userId, localizedKey);
            if (localizedTemplate) {
                return this.formatTemplate(localizedTemplate, variables);
            }
        }
        // Fall back to default (English)
        return this.getResponse(userId, command, variables);
    }

    /**
     * Detect language of incoming message and return a localized response.
     * Convenience method combining language detection + localized template lookup.
     * 
     * @param {string} userId - User ID
     * @param {string} command - Template key
     * @param {Object} variables - Template variables
     * @param {string} incomingMessage - The original message (for language detection)
     * @returns {Object} { response: string, detectedLanguage: { language, confidence, name } }
     */
    async detectAndRespond(userId, command, variables = {}, incomingMessage = '') {
        const languageDetectionService = require('./languageDetectionService');
        const detected = languageDetectionService.detect(incomingMessage);
        const response = await this.getLocalizedResponse(userId, command, variables, detected.language);
        return { response, detectedLanguage: detected };
    }


    /**
     * Get all templates for a user (custom + defaults)
     */
    async getAllTemplates(userId) {
        // Get user's custom templates (default scope only)
        const customTemplates = await prisma.commandTemplate.findMany({
            where: { userId, deviceId: null, panelId: null },
            orderBy: { command: 'asc' }
        });

        const customMap = {};
        for (const t of customTemplates) {
            customMap[t.command] = t;
        }

        // Merge with defaults
        const result = [];
        for (const [command, defaultData] of Object.entries(this.defaultTemplates)) {
            const custom = customMap[command];
            result.push({
                command,
                template: custom?.template || defaultData.template,
                isCustom: !!custom,
                isActive: custom?.isActive ?? true,
                description: defaultData.description,
                variables: defaultData.variables,
                defaultTemplate: defaultData.template
            });
        }

        return result;
    }

    /**
     * Update or create a custom template
     */
    async updateTemplate(userId, command, template, isActive = true) {
        // Find existing record (can't use upsert with nullable composite keys)
        const existing = await prisma.commandTemplate.findFirst({
            where: {
                userId,
                command,
                deviceId: null,
                panelId: null
            }
        });

        if (existing) {
            return prisma.commandTemplate.update({
                where: { id: existing.id },
                data: {
                    template,
                    isActive,
                    updatedAt: new Date()
                }
            });
        } else {
            return prisma.commandTemplate.create({
                data: {
                    userId,
                    command,
                    template,
                    isActive,
                    deviceId: null,
                    panelId: null
                }
            });
        }
    }

    /**
     * Reset a template to default
     */
    async resetTemplate(userId, command) {
        await prisma.commandTemplate.deleteMany({
            where: { userId, command, deviceId: null, panelId: null }
        });

        return this.defaultTemplates[command] || null;
    }

    /**
     * Reset all templates to default
     */
    async resetAllTemplates(userId) {
        await prisma.commandTemplate.deleteMany({
            where: { userId, deviceId: null, panelId: null }
        });

        return Object.keys(this.defaultTemplates);
    }

    /**
     * Get available variables for a command
     */
    getVariables(command) {
        return this.defaultTemplates[command]?.variables || [];
    }

    /**
     * Validate a template (check for invalid variables)
     */
    validateTemplate(command, template) {
        const allowedVariables = this.getVariables(command);
        const usedVariables = template.match(/\{([a-z_]+)\}/gi) || [];

        const invalid = [];
        for (const v of usedVariables) {
            const varName = v.replace(/[{}]/g, '').toLowerCase();
            if (!allowedVariables.includes(varName)) {
                invalid.push(varName);
            }
        }

        return {
            valid: invalid.length === 0,
            invalidVariables: invalid,
            allowedVariables
        };
    }
}

module.exports = new ResponseTemplateService();
