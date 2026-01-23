

## Provider Forwarding & Support System – Bug
Report and Requirements
## Bugs & Issues Observed – Provider Forwarding & System Logic
## 1. Wrong Forwarding Without Checking Provider Name
## Current Problem:
The system currently forwards  external order IDs to a single support group  without checking the
provider alias name.
This causes wrong orders to be sent to the wrong provider support group.

## Example Panel Orders
Panel Order IDExternal Order IDProvider Alias
37803155BamProvider
37793154BamProvider
37787450284SmmNepal
37777450283SmmNepal
37767450282SmmNepal

## User Request Example
User sends command:
3780,3779,3778,3777,3776 cancel
System response on user side:
These orders are added to refund support queue: 3780,3779,3778,3777,3776

## ❌ Current Bug Behavior
All external IDs are sent together to one single support group•
Provider alias name is not checked
Different providers are mixed in one forwarding message
This sends wrong commands to wrong provider groups

## ✅ Expected Correct Behavior
Before forwarding any command, the system must:
Read each panel order ID separately
- Fetch related:
- Provider alias name
- External / provider order ID
- Group orders by provider alias
- Forward each group to its own linked support group / target number

## Correct Forwarding Logic Example

For Provider: BamProvider
## Orders: - 3780 → 3155
## - 3779 → 3154

Forward only to BamProvider linked support group:
3155,3154 cancel

For Provider: SmmNepal
## Orders: - 3778 → 7450284
## - 3777 → 7450283
## - 3776 → 7450282

Forward only to SmmNepal linked support group / target number:
7450284,7450283,7450282 cancel


Main Forwarding Rules (Mandatory)
- Never mix different providers in one forwarding message
- Always:
- Split orders by provider alias
- Send only to correct provider’s mapped support group / number
- Use only external / provider order IDs

##  Other Issues & Missing Features

## 2. User Mapping & Keyword Mapping
Panel-wise user mapping is missing / incomplete
- Keyword mapping between:
- WhatsApp commands
- Panel commands
- is not clearly linked and tested

## 3 Manual Services & Service ID Routing

- Manual services handling not fully tested
- Service ID routing rules logic is incomplete
- Full testing required after fixing forwarding logic

## 4. Unnecessary / Useless Fields
- Several form fields are not useful
- Please review UI and remove unused fields
- Simplify configuration screens

## 5. Rental Panel Integration
- Rental panel integration is still not working properly
- Must be fixed so that:
- Panel sync works correctly
- Orders and provider mapping work correctly

## 6. Command Edit Section Missing
- Command editing section is missing
- No place to configure:
- Single command format
- Mass request command format

## Requirement:
Add a configuration page to edit all command templates.

## 7. Free Credit – Master Admin Side
- Free credit editable option is missing on Master Admin side
## Requirement:
Admin should be able to: - Set free credit limits
- Edit / update free credit values

## ✅ Summary
This forwarding system must strictly:
- Map panel order ID → external provider order ID
- Check provider alias for every order
- Split multi-order requests by provider
- Forward commands only to correct provider support group
- This logic is critical for correct automation and provider communication.