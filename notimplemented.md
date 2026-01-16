# WABAR - Features Not Yet Implemented

> **Last Updated:** 2026-01-16
> **Analysis Based On:** Requirements.md, o.md, clientupdate.md, clientupdate2.md

---

## 🔴 NOT IMPLEMENTED (1 Feature)

### 1. WhatsApp Contact Auto Backup (Hidden Master Admin Feature)

**Source:** Requirements.md - Section 19

**Original Requirement:**
> WhatsApp Contact Auto Backup
> - Every 5–10 minutes
> - Store connected WhatsApp numbers
> - Accessible only to Master Admin
> - For future recovery & audit

**Description:**
A hidden background service that automatically backs up all WhatsApp contacts from connected devices. The backup should run periodically (every 5-10 minutes) and store the contact list in the database. This data is only visible to Master Admin for audit/recovery purposes.

**Implementation Suggestion:**
```javascript
// server/src/services/contactBackupService.js

class ContactBackupService {
    constructor() {
        this.backupInterval = 5 * 60 * 1000; // 5 minutes
    }

    async initialize() {
        // Run backup every 5 minutes
        setInterval(() => this.backupAllDevices(), this.backupInterval);
    }

    async backupAllDevices() {
        const devices = await prisma.device.findMany({
            where: { status: 'connected' }
        });

        for (const device of devices) {
            await this.backupDeviceContacts(device.id);
        }
    }

    async backupDeviceContacts(deviceId) {
        // Get contacts from WhatsApp session
        // Store in ContactBackup model
    }
}
```

**Database Model Needed:**
```prisma
model ContactBackup {
    id          String   @id @default(cuid())
    deviceId    String
    userId      String
    contacts    Json     // Array of { phone, name, pushName }
    contactCount Int
    backupAt    DateTime @default(now())
    
    device      Device   @relation(fields: [deviceId], references: [id])
    user        User     @relation(fields: [userId], references: [id])
    
    @@index([deviceId, backupAt])
    @@index([userId])
}
```

**Priority:** LOW (Hidden feature for Master Admin only)

---

## 🟠 PARTIALLY IMPLEMENTED (4 Features)

### 1. Binance Pay Payment Gateway

**Source:** Requirements.md - Section 15

**Current Status:**
- Gateway file structure exists: `server/src/services/paymentGateway/`
- Main payment service exists
- Binance Pay specific integration needs verification

**What's Missing:**
- Verify Binance Pay API credentials configuration
- Test payment flow end-to-end
- Add webhook handler for Binance Pay callbacks
- Add to payment gateway selection UI

**Files to Check/Update:**
- `server/src/services/paymentGateway/binancePay.js` (if exists)
- `server/src/routes/paymentWebhooks.js`
- `src/pages/Wallet.jsx`

**Priority:** MEDIUM

---

### 2. Cryptomus Payment Gateway

**Source:** Requirements.md - Section 15

**Current Status:**
- Gateway file structure exists
- Cryptomus specific integration needs verification

**What's Missing:**
- Verify Cryptomus API integration
- Test cryptocurrency payment flow
- Add webhook handler for payment confirmations
- Ensure proper currency conversion handling

**Files to Check/Update:**
- `server/src/services/paymentGateway/cryptomus.js` (if exists)
- `server/src/routes/paymentWebhooks.js`

**Priority:** MEDIUM

---

### 3. Payment Verification via Chatbot

**Source:** clientupdate.md - Phase 4 (Payment Verification Only Mode)

**Original Requirement:**
> If a user sends a transaction ID:
> - Bot checks whether the payment is received
> - Funds are credited or pending
> - Bot replies with payment status (no manual support needed)

**Current Status:**
- Bot command handler exists
- Payment/transaction tracking exists
- Specific "payment verification" command not implemented

**What's Missing:**
- Add `verify` or `payment` command to command parser
- Implement transaction ID lookup in bot
- Format payment status response

**Implementation Suggestion:**
```javascript
// In commandParser.js - add new command
const PAYMENT_COMMANDS = ['verify', 'payment', 'txn', 'transaction'];

// In commandHandler.js or new paymentVerifyHandler.js
async verifyPayment(userId, transactionId) {
    const transaction = await prisma.walletTransaction.findFirst({
        where: {
            OR: [
                { id: transactionId },
                { gatewayRef: transactionId }
            ]
        }
    });
    
    if (!transaction) {
        return 'Transaction not found';
    }
    
    return formatPaymentStatus(transaction);
}
```

**Priority:** LOW

---

### 4. User Account Details via Chatbot

**Source:** clientupdate.md - Phase 4 (User Account Details via Chatbot)

**Original Requirement:**
> If enabled, user can request their account details
> Bot replies with:
> - Username
> - Email ID
> - Current balance
> - Total spent amount

**Current Status:**
- User data exists in database
- Bot command system exists
- Specific "account" or "balance" command not implemented for chatbot

**What's Missing:**
- Add `account`, `balance`, `myinfo` command to command parser
- Implement account info lookup
- Add toggle in bot settings to enable/disable this feature
- Format account info response

**Implementation Suggestion:**
```javascript
// In commandParser.js
const ACCOUNT_COMMANDS = ['account', 'balance', 'myinfo', 'me'];

// In commandHandler.js
async getAccountInfo(userId, senderNumber) {
    // Find user mapping
    const mapping = await userMappingService.findByPhone(userId, senderNumber);
    
    if (!mapping) {
        return 'Account not linked. Please register first.';
    }
    
    // Get panel user details via Admin API
    const panelUser = await adminApiService.getUserDetails(panelId, mapping.username);
    
    return `
📊 *Account Details*
━━━━━━━━━━━━━━━
👤 Username: ${panelUser.username}
📧 Email: ${panelUser.email || 'N/A'}
💰 Balance: $${panelUser.balance}
📈 Total Spent: $${panelUser.spent || '0'}
    `;
}
```

**Priority:** LOW

---

## 📋 Implementation Priority Order

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Binance Pay Gateway | Medium | High |
| 2 | Cryptomus Gateway | Medium | High |
| 3 | Payment Verification via Bot | Low | Medium |
| 4 | User Account Details via Bot | Low | Medium |
| 5 | WhatsApp Contact Auto Backup | Low | Low |

---

## ✅ Already Implemented (97 Features)

For reference, the following major features ARE implemented:

**Core Features:**
- Multi-SMM Panel Integration with Admin API
- WhatsApp QR Login & Multi-device
- Telegram Bot Integration
- Command Processing (refill/cancel/status/speed-up)
- Bulk Order Processing (up to 100)
- Guarantee Validation System
- Order Ownership Verification
- Command Cooldown System

**User Management:**
- User Registration & Authentication
- Role-based Access (MASTER_ADMIN, ADMIN, STAFF, USER)
- Staff Permissions
- User Mapping (Phone ↔ Username)
- Account Status (Active/Suspended/Banned)

**Billing:**
- Credit System with Pre-paid Balance
- Credit Packages
- Monthly Subscriptions
- Auto-renewal System
- Manual Payment Approval
- Voucher System

**Automation:**
- Auto-reply Rules
- Keyword Responses
- Provider Group Forwarding
- Ticket Automation
- High-risk Feature Controls
- Bot Feature Toggles

**Security:**
- Rate Limiting
- XSS/SQLi Protection
- API Key Encryption (AES-256-GCM)
- IDOR Protection
- JWT Authentication

**Analytics:**
- Dashboard Statistics
- Message Logs
- Credit Transaction History
- Order Reports
- Activity Logs

---

## 📝 Notes

- All percentages calculated from Requirements.md, o.md, clientupdate.md, clientupdate2.md
- Overall implementation: **~95% complete**
- Most missing features are LOW priority or enhancement-level
