---
description: Project structure and important files for DICREWA
---

# DICREWA Project Structure

## Key Files to Know

### Entry Points
- `index.html` - HTML entry with fonts
- `src/main.jsx` - React entry point
- `src/App.jsx` - Main app with routing

### Styling
- `src/index.css` - Complete design system (800+ lines)
  - CSS Variables for colors, spacing, typography
  - Component styles (.card, .btn, .form-input, etc.)
  - Utility classes
  - Animations

### Components
- `src/components/Sidebar.jsx` - Navigation sidebar

### Pages (all in src/pages/)
| File | Route | Purpose |
|------|-------|---------|
| Dashboard.jsx | /dashboard | Main overview |
| Devices.jsx | /devices | WhatsApp device management |
| Broadcast.jsx | /broadcast | Bulk messaging |
| AutoReply.jsx | /auto-reply | Bot configuration |
| Webhook.jsx | /webhook | Webhook endpoints |
| Contacts.jsx | /contacts | Contact management |
| MessageLogs.jsx | /logs | Message history |
| ApiDocs.jsx | /api-docs | API documentation |
| N8nTutorial.jsx | /n8n-tutorial | n8n integration guide |
| Settings.jsx | /settings | System settings |

## Adding New Features

### To add a new page:
1. Create new file in `src/pages/NewPage.jsx`
2. Import in `src/App.jsx`
3. Add Route: `<Route path="/new-page" element={<NewPage />} />`
4. Add nav item in `src/components/Sidebar.jsx`

### To modify styling:
- Edit `src/index.css`
- Use existing CSS variables for consistency
- Follow existing component patterns

## Current State
- Frontend UI complete (mock data)
- Backend API not implemented yet
- See AGENT_HANDOFF.md for full details
