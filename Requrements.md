# Project Title

Multi SMM Panel Integrated WhatsApp & Telegram Automation Platform

## 1. Project Overview

This project is a centralized web-based platform where users can connect their WhatsApp and Telegram
accounts, integrate multiple SMM panels via API, and manage order-related automation (refill, cancel,
refund, speed-up, status check) using chat commands.

The platform will work 24/7 in real-time and will support both:

- Group-based automation
- Direct (1-to-1) WhatsApp / Telegram message automation

The domain, hosting, database, and full control will be owned by the Master Admin.

## 2. User Roles

### 2.1 Master Admin

- Full system control
- User management
- Pricing & credit control
- API & external integrations
- Hidden monitoring features
- Staff management

### 2.2 User (Panel Owner / Reseller)

- Register & login
- Connect SMM panels
- Scan WhatsApp QR & Telegram login
- Configure bot rules
- Manage credits & reports

### 2.3 Staff

- Limited access based on permission
- Support & monitoring roles

## 3. Authentication & Registration


### User Registration (Mandatory Fields)

- Username
- Password
- WhatsApp number
- Telegram username
- SMM Panel URL
- Panel API Key
- Account creation date
- IP address

### Login

- Username + Password
- IP logging
- Login history
- Account status check (Active / Suspended / Banned)

## 4. WhatsApp & Telegram Integration

### 4.1 WhatsApp Login

- QR Code scan based login
- Multiple WhatsApp numbers per user
- Real-time connection status
- Auto reconnect system
- Live WhatsApp dashboard (chat view)

### 4.2 Telegram Login

- Bot token or account-based integration
- Multiple Telegram accounts allowed

### 4.3 Login Charging Rules

- Master Admin can configure:
    o First WhatsApp login → Free
    o Next WhatsApp login → Monthly / One-time fee
    o Separate pricing for Telegram login

## 5. SMM Panel API Integration

### Supported Panels

- PerfectPanel
- Rental Panels


- Any SMM panel with standard API

### Provider Alias System (Important)

Users can hide provider names by setting aliases:

Example:

- smmsuper.com → Alias: SmSuper
- smmcheappanel.com → Alias: SmCPPanel
- fasterpanel.com → Alias: FTRPanel

Alias will be used everywhere:

- Bot replies
- Group forwarding
- Logs & reports

## 6. Bot Command Processing System

### Command Format (WhatsApp / Telegram)

{ORDER_ID},{ORDER_ID} command

Example:

481799696,481799190 refill

## 7. Order Validation Flow (Very Important)

For each Order ID, the system will:

1. Check if the Order ID belongs to that user
2. Verify panel via API
3. Fetch order status
4. Process command individually per order

❌ If order does NOT belong to the user
→ Reply:
Order ID does not belong to your account

## 8. Command Handling Logic

### 8.1 Refill Command


- Allowed ONLY if order status = Completed
- If status = Pending / In Progress
    → Custom reply set by user

Example Reply:

{ORDERID} 481799696 is still pending.
Speed-up request has been added.

- Backend actions:
    o Fetch External Order ID
    o Detect Provider Alias
    o Forward command to provider WhatsApp/Telegram group

### 8.2 Cancel Command

Example:

485018699 cancel

Reply to user:

These orders are added to refund support queue:
485018699

- API cancel request
- Same command forwarded to provider group

### 8.3 Bulk Orders Rule

- Max 100 Order IDs per message
- Each order processed individually
- Separate reply per order
- Instant real-time reply mandatory

## 9. Group & Direct Message Support

### Required Support Modes:

✅ Provider Group Automation
✅ Direct Message (Single Number) Automation

### Security Rule (Critical)

To prevent fraud:


- Orders must be mapped with user WhatsApp number + username
- System checks ownership before processing
- Prevents others from requesting refunds on чуж orders

## 10. Provider Group Forwarding

Each provider will have:

- Predefined WhatsApp / Telegram group
- Naming format:

ProviderAlias / UserPanelName Support

Messages forwarded:

- External Order ID
- Command (refill / cancel / speed-up)
- Panel name

## 11. Custom Bot Workflow System

User can configure:

- Custom replies per command
- Wrong command response
- Keyword-based automation

### Keyword Examples:

- payment
- ticket
- refund
- support

Each keyword has:

- Auto reply message
- Backend task (API / ticket / notify staff)

## 12. API Button Integration (Panel Side)

If panel provides:

- Refill button


- Cancel button
- Refund button

Then system must:

- Send API request
- Forward same request to provider group
- Log both actions

## 13. Message Credit System

### User Side

- Credit wallet
- Recharge before usage
- Each bot reply deducts credit

### Master Admin Control

- Per-message cost
- User-wise pricing
- Different rates for:
    o WhatsApp
    o Telegram
    o Group messages

## 14. Reports & Analytics

### User Reports

- Total messages sent
- Bot replies count
- Credit usage
- Daily / Monthly stats

### Master Admin Reports

- System-wide usage
- User-wise consumption
- Revenue reports
- Failed requests logs

## 15. Payment System


Supported Methods:

- Wallet balance
- Voucher codes
- Affiliate system
- Manual fund add/Deduct(Admin)

Gateways:

- Binance Pay
- Cryptomus
- Tik Kart
- Esewa
- Manual approval payments
- Wallet ( To load for later use auto deduct renew credit message )

## 16. User Management (Admin Side)

User details:

- Username
- Status (Active / Suspended / Banned)
- Created date
- Discount rate
- Login IP
- WhatsApp & Telegram count

Actions:

- Suspend / Ban user
- Adjust credit
- Set message pricing
- View activity logs

## 17. Staff Management

- Add staff accounts
- Permission-based access
- Assign support roles
- View logs only (optional)

## 18. External Integrations & Logs

- n8n integration


- Webhooks
- External API connections
- Full activity logs (Admin view)

## 19. Hidden Master Admin Features

WhatsApp Contact Auto Backup

- Every 5–10 minutes
- Store connected WhatsApp numbers
- Accessible only to Master Admin
- For future recovery & audit

## 20. Security & Performance

- Rate limiting
- Command validation
- Fraud prevention
- Encrypted API keys
- High availability (24/7 uptime)

## 21. Tech Expectations (Suggested)

- Backend: Node.js / Laravel
- Database: MySQL / PostgreSQL
- WhatsApp: Web-based API (Baileys / Similar)
- Telegram: Bot API
- Queue system for bulk commands
- Real-time WebSocket updates

## 22. Future Scalability

- Multi-panel expansion
- AI-based reply system
- CRM integration
- Ticket automation