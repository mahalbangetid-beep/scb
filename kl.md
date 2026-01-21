SMM Panel Provider & Auto-Forwarding System –
Full Explanation for Developers
1. How SMM Panels Actually Work (Important Background)
In the SMM industry:

95% of SMM panels are resellers
Panels do NOT create services themselves
Panel owners connect their panel to another SMM panel (provider panel) using a normal API
They load funds in the provider panel
Then they:
o Select services (example: Service ID 4344 )
o Set their own profit margin (5%, 10%, or any amount)
o Slightly modify service names
o Sell the services as if they are their own
So almost all panel owners are reselling services, not producing them.
Privacy is CRITICAL
The provider panel domain & identity is private
No panel owner wants others to know where they source services from
If the provider is exposed, customers may bypass them and buy directly
Provider privacy = core trust factor
2. Who the “Main Provider” Is
The main provider (real service creator):
o Uses their own tools / scripts
o Has Admin API
o Services are usually manual mode
o They do not resell from another panel
Everyone else (95%) is a reseller panel connected panel-to-panel.
3. What Platform We Are Building
Our platform is mainly for reseller panel owners, not main providers.

Current Manual Process (Problem)
Example flow today:

A customer places an order on Panel A
o Order ID: 45323
The service is AUTO
o Because Panel A is connected to Panel B (provider)
Panel B generates:
o Its own Order ID (External ID / Provider Order ID)
When customer has an issue:
o Speed
o Refill
o Cancel
o Partial
Customer sends Panel A Order ID to support
Panel owner:
o Manually checks order
o Copies External ID
o Manually sends command + external ID to:
▪ Provider WhatsApp group
▪ Telegram group
▪ Telegram ID
This entire process is manual and time-consuming.
4. What We Want to Automate (Core Feature)
Goal:
As soon as an order-related request is received:
Automatically send

External ID
Command (speed / refill / cancel / etc.)
To the correct provider group or number
Via WhatsApp / Telegram
5. Key Technical Concepts to Implement
A. Provider Alias System (Privacy Safe)
Never show real provider domain
Platform must work using Alias Names only
Panel owner can name provider anything:
o Example: FastLikes_A, Provider_X, Backup_
Only alias name is visible everywhere
Real provider domain stays hidden internally
UI message example:
“Our platform forwards requests using provider aliases to protect your privacy.”

B. Provider Detection Flow (Automatic)
User submits Panel Order ID
Platform calls Panel API
From API response:
o Fetch External ID
o Fetch Provider Alias
Based on provider alias:
o Auto-forward message to linked destination
6. Master Admin (Hidden Backup System)
IMPORTANT – Master Admin Only

When any panel is added:
o Automatically backup:
▪ Panel name
▪ Linked provider domains
▪ Provider aliases
Store in a separate secured backup section
Even if:
o User removes panel
o User deletes integration
Backup data must remain safe
This is ONLY for master admin
Never visible to panel owners
Purpose:
Recovery
Abuse control
Internal reference
Platform stability
7. Provider → Group / Destination Mapping
Create a separate configuration page:

Provider & Group Linking Page
Features:

Provider Alias → Destination Mapping
o WhatsApp Group
o WhatsApp Number
o Telegram Group
o Telegram User ID
If Provider Not Detected
o Fallback group/number selection
Manual Services Handling
o Manual services may not have provider
o Separate group/number for manual services
Service ID Based Routing (Advanced Rule)
o If specific Service ID is detected:
▪ Forward to specific group
▪ Override provider default
o Example:
▪ Service ID 1234 → Group A
▪ Service ID 5678 → Group B
8. Message Forwarding Logic
Auto-message must include:

External Order ID
Command type (speed/refill/cancel/etc.)
Panel Order ID (optional)
Clean readable format
Automatically sent to:
Correct provider destination
Based on alias + rules
9. UI / UX Design Requirements (Very Important)
Design Philosophy:
SMM Panel Admin-Like
Familiar to panel owners
No complex or confusing layouts
Layout Guidelines:
Horizontal list style
Similar to SMM panel admin tables
Avoid deep nested pages
Avoid long vertical scrolling
Toggle / Permission Design:
Small, clean toggle switches
Simple enable/disable
No heavy permission matrix
Quick understanding at a glance
Goal:
Even new users should understand without explanation.

10. Summary for Developers
This platform must:

Protect provider privacy using alias system
Auto-detect provider using panel API
Auto-forward external ID + command
Support:
o Provider-based routing
o Service-ID-based routing
o Manual service routing
Maintain hidden master admin backups
Use simple SMM-panel-friendly UI
Avoid exposing provider domains at all costs