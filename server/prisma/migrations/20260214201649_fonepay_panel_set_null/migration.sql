-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MASTER_ADMIN', 'ADMIN', 'USER', 'STAFF');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "avatar" TEXT,
    "whatsappNumber" TEXT,
    "telegramUsername" TEXT,
    "primaryPanelUrl" TEXT,
    "primaryPanelKey" TEXT,
    "creditBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "customWaRate" DOUBLE PRECISION,
    "customTgRate" DOUBLE PRECISION,
    "customGroupRate" DOUBLE PRECISION,
    "messageCredits" INTEGER NOT NULL DEFAULT 0,
    "freeCreditsGiven" BOOLEAN NOT NULL DEFAULT false,
    "customCreditRate" INTEGER,
    "registrationIp" TEXT,
    "lastLoginIp" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "keyPrefix" TEXT,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsed" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPermission" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "userId" TEXT,
    "permission" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "failReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmmPanel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiId" TEXT,
    "panelType" TEXT NOT NULL DEFAULT 'GENERIC',
    "apiFormat" TEXT NOT NULL DEFAULT 'STANDARD',
    "endpointBalance" TEXT,
    "endpointServices" TEXT,
    "endpointAddOrder" TEXT,
    "endpointOrderStatus" TEXT,
    "endpointRefill" TEXT,
    "endpointCancel" TEXT,
    "apiKeyParam" TEXT NOT NULL DEFAULT 'key',
    "apiIdParam" TEXT NOT NULL DEFAULT 'api_id',
    "actionParam" TEXT NOT NULL DEFAULT 'action',
    "httpMethod" TEXT NOT NULL DEFAULT 'POST',
    "useApiId" BOOLEAN NOT NULL DEFAULT false,
    "adminApiKey" TEXT,
    "supportsAdminApi" BOOLEAN NOT NULL DEFAULT false,
    "adminApiBaseUrl" TEXT,
    "detectedOrdersEndpoint" TEXT,
    "detectedRefillEndpoint" TEXT,
    "detectedCancelEndpoint" TEXT,
    "detectedStatusEndpoint" TEXT,
    "detectedProviderEndpoint" TEXT,
    "endpointScanResults" TEXT,
    "manualEndpointOverrides" TEXT,
    "balance" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "lastProviderSyncAt" TIMESTAMP(3),
    "capabilities" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fonepayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "fonepayVerifyEndpoint" TEXT,
    "fonepayAddFundEndpoint" TEXT,

    CONSTRAINT "SmmPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT,
    "serviceName" TEXT,
    "link" TEXT,
    "quantity" INTEGER,
    "charge" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startCount" INTEGER,
    "remains" INTEGER,
    "lastCheckedAt" TIMESTAMP(3),
    "providerName" TEXT,
    "providerOrderId" TEXT,
    "providerStatus" TEXT,
    "providerCharge" DOUBLE PRECISION,
    "providerSyncedAt" TIMESTAMP(3),
    "customerUsername" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "claimedByPhone" TEXT,
    "claimedAt" TIMESTAMP(3),
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "canRefill" BOOLEAN NOT NULL DEFAULT false,
    "canCancel" BOOLEAN NOT NULL DEFAULT false,
    "actionsUpdatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "staffMemo" TEXT,
    "statusOverride" TEXT,
    "statusOverrideBy" TEXT,
    "statusOverrideAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderCommand" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedBy" TEXT NOT NULL,
    "response" TEXT,
    "error" TEXT,
    "forwardedTo" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceBefore" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageCreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageCreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "panelId" TEXT,
    "deviceId" TEXT,
    "providerName" TEXT,
    "type" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "messageTemplate" TEXT,
    "serviceIdRules" JSONB,
    "isManualServiceGroup" BOOLEAN NOT NULL DEFAULT false,
    "useSimpleFormat" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "type" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sessionData" TEXT,
    "lastActive" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "panelId" TEXT,
    "isFreeLogin" BOOLEAN NOT NULL DEFAULT true,
    "chargeType" TEXT,
    "chargeAmount" DOUBLE PRECISION,
    "nextChargeAt" TIMESTAMP(3),
    "isSystemBot" BOOLEAN NOT NULL DEFAULT false,
    "groupOnly" BOOLEAN NOT NULL DEFAULT false,
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "usageResetAt" TIMESTAMP(3),
    "systemBotPrice" DOUBLE PRECISION,
    "maxSubscribers" INTEGER,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemBotSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "monthlyFee" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextBillingDate" TIMESTAMP(3) NOT NULL,
    "lastBilledAt" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "usageLimit" INTEGER,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 3,
    "expiresAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastFailReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemBotSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactBackup" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "userId" TEXT NOT NULL,
    "totalContacts" INTEGER NOT NULL DEFAULT 0,
    "totalGroups" INTEGER NOT NULL DEFAULT 0,
    "contacts" JSONB,
    "groups" JSONB,
    "backupType" TEXT NOT NULL DEFAULT 'AUTO',
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ContactBackup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePanelBinding" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevicePanelBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramBot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "botToken" TEXT NOT NULL,
    "botUsername" TEXT,
    "botName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "panelId" TEXT,
    "isFreeLogin" BOOLEAN NOT NULL DEFAULT true,
    "chargeType" TEXT,
    "chargeAmount" DOUBLE PRECISION,
    "nextChargeAt" TIMESTAMP(3),
    "lastActive" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramBot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "telegramBotId" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "type" TEXT NOT NULL DEFAULT 'outgoing',
    "mediaType" TEXT,
    "to" TEXT,
    "toName" TEXT,
    "from" TEXT,
    "fromName" TEXT,
    "message" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "broadcastId" TEXT,
    "contactId" TEXT,
    "creditCharged" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "userId" TEXT NOT NULL,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#25D366',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactTag" (
    "contactId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ContactTag_pkey" PRIMARY KEY ("contactId","tagId")
);

-- CreateTable
CREATE TABLE "AutoReplyRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL DEFAULT 'contains',
    "response" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "deviceId" TEXT,
    "userId" TEXT NOT NULL,
    "triggerCount" INTEGER NOT NULL DEFAULT 0,
    "isCommandHandler" BOOLEAN NOT NULL DEFAULT false,
    "commandType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoReplyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "userId" TEXT NOT NULL,
    "lastCalled" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "responseCode" INTEGER,
    "responseBody" TEXT,
    "duration" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "read" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastRecipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "gateway" TEXT,
    "gatewayRef" TEXT,
    "description" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "transactionId" TEXT,
    "gatewayData" TEXT,
    "metadata" TEXT,
    "approvedBy" TEXT,
    "processedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "items" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "method" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FIXED',
    "amount" DOUBLE PRECISION NOT NULL,
    "value" DOUBLE PRECISION,
    "maxUsage" INTEGER,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "minAmount" DOUBLE PRECISION,
    "singleUsePerUser" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageWatermark" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "recipientId" TEXT,
    "messagePreview" TEXT,
    "broadcastId" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "detectedCount" INTEGER NOT NULL DEFAULT 0,
    "lastDetectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageWatermark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandCooldown" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "senderPhone" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommandCooldown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBotSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderClaimMode" TEXT NOT NULL DEFAULT 'disabled',
    "groupSecurityMode" TEXT NOT NULL DEFAULT 'none',
    "usernameValidationMode" TEXT NOT NULL DEFAULT 'disabled',
    "maxCommandsPerMinute" INTEGER NOT NULL DEFAULT 10,
    "commandCooldownSecs" INTEGER NOT NULL DEFAULT 300,
    "showProviderInResponse" BOOLEAN NOT NULL DEFAULT false,
    "showDetailedStatus" BOOLEAN NOT NULL DEFAULT false,
    "privateReplyInGroups" BOOLEAN NOT NULL DEFAULT false,
    "refillActionMode" TEXT NOT NULL DEFAULT 'forward',
    "cancelActionMode" TEXT NOT NULL DEFAULT 'forward',
    "speedupActionMode" TEXT NOT NULL DEFAULT 'forward',
    "statusResponseMode" TEXT NOT NULL DEFAULT 'standard',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBotSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationState" (
    "id" TEXT NOT NULL,
    "senderPhone" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "stateType" TEXT NOT NULL,
    "currentStep" TEXT NOT NULL,
    "contextData" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommandTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemCommandTemplate" (
    "id" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "description" TEXT,
    "variables" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemCommandTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotFeatureToggles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "autoHandleFailedOrders" BOOLEAN NOT NULL DEFAULT false,
    "failedOrderAction" TEXT NOT NULL DEFAULT 'NOTIFY',
    "allowForceCompleted" BOOLEAN NOT NULL DEFAULT false,
    "allowLinkUpdateViaBot" BOOLEAN NOT NULL DEFAULT false,
    "allowPaymentVerification" BOOLEAN NOT NULL DEFAULT false,
    "allowAccountDetailsViaBot" BOOLEAN NOT NULL DEFAULT false,
    "allowTicketAutoReply" BOOLEAN NOT NULL DEFAULT false,
    "allowRefillCommand" BOOLEAN NOT NULL DEFAULT true,
    "allowCancelCommand" BOOLEAN NOT NULL DEFAULT true,
    "allowSpeedUpCommand" BOOLEAN NOT NULL DEFAULT true,
    "allowStatusCommand" BOOLEAN NOT NULL DEFAULT true,
    "processingSpeedUpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "processingCancelEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoForwardProcessingCancel" BOOLEAN NOT NULL DEFAULT false,
    "providerSpeedUpTemplate" TEXT NOT NULL DEFAULT '{speed}',
    "providerRefillTemplate" TEXT NOT NULL DEFAULT '{refill}',
    "providerCancelTemplate" TEXT NOT NULL DEFAULT '{cancel}',
    "bulkResponseThreshold" INTEGER NOT NULL DEFAULT 5,
    "maxBulkOrders" INTEGER NOT NULL DEFAULT 100,
    "showProviderInResponse" BOOLEAN NOT NULL DEFAULT false,
    "showDetailedStatus" BOOLEAN NOT NULL DEFAULT false,
    "replyToAllMessages" BOOLEAN NOT NULL DEFAULT false,
    "fallbackMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotFeatureToggles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuaranteeConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "patterns" TEXT NOT NULL DEFAULT '[]',
    "keywords" TEXT,
    "emojis" TEXT,
    "defaultDays" INTEGER NOT NULL DEFAULT 30,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "noGuaranteeAction" TEXT NOT NULL DEFAULT 'DENY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuaranteeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "credits" INTEGER NOT NULL,
    "bonusCredits" INTEGER NOT NULL DEFAULT 0,
    "discountPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minPurchase" INTEGER NOT NULL DEFAULT 1,
    "maxPurchase" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlySubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "resourceName" TEXT,
    "monthlyFee" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL,
    "nextBillingDate" TIMESTAMP(3) NOT NULL,
    "lastBilledAt" TIMESTAMP(3),
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 3,
    "pausedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastFailReason" TEXT,
    "lastFailedAt" TIMESTAMP(3),
    "isFreeFirst" BOOLEAN NOT NULL DEFAULT false,
    "reminderSentAt" TIMESTAMP(3),
    "expiringSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlySubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserWhatsAppMapping" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "panelUsername" TEXT NOT NULL,
    "panelEmail" TEXT,
    "panelUserId" TEXT,
    "whatsappNumbers" TEXT NOT NULL DEFAULT '[]',
    "groupIds" TEXT NOT NULL DEFAULT '[]',
    "isBotEnabled" BOOLEAN NOT NULL DEFAULT true,
    "adminNotes" TEXT,
    "isAutoSuspended" BOOLEAN NOT NULL DEFAULT false,
    "suspendReason" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "spamCount" INTEGER NOT NULL DEFAULT 0,
    "lastSpamAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWhatsAppMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderDomainMapping" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "hiddenDomain" TEXT,
    "publicAlias" TEXT NOT NULL,
    "forwardDestinations" TEXT NOT NULL DEFAULT '[]',
    "isForwardingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isApiRequestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "totalForwarded" INTEGER NOT NULL DEFAULT 0,
    "lastForwardedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderDomainMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeywordResponse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'CONTAINS',
    "caseSensitive" BOOLEAN NOT NULL DEFAULT false,
    "responseText" TEXT NOT NULL,
    "responseMedia" TEXT,
    "triggerAction" TEXT DEFAULT 'NONE',
    "actionConfig" TEXT DEFAULT '{}',
    "deviceId" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'ALL',
    "applyToGroups" BOOLEAN NOT NULL DEFAULT true,
    "applyToDMs" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "triggerCount" INTEGER NOT NULL DEFAULT 0,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeywordResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "orderId" TEXT,
    "orderExternalId" TEXT,
    "panelId" TEXT,
    "customerPhone" TEXT,
    "customerUsername" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "source" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "messages" TEXT NOT NULL DEFAULT '[]',
    "panelTicketId" TEXT,
    "syncedAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "lastReplyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPanelMapping" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "panelUsername" TEXT NOT NULL,
    "panelEmail" TEXT,
    "panelUserId" TEXT,
    "whatsappNumbers" TEXT NOT NULL DEFAULT '[]',
    "groupIds" TEXT NOT NULL DEFAULT '[]',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "isBotEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isAutoSuspended" BOOLEAN NOT NULL DEFAULT false,
    "suspendedAt" TIMESTAMP(3),
    "suspendReason" TEXT,
    "spamCount" INTEGER NOT NULL DEFAULT 0,
    "lastSpamAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPanelMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "alias" TEXT,
    "providerDomain" TEXT,
    "forwardRefill" BOOLEAN NOT NULL DEFAULT true,
    "forwardCancel" BOOLEAN NOT NULL DEFAULT true,
    "forwardSpeedup" BOOLEAN NOT NULL DEFAULT true,
    "forwardStatus" BOOLEAN NOT NULL DEFAULT false,
    "whatsappGroupJid" TEXT,
    "whatsappNumber" TEXT,
    "telegramChatId" TEXT,
    "telegramBotToken" TEXT,
    "errorGroupJid" TEXT,
    "errorChatId" TEXT,
    "errorNotifyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "newOrderTemplate" TEXT,
    "refillTemplate" TEXT,
    "cancelTemplate" TEXT,
    "speedupTemplate" TEXT,
    "errorTemplate" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderForwardLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "providerId" TEXT,
    "requestType" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "messageContent" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "errorMessage" TEXT,
    "responseTime" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderForwardLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterBackup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "originalPanelId" TEXT,
    "panelName" TEXT NOT NULL,
    "panelAlias" TEXT,
    "panelDomain" TEXT NOT NULL,
    "panelApiKey" TEXT NOT NULL,
    "panelAdminApiKey" TEXT,
    "panelType" TEXT,
    "providerDomains" JSONB,
    "providerAliases" JSONB,
    "providerGroups" JSONB,
    "backupType" TEXT NOT NULL DEFAULT 'AUTO',
    "backupReason" TEXT,
    "deletedByUser" BOOLEAN NOT NULL DEFAULT false,
    "userDeletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterBackup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPaymentConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "binanceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "binanceId" TEXT,
    "binanceApiKey" TEXT,
    "binanceSecret" TEXT,
    "binanceQrUrl" TEXT,
    "binanceMinAmount" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "binanceBonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "binanceName" TEXT,
    "binanceCurrency" TEXT NOT NULL DEFAULT 'USDT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPaymentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "description" TEXT,
    "variables" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FonepayTransaction" (
    "id" TEXT NOT NULL,
    "whatsappNumber" TEXT NOT NULL,
    "panelUsername" TEXT NOT NULL,
    "panelId" TEXT,
    "userId" TEXT NOT NULL,
    "txnId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'WHATSAPP_FONEPAY',
    "amountEntered" DOUBLE PRECISION NOT NULL,
    "amountVerified" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "creditedAt" TIMESTAMP(3),
    "paymentTimestamp" TIMESTAMP(3),
    "adminActionBy" TEXT,
    "adminActionAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FonepayTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FonepayAuditLog" (
    "id" TEXT NOT NULL,
    "whatsappNumber" TEXT NOT NULL,
    "panelUsername" TEXT NOT NULL,
    "panelId" TEXT,
    "userId" TEXT NOT NULL,
    "txnId" TEXT NOT NULL,
    "amountEntered" DOUBLE PRECISION NOT NULL,
    "amountFromApi" DOUBLE PRECISION,
    "verificationResult" TEXT NOT NULL,
    "failureReason" TEXT,
    "ipAddress" TEXT,
    "deviceId" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FonepayAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey"("key");

-- CreateIndex
CREATE UNIQUE INDEX "StaffPermission_staffId_userId_permission_key" ON "StaffPermission"("staffId", "userId", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "SmmPanel_url_userId_key" ON "SmmPanel"("url", "userId");

-- CreateIndex
CREATE INDEX "Order_providerOrderId_idx" ON "Order"("providerOrderId");

-- CreateIndex
CREATE INDEX "Order_claimedByPhone_idx" ON "Order"("claimedByPhone");

-- CreateIndex
CREATE UNIQUE INDEX "Order_externalOrderId_panelId_key" ON "Order"("externalOrderId", "panelId");

-- CreateIndex
CREATE INDEX "ProviderGroup_userId_idx" ON "ProviderGroup"("userId");

-- CreateIndex
CREATE INDEX "ProviderGroup_providerName_idx" ON "ProviderGroup"("providerName");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderGroup_panelId_providerName_type_key" ON "ProviderGroup"("panelId", "providerName", "type");

-- CreateIndex
CREATE INDEX "SystemBotSubscription_userId_idx" ON "SystemBotSubscription"("userId");

-- CreateIndex
CREATE INDEX "SystemBotSubscription_deviceId_idx" ON "SystemBotSubscription"("deviceId");

-- CreateIndex
CREATE INDEX "SystemBotSubscription_status_idx" ON "SystemBotSubscription"("status");

-- CreateIndex
CREATE INDEX "SystemBotSubscription_nextBillingDate_idx" ON "SystemBotSubscription"("nextBillingDate");

-- CreateIndex
CREATE UNIQUE INDEX "SystemBotSubscription_userId_deviceId_key" ON "SystemBotSubscription"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "ContactBackup_deviceId_createdAt_idx" ON "ContactBackup"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "ContactBackup_userId_createdAt_idx" ON "ContactBackup"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DevicePanelBinding_deviceId_idx" ON "DevicePanelBinding"("deviceId");

-- CreateIndex
CREATE INDEX "DevicePanelBinding_panelId_idx" ON "DevicePanelBinding"("panelId");

-- CreateIndex
CREATE UNIQUE INDEX "DevicePanelBinding_deviceId_panelId_key" ON "DevicePanelBinding"("deviceId", "panelId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_phone_userId_key" ON "Contact"("phone", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_userId_key" ON "Tag"("name", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_userId_key" ON "Setting"("key", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- CreateIndex
CREATE INDEX "WalletTransaction_userId_idx" ON "WalletTransaction"("userId");

-- CreateIndex
CREATE INDEX "WalletTransaction_gateway_idx" ON "WalletTransaction"("gateway");

-- CreateIndex
CREATE INDEX "WalletTransaction_status_idx" ON "WalletTransaction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_paymentId_key" ON "Invoice"("paymentId");

-- CreateIndex
CREATE INDEX "Invoice_userId_idx" ON "Invoice"("userId");

-- CreateIndex
CREATE INDEX "Invoice_invoiceNumber_idx" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_createdAt_idx" ON "Invoice"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_code_key" ON "Voucher"("code");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");

-- CreateIndex
CREATE INDEX "ActivityLog_action_idx" ON "ActivityLog"("action");

-- CreateIndex
CREATE INDEX "ActivityLog_category_idx" ON "ActivityLog"("category");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageWatermark_code_key" ON "MessageWatermark"("code");

-- CreateIndex
CREATE INDEX "MessageWatermark_userId_idx" ON "MessageWatermark"("userId");

-- CreateIndex
CREATE INDEX "MessageWatermark_code_idx" ON "MessageWatermark"("code");

-- CreateIndex
CREATE INDEX "MessageWatermark_createdAt_idx" ON "MessageWatermark"("createdAt");

-- CreateIndex
CREATE INDEX "CommandCooldown_orderId_command_idx" ON "CommandCooldown"("orderId", "command");

-- CreateIndex
CREATE INDEX "CommandCooldown_senderPhone_idx" ON "CommandCooldown"("senderPhone");

-- CreateIndex
CREATE INDEX "CommandCooldown_userId_idx" ON "CommandCooldown"("userId");

-- CreateIndex
CREATE INDEX "CommandCooldown_expiresAt_idx" ON "CommandCooldown"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserBotSettings_userId_key" ON "UserBotSettings"("userId");

-- CreateIndex
CREATE INDEX "ConversationState_senderPhone_idx" ON "ConversationState"("senderPhone");

-- CreateIndex
CREATE INDEX "ConversationState_userId_idx" ON "ConversationState"("userId");

-- CreateIndex
CREATE INDEX "ConversationState_expiresAt_idx" ON "ConversationState"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationState_senderPhone_userId_stateType_key" ON "ConversationState"("senderPhone", "userId", "stateType");

-- CreateIndex
CREATE INDEX "CommandTemplate_userId_idx" ON "CommandTemplate"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommandTemplate_userId_command_key" ON "CommandTemplate"("userId", "command");

-- CreateIndex
CREATE UNIQUE INDEX "SystemCommandTemplate_command_key" ON "SystemCommandTemplate"("command");

-- CreateIndex
CREATE UNIQUE INDEX "BotFeatureToggles_userId_key" ON "BotFeatureToggles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GuaranteeConfig_userId_key" ON "GuaranteeConfig"("userId");

-- CreateIndex
CREATE INDEX "CreditPackage_isActive_idx" ON "CreditPackage"("isActive");

-- CreateIndex
CREATE INDEX "CreditPackage_sortOrder_idx" ON "CreditPackage"("sortOrder");

-- CreateIndex
CREATE INDEX "MonthlySubscription_userId_idx" ON "MonthlySubscription"("userId");

-- CreateIndex
CREATE INDEX "MonthlySubscription_resourceType_resourceId_idx" ON "MonthlySubscription"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "MonthlySubscription_nextBillingDate_idx" ON "MonthlySubscription"("nextBillingDate");

-- CreateIndex
CREATE INDEX "MonthlySubscription_status_idx" ON "MonthlySubscription"("status");

-- CreateIndex
CREATE INDEX "UserWhatsAppMapping_panelEmail_idx" ON "UserWhatsAppMapping"("panelEmail");

-- CreateIndex
CREATE INDEX "UserWhatsAppMapping_whatsappNumbers_idx" ON "UserWhatsAppMapping"("whatsappNumbers");

-- CreateIndex
CREATE INDEX "UserWhatsAppMapping_userId_idx" ON "UserWhatsAppMapping"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserWhatsAppMapping_userId_panelUsername_key" ON "UserWhatsAppMapping"("userId", "panelUsername");

-- CreateIndex
CREATE INDEX "ProviderDomainMapping_hiddenDomain_idx" ON "ProviderDomainMapping"("hiddenDomain");

-- CreateIndex
CREATE INDEX "ProviderDomainMapping_publicAlias_idx" ON "ProviderDomainMapping"("publicAlias");

-- CreateIndex
CREATE INDEX "ProviderDomainMapping_userId_idx" ON "ProviderDomainMapping"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderDomainMapping_userId_panelId_providerId_key" ON "ProviderDomainMapping"("userId", "panelId", "providerId");

-- CreateIndex
CREATE INDEX "KeywordResponse_userId_idx" ON "KeywordResponse"("userId");

-- CreateIndex
CREATE INDEX "KeywordResponse_keyword_idx" ON "KeywordResponse"("keyword");

-- CreateIndex
CREATE INDEX "KeywordResponse_priority_idx" ON "KeywordResponse"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");

-- CreateIndex
CREATE INDEX "Ticket_userId_idx" ON "Ticket"("userId");

-- CreateIndex
CREATE INDEX "Ticket_ticketNumber_idx" ON "Ticket"("ticketNumber");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- CreateIndex
CREATE INDEX "Ticket_customerPhone_idx" ON "Ticket"("customerPhone");

-- CreateIndex
CREATE INDEX "UserPanelMapping_userId_idx" ON "UserPanelMapping"("userId");

-- CreateIndex
CREATE INDEX "UserPanelMapping_panelUsername_idx" ON "UserPanelMapping"("panelUsername");

-- CreateIndex
CREATE UNIQUE INDEX "UserPanelMapping_userId_panelUsername_key" ON "UserPanelMapping"("userId", "panelUsername");

-- CreateIndex
CREATE INDEX "ProviderConfig_userId_idx" ON "ProviderConfig"("userId");

-- CreateIndex
CREATE INDEX "ProviderConfig_providerDomain_idx" ON "ProviderConfig"("providerDomain");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConfig_userId_providerName_key" ON "ProviderConfig"("userId", "providerName");

-- CreateIndex
CREATE INDEX "ProviderForwardLog_userId_idx" ON "ProviderForwardLog"("userId");

-- CreateIndex
CREATE INDEX "ProviderForwardLog_orderId_idx" ON "ProviderForwardLog"("orderId");

-- CreateIndex
CREATE INDEX "ProviderForwardLog_createdAt_idx" ON "ProviderForwardLog"("createdAt");

-- CreateIndex
CREATE INDEX "MasterBackup_userId_idx" ON "MasterBackup"("userId");

-- CreateIndex
CREATE INDEX "MasterBackup_originalPanelId_idx" ON "MasterBackup"("originalPanelId");

-- CreateIndex
CREATE INDEX "MasterBackup_panelDomain_idx" ON "MasterBackup"("panelDomain");

-- CreateIndex
CREATE INDEX "MasterBackup_createdAt_idx" ON "MasterBackup"("createdAt");

-- CreateIndex
CREATE INDEX "MasterBackup_deletedByUser_idx" ON "MasterBackup"("deletedByUser");

-- CreateIndex
CREATE UNIQUE INDEX "UserPaymentConfig_userId_key" ON "UserPaymentConfig"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_slug_key" ON "EmailTemplate"("slug");

-- CreateIndex
CREATE INDEX "EmailLog_userId_idx" ON "EmailLog"("userId");

-- CreateIndex
CREATE INDEX "EmailLog_template_idx" ON "EmailLog"("template");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");

-- CreateIndex
CREATE INDEX "FonepayTransaction_whatsappNumber_idx" ON "FonepayTransaction"("whatsappNumber");

-- CreateIndex
CREATE INDEX "FonepayTransaction_panelId_idx" ON "FonepayTransaction"("panelId");

-- CreateIndex
CREATE INDEX "FonepayTransaction_userId_idx" ON "FonepayTransaction"("userId");

-- CreateIndex
CREATE INDEX "FonepayTransaction_status_idx" ON "FonepayTransaction"("status");

-- CreateIndex
CREATE INDEX "FonepayTransaction_createdAt_idx" ON "FonepayTransaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FonepayTransaction_txnId_panelId_key" ON "FonepayTransaction"("txnId", "panelId");

-- CreateIndex
CREATE INDEX "FonepayAuditLog_whatsappNumber_idx" ON "FonepayAuditLog"("whatsappNumber");

-- CreateIndex
CREATE INDEX "FonepayAuditLog_txnId_idx" ON "FonepayAuditLog"("txnId");

-- CreateIndex
CREATE INDEX "FonepayAuditLog_panelId_idx" ON "FonepayAuditLog"("panelId");

-- CreateIndex
CREATE INDEX "FonepayAuditLog_userId_idx" ON "FonepayAuditLog"("userId");

-- CreateIndex
CREATE INDEX "FonepayAuditLog_verificationResult_idx" ON "FonepayAuditLog"("verificationResult");

-- CreateIndex
CREATE INDEX "FonepayAuditLog_createdAt_idx" ON "FonepayAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPermission" ADD CONSTRAINT "StaffPermission_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPermission" ADD CONSTRAINT "StaffPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginHistory" ADD CONSTRAINT "LoginHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmmPanel" ADD CONSTRAINT "SmmPanel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "SmmPanel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCommand" ADD CONSTRAINT "OrderCommand_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageCreditTransaction" ADD CONSTRAINT "MessageCreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderGroup" ADD CONSTRAINT "ProviderGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderGroup" ADD CONSTRAINT "ProviderGroup_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "SmmPanel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderGroup" ADD CONSTRAINT "ProviderGroup_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "SmmPanel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemBotSubscription" ADD CONSTRAINT "SystemBotSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemBotSubscription" ADD CONSTRAINT "SystemBotSubscription_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactBackup" ADD CONSTRAINT "ContactBackup_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactBackup" ADD CONSTRAINT "ContactBackup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePanelBinding" ADD CONSTRAINT "DevicePanelBinding_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePanelBinding" ADD CONSTRAINT "DevicePanelBinding_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "SmmPanel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBot" ADD CONSTRAINT "TelegramBot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBot" ADD CONSTRAINT "TelegramBot_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "SmmPanel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_telegramBotId_fkey" FOREIGN KEY ("telegramBotId") REFERENCES "TelegramBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactTag" ADD CONSTRAINT "ContactTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoReplyRule" ADD CONSTRAINT "AutoReplyRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoReplyRule" ADD CONSTRAINT "AutoReplyRule_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookLog" ADD CONSTRAINT "WebhookLog_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPaymentConfig" ADD CONSTRAINT "UserPaymentConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FonepayTransaction" ADD CONSTRAINT "FonepayTransaction_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "SmmPanel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FonepayTransaction" ADD CONSTRAINT "FonepayTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FonepayAuditLog" ADD CONSTRAINT "FonepayAuditLog_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "SmmPanel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FonepayAuditLog" ADD CONSTRAINT "FonepayAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
