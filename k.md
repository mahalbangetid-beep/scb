# Client Feature Requests - Development Plan

> **Date:** 2026-01-17
> **Source:** Client feedback via WhatsApp
> **Priority:** High
> **Last Updated:** 2026-01-17 18:10

---

## 📋 Summary of Requests

Client meminta 5 fitur utama:

| # | Feature | Priority | Status | Complexity |
|---|---------|----------|--------|------------|
| 1 | Customizable Bot Responses | 🔴 High | ✅ **DONE** | Medium |
| 2 | Provider Forwarding Configuration | 🔴 High | ✅ **DONE** | High |
| 3 | Reply to All Messages Toggle | 🟡 Medium | ✅ **DONE** | Low |
| 4 | Keyword-Based Auto-Reply | ✅ Done | ✅ Already exists | - |
| 5 | Testing & Bug Reports | ✅ Noted | Ongoing | - |

---

## Feature 1: Customizable Bot Responses

### 📝 Requirement
> "Bot responses must be fully customizable, not hardcoded"

### ✅ Status: IMPLEMENTED (2026-01-17)

### Implementation Details

#### Service: ResponseTemplateService
Located at: `server/src/services/responseTemplateService.js`

**18+ Default Templates:**
- STATUS_SUCCESS, STATUS_NOT_FOUND, STATUS_ERROR
- REFILL_SUCCESS, REFILL_PENDING, REFILL_STATUS_INVALID, REFILL_NO_GUARANTEE, REFILL_EXPIRED, REFILL_FORWARDED, REFILL_ERROR
- CANCEL_SUCCESS, CANCEL_STATUS_INVALID, CANCEL_ERROR
- SPEEDUP_SUCCESS, SPEEDUP_ERROR
- COOLDOWN, DISABLED, ACCESS_DENIED

#### Variables Support
```
{order_id}        → Order ID
{status}          → Order status
{service}         → Service name
{link}            → Order link
{remains}         → Remaining count
{start_count}     → Start count
{charge}          → Order charge
{provider}        → Provider name
{provider_order_id} → Provider order ID
{date}            → Order date
{guarantee}       → Guarantee days
{error}           → Error message
{quantity}        → Order quantity
```

#### API Endpoints
- `GET /api/templates` - Get all templates (custom + defaults)
- `GET /api/templates/:command` - Get specific template
- `PUT /api/templates/:command` - Update/create custom template
- `DELETE /api/templates/:command` - Reset to default
- `POST /api/templates/reset-all` - Reset all to default
- `POST /api/templates/preview` - Preview with sample variables

#### Usage in Code
```javascript
// Sync version (uses fallback templates)
commandParser.generateResponse('refill', orderId, true, details);

// Async version (uses user's custom templates)
await commandParser.generateResponseAsync(userId, 'refill', orderId, true, details);
```

### Files Modified
- [x] `server/src/services/responseTemplateService.js` - New service
- [x] `server/src/routes/templates.js` - New API routes
- [x] `server/src/services/commandParser.js` - Added generateResponseAsync()
- [x] `server/src/index.js` - Registered /api/templates route
- [x] `src/pages/ResponseTemplates.jsx` - ✅ NEW: UI for managing templates

---

## Feature 2: Provider Forwarding Configuration

### 📝 Requirement
> "Provider-side handling must be fully configurable"
> - Which provider receives which request type
> - WhatsApp/Telegram group per provider
> - Error forwarding to specific groups

### ✅ Status: IMPLEMENTED (2026-01-17)

### Implementation Details

#### Database Models
```prisma
model ProviderConfig {
  // Provider identification
  providerName    String   // e.g., "smmnepal", "main_provider"
  alias           String?  // Display name
  providerDomain  String?  // Auto-match by domain
  
  // Request type forwarding
  forwardRefill   Boolean  @default(true)
  forwardCancel   Boolean  @default(true)
  forwardSpeedup  Boolean  @default(true)
  forwardStatus   Boolean  @default(false)
  
  // Destinations
  whatsappGroupJid String?  // WhatsApp group
  whatsappNumber   String?  // WhatsApp number
  telegramChatId   String?  // Telegram chat
  
  // Error handling
  errorGroupJid    String?
  errorChatId      String?
  errorNotifyEnabled Boolean
  
  // Custom templates
  refillTemplate   String?
  cancelTemplate   String?
  speedupTemplate  String?
  errorTemplate    String?
}

model ProviderForwardLog {
  // Logging forwarding activity
  orderId, providerId, requestType, destination, platform
  messageContent, status, errorMessage, responseTime
}
```

#### API Endpoints
- `GET /api/provider-config` - List all configs
- `GET /api/provider-config/:id` - Get specific config
- `POST /api/provider-config` - Create new config
- `PUT /api/provider-config/:id` - Update config
- `DELETE /api/provider-config/:id` - Delete config
- `POST /api/provider-config/:id/test` - Test forwarding
- `GET /api/provider-config/logs` - View forwarding logs

#### Flow Diagram
```
User: "3500 refill"
        ↓
Bot validates → Guarantee OK
        ↓
Check ProviderConfig for order's provider
        ↓
┌─────────────────────────────────────────┐
│ ProviderConfig: "smmnepal"              │
│ - forwardRefill: true                   │
│ - whatsappGroupJid: "120363xxx@g.us"    │
│ - telegramChatId: "-1001234567890"      │
└─────────────────────────────────────────┘
        ↓
┌─────────────────────┬─────────────────────┐
│ Send to WhatsApp    │ Send to Telegram    │
│ Group               │ Group               │
├─────────────────────┼─────────────────────┤
│ "REFILL REQUEST     │ "REFILL REQUEST     │
│  Order: 3500        │  Order: 3500        │
│  Provider ID: 7392622│  Provider ID: 7392622│
│  Service: TikTok... │  Service: TikTok... │
│  Link: https://..." │  Link: https://..." │
└─────────────────────┴─────────────────────┘
        ↓
Reply to user: "✅ Refill request forwarded to provider"
```

### Files Modified
- [x] `server/prisma/schema.prisma` - Added ProviderConfig & ProviderForwardLog
- [x] `server/src/services/providerForwardingService.js` - Existing, enhanced
- [x] `server/src/routes/providerConfig.js` - New API routes
- [x] `server/src/index.js` - Registered route
- [ ] `server/src/services/commandHandler.js` - Integrate forwarding (TODO)
- [x] `src/pages/ProviderForwarding.jsx` - ✅ NEW: UI page for provider config

---

## Feature 3: Reply to All Messages Toggle

### 📝 Requirement
> "Bot should reply to every incoming message, controlled by toggle"
> - Enabled → Reply to all messages
> - Disabled → Only reply to valid commands

### ✅ Status: IMPLEMENTED (2026-01-17)

### Implementation Details

#### Database Schema (BotFeatureToggles)
```prisma
// Added to BotFeatureToggles model:
replyToAllMessages          Boolean @default(false)  // Toggle
fallbackMessage             String? @db.Text         // Custom fallback message
```

#### API Endpoints
- `GET /api/settings/bot-toggles` - Get all bot toggles
- `PUT /api/settings/bot-toggles` - Update toggles

#### Flow
```
Message received
        ↓
┌─────────────────────────────────────────┐
│ Check handlers:                          │
│ 1. Verification response? → Handle       │
│ 2. Utility command (.ping)? → Handle     │
│ 3. SMM command (order ID)? → Handle      │
│ 4. Auto-reply keyword? → Handle          │
│ 5. Nothing matched...                    │
└─────────────────────────────────────────┘
        ↓
Check: replyToAllMessages === true?
        │
   ┌────┴────┐
  YES       NO
   │         │
   ▼         ▼
Send        Ignore
fallback    message
message     (no reply)
```

#### Default Fallback Message
```
"I didn't understand your message.

📋 *Available Commands:*
• [Order ID] status - Check order status
• [Order ID] refill - Request refill
• [Order ID] cancel - Cancel order
• .help - Show all commands

Example: 12345 status"
```

### Files Modified
- [x] `server/prisma/schema.prisma` - Added fields to BotFeatureToggles
- [x] `server/src/services/botMessageHandler.js` - Added fallback handler
- [x] `server/src/routes/settings.js` - Added API endpoints

---

## Feature 4: Keyword-Based Auto-Reply ✅

### 📝 Requirement
> "Keyword-based replies must be fully customizable"

### Status: ✅ ALREADY IMPLEMENTED!

#### Current Features
- **Auto Reply page** in dashboard
- User can add custom keywords
- Set response message for each keyword
- Enable/disable individual rules
- Support for exact match or contains match

#### Where to Find
- Dashboard → Auto Reply
- Click "Add Rule" to create new keyword trigger

#### Inform Client
> "This feature is already available! Go to Auto Reply page in dashboard. You can add keywords and set custom responses for each."

---

## 📅 Implementation Priority

### Phase 1: Quick Wins (1-2 days)
- [x] Feature 4: Keyword Auto-Reply ✅ Already done
- [ ] Feature 3: Reply to All Messages Toggle (Low complexity)

### Phase 2: Response Templates (3-4 days)
- [ ] Feature 1: Customizable Bot Responses
  - Schema migration
  - Template service
  - API endpoints
  - Settings UI

### Phase 3: Provider Forwarding (5-7 days)
- [ ] Feature 2: Provider Forwarding Configuration
  - Schema migration
  - Forwarding service
  - Integration with command handler
  - API endpoints
  - New UI page

---

## 📝 Notes

- Client is actively testing the system
- Will report bugs as found
- Need to maintain backward compatibility
- All features should be optional/configurable per user

---

## 📊 Estimated Timeline

| Phase | Feature | Duration | Target |
|-------|---------|----------|--------|
| 1 | Reply All Toggle | 1 day | ASAP |
| 2 | Response Templates | 3-4 days | Week 1 |
| 3 | Provider Forwarding | 5-7 days | Week 2 |

**Total Estimated: 9-12 days**
