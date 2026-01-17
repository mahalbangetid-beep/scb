At the moment, the chatbot is replying in a fixed and hardcoded way, but it must be fully customizable. The response logic should work according to how the user wants the bot to check conditions and send replies. All responses should remain customizable in the same way you have already implemented, and not be restricted to fixed replies.

Another important point is the provider-side handling. It must be fully configurable:

Which provider should receive which type of request

For each provider, which WhatsApp/Telegram group or which number the request should be sent to

In case of an error, which provider and which group the error message should be forwarded to

Note:
After going live, the bot should be able to reply to every incoming text message. Currently, it only responds to order ID–based commands and ignores all other text messages.
This must be controlled by a toggle / checkbox setting, so that:

If enabled → the bot replies to all messages

If disabled → the bot ignores random or irrelevant text

Keyword-based replies must also be fully customizable, meaning the user should be able to define:

Which keyword triggers a response

What reply message should be sent for that keyword

I am testing the system on a regular basis by placing real orders in the SMM panel and checking all flows. If I encounter any bugs or issues, I will inform you accordingly.