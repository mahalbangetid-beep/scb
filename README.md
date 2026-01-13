<p align="center">
  <img src="https://img.shields.io/badge/Version-2.0.0-blue?style=for-the-badge" alt="Version"/>
  <img src="https://img.shields.io/badge/Node.js-20.x-green?style=for-the-badge&logo=node.js" alt="Node.js"/>
  <img src="https://img.shields.io/badge/React-18.x-61DAFB?style=for-the-badge&logo=react" alt="React"/>
  <img src="https://img.shields.io/badge/PostgreSQL-15+-336791?style=for-the-badge&logo=postgresql" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/License-Proprietary-red?style=for-the-badge" alt="License"/>
</p>

<h1 align="center">🚀 WABAR</h1>
<h3 align="center">WhatsApp Business Automation & Refill Gateway Platform</h3>

<p align="center">
  <b>Enterprise-grade WhatsApp automation platform for SMM Panel integration with intelligent auto-reply, order management, and multi-provider forwarding capabilities.</b>
</p>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Technology Stack](#-technology-stack)
- [System Architecture](#-system-architecture)
- [Core Modules](#-core-modules)
- [Database Schema](#-database-schema)
- [API Documentation](#-api-documentation)
- [Environment Configuration](#-environment-configuration)
- [Project Structure](#-project-structure)
- [Security Features](#-security-features)
- [Changelog](#-changelog)

---

## 🎯 Overview

**WABAR** (WhatsApp Business Automation & Refill) is a comprehensive SaaS platform designed to automate WhatsApp-based customer service for SMM (Social Media Marketing) panel operators. The platform bridges the gap between customers seeking order refills/cancellations and SMM panel providers, enabling fully automated order processing with intelligent routing capabilities.

### Business Value Proposition

| Metric | Before WABAR | After WABAR |
|--------|--------------|-------------|
| Response Time | 5-30 minutes | < 1 second |
| Manual Processing | 100% | 0% |
| 24/7 Availability | No | Yes |
| Multi-Panel Support | Limited | Unlimited |
| Provider Routing | Manual | Automated |

---

## ✨ Key Features

### 🤖 Intelligent Automation
- **AI-Powered Auto-Reply** - Context-aware responses with keyword matching, regex patterns, and command recognition
- **Order Processing Engine** - Automatic validation, parsing, and forwarding of refill/cancel/status commands
- **Provider Group Routing** - Intelligent message forwarding to correct provider WhatsApp groups

### 📊 Multi-Panel Integration
- **Universal API Compatibility** - Supports PerfectPanel, RentalPanel, and custom panel APIs
- **Smart API Scanner** - Auto-detects panel endpoints and capabilities
- **Admin API Integration** - Provider-level data fetching for accurate order routing
- **Real-time Balance Sync** - Automatic panel balance monitoring

### 💬 Multi-Platform Support
- **WhatsApp Business** - Full integration via WhatsApp Web session
- **Telegram Bots** - Native bot API integration
- **Unified Inbox** - Single dashboard for all conversations

### 💳 Credit System
- **Pre-paid Credit Model** - User balance management with transaction history
- **Flexible Pricing** - Per-message, per-device, and custom rate configurations
- **Payment Gateways** - Binance Pay, Cryptomus, Bank Transfer, Manual top-up
- **Voucher System** - Promotional codes with usage limits

### 👥 Multi-Tenant Architecture
- **User Isolation** - Complete data segregation per user
- **Role-Based Access Control** - Master Admin, Admin, Staff, User roles
- **Staff Permissions** - Granular permission assignment

### 📈 Analytics & Reporting
- **Real-time Statistics** - Message counts, order volumes, success rates
- **Transaction History** - Complete audit trail for all operations
- **Activity Logs** - Comprehensive user action logging

---

## 🛠 Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI Framework |
| Vite | 5.x | Build Tool & Dev Server |
| React Router | 6.x | Client-side Routing |
| Axios | 1.x | HTTP Client |
| Lucide React | Latest | Icon Library |
| Recharts | 2.x | Data Visualization |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 20.x LTS | Runtime Environment |
| Express.js | 4.x | Web Framework |
| Prisma ORM | 6.x | Database ORM |
| Baileys | 6.x | WhatsApp Web API |
| JWT | 9.x | Authentication |
| bcryptjs | 2.x | Password Hashing |
| node-cron | 3.x | Task Scheduling |

### Database & Infrastructure
| Technology | Version | Purpose |
|------------|---------|---------|
| PostgreSQL | 15+ | Primary Database |
| Redis | 7.x | Caching & Queues (Optional) |
| Nginx | Latest | Reverse Proxy |
| PM2 | 5.x | Process Manager |

---

## 🏗 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Web App   │  │  WhatsApp   │  │      Telegram Bot       │  │
│  │   (React)   │  │   Users     │  │                         │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
└─────────┼────────────────┼──────────────────────┼───────────────┘
          │                │                      │
          ▼                ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API GATEWAY                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Express.js Server                     │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │    │
│  │  │   Auth   │ │  Orders  │ │ Messages │ │  Panels  │   │    │
│  │  │  Routes  │ │  Routes  │ │  Routes  │ │  Routes  │   │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SERVICE LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  WhatsApp   │  │  Telegram   │  │     Order Processing    │  │
│  │   Service   │  │   Service   │  │        Engine           │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
│         │                │                      │                │
│  ┌──────┴──────────────────┴────────────────────┴──────────┐    │
│  │                  Auto-Reply Engine                       │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │    │
│  │  │ Keyword  │ │  Regex   │ │ Command  │ │ Provider │   │    │
│  │  │ Matcher  │ │ Patterns │ │ Handler  │ │ Forwarder│   │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐        ┌─────────────────────────┐     │
│  │     PostgreSQL      │        │    Redis (Optional)     │     │
│  │   ┌───────────┐     │        │  ┌─────────────────┐    │     │
│  │   │   Users   │     │        │  │  Session Cache  │    │     │
│  │   │   Orders  │     │        │  │  Rate Limiting  │    │     │
│  │   │  Devices  │     │        │  │  Job Queues     │    │     │
│  │   │  Messages │     │        │  └─────────────────┘    │     │
│  │   └───────────┘     │        │                         │     │
│  └─────────────────────┘        └─────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL INTEGRATIONS                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ SMM Panels  │  │  Payment    │  │    Provider Groups      │  │
│  │    APIs     │  │  Gateways   │  │  (WhatsApp/Telegram)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 Core Modules

### 1. Authentication & Authorization
- JWT-based authentication with refresh token support
- Role-based access control (RBAC)
- Session management with device tracking
- Login history and security auditing

### 2. Device Management
- WhatsApp session handling via Baileys
- QR code generation for device pairing
- Session persistence and auto-reconnection
- Multi-device support per user

### 3. Order Processing Engine
- Real-time order command parsing
- Multi-panel order lookup
- Provider identification via Admin API
- Status tracking and history

### 4. Provider Group Routing
- Dynamic provider-to-group mapping
- Customizable message templates
- Order forwarding with full context
- Delivery confirmation tracking

### 5. Auto-Reply System
- Keyword-based triggers (exact, contains, startswith)
- Regex pattern matching
- Priority-based rule execution
- Device-specific or global rules

### 6. Credit & Billing System
- Pre-paid balance model
- Transaction ledger with full history
- Multiple payment gateway integrations
- Automated charge deduction

### 7. Admin Control Panel
- System-wide configuration management
- User management and moderation
- Pricing and rate configuration
- Platform statistics and analytics

---

## 🗄 Database Schema

### Entity Relationship Overview

```
User ─────────┬──── ApiKey
              ├──── Device ──────── Message
              ├──── TelegramBot ─── Message
              ├──── SmmPanel ────── Order ──── OrderCommand
              │                  └── ProviderGroup
              ├──── Contact ─────── Tag (M:M via ContactTag)
              ├──── AutoReplyRule
              ├──── Webhook ─────── WebhookLog
              ├──── Setting
              ├──── CreditTransaction
              ├──── Payment
              ├──── LoginHistory
              └──── StaffPermission

SystemConfig (Global settings)
Voucher (Promotional codes)
ActivityLog (Audit trail)
CommandCooldown (Rate limiting)
UserBotSettings (Per-user bot config)
ConversationState (Multi-step conversations)
CommandTemplate (Custom response templates)
```

### Key Tables

| Table | Purpose | Records Expected |
|-------|---------|------------------|
| User | User accounts | 100-10,000 |
| Device | WhatsApp sessions | 1-10 per user |
| Message | Chat history | 1M+ |
| Order | SMM orders | 100K+ |
| SmmPanel | Panel connections | 1-5 per user |
| AutoReplyRule | Automation rules | 10-50 per user |
| CreditTransaction | Financial ledger | 10K+ |

---

## 🔌 API Documentation

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/login` | User authentication |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/logout` | Invalidate session |

### Device Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/devices` | List all devices |
| POST | `/api/devices` | Create new device |
| GET | `/api/devices/:id/qr` | Get QR code |
| DELETE | `/api/devices/:id` | Remove device |

### Order Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders` | List orders |
| GET | `/api/orders/:id` | Get order details |
| POST | `/api/orders/:id/refill` | Request refill |
| POST | `/api/orders/:id/cancel` | Request cancel |

### Panel Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/panels` | List panels |
| POST | `/api/panels` | Add panel |
| POST | `/api/panels/detect` | Auto-detect panel |
| POST | `/api/panels/:id/sync` | Sync services |

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users |
| GET | `/api/admin/stats` | Platform statistics |
| GET | `/api/admin/config` | System configuration |
| PUT | `/api/admin/config` | Update configuration |

---

## ⚙️ Environment Configuration

### Required Variables

```env
# Application
NODE_ENV=production
PORT=3001

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db
DIRECT_URL=postgresql://user:pass@host:5432/db

# Security
JWT_SECRET=<minimum-32-character-random-string>
ENCRYPTION_KEY=<64-character-hex-string>

# CORS
FRONTEND_URL=https://yourdomain.com
```

### Optional Variables

```env
# Redis
REDIS_URL=redis://localhost:6379

# Telegram
TELEGRAM_BOT_TOKEN=<bot-token>

# Payment Gateways
BINANCE_API_KEY=<key>
BINANCE_API_SECRET=<secret>
CRYPTOMUS_MERCHANT_ID=<id>
CRYPTOMUS_API_KEY=<key>

# Pricing Defaults
DEFAULT_USER_CREDIT=10.00
CREDIT_PER_MESSAGE_WA=0.01
CREDIT_PER_MESSAGE_TG=0.01
```

---

## 📁 Project Structure

```
wabar/
├── public/                    # Static assets
├── src/                       # Frontend source
│   ├── components/           # React components
│   │   ├── Sidebar.jsx
│   │   ├── Header.jsx
│   │   └── ...
│   ├── pages/                # Page components
│   │   ├── Dashboard.jsx
│   │   ├── Devices.jsx
│   │   ├── Inbox.jsx
│   │   ├── Orders.jsx
│   │   ├── Panels.jsx
│   │   ├── Settings.jsx
│   │   ├── Wallet.jsx
│   │   └── admin/           # Admin pages
│   │       ├── UserManagement.jsx
│   │       ├── SystemSettings.jsx
│   │       └── ...
│   ├── services/            # API services
│   │   └── api.js
│   ├── App.jsx              # Root component
│   ├── index.css            # Global styles
│   └── main.jsx             # Entry point
│
├── server/                   # Backend source
│   ├── prisma/
│   │   ├── schema.prisma    # Database schema
│   │   └── migrations/      # Migration files
│   ├── src/
│   │   ├── routes/          # API routes
│   │   │   ├── auth.js
│   │   │   ├── devices.js
│   │   │   ├── orders.js
│   │   │   ├── panels.js
│   │   │   └── admin.js
│   │   ├── services/        # Business logic
│   │   │   ├── whatsapp.js
│   │   │   ├── telegram.js
│   │   │   ├── autoReply.js
│   │   │   └── orderProcessor.js
│   │   ├── utils/           # Utilities
│   │   │   ├── prisma.js
│   │   │   ├── jwt.js
│   │   │   └── encryption.js
│   │   └── index.js         # Server entry
│   ├── package.json
│   └── .env
│
├── VPS-SETUP-GUIDE.md       # Deployment guide
├── package.json             # Frontend dependencies
└── README.md                # This file
```

---

## 🔒 Security Features

### Authentication
- ✅ JWT with secure signing
- ✅ Password hashing with bcrypt (12 rounds)
- ✅ Session expiration and refresh
- ✅ Login attempt rate limiting

### Data Protection
- ✅ API key encryption at rest
- ✅ Multi-tenant data isolation
- ✅ Input validation and sanitization
- ✅ SQL injection prevention (Prisma ORM)

### Infrastructure
- ✅ HTTPS enforcement
- ✅ CORS configuration
- ✅ Helmet security headers
- ✅ Rate limiting per endpoint

### Audit & Compliance
- ✅ Comprehensive activity logging
- ✅ Login history tracking
- ✅ Transaction audit trail
- ✅ IP address logging

---

## 📝 Changelog

### v2.0.0 (January 2026)
- 🔄 Migrated from SQLite to PostgreSQL
- ✨ Added Supabase cloud database support
- 🎨 New modern UI with glassmorphism design
- 📱 Improved mobile responsiveness
- 🔧 System Settings with logo upload
- 🌍 Global timezone selection
- 🔒 Enhanced multi-tenant security

### v1.5.0 (December 2025)
- ✨ Admin API integration for provider data
- 📊 Provider group routing system
- 💳 Multi-gateway payment support
- 👥 Staff management with permissions

### v1.0.0 (November 2025)
- 🚀 Initial release
- 🤖 WhatsApp automation core
- 📱 Multi-device support
- 💬 Auto-reply system
- 📈 Basic analytics

---

## 📄 License

**Proprietary Software** - All rights reserved.

This software and its source code are the exclusive property of the owner. Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

---

<p align="center">
  <b>Built For for SMM Panel Owners</b>
</p>

<p align="center">
  <sub>© 2026 SMMChatBot. All rights reserved.</sub>
</p>
