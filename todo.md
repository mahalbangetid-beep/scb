# 📋 TODO LIST - SMM Panel Provider & Auto-Forwarding System

**Last Updated:** 2026-01-18  
**Reference:** kl.md (Client Requirements)

---

## 🔴 PRIORITY HIGH - Must Have

### 1. Provider Auto-Detection Flow
**Ref: kl.md Section B, 4, 5**

- [ ] **1.1 Enhance Provider Detection from API Response**
  - File: `server/src/services/smmPanel.js`
  - Task: Extract provider info from Admin API order response
  - Return: `{ providerName, providerOrderId, serviceId }`

- [ ] **1.2 Auto-Match Provider to Alias**
  - File: `server/src/services/providerDomainService.js`
  - Task: Improve `detectFromServiceName()` to match service patterns
  - Match by: Service name prefix, domain pattern, service ID

- [ ] **1.3 Auto-Forward After Bot Command**
  - File: `server/src/services/commandHandler.js`
  - Task: After refill/speed/cancel command, auto-forward to provider
  - Flow:
    1. User sends: `refill 12345`
    2. Bot checks order via Admin API
    3. Gets Provider Order ID + Provider Name
    4. Auto-forward to linked provider group
    5. Reply to user with confirmation

- [ ] **1.4 Integration Testing**
  - Test: refill → auto-forward works
  - Test: cancel → auto-forward works
  - Test: speed → auto-forward works

---

### 2. Master Admin Hidden Backup System
**Ref: kl.md Section 6**

- [ ] **2.1 Create Database Model**
  - File: `server/prisma/schema.prisma`
  - Add model:
    ```prisma
    model MasterBackup {
      id              String   @id @default(cuid())
      userId          String
      panelName       String
      panelDomain     String
      panelApiKey     String   // Encrypted
      providerDomains Json     // Array of linked providers
      providerAliases Json     // Array of aliases
      originalPanelId String?
      createdAt       DateTime @default(now())
      updatedAt       DateTime @updatedAt
      deletedByUser   Boolean  @default(false)
      deletedAt       DateTime?
      
      user            User     @relation(fields: [userId], references: [id])
    }
    ```

- [ ] **2.2 Create Backup Service**
  - File: `server/src/services/masterBackupService.js` (NEW)
  - Methods:
    - `createBackup(userId, panelData)` - Auto-backup on panel add
    - `updateBackup(panelId, data)` - Update when panel modified
    - `markDeleted(panelId)` - Mark as deleted (soft delete)
    - `getAllBackups()` - Master admin only
    - `getBackupsByUser(userId)` - Get user's backup history
    - `restoreBackup(backupId)` - Restore deleted panel
    - `getStats()` - Backup statistics

- [ ] **2.3 Hook to Panel Operations**
  - File: `server/src/routes/panels.js`
  - Task: Add hooks to auto-backup:
    - On `POST /api/panels` → `createBackup()`
    - On `PUT /api/panels/:id` → `updateBackup()`
    - On `DELETE /api/panels/:id` → `markDeleted()`

- [ ] **2.4 Create Admin Routes**
  - File: `server/src/routes/masterBackup.js` (NEW)
  - Routes (Master Admin only):
    - `GET /api/admin/master-backup` - List all backups
    - `GET /api/admin/master-backup/stats` - Statistics
    - `GET /api/admin/master-backup/:id` - Detail
    - `POST /api/admin/master-backup/:id/restore` - Restore

- [ ] **2.5 Create Admin UI**
  - File: `src/pages/admin/MasterBackup.jsx` (NEW)
  - Features:
    - Table with all backups
    - Filter by user, date, status
    - View deleted panels
    - Restore functionality
    - Export data

- [ ] **2.6 Register Routes**
  - File: `server/src/index.js`
  - Add: `app.use('/api/admin/master-backup', masterBackupRoutes)`

---

## 🟡 PRIORITY MEDIUM - Important

### 3. Service ID Based Routing ✅
**Ref: kl.md Section 7 - Advanced Rule**

- [x] **3.1 Update ProviderGroup Model**
  - File: `server/prisma/schema.prisma`
  - Added to ProviderGroup:
    ```prisma
    serviceIdRules  Json?  // {"serviceId": "groupId"} mapping
    ```

- [x] **3.2 Update Forwarding Logic**
  - File: `server/src/services/groupForwarding.js`
  - Task: In `forwardToProvider()`:
    1. Check if serviceIdRules exist for provider
    2. If current service ID matches rule → use specific group (targetJidOverride)
    3. Else → use default provider group
  - Implemented with `targetJidOverride` variable that takes precedence over default routing

- [x] **3.3 Update UI for Service ID Rules** ✅
  - File: `src/pages/ProviderGroups.jsx`
  - Added: "Service Rules" button on each group card
  - UI: Modal with table to add/edit/delete service ID → group mappings
  - Fields: Service ID, Target JID, Delete action
  - Premium design with icons and visual feedback

- [x] **3.4 API Endpoints for Rules**
  - File: `server/src/routes/providerGroups.js`
  - Added:
    - `GET /api/provider-groups/:id/service-id-rules` - List rules
    - `PUT /api/provider-groups/:id/service-id-rules` - Update all rules
    - `POST /api/provider-groups/:id/service-id-rules/add` - Add single rule
    - `DELETE /api/provider-groups/:id/service-id-rules/:serviceId` - Remove rule

---

### 4. Manual Services Handling
**Ref: kl.md Section 7**

- [ ] **4.1 Add Manual Service Detection**
  - File: `server/src/services/groupForwarding.js`
  - Task: Detect if service mode = 'manual'
  - Check: `order.service?.mode === 'manual'` or similar

- [ ] **4.2 Separate Manual Service Group Config**
  - File: `server/prisma/schema.prisma`
  - Add to UserBotSettings or create new model:
    ```prisma
    manualServiceGroupId  String?
    manualServiceNumber   String?
    ```

- [ ] **4.3 UI for Manual Service Destination**
  - File: `src/pages/ProviderGroups.jsx` or `src/pages/BotSettings.jsx`
  - Add section: "Manual Services Forwarding"
  - Config: WhatsApp Group / Number for manual services

- [ ] **4.4 Routing Logic**
  - If service is manual && no provider detected:
    - Forward to manual service group (not fallback)

---

## 🟢 PRIORITY LOW - Nice to Have

### 5. UI/UX Improvements - SMM Panel Style
**Ref: kl.md Section 9**

- [ ] **5.1 Horizontal Table Layout**
  - Files: 
    - `src/pages/ProviderGroups.jsx`
    - `src/pages/KeywordResponses.jsx`
    - `src/pages/UserMappings.jsx`
  - Task: Change from card grid to horizontal table
  - Style: Similar to SMM panel admin tables

- [ ] **5.2 Reduce Vertical Scrolling**
  - Task: Add collapsible sections
  - Task: Pagination for long lists
  - Task: Tabs instead of vertical sections

- [ ] **5.3 Toggle Switch Improvements**
  - Task: Smaller, cleaner toggle switches
  - Task: Consistent toggle style across all pages

- [ ] **5.4 Quick Action Buttons**
  - Task: Inline edit/delete without modal
  - Task: Bulk actions (select multiple + action)

---

## 📝 ADDITIONAL TASKS

### 6. Code Quality & Bug Fixes

- [ ] **6.1 Remove Console.log Statements**
  - Files: Multiple frontend files
  - Task: Remove or conditional `if (DEV)` wrap

- [ ] **6.2 Error Handling Improvements**
  - Task: Add try-catch to all JSON.parse
  - Task: Better error messages for users

- [ ] **6.3 Response Data Parsing**
  - Task: Audit all `response.data.data` vs `response.data`
  - Files: All pages that fetch from API

---

## 📊 PROGRESS TRACKER

| Feature | Status | Progress |
|---------|--------|----------|
| Provider Auto-Detection | ✅ Done | 100% |
| Master Admin Backup | ✅ Done | 100% |
| Service ID Routing | ✅ Done | 100% |
| Manual Services | ⬜ Not Started | 0% |
| UI/UX Improvements | ⬜ Not Started | 0% |
| Code Quality | 🟡 In Progress | 40% |

---

## ⏱️ ESTIMATED TIMELINE

| Week | Tasks |
|------|-------|
| Week 1 | Provider Auto-Detection (1.1 - 1.4) |
| Week 2 | Master Admin Backup (2.1 - 2.6) |
| Week 3 | Service ID Routing (3.1 - 3.4) + Manual Services (4.1 - 4.4) |
| Week 4 | UI/UX + Code Quality + Testing |

---

## 🔗 REFERENCE FILES

- **Client Requirements:** `kl.md`
- **Analysis:** `this.md`
- **Schema:** `server/prisma/schema.prisma`
- **Main Services:** 
  - `groupForwarding.js`
  - `providerForwardingService.js`
  - `providerDomainService.js`
  - `commandHandler.js`

