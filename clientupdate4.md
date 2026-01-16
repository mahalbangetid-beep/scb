I have linked a WhatsApp account, and I noticed one thing.

There is one group where I tested using a random number.
In the group, the bot is replying to solo messages correctly.

Then I tested by sending a message from a random number.
The panel is linked with smmapiprovider.com.

From one number, I sent an order ID with the cancel command, but it always shows “Order not found”.

I want to explain the issue more clearly.

I have noticed that multiple websites will be linked, and some users will have multiple WhatsApp and Telegram numbers connected.

So the system should work like this:
	•	Each panel should have its own auto bot
	•	Each WhatsApp number should reply only for its assigned panel
	•	Each Telegram bot should also work panel-wise
	•	Command checking and replies should be separate for each panel

Otherwise, if multiple WhatsApp numbers are linked, the same bot command will work everywhere, which will create confusion.

Currently, the bot is working, but the issue is:
	•	Commands are not being checked from the correct panel
	•	Instead of fetching data from the panel API, it is replying with random pre-set bot responses

Please check this issue as well.