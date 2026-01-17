0|wabar-api  | [WARN] GET / 404 3ms { ip: '167.94.138.49', userId: null }


0|wabar-ap |     at Nn (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:29:1363)
0|wabar-ap |     at ei.handleRequestError (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:121:6911)
0|wabar-ap |     at ei.handleAndLogRequestError (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:121:6593)
0|wabar-ap |     at ei.request (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:121:6300)
0|wabar-ap |     at async a (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:130:9551)
0|wabar-ap |     at async EventEmitter.<anonymous> (/var/www/wabar/server/src/services/whatsapp.js:318:38) {
0|wabar-ap |   clientVersion: '6.19.1'
0|wabar-ap | }
0|wabar-ap | [WA:cmkhxu6bu0017gja8vdpo8p5n] Error saving message: PrismaClientValidationError:
0|wabar-ap | Invalid `prisma.message.create()` invocation:
0|wabar-ap |
0|wabar-ap | {
0|wabar-ap |   data: {
0|wabar-ap |     id: "3AD5D21D8A821DFAAFA4",
0|wabar-ap |     deviceId: "cmkhxu6bu0017gja8vdpo8p5n",
0|wabar-ap |     from: "152252513788018",
0|wabar-ap |     to: "62881025232851",
0|wabar-ap |     content: "So may i send test order id with command right ?",
0|wabar-ap |     type: "text",
0|wabar-ap |     status: "received",
0|wabar-ap |     direction: "incoming",
0|wabar-ap |     createdAt: new Date("2026-01-17T06:44:05.000Z"),
0|wabar-ap | +   message: String
0|wabar-ap |   }
0|wabar-ap | }
0|wabar-ap |
0|wabar-ap | Argument `message` is missing.
0|wabar-ap |     at Nn (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:29:1363)
0|wabar-ap |     at ei.handleRequestError (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:121:6911)
0|wabar-ap |     at ei.handleAndLogRequestError (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:121:6593)
0|wabar-ap |     at ei.request (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:121:6300)
0|wabar-ap |     at async a (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:130:9551)
0|wabar-ap |     at async EventEmitter.<anonymous> (/var/www/wabar/server/src/services/whatsapp.js:318:38) {
0|wabar-ap |   clientVersion: '6.19.1'
0|wabar-ap | }
0|wabar-ap | [Cryptomus] Not configured - CRYPTOMUS_MERCHANT_ID and CRYPTOMUS_API_KEY required
0|wabar-ap | [SMM] API Error for SMMAPIPROVIDER: Request failed with status code 404
0|wabar-ap | [SMM] Error data: {"data":[],"error_message":"Page not found.","error_code":100}
0|wabar-ap | [BotHandler] Failed to log message: PrismaClientValidationError:
0|wabar-ap | Invalid `prisma.message.create()` invocation:
0|wabar-ap |
0|wabar-ap | {
0|wabar-ap |   data: {
0|wabar-ap |     deviceId: "cmkhxu6bu0017gja8vdpo8p5n",
0|wabar-ap |     type: "incoming",
0|wabar-ap |     to: "bot",
0|wabar-ap |     from: "unknown",
0|wabar-ap |     content: "3531 status",
0|wabar-ap |     status: "received",
0|wabar-ap |     platform: "WHATSAPP",
0|wabar-ap |     creditCharged: 0.01,
0|wabar-ap |     metadata: "{\"command\":\"status\",\"orderCount\":1,\"success\":0,\"failed\":1}",
0|wabar-ap | +   message: String
0|wabar-ap |   }
0|wabar-ap | }
0|wabar-ap |
0|wabar-ap | Argument `message` is missing.
0|wabar-ap |     at Nn (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:29:1363)
0|wabar-ap |     at ei.handleRequestError (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:121:6911)
0|wabar-ap |     at ei.handleAndLogRequestError (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:121:6593)
0|wabar-ap |     at ei.request (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:121:6300)
0|wabar-ap |     at async a (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:130:9551)
0|wabar-ap |     at async BotMessageHandler.logMessage (/var/www/wabar/server/src/services/botMessageHandler.js:365:13)
0|wabar-ap |     at async BotMessageHandler.handleSmmCommand (/var/www/wabar/server/src/services/botMessageHandler.js:215:9)
0|wabar-ap |     at async BotMessageHandler.handleMessage (/var/www/wabar/server/src/services/botMessageHandler.js:127:20)
0|wabar-ap |     at async EventEmitter.<anonymous> (/var/www/wabar/server/src/services/whatsapp.js:353:51) {
0|wabar-ap |   clientVersion: '6.19.1'
0|wabar-ap | }
0|wabar-ap | [SMM] API Error for SMMAPIPROVIDER: Request failed with status code 404
0|wabar-ap | [SMM] Error data: {"data":[],"error_message":"Page not found.","error_code":100}
0|wabar-ap | [BotHandler] Failed to log message: PrismaClientValidationError:
0|wabar-ap | Invalid `prisma.message.create()` invocation:
0|wabar-ap |
0|wabar-ap | {
0|wabar-ap |   data: {
0|wabar-ap |     deviceId: "cmkhxu6bu0017gja8vdpo8p5n",
0|wabar-ap |     type: "incoming",
0|wabar-ap |     to: "bot",
0|wabar-ap |     from: "unknown",
0|wabar-ap |     content: "3531 cancel",
0|wabar-ap |     status: "received",
0|wabar-ap |     platform: "WHATSAPP",
0|wabar-ap |     creditCharged: 0.01,
0|wabar-ap |     metadata: "{\"command\":\"cancel\",\"orderCount\":1,\"success\":0,\"failed\":1}",
0|wabar-ap | +   message: String
0|wabar-ap |   }
0|wabar-ap | }
0|wabar-ap |
0|wabar-ap | Argument `message` is missing.
0|wabar-ap |     at Nn (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:29:1363)
0|wabar-ap |     at ei.handleRequestError (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:121:6911)
0|wabar-ap |     at ei.handleAndLogRequestError (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:121:6593)
0|wabar-ap |     at ei.request (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:121:6300)
0|wabar-ap |     at async a (/var/www/wabar/server/node_modules/@prisma/client/runtime/library.js:130:9551)
0|wabar-ap |     at async BotMessageHandler.logMessage (/var/www/wabar/server/src/services/botMessageHandler.js:365:13)
0|wabar-ap |     at async BotMessageHandler.handleSmmCommand (/var/www/wabar/server/src/services/botMessageHandler.js:215:9)
0|wabar-ap |     at async BotMessageHandler.handleMessage (/var/www/wabar/server/src/services/botMessageHandler.js:127:20)
0|wabar-ap |     at async EventEmitter.<anonymous> (/var/www/wabar/server/src/services/whatsapp.js:353:51) {
0|wabar-ap |   clientVersion: '6.19.1'
0|wabar-ap | }