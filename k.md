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
| 1 | Customizable Bot Responses | 🔴 High | ⏳ Planning | Medium |
| 2 | Provider Forwarding Configuration | 🔴 High | ⏳ Planning | High |
| 3 | Reply to All Messages Toggle | 🟡 Medium | ✅ **DONE** | Low |
| 4 | Keyword-Based Auto-Reply | ✅ Done | ✅ Already exists | - |
| 5 | Testing & Bug Reports | ✅ Noted | Ongoing | - |

---

## Feature 1: Customizable Bot Responses

### 📝 Requirement
> "Bot responses must be fully customizable, not hardcoded"

### Current State
- Response templates are in `commandParser.js` → `generateResponse()`
- Messages are hardcoded in code

### Solution Plan

#### Database Schema
```prisma
model ResponseTemplate {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  
  // Response category
  category    String   // e.g., "status", "refill", "cancel", "error", "general"
  responseKey String   // e.g., "success", "pending", "not_found", "no_guarantee"
  
  // Template content (supports variables)
  template    String   @db.Text
  
  // Language support
  language    String   @default("en")
  
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@unique([userId, category, responseKey, language])
}
```

#### Variables Support
```
{order_id}     → Order ID
{status}       → Order status
{service}      → Service name
{link}         → Order link
{remains}      → Remaining count
{start_count}  → Start count
{charge}       → Order charge
{provider}     → Provider name
{date}         → Order date
{guarantee}    → Guarantee days
{error}        → Error message
```

#### Default Templates
```javascript
// Status Response
"status.completed": "✅ Order #{order_id}: COMPLETED\n📦 Service: {service}\n📊 Start: {start_count}",
"status.pending": "⏳ Order #{order_id}: PENDING\n📦 Service: {service}",
"status.not_found": "❌ Order #{order_id} not found in this panel.",

// Refill Response
"refill.success": "✅ Order #{order_id}: Refill request submitted!",
"refill.no_guarantee": "❌ Order #{order_id}: No refill available. This is a no-refill, no-support service.",
"refill.expired": "❌ Order #{order_id}: Refill period has expired ({guarantee} days).",

// Cancel Response
"cancel.success": "✅ Order #{order_id}: Cancel request submitted!",
"cancel.failed": "❌ Order #{order_id}: Cannot cancel. {error}",

// General
"error.unknown": "❌ An error occurred. Please try again later.",
"fallback.message": "I didn't understand your message. Send an Order ID to check status."
```

#### UI: Settings → Response Templates
- Category tabs: Status | Refill | Cancel | Error | General
- Edit each template with live preview
- Reset to default button
- Test template with sample data

### Files to Modify
- [ ] `server/prisma/schema.prisma` - Add ResponseTemplate model
- [ ] `server/src/services/responseTemplateService.js` - New service
- [ ] `server/src/services/commandParser.js` - Use templates instead of hardcoded
- [ ] `server/src/routes/settings.js` - API endpoints for templates
- [ ] `src/pages/Settings.jsx` - UI for managing templates

---

## Feature 2: Provider Forwarding Configuration

### 📝 Requirement
> "Provider-side handling must be fully configurable"
> - Which provider receives which request type
> - WhatsApp/Telegram group per provider
> - Error forwarding to specific groups

### Current State
- No provider forwarding feature exists
- Commands are processed locally via Admin API

### Solution Plan

#### Database Schema
```prisma
model ProviderConfig {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  
  // Provider info
  name        String   // e.g., "smmnepal", "main_provider"
  alias       String?
  
  // Forwarding settings
  forwardRefill     Boolean  @default(true)
  forwardCancel     Boolean  @default(true)
  forwardSpeedup    Boolean  @default(true)
  forwardStatus     Boolean  @default(false)
  
  // Target destinations
  whatsappGroupJid  String?  // WhatsApp group ID for forwarding
  whatsappNumber    String?  // WhatsApp number for forwarding
  telegramChatId    String?  // Telegram chat/group ID
  
  // Error handling
  errorGroupJid     String?  // Where to forward errors
  errorNotifyEnabled Boolean @default(true)
  
  // Message format
  messageFormat     String?  @db.Text  // Custom message format
  
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

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

#### Error Forwarding
```
If refill API fails:
        ↓
Check ProviderConfig.errorGroupJid
        ↓
Send error notification:
"❌ REFILL ERROR
 Order: 3500
 Provider: smmnepal
 Error: API timeout
 User: @628xxx"
```

#### UI: Settings → Provider Forwarding
- List of configured providers
- Add/Edit provider config
- Test forward button
- View forward logs

### Files to Create/Modify
- [ ] `server/prisma/schema.prisma` - Add ProviderConfig model
- [ ] `server/src/services/providerForwardingService.js` - New service
- [ ] `server/src/services/commandHandler.js` - Integrate forwarding after command
- [ ] `server/src/routes/providerConfig.js` - API endpoints
- [ ] `src/pages/ProviderForwarding.jsx` - New UI page

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
