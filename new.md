# 📋 WABAR Client Requirements Implementation Analysis

**Document Version:** 1.0  
**Date:** 16 January 2026  
**Status:** Implementation Gap Analysis

---

## 📌 Executive Summary

Dokumen ini menganalisis requirements dari client (berdasarkan `clientupdate.md` dan `clientupdate2.md`) dan membandingkannya dengan implementasi saat ini di project WABAR. Setiap fitur dikategorikan dengan status implementasi dan detail teknis yang diperlukan.

---

# 🚀 RECOMMENDED IMPLEMENTATION ROADMAP

## Urutan Implementasi yang Direkomendasikan

Berikut adalah urutan implementasi berdasarkan **dependencies** (apa yang harus dibangun duluan), **business impact** (nilai untuk client), dan **complexity** (tingkat kesulitan):

---

## 📊 Overview Timeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    IMPLEMENTATION ROADMAP - 6 WEEKS                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  WEEK 1: Foundation & Database                                              │
│  ├── Step 1: Schema Updates (All new models)                               │
│  └── Step 2: BotFeatureToggles System                                       │
│                                                                             │
│  WEEK 2: Core Bot Intelligence                                              │
│  ├── Step 3: Guarantee Validation System                                    │
│  └── Step 4: Keyword-Response Separation                                    │
│                                                                             │
│  WEEK 3: Billing Foundation                                                 │
│  ├── Step 5: Credit Packages System                                         │
│  └── Step 6: Monthly Subscription Model                                     │
│                                                                             │
│  WEEK 4: User Management                                                    │
│  ├── Step 7: UserWhatsAppMapping System                                     │
│  └── Step 8: Unregistered User Flow                                         │
│                                                                             │
│  WEEK 5: Provider Enhancement                                               │
│  ├── Step 9: Multiple Forwarding Destinations                               │
│  └── Step 10: Hidden Domain Storage                                         │
│                                                                             │
│  WEEK 6: Advanced Features                                                  │
│  ├── Step 11: Ticket Automation                                             │
│  └── Step 12: High-Risk Features (Optional)                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 DETAILED IMPLEMENTATION ORDER

### 🔵 STEP 1: Database Schema Updates
**Priority:** 🔴 CRITICAL | **Effort:** Medium | **Duration:** 1-2 days

**Alasan Prioritas:**
- Semua fitur lain bergantung pada model database yang baru
- Harus dilakukan pertama sebelum membangun service/UI apapun

**Tasks:**
1. Tambahkan model `BotFeatureToggles` ke schema.prisma
2. Tambahkan model `GuaranteeConfig` ke schema.prisma
3. Tambahkan model `CreditPackage` ke schema.prisma
4. Tambahkan model `MonthlySubscription` ke schema.prisma
5. Tambahkan model `UserWhatsAppMapping` ke schema.prisma
6. Tambahkan model `ProviderDomainMapping` ke schema.prisma
7. Tambahkan model `KeywordResponse` ke schema.prisma
8. Update model `Order` - tambahkan field `completedAt`
9. Run `npx prisma migrate dev`

**Deliverables:**
- [x] All new models in schema.prisma ✅ DONE
- [x] Migration files generated ✅ DONE (via prisma db push)
- [x] Database updated successfully ✅ DONE

---

### 🔵 STEP 2: BotFeatureToggles System
**Priority:** 🔴 CRITICAL | **Effort:** Medium | **Duration:** 2-3 days

**Alasan Prioritas:**
- Client sangat membutuhkan kontrol on/off untuk setiap fitur
- Fondasi untuk semua fitur bot lainnya
- Quick win - terlihat jelas di UI

**Dependencies:** Step 1 (Schema)

**Tasks:**
1. Create `BotFeatureToggles` service
2. Create API endpoints (CRUD untuk toggles)
3. Integrate toggles ke `commandHandler.js`
4. Create admin UI page untuk manage toggles
5. Add warning dialogs untuk high-risk features

**Deliverables:**
- [x] `server/src/services/botFeatureService.js` ✅ DONE
- [x] `server/src/routes/botFeatures.js` ✅ DONE
- [x] `src/pages/BotSettings.jsx` ✅ DONE
- [x] Toggle integration in command handler ✅ DONE

---

### 🔵 STEP 3: Guarantee Validation System
**Priority:** 🔴 CRITICAL | **Effort:** Medium | **Duration:** 2 days

**Alasan Prioritas:**
- Core feature yang sangat diminta client
- Mencegah refill abuse untuk non-guarantee orders
- Langsung terintegrasi dengan command processing yang sudah ada

**Dependencies:** Step 1 (Schema), Step 2 (Feature Toggles)

**Tasks:**
1. Create `guaranteeService.js`
   - Extract guarantee days from service name
   - Support multiple patterns (30 Days ♻️, 10 Days Guarantee, etc.)
   - Calculate expiry dari order completion date
2. Create `GuaranteeConfig` management UI
3. Integrate ke `handleRefill()` di commandHandler.js
4. Add appropriate error messages

**Deliverables:**
- [x] `server/src/services/guaranteeService.js` ✅ DONE
- [x] `server/src/routes/guarantee.js` ✅ DONE
- [x] Integration in refill command handler ✅ DONE

---

### 🔵 STEP 4: Keyword-Response Separation
**Priority:** 🟠 HIGH | **Effort:** Low | **Duration:** 1-2 days

**Alasan Prioritas:**
- Diminta langsung oleh client di `clientupdate2.md`
- Membuat konfigurasi bot lebih mudah
- Enhancement dari AutoReplyRule yang sudah ada

**Dependencies:** Step 1 (Schema)

**Tasks:**
1. Create atau enhance `KeywordResponse` model
2. Create dedicated API endpoints
3. Create UI untuk manage keyword-response pairs
4. Integrate dengan existing auto-reply system

**Deliverables:**
- [x] `server/src/services/keywordResponseService.js` ✅ DONE
- [x] `server/src/routes/keywordResponses.js` ✅ DONE
- [x] `src/pages/KeywordResponses.jsx` ✅ DONE
- [x] Added to Sidebar navigation ✅ DONE

---

### 🔵 STEP 5: Credit Packages System
**Priority:** 🔴 CRITICAL | **Effort:** Medium | **Duration:** 2-3 days

**Alasan Prioritas:**
- Major billing change requested by client
- Foundation untuk monetisasi yang lebih baik
- Mengubah model dari per-message ke credit packages

**Dependencies:** Step 1 (Schema)

**Tasks:**
1. Create `CreditPackage` management (Admin)
2. Create package purchase flow (User)
3. Update wallet page untuk show packages
4. Create package selection UI during payment
5. Update credit deduction logic

**Deliverables:**
- [x] `server/src/services/creditPackageService.js` ✅ DONE
- [x] `server/src/routes/creditPackages.js` ✅ DONE
- [x] Default packages auto-created ✅ DONE
- [x] Admin UI `src/pages/admin/CreditPackages.jsx` ✅ DONE
- [x] Updated `Wallet.jsx` with package purchase ✅ DONE

---

### 🔵 STEP 6: Monthly Subscription System
**Priority:** 🔴 CRITICAL | **Effort:** High | **Duration:** 3-4 days

**Alasan Prioritas:**
- Recurring revenue model yang diminta client
- Auto-renewal untuk devices, panels, bots
- Complex tapi sangat penting untuk business

**Dependencies:** Step 1 (Schema), Step 5 (Credit Packages)

**Tasks:**
1. Create `subscriptionService.js`
2. Create subscription cron job (daily check)
3. Implement renewal logic
4. Implement grace period handling
5. Implement pause/resume logic
6. Create notifications for:
   - Upcoming renewal
   - Renewal success
   - Renewal failed
   - Service paused
7. Update device/bot/panel creation to include subscription

**Deliverables:**
- [x] `server/src/services/subscriptionService.js` ✅ DONE
- [x] `server/src/services/subscriptionScheduler.js` ✅ DONE
- [x] `server/src/routes/subscriptions.js` ✅ DONE
- [x] Subscription management UI `src/pages/Subscriptions.jsx` ✅ DONE
- [x] Integration with device/bot/panel creation `resourceSubscriptionHook.js` ✅ DONE

---

### 🔵 STEP 7: UserWhatsAppMapping System
**Priority:** 🟠 HIGH | **Effort:** High | **Duration:** 3 days

**Alasan Prioritas:**
- Phase 1 dari client requirements
- Enables proper user-to-order ownership validation
- Foundation untuk security yang lebih baik

**Dependencies:** Step 1 (Schema), Step 2 (Feature Toggles)

**Tasks:**
1. Create `UserWhatsAppMapping` model implementation
2. Create admin UI untuk manage mappings
3. Create API endpoints
4. Integrate dengan command handler untuk validation
5. Add bulk import dari existing contacts

**Deliverables:**
- [x] `server/src/services/userMappingService.js` ✅ DONE
- [x] `server/src/routes/userMappings.js` ✅ DONE
- [x] `src/pages/UserMappings.jsx` ✅ DONE
- [x] Bulk import and check-sender endpoints ✅ DONE

---

### 🔵 STEP 8: Unregistered User Flow
**Priority:** 🟠 HIGH | **Effort:** Medium | **Duration:** 2 days

**Alasan Prioritas:**
- Melengkapi UserWhatsAppMapping
- Smooth onboarding untuk new users
- Better UX untuk customer panel owner

**Dependencies:** Step 7 (UserWhatsAppMapping)

**Tasks:**
1. Create `userValidationService.js`
2. Implement conversation flow:
   - Detect unregistered sender
   - Ask for username/email
   - Validate against panel
   - Auto-register if valid
3. Handle edge cases (duplicate, banned, etc.)
4. Create configurable messages

**Deliverables:**
- [x] `server/src/services/unregisteredUserService.js` ✅ DONE
- [x] Registration flow with conversation state ✅ DONE
- [x] Auto-registration from order username ✅ DONE

---

### 🔵 STEP 9: Multiple Forwarding Destinations
**Priority:** 🟡 MEDIUM | **Effort:** Medium | **Duration:** 2 days

**Alasan Prioritas:**
- Enhancement untuk provider group forwarding
- Flexibility untuk forward ke multiple channels
- Good improvement tapi bukan blocker

**Dependencies:** Step 1 (Schema)

**Tasks:**
1. Update `ProviderGroup` model untuk support multiple destinations
2. Update `groupForwarding.js` untuk iterate destinations
3. Update UI untuk add/remove multiple destinations
4. Support mix of WhatsApp groups, numbers, Telegram

**Deliverables:**
- [x] `server/src/services/providerForwardingService.js` ✅ DONE
- [x] Multi-destination forwarding (WhatsApp, Telegram, Webhooks) ✅ DONE
- [x] API + Group message forwarding ✅ DONE

---

### 🔵 STEP 10: Hidden Domain Storage
**Priority:** 🟡 MEDIUM | **Effort:** Low | **Duration:** 1 day

**Alasan Prioritas:**
- Security enhancement
- Stores provider domains internally
- Relatively simple implementation

**Dependencies:** Step 1 (Schema)

**Tasks:**
1. Create `ProviderDomainMapping` implementation
2. Extract domain saat sync providers
3. Store securely (never expose to frontend)
4. Use for internal provider identification

**Deliverables:**
- [x] `server/src/services/providerDomainService.js` ✅ DONE
- [x] `server/src/routes/providerDomains.js` ✅ DONE
- [x] Auto-detection from service name ✅ DONE

---

### 🔵 STEP 11: Ticket Automation (Optional)
**Priority:** 🟢 LOW | **Effort:** High | **Duration:** 3-4 days

**Alasan Prioritas:**
- Bergantung pada Panel API capabilities
- Complex integration
- Nice to have, bukan core requirement

**Dependencies:** Step 2 (Feature Toggles), Panel API support

**Tasks:**
1. Check panel API untuk ticket endpoints
2. Create `ticketAutomationService.js`
3. Detect ticket keywords
4. Auto-reply implementation
5. Forward unhandled to admin

**Deliverables:**
- [x] `server/src/services/ticketAutomationService.js` ✅ DONE
- [x] `server/src/routes/tickets.js` ✅ DONE
- [x] Ticket UI `src/pages/Tickets.jsx` ✅ DONE
- [x] Ticket model in Prisma schema ✅ DONE

---

### 🔵 STEP 12: High-Risk Features (Optional)
**Priority:** 🟢 LOW | **Effort:** Medium | **Duration:** 2-3 days

**Alasan Prioritas:**
- High-risk features dengan warning labels
- Client can enable at their own risk
- Requires careful implementation

**Features:**
- Force Order Completed ⚠️
- Order Link Update via Bot
- Payment Verification via Bot
- User Account Details via Bot

**Tasks:**
1. Implement dengan extensive logging
2. Add confirmation dialogs
3. Add audit trail untuk semua actions
4. Rate limiting untuk abuse prevention

**Deliverables:**
- [x] `server/src/services/highRiskService.js` ✅ DONE
- [x] `server/src/routes/highRisk.js` ✅ DONE
- [x] Extensive logging & audit trail ✅ DONE
- [x] Cooldown & rate limiting ✅ DONE

---

## 📈 Summary Priority Table

| Step | Feature | Priority | Week | Dependencies |
|------|---------|----------|------|--------------|
| 1 | Schema Updates | 🔴 CRITICAL | 1 | None |
| 2 | BotFeatureToggles | 🔴 CRITICAL | 1 | Step 1 |
| 3 | Guarantee Validation | 🔴 CRITICAL | 2 | Step 1, 2 |
| 4 | Keyword-Response | 🟠 HIGH | 2 | Step 1 |
| 5 | Credit Packages | 🔴 CRITICAL | 3 | Step 1 |
| 6 | Monthly Subscriptions | 🔴 CRITICAL | 3 | Step 1, 5 |
| 7 | UserWhatsAppMapping | 🟠 HIGH | 4 | Step 1, 2 |
| 8 | Unregistered User Flow | 🟠 HIGH | 4 | Step 7 |
| 9 | Multiple Forward Dest | 🟡 MEDIUM | 5 | Step 1 |
| 10 | Hidden Domain Storage | 🟡 MEDIUM | 5 | Step 1 |
| 11 | Ticket Automation | 🟢 LOW | 6 | Step 2 |
| 12 | High-Risk Features | 🟢 LOW | 6 | Step 2 |

---

## 🎯 Quick Wins (Bisa selesai < 1 hari)

Jika ingin menunjukkan progress cepat ke client:

1. **BotFeatureToggles UI** - Toggle switches visible di dashboard
2. **Keyword-Response UI** - Separated section, easy to configure
3. **Credit Package Display** - Show packages di wallet page

---

## ⚠️ Potential Blockers

1. **Panel API Limitations** - Beberapa fitur (ticket automation) bergantung pada API panel yang mungkin tidak tersedia
2. **Cron Job Infrastructure** - Subscription renewal butuh reliable cron system
3. **Database Migration** - Harus dilakukan dengan hati-hati di production
4. **Backward Compatibility** - Existing users tidak boleh terdampak

---

## 🎯 Client Requirements Overview

Client meminta implementasi dalam **5 Phase utama** ditambah sistem kredit/billing yang lebih canggih:

| Phase | Deskripsi | Status |
|-------|-----------|--------|
| Phase 1 | Username & User Validation System | 🔶 Partial |
| Phase 2 | Order Command Handling | 🔶 Partial |
| Phase 3 | Mass/Bulk Order Support | ✅ Implemented |
| Phase 4 | Rule-Based Bot Control | 🔴 Not Implemented |
| Phase 5 | Provider Integration & API Sync | 🔶 Partial |
| Billing | Message Credit System Enhancement | 🔴 Not Implemented |

---

# 📦 PHASE 1: Username & User Validation System

## 1.1 Requirement dari Client

### A. Manual User Registration & Mapping Panel
Panel admin harus dapat mengelola user validation secara manual dengan field:

| Field | Deskripsi | Status |
|-------|-----------|--------|
| Username (Panel username) | Mandatory | 🔴 Missing |
| Registered Email & User ID | Optional | 🔴 Missing |
| WhatsApp Number / Group ID | Multiple allowed | 🔶 Partial (hanya `claimedByPhone`) |
| Bot Response Status | Active/Disabled | 🔴 Missing |
| Admin Memo / Notes | Internal notes | 🔴 Missing |
| Security Rule (auto-suspend spam) | Anti-abuse | 🔶 Partial |

### B. New User Interaction Flow
| Step | Requirement | Status |
|------|-------------|--------|
| 1 | Bot replies: "This number is not registered. Please enter your panel username..." | 🔴 Missing |
| 2 | System checks if username/email exists | 🔴 Missing |
| 3 | Auto-mapping jika valid | 🔴 Missing |
| 4 | "Already registered with another number" reply | 🔴 Missing |

### C. Account Status Validation
| Feature | Deskripsi | Status |
|---------|-----------|--------|
| Check banned/suspended status | Via panel API | 🔴 Missing |
| Predefined reply for banned users | Custom message | 🔴 Missing |

## 1.2 Current Implementation

```
Model yang ada saat ini:
- Order.claimedByPhone ✅ (single claim)
- Order.customerUsername ✅ (dari panel)
- Order.customerEmail ✅ (dari panel)
- ConversationState ✅ (multi-step conversation)
- UserBotSettings.usernameValidationMode ✅ (disabled/ask/strict)
```

## 1.3 Gap Analysis - Phase 1

### 🔴 MISSING: UserWhatsAppMapping Model
```prisma
// NEW MODEL NEEDED
model UserWhatsAppMapping {
  id              String   @id @default(cuid())
  userId          String   // Panel owner
  panelUsername   String   // Username on panel
  panelEmail      String?  // Email on panel
  panelUserId     String?  // User ID on panel
  
  // WhatsApp mappings (multiple allowed)
  whatsappNumbers String   // JSON array of phone numbers
  groupIds        String?  // JSON array of group IDs
  
  // Status
  isActive        Boolean  @default(true)
  isBotEnabled    Boolean  @default(true)
  
  // Admin controls
  adminNotes      String?
  autoSuspended   Boolean  @default(false)
  suspendReason   String?
  suspendedAt     DateTime?
  
  // Tracking
  spamCount       Int      @default(0)
  lastMessageAt   DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@unique([userId, panelUsername])
  @@index([whatsappNumbers])
}
```

### 🔴 MISSING: Admin UI untuk User Mapping
- Halaman admin untuk mengelola user-to-WhatsApp mapping
- CRUD operations untuk mapping
- Enable/disable bot per user
- Add notes per user

### 🔴 MISSING: Unregistered User Flow Service
```javascript
// NEW SERVICE NEEDED: userValidationService.js
class UserValidationService {
  // Check if sender is registered
  async checkSenderRegistration(senderPhone, userId) {}
  
  // Start registration flow
  async startRegistrationFlow(senderPhone, userId) {}
  
  // Verify username/email
  async verifyUserCredentials(username, email, senderPhone, userId) {}
  
  // Auto-register new mapping
  async autoRegisterMapping(panelUsername, senderPhone, userId) {}
}
```

---

# 📦 PHASE 2: Order Command Handling

## 2.1 Requirement dari Client

### A. Command Cooldown System
| Requirement | Deskripsi | Status |
|-------------|-----------|--------|
| Cooldown per order ID | 12 hours default | ✅ Implemented |
| "Already in queue" reply | Custom message | ✅ Implemented |
| Prevent duplicate requests | Per order + command | ✅ Implemented |

### B. Order Validation Flow
| Step | Requirement | Status |
|------|-------------|--------|
| 1. User Validation | WhatsApp → username mapping | 🔶 Partial |
| 2. Order Ownership | Order belongs to user | ✅ Implemented |
| 3. Status Check | Cancelled/Partial/Pending/etc | ✅ Implemented |

### C. Command-Specific Logic

#### Cancel Command
| Status | Expected Reply | Status |
|--------|----------------|--------|
| Cancelled | "Order already cancelled" | ✅ Implemented |
| Partial | "Order already partially refunded" | ✅ Implemented |
| In Progress | "Cancel request added" + Forward | ✅ Implemented |
| Completed | "Completed orders cannot be cancelled" | ✅ Implemented |

#### Refill Command  
| Status | Expected Action | Status |
|--------|-----------------|--------|
| Completed | Proceed to Guarantee Validation | 🔴 Missing |
| In Progress | "Refill not possible" | ✅ Implemented |
| Check guarantee period | Calculate from completion date | 🔴 Missing |

#### Speed-Up Command
| Status | Expected Action | Status |
|--------|-----------------|--------|
| Pending/In Progress | "Speed-up request added" + Forward | ✅ Implemented |
| Cancelled/Completed | "Speed-up not allowed" | ✅ Implemented |

## 2.2 Gap Analysis - Phase 2

### 🔴 MISSING: Guarantee Validation System

Client menginginkan sistem yang dapat:
1. **Detect guarantee dari service name** (e.g., "30 Days ♻️", "10 Days ♻️")
2. **Calculate guarantee expiry** dari order completion date
3. **Block refill** jika guarantee expired

```javascript
// NEW: guaranteeService.js
class GuaranteeService {
  // Extract guarantee days from service name
  extractGuaranteeDays(serviceName) {
    // Pattern: "30 Days ♻️", "10 Days Guarantee", etc.
    const patterns = [
      /(\d+)\s*Days?\s*♻️/i,
      /(\d+)\s*Days?\s*Guarantee/i,
      /Guarantee\s*(\d+)\s*Days?/i,
      /♻️\s*(\d+)\s*Days?/i
    ];
    
    for (const pattern of patterns) {
      const match = serviceName.match(pattern);
      if (match) return parseInt(match[1]);
    }
    return null; // No guarantee
  }
  
  // Check if guarantee is still valid
  isGuaranteeValid(order) {
    const guaranteeDays = this.extractGuaranteeDays(order.serviceName);
    if (!guaranteeDays) return { valid: false, reason: 'NO_GUARANTEE' };
    
    const completedAt = order.completedAt || order.updatedAt;
    const expiryDate = new Date(completedAt);
    expiryDate.setDate(expiryDate.getDate() + guaranteeDays);
    
    if (new Date() > expiryDate) {
      return { valid: false, reason: 'EXPIRED', expiredAt: expiryDate };
    }
    return { valid: true, expiresAt: expiryDate };
  }
}
```

### 🔴 MISSING: GuaranteeConfig Model
```prisma
// User-configurable guarantee patterns
model GuaranteeConfig {
  id          String   @id @default(cuid())
  userId      String
  
  // Pattern configuration
  patterns    String   // JSON array of regex patterns
  keywords    String?  // Comma-separated keywords
  emojis      String?  // Emoji patterns like ♻️,🔄
  
  // Default guarantee (if pattern found but no days specified)
  defaultDays Int      @default(30)
  
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@unique([userId])
}
```

---

# 📦 PHASE 3: Mass/Bulk Order Support

## 3.1 Requirement dari Client

| Feature | Deskripsi | Status |
|---------|-----------|--------|
| Multiple order IDs per message | Comma/newline separated | ✅ Implemented |
| Max 100 orders per message | Configurable limit | ✅ Implemented |
| Individual validation per order | Apply all validation rules | ✅ Implemented |
| Detailed response (≤5 orders) | Show each order result | ✅ Implemented |
| Compact response (>5 orders) | Summary only | ✅ Implemented |
| Mixed results handling | Valid + Invalid separation | ✅ Implemented |
| Bulk forwarding to provider | Group by provider | ✅ Implemented |

## 3.2 Current Implementation

✅ **Fully Implemented** in:
- `commandParser.js` - Parses multiple order IDs
- `commandHandler.js` - Processes each order individually
- `groupForwarding.js` - Bulk forward with `bulkForward()`

## 3.3 Gap Analysis - Phase 3

### 🔶 ENHANCEMENT NEEDED: Config untuk Response Mode

```javascript
// Tambahkan ke UserBotSettings
bulkResponseThreshold: Int @default(5)  // Switch to compact mode after this
maxBulkOrders: Int @default(100)        // Max orders per message
```

---

# 📦 PHASE 4: Rule-Based Bot Control (HIGH PRIORITY)

## 4.1 Requirement dari Client

Client menginginkan **toggle switches** untuk setiap fitur bot:

### A. High-Risk Rules (Opt-in)
| Rule | Deskripsi | Status |
|------|-----------|--------|
| Error/Failed Order Auto Handling | Auto-cancel/refund failed orders | 🔴 Missing |
| Force Order Status to Completed | Fake completion (dangerous!) | 🔴 Missing |
| Order Link Update via Chatbot | User can update order link | 🔴 Missing |
| Payment Verification Mode | Check transaction via bot | 🔴 Missing |
| User Account Details via Chatbot | Show balance, spent, etc | 🔴 Missing |
| Ticket Page Reply Allowed | Auto-reply to panel tickets | 🔴 Missing |

### B. Command Mapping (Provider Side)
| User Command | Provider Command | Status |
|--------------|------------------|--------|
| Speed-Up | `{speed}` | 🔴 Missing (no template) |
| Refill | `{refill}` | 🔴 Missing (no template) |
| Cancel | `{cancel}` | 🔴 Missing (no template) |
| Processing | Custom | 🔴 Missing |

### C. Ticket Automation
| Feature | Deskripsi | Status |
|---------|-----------|--------|
| Ticket subject detection | Keywords: order, refill, payment, cancel | 🔴 Missing |
| Auto-reply on panel | Via panel API | 🔴 Missing |
| Forward unhandled to admin WhatsApp | Ticket ID, username, subject | 🔴 Missing |
| Create ticket on provider side | Via external order ID | 🔴 Missing |

## 4.2 Gap Analysis - Phase 4

### 🔴 MISSING: BotFeatureToggle Model
```prisma
model BotFeatureToggles {
  id     String @id @default(cuid())
  userId String @unique
  
  // ==================== HIGH-RISK RULES ====================
  // Error/Failed Order Auto Handling
  autoHandleFailedOrders      Boolean @default(false)
  failedOrderAction           String  @default("CANCEL") // CANCEL, REFUND, NOTIFY
  
  // Force Order Status (DANGEROUS)
  allowForceCompleted         Boolean @default(false)
  
  // Order Link Update via Chatbot
  allowLinkUpdateViaBot       Boolean @default(false)
  
  // Payment Verification via Bot
  allowPaymentVerification    Boolean @default(false)
  
  // User Account Details via Bot
  allowAccountDetailsViaBot   Boolean @default(false)
  
  // Ticket Auto-Reply
  allowTicketAutoReply        Boolean @default(false)
  
  // ==================== COMMAND TOGGLES ====================
  // Enable/disable specific commands
  allowRefillCommand          Boolean @default(true)
  allowCancelCommand          Boolean @default(true)
  allowSpeedUpCommand         Boolean @default(true)
  allowStatusCommand          Boolean @default(true)
  
  // ==================== PROCESSING STATUS RULES ====================
  // Special handling for "Processing" status
  processingSpeedUpEnabled    Boolean @default(true)
  processingCancelEnabled     Boolean @default(false)
  autoForwardProcessingCancel Boolean @default(false)
  
  // ==================== PROVIDER COMMAND MAPPING ====================
  // Custom command templates for provider forwarding
  providerSpeedUpTemplate     String  @default("{speed}")
  providerRefillTemplate      String  @default("{refill}")
  providerCancelTemplate      String  @default("{cancel}")
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 🔴 MISSING: Ticket Automation Service
```javascript
// NEW: ticketAutomationService.js
class TicketAutomationService {
  // Detect ticket subject keywords
  detectTicketType(subject) {
    const keywords = {
      ORDER: ['order', 'pesanan', 'id'],
      REFILL: ['refill', 'isi ulang', 'guarantee'],
      PAYMENT: ['payment', 'bayar', 'deposit', 'transaction'],
      CANCEL: ['cancel', 'batal', 'refund'],
      SPEEDUP: ['speed', 'cepat', 'slow']
    };
    // ...detection logic
  }
  
  // Auto-reply to ticket on panel
  async autoReplyToTicket(panelId, ticketId, replyMessage) {}
  
  // Forward unhandled ticket to admin
  async forwardTicketToAdmin(ticket, adminWhatsApp) {}
  
  // Create ticket on provider panel
  async createProviderTicket(providerOrderId, subject, message) {}
}
```

### 🔴 MISSING: Admin UI untuk Feature Toggles
- Toggle switches untuk semua rules
- Warning messages untuk high-risk features
- Confirmation dialog untuk dangerous operations

---

# 📦 PHASE 5: Provider Integration & API Sync

## 5.1 Requirement dari Client

### A. Dual Request Submission
| Feature | Deskripsi | Status |
|---------|-----------|--------|
| API request + Group forwarding | Simultaneous | ✅ Implemented |
| Cancel via API + Forward | Both actions | ✅ Implemented |
| Refill via API + Forward | Both actions | ✅ Implemented |

### B. Provider Auto-Import
| Feature | Deskripsi | Status |
|---------|-----------|--------|
| Fetch all providers from panel | One-click import | 🔶 Partial |
| Import Provider Alias Name | Or fallback to Provider Name | ✅ Implemented |
| Privacy notice (providers safe) | User-facing message | 🔴 Missing |
| Hidden domain sync | Internal security | 🔴 Missing |

### C. Provider Alias & Auto-Sync
| Feature | Deskripsi | Status |
|---------|-----------|--------|
| Internal Domain (Hidden) | Stored internally | 🔴 Missing |
| Public Alias (Visible) | User-configurable | ✅ Implemented |
| Sync Providers button | Re-import aliases | 🔶 Partial |

### D. Provider Request Forwarding
| Destination | Status |
|-------------|--------|
| WhatsApp Group | ✅ Implemented |
| WhatsApp Number | ✅ Implemented |
| Telegram Group | 🔶 Partial |
| Telegram Username | 🔶 Partial |
| Multiple destinations | 🔴 Missing |

## 5.2 Gap Analysis - Phase 5

### 🔴 MISSING: ProviderDomain Hidden Storage
```prisma
// Add to existing ProviderGroup or create new model
model ProviderDomainMapping {
  id            String   @id @default(cuid())
  userId        String
  panelId       String
  
  // Provider identification
  providerId    String   // Provider ID from panel
  providerName  String   // Original provider name
  
  // Hidden domain (INTERNAL ONLY - never exposed to UI)
  hiddenDomain  String?  // e.g., "smmrapid.com"
  
  // Public alias (user-facing)
  publicAlias   String   // e.g., "SMMRPD"
  
  // Multiple forwarding destinations
  forwardDestinations String // JSON: [{type: "WHATSAPP_GROUP", id: "xxx"}, ...]
  
  isActive      Boolean  @default(true)
  lastSyncedAt  DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  @@unique([userId, panelId, providerId])
  @@index([hiddenDomain])
}
```

### 🔶 ENHANCEMENT: Multiple Forwarding Destinations
```javascript
// Current: Single destination per provider
// Needed: Multiple destinations (WhatsApp + Telegram)

// forwardDestinations JSON structure:
[
  { type: "WHATSAPP_GROUP", groupId: "xxx@g.us", name: "Provider Support" },
  { type: "WHATSAPP_NUMBER", phone: "628xxx", name: "Provider Admin" },
  { type: "TELEGRAM_GROUP", chatId: "-100xxx", name: "TG Support" },
  { type: "TELEGRAM_USERNAME", username: "@provider", name: "TG Admin" }
]
```

---

# 📦 BILLING SYSTEM ENHANCEMENT (dari clientupdate2.md)

## 6.1 Requirement dari Client

### A. Message Credit System REVAMP
| Current | Requested |
|---------|-----------|
| Per-message charge ($0.02) | Credit packages ($50 = 5000 credits) |
| Different rates WA/TG | Customizable credit rate per user |
| Auto-deduct per message | Auto-deduct from credit balance |

### B. Free & Paid Setup Structure
| Service | First Time | After First |
|---------|------------|-------------|
| WhatsApp login | FREE | Monthly charge |
| SMM Panel linking | FREE | Monthly charge |
| Telegram linking | FREE | Monthly charge |
| Extra connections | N/A | Additional monthly |

### C. Auto-Renewal System
| Feature | Deskripsi | Status |
|---------|-----------|--------|
| Monthly auto-deduction | From user balance | 🔴 Missing |
| Automatic renewal | For devices & panels | 🔴 Missing |
| Insufficient balance handling | Pause/limit services | 🔴 Missing |
| Renewal reminders | Before expiry | 🔴 Missing |

### D. Message Credit Pricing Plans
| Feature | Deskripsi | Status |
|---------|-----------|--------|
| Credit packages | $50 = 5000 credits, etc | 🔴 Missing |
| Package selection | User chooses plan | 🔴 Missing |
| Bulk discounts | More credits = lower rate | 🔴 Missing |

## 6.2 Gap Analysis - Billing

### 🔴 MISSING: CreditPackage Model
```prisma
model CreditPackage {
  id          String   @id @default(cuid())
  name        String   // "Starter", "Pro", "Enterprise"
  
  // Pricing
  price       Float    // USD amount
  credits     Int      // Number of message credits
  
  // Calculated rate
  ratePerCredit Float  // Auto-calculated: price / credits
  
  // Bonus/Discount
  bonusCredits  Int    @default(0)
  discountPct   Float  @default(0)
  
  // Limits
  minPurchase   Int    @default(1)
  maxPurchase   Int?   // null = unlimited
  
  // Status
  isActive      Boolean @default(true)
  isFeatured    Boolean @default(false)
  sortOrder     Int     @default(0)
  
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

// Example packages:
// Starter: $10 = 500 credits (rate: $0.02/credit)
// Basic: $25 = 1500 credits (rate: $0.0167/credit) + 100 bonus
// Pro: $50 = 5000 credits (rate: $0.01/credit) + 500 bonus
// Enterprise: $100 = 12000 credits (rate: $0.0083/credit) + 2000 bonus
```

### 🔴 MISSING: MonthlySubscription Model
```prisma
model MonthlySubscription {
  id          String   @id @default(cuid())
  userId      String
  
  // What is being subscribed
  resourceType String  // DEVICE, TELEGRAM_BOT, SMM_PANEL
  resourceId   String  // ID of the device/bot/panel
  
  // Pricing
  monthlyFee   Float
  currency     String  @default("USD")
  
  // Status
  status       String  @default("ACTIVE") // ACTIVE, PAUSED, CANCELLED, EXPIRED
  
  // Billing cycle
  startDate    DateTime
  nextBillingDate DateTime
  lastBilledAt DateTime?
  
  // Grace period
  gracePeriodDays Int @default(3)
  pausedAt     DateTime?
  
  // Payment tracking
  failedAttempts Int @default(0)
  lastFailReason String?
  
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  @@index([userId])
  @@index([nextBillingDate])
  @@index([status])
}
```

### 🔴 MISSING: Auto-Renewal Service
```javascript
// NEW: subscriptionService.js
class SubscriptionService {
  // Process monthly renewals (run via cron)
  async processMonthlyRenewals() {
    const dueSubscriptions = await this.getDueSubscriptions();
    
    for (const sub of dueSubscriptions) {
      const result = await this.processRenewal(sub);
      if (!result.success) {
        await this.handleFailedRenewal(sub, result.reason);
      }
    }
  }
  
  // Process single renewal
  async processRenewal(subscription) {
    const user = await prisma.user.findUnique({ where: { id: subscription.userId }});
    
    if (user.creditBalance < subscription.monthlyFee) {
      return { success: false, reason: 'INSUFFICIENT_BALANCE' };
    }
    
    // Deduct and record
    await creditService.deductCredit(
      user.id,
      subscription.monthlyFee,
      `Monthly renewal: ${subscription.resourceType} - ${subscription.resourceId}`
    );
    
    // Update next billing date
    await this.extendSubscription(subscription);
    
    return { success: true };
  }
  
  // Handle failed renewal
  async handleFailedRenewal(subscription, reason) {
    // Increment failed attempts
    // After N failures, pause/suspend the resource
    // Send notification to user
  }
  
  // Pause services on insufficient balance
  async pauseResourcesForUser(userId) {
    // Pause all devices
    // Pause all Telegram bots
    // Mark SMM panels as inactive
  }
}
```

### 🔴 MISSING: Keyword-Response Separation (dari clientupdate2.md)

Client meminta section terpisah untuk keyword matching dan response definition:

```prisma
// Modify existing or create new
model KeywordResponse {
  id          String   @id @default(cuid())
  userId      String
  
  // Keyword matching
  keyword     String   // The keyword to match
  matchType   String   @default("CONTAINS") // EXACT, CONTAINS, STARTS_WITH, REGEX
  
  // Response configuration
  responseText String  // The reply message
  responseMedia String? // Optional media URL
  
  // Optional actions
  triggerAction String? // FORWARD_TO_ADMIN, CREATE_TICKET, etc.
  actionConfig  String? // JSON config for the action
  
  // Status
  isActive    Boolean  @default(true)
  priority    Int      @default(0)
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([userId])
  @@index([keyword])
}
```

---

# 📊 Implementation Priority Matrix

## 🔴 HIGH PRIORITY (Critical for Client)

| Feature | Effort | Impact | Phase |
|---------|--------|--------|-------|
| BotFeatureToggles | Medium | High | 4 |
| Guarantee Validation | Medium | High | 2 |
| UserWhatsAppMapping | High | High | 1 |
| Auto-Renewal System | High | High | Billing |
| Credit Packages | Medium | High | Billing |

## 🔶 MEDIUM PRIORITY (Important)

| Feature | Effort | Impact | Phase |
|---------|--------|--------|-------|
| Multiple Forward Destinations | Medium | Medium | 5 |
| Hidden Domain Storage | Low | Medium | 5 |
| Unregistered User Flow | Medium | Medium | 1 |
| Ticket Automation | High | Medium | 4 |

## 🟢 LOW PRIORITY (Nice to Have)

| Feature | Effort | Impact | Phase |
|---------|--------|--------|-------|
| Force Order Completed | Low | Low (Risky) | 4 |
| Order Link Update via Bot | Low | Low | 4 |
| Payment Verification via Bot | Medium | Low | 4 |

---

# 🗂️ Files to Create/Modify

## New Files Needed

| File | Purpose |
|------|---------|
| `server/src/services/guaranteeService.js` | Guarantee validation logic |
| `server/src/services/userValidationService.js` | User-WhatsApp mapping |
| `server/src/services/ticketAutomationService.js` | Panel ticket automation |
| `server/src/services/subscriptionService.js` | Monthly subscription management |
| `server/src/routes/subscriptions.js` | Subscription API endpoints |
| `server/src/routes/creditPackages.js` | Credit package endpoints |
| `src/pages/admin/FeatureToggles.jsx` | Admin toggle UI |
| `src/pages/admin/CreditPackages.jsx` | Credit package management |
| `src/pages/UserMappings.jsx` | User-WhatsApp mapping UI |

## Schema Updates (prisma/schema.prisma)

| Model | Action |
|-------|--------|
| `UserWhatsAppMapping` | CREATE |
| `BotFeatureToggles` | CREATE |
| `CreditPackage` | CREATE |
| `MonthlySubscription` | CREATE |
| `GuaranteeConfig` | CREATE |
| `ProviderDomainMapping` | CREATE |
| `KeywordResponse` | CREATE |
| `Order` | ADD `completedAt` field |

---

# ✅ Action Items

## Immediate Actions (Week 1)
1. [ ] Create new Prisma models
2. [ ] Run database migration
3. [ ] Implement BotFeatureToggles service
4. [ ] Create admin toggle UI

## Short-term (Week 2-3)
5. [ ] Implement Guarantee Validation
6. [ ] Create Credit Packages system
7. [ ] Implement Monthly Subscription logic
8. [ ] Create subscription cron job

## Medium-term (Week 4-5)
9. [ ] Implement UserWhatsAppMapping
10. [ ] Create unregistered user flow
11. [ ] Add multiple forwarding destinations
12. [ ] Ticket automation (if panel API supports)

---

# 📝 Notes

1. **High-Risk Features**: Force Completed dan Order Link Update sangat berisiko. Perlu confirmation dialog dan audit logging yang ketat.

2. **Panel API Dependency**: Beberapa fitur (Ticket Automation, Account Details) bergantung pada kemampuan Panel API. Perlu verifikasi endpoint yang tersedia.

3. **Billing Complexity**: Auto-renewal dengan pause/resume membutuhkan cron job yang reliable dan handling edge cases yang baik.

4. **Backward Compatibility**: Semua perubahan harus backward compatible dengan user yang sudah ada.

---

**Document Prepared By:** AI Assistant  
**Last Updated:** 16 January 2026  
**Next Review:** After Phase 1 Implementation
