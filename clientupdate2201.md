

Some bug-related issues that I have noticed are mentioned below.

Dashboard Page – User Area (Issues & Missing Features)
## 1. Missing Message Reports
o The dashboard should show:
▪ Today’s sent and received message report
▪ Weekly message report
o At the top, it should also display the remaining message credit balance.
## 2. View All Report Page
o There should be a “View All” button.
o When clicked, it should redirect to a page showing proper day-wise message reports (daily
history).
- Top-Up Credit Button
o The Top-Up Credit button at the top should be more bold and highlighted.
o Clicking it should redirect the user to the Load Message Credit page.
## 4. Recent Messages Section
o In the Recent Messages area, there should be a separate box showing:
▪ Recent order ID
▪ Panel name
▪ Provider side status (sent)
▪ Sent to which group or number
▪ Message delivery details
## 5. Device Status Manage Button
o The Device Status → Manage button is not working and needs to be fixed.

## Master Admin Dashboard – Required Reports & Metrics
- Total message credits used
- Total fund received in the wallet
- Total message credits loaded into the system
- Overall bot working status (system health / proper functioning report)
- Total number of registered users
- Number of users with active bots
- Total number of panels linked
- Complete system-wide reports to monitor and verify all records properly









User Side – WhatsApp Device Page (Issues & Required Features)
## 1. Automatic Contact Backup
o As soon as a WhatsApp device is linked, all contact details should be automatically backed up
to the Master Admin side.
o Backup details should include:
▪ Owner’s username
▪ WhatsApp number
▪ Backup date
▪ Other relevant metadata
## 2. Multiple Panel Support
o Currently, only one panel can be selected.
o This page should support multiple panels (e.g., Panel 1, Panel 2, Panel 3).
o Example:
▪ If a user has 3 panels linked, at least 2 panels should work simultaneously, and the
remaining panel should not be automatically disabled or ignored.
o Proper multi-panel handling logic is required.
## 3. Edit Device Name
o Users should be allowed to edit the WhatsApp device name.
On the WhatsApp Devices page, add an ON/OFF toggle button for each WhatsApp login. If the user turns it OFF, the
bot should stop working for that device. If it is ON, the bot should work normally based on the configured bot
settings.

Master Admin Side – WhatsApp Device Management
- WhatsApp Login History
o Since this is the Master Admin panel, it should show:
▪ Complete WhatsApp login history of all users
▪ Linked username for each WhatsApp login
o This will allow the Master Admin to independently verify and monitor all logins.
- Search & Filter Options (Missing)
o A search box is missing.
o Search should be available by:
## ▪ Username
## ▪ Email
▪ Panel link / panel URL




I will test the Telegram bot later, after all WhatsApp-related issues are fixed properly.




SMM Panels Page
## Master Admin Side – Requirements & Issues
## 1. Complete Panel Records
o Every added panel should have a complete record stored on the Master Admin side.
o There should be a search box to search panels by:
▪ Panel domain
▪ Panel name / alias
## ▪ Username
▪ Other related details
## 2. Automatic Provider Backup
o As soon as a panel is added, its provider domain and alias should be automatically fetched via
## API.
o This data should be auto-saved (backed up) on the Master Admin page, including:
▪ Provider domain
## ▪ Alias
▪ Panel domain
▪ Date added
## 3. Auto Sync Providers
o The system should automatically sync provider domains at regular intervals.
o If any new provider domains are added, they should be auto-detected and added without
manual action.

## User Dashboard Side – Issues & Improvements
## 4. Automatic Endpoint Scanning
o Currently, after adding a provider, the user must manually click “Scanning all endpoints...” to
complete the process.
o This should be automated:
▪ As soon as the panel is added, a progress bar should appear at the top.
▪ All endpoints should be auto-scanned and completed automatically.
▪ No manual action should be required from the user.
▪ This will make the system easier and more user-friendly.
## 5. Refresh Balance Error
o When clicking the Refresh button, an error appears:
▪ “Failed to refresh balance”
o This issue needs to be fixed. ( removed no need )
## 6. Panel Type Identification
o On the panel rectangular card/bar, add a small logo or icon to indicate:
▪ Rental Panel or
## ▪ Perfect Panel
o This will help users quickly identify the panel type.





## Panel Connection Page
## Master Admin Side
- Every connected panel should have its endpoint details visible.
- A search box should be available (same as previous pages) to search by:
o Panel name
o Domain
o Username, etc.
- If any endpoint connection fails, the system should:
o Automatically try to re-sync
o Auto-connect and pass the connection every time without manual action

The list of all panels linked on the user side should also be visible on the Master Admin Panel
Connection page. Every panel linked on this platform must be recorded and shown in the Master
Admin panel.

## User Side Dashboard
- All failed endpoints should be auto-synced automatically.
- No manual retry should be required from the user.

Panel-Specific Issues
## • Rental Panel
o Almost every section is currently failing.
o All failed sections need to be fixed and made fully functional.
## • Perfect Panel
o The following features are showing failure repeatedly and need fixing so they auto-pass and
complete successfully:
▪ Order status
▪ Set partial
▪ Edit link
▪ Provider info
▪ Get ticket
▪ Reply ticket








## Orders Page – Required Fields & Improvements
## Order Table Columns
The Orders page should include the following columns:
## • Date & Time
- External ID
- Order ID
- Request from User
- Provider (Alias)
## • Service
## • Link
## • Start Count / Quantity
## • Final Quantity
## • Status
## • Charge
## • Action

Status UI Improvement
- The status filter at the top should be displayed horizontally (buttons/tabs).
- Do not use a dropdown, since there are only 4–5 statuses.

## Bulk Actions
- Enable bulk selection of orders.
- Allow bulk copy of:
o External ID
o Order ID
o Link

## Filters & Search
- Add a provider filter:
o When a provider is selected, all requests related to that provider should be shown on a single
page.
- Replace provider domain display with provider alias.
- Add search functionality by:
o External ID
o Order ID
o Link


Re-Request Behavior
- When Re-Request is clicked:
o The order request should be automatically forwarded again to the targeted group.

## Manual Status & Staff Handling
- Add a Manual status.
- If an order request comes as a manual order, it should be added under this status.
- Include a memo/note field so the staff team can review and process the order properly.


Honestly, I did not understand your logic for the provider
group and provider forwarding.
## ------------------------------------------------------------------------
“But from my point of view, if you use a simple logical approach, I can suggest a few design
ideas. If implemented that way, it will be easy for any normal user to understand and use.”

----------------------------------------------------------------------------------------------------------------
## Provider Forward Target Page – Required Logic & Features
## 1. Panel & Provider Selection
o The page should list all added panels.
o When a panel is selected:
▪ All providers linked to that panel should be auto-fetched and displayed in a list.
▪ Each provider entry should show:
▪ Provider ID
▪ Provider alias name
## 2. Forwarding Targets
o For each provider, allow selection of forwarding targets:
▪ WhatsApp groups
▪ WhatsApp numbers
▪ Telegram groups
▪ Telegram IDs
o Allow multiple group and multiple number selection.
o Existing groups should appear as suggestions while selecting.
o Any group added under Provider Social Group should automatically appear in suggestions and
start working for forwarding after selection.
## 3. Automatic Sync + Extra Options
o Provider lists should automatically sync from the panel API.
o In addition, include extra features:
▪ A manual service / provider not found field.

▪ If a provider or service is not found, forward the request automatically to all selected
target groups/numbers.
## 4. Manual Alias Configuration
o Users should be able to:
▪ Add a custom/random alias manually
▪ Define which groups or numbers the request should be forwarded to
- Multi-Panel Support
o Each panel should have its own separate forwarding configuration page.
o If multiple panels are linked, each panel should maintain independent forwarding rules.
## 6. List View & Usability
o All data should be displayed in a list-based view for easy understanding.
o Search and filter options must be available.
- WhatsApp Device Selection
o Add a WhatsApp device selection mode.
o The forwarding should work only from the selected WhatsApp device.
- Service-Level Forwarding Rules (Separate Page)
o Create a separate page where:
▪ Specific service IDs (e.g., 3463 or any targeted service ID)
▪ Can be matched with a provider alias
▪ And mapped to specific forwarding targets (groups/numbers)

## Provider Social Group – Page Requirements & Logic
- Purpose of the Page
o This page is used to store group/number IDs and link them with providers.
o It controls where and how messages are forwarded (WhatsApp / Telegram) and in which
message format.
o Forwarding should work panel-wise (based on the selected panel).

## 2. Add Social Group / Number – Fields
When adding a Social Group or Number, the following fields should be available:
o Name
o Provider Alias (used to match and link with the correct provider)
o WhatsApp Group JID
o WhatsApp Number
o Telegram Group ID
o Telegram User ID
These IDs will define where the forwarded message will be triggered and sent.

## 3. Error Group / Number Handling
o An option to enable error notifications for a specific group or number.
o If any error occurs, the message should be forwarded to the selected error group/number.


## 4. Forward Request Types
Allow selection of forward request types such as:
o Refill
o Cancel
o Speed Up
When a request type is selected, the forward message preview should be shown automatically.

## 5. Default Forward Message Format
A default suggested format should be available, for example:
## For Refill:
{orderid1},{orderid2},{orderid3},{orderid4},{orderid5},{orderid6},{orderid7},{order
id8} ... (up to 100 supported)
## Command: {refill}
## For Cancel:
{orderid1},{orderid2},{orderid3},{orderid4},{orderid5},{orderid6},{orderid7},{order
id8} ... (up to 100 supported)
## Command: {cancel}
## For Speed Up:
{orderid1},{orderid2},{orderid3},{orderid4},{orderid5},{orderid6},{orderid7},{order
id8} ... (up to 100 supported)
## Command: {speedup}

## 6. Order Status Triggers
Forwarding should support the following statuses:
o Awaiting
o Pending
o In Progress
o Processing
o Completed
o Partial
o Canceled
o Failed
o When a status is ticked and set as active, forwarding should trigger based on the configured
command and format.

## 7. Panel Selection
o Panel selection should be mandatory.
o Forwarding rules should work only for the selected panel.


- Search & Panel-Wise View
o A search feature should be available.
o Data should be displayed in a panel-wise list view, for example:
▪ This panel → these social groups
▪ That panel → those social groups
o Everything should remain separate and clearly organized for easier understanding.

## 9. Forwarding Logs & Reports
o A forwarding logs/report section should be available.
o It should show:
▪ Date & time
## ▪ Panel
▪ Provider alias
▪ Target group/number
▪ Request type
▪ Status (success / failed)

---------------------------------------------------------------------------------------------
Keyword Page – Feedback & Missing Features (not working)
- Everything is fine, but it would be easier to use if the data is displayed in a list view.
- A missing feature is the option to select which WhatsApp device the keyword should work on.
- Add a search option to easily find keywords.
- Add an icon or indicator to show:
o Which WhatsApp device the keyword belongs to
o Keyword-related details at a glance

User Mapping Page – Missing Features & Improvements (not working)
- Everything is fine, but a panel name selection option is missing.
- If no panel is selected, or if a panel is removed, the mapping should automatically apply to all panels
by default.
- Data should be displayed in a panel-wise list view for better clarity and organization.
- Improve the layout so all details are shown in a proper, clean format.
- Add a search feature with filters such as:
o Username
o WhatsApp number
o Group
o Other relevant fields


## Bot Settings – Feedback & Required Changes
- Try to design the algorithm so that:
o There is one default setting per panel.
o Users can optionally customize settings panel-wise or WhatsApp device-wise if needed.
- Having one single setting for all panels and all WhatsApp devices is not ideal, especially if a user
has:
o Multiple panels
o Multiple WhatsApp devices
- The current bot settings are not working properly and need to be fixed.
- The current design looks too lengthy and complex.
o Please try to simplify the UI
o Make it more user-friendly and easier to understand (suggestion only).

## Wallet Page – Requirements & Issues
- The wallet page should show only:
o Fund added / deducted history
o Date
o Payment method
o Transaction ID
o Message credit details
o Wallet name
o Existing report data (already available)
- Users should be allowed to:
o Add wallet funds directly using available payment methods
o Buy message credits from wallet balance
o Set a package that can be auto-purchased from wallet funds
o Use a renew / auto-buy button for packages using wallet balance
- There are errors with the payment gateway integration that need to be fixed.


On the Subscription page, there should be a report showing charges for every new WhatsApp login and Telegram login,
including the date, charge amount, and the related number.

“WhatsApp, Telegram, and panel access should be free for the first month. From the following months,
charges should be applied automatically, with auto-renewal deducting the amount from the wallet. Please
ensure that all related features are included, especially the ones that are currently missing.”