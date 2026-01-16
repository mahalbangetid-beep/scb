These are bot features that users can enable or disable while setting up automation.
I have written down all the ideas I currently have.
You are free to organize, improve, and implement them in the way you think works best.


There should be a separate tick/flag with a time setting to control how long a user must wait before submitting another request for the same order.

For example, if a user repeatedly sends cancel requests for the same order ID, the system should not allow it. The bot should reply like this:
These support requests are already in progress: 490192155. For each order, you can request support once every 12 hours.
If a support request is already in the queue, you cannot create another support request for the same order.








Phase 1: Username & User Validation System
Overview

In Phase 1, the system will implement user identity validation before allowing the bot to respond to order- related support requests.
There will be two types of incoming requests:

1. WhatsApp Group Support
- Support requests coming from a predefined WhatsApp group.
2. Direct WhatsApp Message (Random Number)
- Support requests coming from any individual WhatsApp number.

Since it is not possible via API to automatically identify which WhatsApp number belongs to which panel username, a manual user-mapping system is required.



Manual User Registration & Mapping Panel (For Panel Admin)
A dedicated admin page will be created where the panel owner/admin can manually manage user validation.

Required Fields

1. Username (Panel username - mandatory)
2. Registered Email (Optional) & User ID
3. WhatsApp Number / WhatsApp Group Name or Group ID
o Allow adding multiple WhatsApp numbers for one username
o Support both individual numbers and group IDs
4. Bot Response Status
o Active ? Bot will respond
o Disabled ? Bot will not respond to this user/group
5. Admin Memo / Notes
o Internal note visible only to panel admin
6. Extra Field / Security Rule
o If the user sends spam, abusive text, or excessive messages, the bot can be auto-suspended for that user

Admin Permissions

* Panel admin can:
o Change or update usernames
o Change or update WhatsApp numbers or group IDs
o Enable or disable bot responses for any user
o Add internal notes for tracking or verification



New User Interaction Flow (Unregistered Users)
When a new WhatsApp number or group contacts the bot and is not registered:

1. Bot replies:

"This number is not registered. Please enter your panel username or registered email to continue."

2. User submits username or email
3. System checks:
o If the username/email already exists and is linked to another number
? Bot replies:

"This account is already registered with another number. Please contact the support team at +9779800000."

o If the username/email is not registered
? The system will:
* Auto-add the WhatsApp number
* Map it to the provided username/email
* Save it in the username validation list



Account Status Validation
After successful registration or validation:

* The system will check:
o Whether the panel account is banned, suspended, or inactive
* If the account is banned or restricted:
o Bot replies with a predefined message (e.g. account banned, contact support, etc.)
* If the account is active:
o Bot will allow order-related responses and support commands



Additional Recommended Enhancements (Added)
* Duplicate Protection
o Prevent the same WhatsApp number from being linked to multiple usernames unless approved by admin
* Audit Logs
o Track changes made by panel admin (username changes, number changes, bot status updates)
* Auto-Verification Cooldown
o Limit repeated username/email attempts to prevent brute-force or spam attempts
* Fallback Manual Approval
o Optional setting where new registrations require admin approval before bot activation




Phase 2: User Validation Active & Order Command Handling

Overview
In Phase 2, only validated users are allowed to interact with the chatbot for order-related actions. The bot will intelligently process order commands, validate ownership, check order status, and take appropriate actions such as cancel, refill, or speed-up requests.



1. Random Number Messaging the Chatbot

* If a random or unregistered number sends messages repeatedly without completing validation:
o The bot will detect spam or repeated invalid attempts
o The bot will be auto-suspended for that number
o No further responses will be sent until manually re-enabled by admin



2. Order ID Command Format
Users can send commands in two formats:

A. Single Order ID with Command

Example:

492007588 cancel
490489574 refill
492007588 speedup


3. Validation Flow (Mandatory Checks)
Step 1: User Validation

* The bot first checks:
o Whether the WhatsApp number is mapped to a valid username
* If not valid ? no response or suspension (based on spam rules)



Step 2: Order Ownership Validation

* The system checks:
o Whether the order ID belongs to the same username / user ID
* If order ID does NOT belong to the user:
o Bot replies:

"Order ID does not belong to you: {order_id}"

o Process stops immediately



4. Order Status-Based Logic (Common for All Commands)
After ownership is confirmed, the bot checks the current order status.

Possible Status Responses


Order Status
Bot Reply
Cancelled
"Order already cancelled: {order_id}"
Partial
"Order already partially refunded: {order_id}"
Pending
"Order {order_id} added for speed-up request."
In Progress
"Order {order_id} is currently in progress."
Completed
"Order {order_id} is completed."


5. Cancel Command Logic
Example:

492007588 cancel

Flow:

1. Validate user
2. Validate order ownership
3. Check order status

Responses:

* Cancelled / Partial
? Direct status reply (no action taken)
* In Progress
o Bot replies:

"Cancel request added for order {order_id}"

o External Order ID is automatically forwarded to the configured provider WhatsApp number or group
* Completed
o Reply:

"Completed orders cannot be cancelled."



6. Refill Command Logic
Example:

490489574 refill

Flow:

1. Validate user
2. Validate order ownership
3. Check order status

Status Rules:

* Cancelled / Partial
? Direct status reply
* In Progress
? Reply:

"Refill is not possible because the order is still in progress."

* Completed
? Proceed to Guarantee Validation



7. Guarantee Validation for Refill Requests
Refill requests are allowed only for guarantee services.

Challenge:

Different panel owners use different formats to indicate guarantee.

Solution:

Create a Guarantee Detection Section where the system checks service names using keywords, patterns, or emojis.



Example Service Names & Logic

Example 1:
TikTok Likes [ Max 5M ] | Real and Bot Accounts | Cancel Enable | 30 Days   | Instant Start

* (30 Days   ) ? Automatically detected as 30-day guarantee

Example 2:
TikTok Followers [ Max 5M ] | LQ Accounts | Cancel Enable | Low Drop | 10 Days   | Instant Start

* (10 Days   ) ? Automatically detected as 10-day guarantee



Guarantee Validation Steps:

1. Extract guarantee days from service name
2. Calculate guarantee expiry using order completion date
3. If guarantee expired:
o Reply:

"Guarantee period expired for order {order_id}"

4. If no guarantee keyword or emoji detected:
o Reply:

"This service does not include a guarantee. Refill not possible."

5. If guarantee is valid:
o Refill request is accepted
o Order ID is forwarded automatically to the provider WhatsApp group



8. Speed-Up Command Logic
Example:

492007588 speedup

Flow:

1. Validate user
2. Validate order ownership
3. Check order status

Rules:

* Cancelled / Completed
? Reply:

"Speed-up is not allowed for {current_status} orders."

* Pending / In Progress
o Reply:

"Speed-up request added for order {order_id}"

o External Order ID is forwarded to provider WhatsApp group automatically (only if configured)



9. Additional Enhancements (Added for Clarity & Safety)
Anti-Abuse & Security

* Rate limiting per WhatsApp number
* Auto-suspend on repeated invalid order IDs
* Temporary cooldown after failed ownership checks

Admin Control

* Enable/disable:
o Cancel requests
o Refill requests
o Speed-up requests
* Custom reply templates per order status

Logging & Tracking

* Maintain logs for:
o User commands
o Order actions
o Forwarded provider requests
* Track request timestamps for audit and dispute handling



Final Outcome
By the end of Phase 2:

* Only verified users can interact
* Order actions are fully automated
* Provider communication is auto-forwarded
* Manual work is reduced
* Abuse and spam are automatically controlled









Processing Status Handling (Additional Section)
Overview

When an order status is Processing, it means the order is acknowledged by the provider but not yet fully in progress.
This status requires special handling, as some actions can be auto-forwarded based on admin configuration.



1. Processing Status - Speed-Up Request
Condition

User sends:

{order_id} speedup

Flow

1. Validate user
2. Validate order ownership
3. Check order status = Processing

Action

* Speed-up request is allowed
* Bot behavior:
o Reply to user:

"Speed-up request added for order {order_id} (Status: Processing)."

o External Order ID is automatically forwarded to the configured provider WhatsApp number/group if speed-up forwarding is enabled



2. Processing Status - Cancel Request
Condition

User sends:

{order_id} cancel

Flow

1. Validate user
2. Validate order ownership
   3. Check order status = Processing Admin Auto-Rule (Backend Setting) Admin can enable a backend rule:
* "Auto-forward cancel requests for Processing orders"

If this rule is ENABLED:

* System automatically forwards:

o External Order ID
o Cancel request
o Order status (Processing)
* Forwarded to provider WhatsApp group/number
* User reply:

"Cancel request added for order {order_id}. Our team is checking with the provider."

If this rule is DISABLED:

* No provider forwarding
* User reply:

"Your cancel request for order {order_id} has been recorded and is under review."



3. Processing Status - Refill Request
Condition

User sends:

{order_id} refill

Rule

* Refill is NOT allowed for Processing orders

Bot Reply

"Refill is not available because order {order_id} is currently in processing status."



4. Processing Status - Summary Table


Command
Allowed
Action
Speed-Up
? Yes
Request added + optional provider forwarding
Cancel
? Conditional
Auto-forward based on admin rule
Refill
? No
Direct rejection reply

5. Additional Safeguards (Recommended)
* Admin can:

o Enable/disable processing-status automation separately
o Set different provider groups for:
* Speed-up
* Cancel
* Bot logs:
o Request type
o Order status
o Forwarding result
* Prevent duplicate requests:
o Same order + same command within cooldown period







Phase 3: Mass / Bulk Order Support Requests

Overview
Phase 3 introduces bulk (mass) order request handling, allowing users to submit multiple order IDs in a single message for actions like cancel, refund, refill, or speed-up.

This is designed to:

* Reduce copy-paste effort
* Handle large volumes (10, 50, 100+ orders)
* Provide clean, readable responses
* Prevent spam or duplicate requests



1. Bulk Order Input Format
Supported Formats

Users can send multiple order IDs in one message, such as:

491338581,491243473,491242842,491133790  cancel

or

491338581
491243473
491242842
cancel

System will:

* Extract all valid order IDs
* Detect the requested action (cancel / refill / speed-up / refund)



2. Validation Rules (Same as Phase 2 - Applied Per Order)
For each order ID, the system must perform:

1. User validation (WhatsApp ? username mapping)
2. Order ownership validation
3. Order status check
4. Request cooldown / duplicate request check
   5. Command-specific rules (cancel / refill / speed-up) Each order is processed independently, even in bulk requests.


3. Bulk Request Size Handling
A. Up to 5 Order IDs (Detailed Response)

If the request contains 5 or fewer order IDs, the bot can return a detailed, formatted result.

Sample Response:

   Cancel Results
????????????????

? Failed (9):
* 491338581: not_found
* 491243473: not_found
* 491242842: not_found
* 491133790: not_found
* 491128562: not_found
* 490822288: not_found
* 490715855: not_found
* 490651134: not_found
* 487677512: not_found

????????????????
Total: 9 | ? 0 | ? 9

This format is suitable for small batch requests where readability is important.



4. More Than 5 Order IDs (Compact Response Mode)
When a request contains more than 5 order IDs in a single message, the response template must change automatically to avoid clutter and copying difficulty.

Compact Response Logic

* Do not list individual success/failure reasons
* Show only order IDs and final action
* Group results in a single-line or short block

Example Response:

491338581, 491243473, 491242842, 491133790, 491128562,
490822288, 490715855, 490651134

Support request added successfully.

or (for refund):

491338581,491243473,491242842,491133790,491128562,
490822288,490715855,490651134

Refund request added for the above orders.


5. Mixed Results Handling (Bulk Requests)
If bulk orders contain mixed outcomes (some valid, some invalid):

Rules:

* Valid orders ? request added
* Invalid / not-owned / cooldown orders ? skipped
* Avoid long error lists for large batches

Example Reply:
Bulk request processed. Valid orders: 23
Skipped orders: 7 (invalid, not owned, or already in queue)

Support requests have been added where applicable.


6. Cooldown & Duplicate Request Protection (Bulk)
* Each order ID follows its own cooldown timer (e.g. 12 hours)
* If an order already has a pending request:
o It will be skipped
o No duplicate request will be created
* Cooldown logic applies even in mass requests



7. Provider Forwarding (Bulk Mode)

If provider forwarding is enabled:

* External Order IDs are:
o Grouped
o Sent in batches
* Separate forwarding can be configured for:
o Cancel
o Refill
         o Speed-up Example provider message:
Bulk Cancel Request:
External IDs: 8847283, 8847284, 8847285, 8847286


8. Admin Configuration Options (Added)
Admin can configure:

* Maximum bulk size per message (e.g. 100 orders)
* Auto-switch threshold (e.g. >5 orders = compact mode)
* Enable/disable bulk requests per command
* Separate cooldown time for bulk requests
* Enable detailed logs for bulk processing



9. Logging & Tracking
For each bulk request:

* Store:
o User ID
o WhatsApp number
o Command type
o Total orders
o Success count
o Skipped count
* Useful for audits, disputes, and abuse detection













Phase 4: Rule-Based Bot Control & Advanced Automation

Overview
In Phase 4, the system introduces a tick-mark (enable/disable) rule engine. Each feature can be individually enabled or disabled by the panel owner.

* If a rule is ticked (enabled) ? the bot will apply the check and perform the action
* If a rule is unticked (disabled) ? the bot will skip that check entirely

This allows full control over risk-sensitive features while keeping the system flexible.



Risk / Warning Features (High-Risk Rules)
  These features can directly affect orders, funds, or account data. Each must be explicitly enabled by the panel owner.

1. Error / Failed Order Auto Handling
o Allows failed or error orders to be automatically changed to Cancelled or Refunded
o Uses panel API for status updates
2. Force Order Status to Completed (Fake Completion)
o Allows any order to be manually or automatically marked as Completed
o Applies regardless of real provider status
o High-risk feature, disabled by default
3. Order Link Update via Chatbot
o Allows users to update the order link directly through WhatsApp
o Bot validates ownership before applying changes
4. Payment Verification Only Mode
o If a user sends a transaction ID
o Bot checks whether:
* The payment is received
* Funds are credited or pending
o Bot replies with payment status (no manual support needed)
5. User Account Details via Chatbot
o If enabled, user can request their account details
o Bot replies with:
* Username
* Email ID
* Current balance
* Total spent amount
6. Ticket Page Reply Allowed
o Allows the bot to automatically reply and act on support tickets
o Uses username and order ID validation



Safe / Normal Features (Low-Risk Rules)
1. User Validation
o Username and WhatsApp number validation
o Mandatory for all chatbot actions
o Cannot be disabled (core safety rule)



Task Status Command Mapping (Provider Side)
The bot maps user commands to provider-side actions based on order status.


User Command
Order Status
Provider Command Sent
Speed-Up
Any allowed status
{speed}
Refill
Completed only
{refill}
Processing
Depends on user request
{cancel} or {speed}
Cancel
In progress / processing
{cancel} or {speed} (based on rules)
These mappings are configurable per provider.



Ticket Page Automation System
Ticket Subject Detection

When a ticket is created, the bot checks the subject keywords, such as:

* Order
* Refill
* Payment
* Cancel
* Speed-up

Auto-Reply Logic

* Bot validates:
o Username
o Order ID mentioned in the chat
* Based on ticket type:
o Sends an automatic reply on the panel
o Creates a provider-side request if needed

Admin Forwarding (Unhandled Tickets)

If the ticket content:

* Does not match known keywords
   * Or requires manual review Then the bot:
* Forwards ticket details to a configured admin WhatsApp number
* Includes:

o Ticket ID
o Username
o Ticket subject
         o Order ID (if available) Admin can review it later manually.
Tickets can also be created through the API.
Please include a provider-side option so that, using the external order ID, a ticket is automatically created on the provider side as well.



Final Result of Phase 4
* Panel owner has full rule-based control
* High-risk actions are opt-in only
* Bot behavior is predictable and configurable
* Ticket handling becomes semi-automatic
* Manual workload is significantly reduced
* System remains secure and auditable

Phase 5: Provider Integration, API Sync & Request Forwarding

Overview
In Phase 5, all cancel, refill, and support requests must be processed simultaneously in two ways:

1. Website / Panel API request (official request added via API)
   2. Provider-side forwarding (WhatsApp / Telegram group or number) Both actions must occur at the same time, ensuring no request is missed.


1. Dual Request Submission (API + Group Forwarding)
When a user submits a cancel or refill request:

* The system will:
o Add the request via the panel API
o Send the same request details to the configured provider group
* This applies to:
o Cancel requests
o Refill requests
         o Speed-up requests This guarantees:
* Panel records remain accurate
* Providers receive real-time instructions



2. Provider Section (Main Configuration Panel)
2.1 Auto Import of Providers

On the Provider Section page:

* The system will fetch all providers linked to the user's panel
* This will be done with one click
* Only the following will be imported:
o Provider Alias Name (preferred)
o If alias does not exist ? Provider Name

   Provider details will never be made public



2.2 Trust & Privacy Notice (User-Facing Message)
To build user trust, this page will display a clear reassurance message, such as: "Your provider information is completely safe.
We do not expose your provider details publicly.
Once you log out or disconnect your panel, all provider data will be permanently deleted from our system."



2.3 Hidden Provider Domain Sync (Internal Use Only)

For internal security and system intelligence:

* When a user adds a panel:
o All provider domains will be silently stored in our system
o This process is hidden from the user
* Domains are used only internally to:
o Identify providers
o Improve automation reliability
* No sensitive provider data is exposed



3. Provider Alias & Auto-Sync System
* Each provider will have:
o Internal Domain (Hidden)
o Public Alias (Visible to user)
* A Sync Providers option will be available:
o If the user adds a new provider in their panel
o The alias will be auto-imported during sync
* No manual reconfiguration required



4. Provider Request Forwarding Rules
Each provider can be configured to forward requests to:

* WhatsApp Group
* WhatsApp Number
* Telegram Group
* Telegram Username
* Multiple destinations (allowed)

Example Mapping (Hidden Domain ? Alias)


Provider ID
Hidden Domain
Alias
Forward To
130
smmrapid.com
SMMRPD
WhatsApp Group / Telegram
129
boostorigin.com
BOrigin
WhatsApp Group/ Telegram Group
128
smmflux.com
SMMFX
Telegram Group
127
socialmint.io
SMINT
WhatsApp Number/ Telegram Username
126
smmwave.com
SMMWV
WhatsApp Group
125
growblast.com
GBLST
Telegram Username
124
smmforge.com
SMMFRG
WhatsApp Group
123
viralsupply.com
VSupply
Telegram/ WhatsApp/ WhatsApp Group/
122
smmpulse.com
SMMPLS
WhatsApp
121
socialdrive.com
SDrive
Telegram

Whenever a request belongs to a specific provider:

* It is automatically forwarded to the assigned destination(s)



5. Provider Message Format
All forwarded messages will follow a standard, readable format, for example:

491338581, 491243473 Cancel

or (for refill):

490489574, Refill

Format is configurable per provider if required.



6. Automatic Provider Response Flow
* Once forwarded:
o Provider-side teams can act immediately
* Panel API request already exists
* No manual duplication needed
* Reduces delays and human error



7. Safety & Control Features
* Enable/disable forwarding per provider
* Enable/disable API request submission
* Logs for:
o API success/failure
o Forwarding success/failure
* Retry logic if:
o API fails
o Message forwarding fails



Final Outcome of Phase 5
* Fully synchronized request handling
* Secure provider data management
* High user trust through transparency
* Scalable forwarding system
* Zero duplicate manual work
