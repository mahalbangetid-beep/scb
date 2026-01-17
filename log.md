For now, this is how I understand the test-based refill checking logic should work:

Refill Request Flow (Bot Logic)

Refill request received
Example: A refill request comes for Order ID: 3500.

Check order status

The bot should first verify whether the order status is “Completed”.

If the order is not completed, the refill process should stop.

Check guarantee eligibility

Currently, there is no dedicated setting to define whether a service is guaranteed or not.

Therefore, for now, the bot will check the service name for any guarantee-related keywords.

No guarantee keyword found

If no guarantee-related keyword is found in the service name, the service will be treated as a non-guarantee service.

In this case, the bot should reply:

“This is not possible to refill. This is a no-refill, no-support service.”

The process ends here.

Guarantee keyword found

If a guarantee keyword exists in the service name, the bot should proceed to the next step.

The bot should check the order date and compare it with the current date to verify whether the refill period is still valid.

Refill date is valid

If the refill period is still valid, the bot should:

Send the reply: “Refill request added.”

Forward the refill request to the provider side.

Send the external order ID along with the refill command to the provider.

Stop further processing.

Refill date expired

If the refill period has expired, the bot should reply:

“Refill period has expired.”

The process ends.