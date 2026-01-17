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
0|wabar-ap | [WARN] GET / 404 3ms { ip: '167.94.138.49', userId: null }
0|wabar-ap | [WARN] GET /wiki 404 2ms { ip: '167.94.138.49', userId: null }
0|wabar-ap | [Cryptomus] Not configured - CRYPTOMUS_MERCHANT_ID and CRYPTOMUS_API_KEY required
0|wabar-ap | [SMM] API Error for SMMAPIPROVIDER: Request failed with status code 404
0|wabar-ap | [SMM] Error data: {"data":[],"error_message":"Page not found.","error_code":100}
0|wabar-ap | [Cryptomus] Not configured - CRYPTOMUS_MERCHANT_ID and CRYPTOMUS_API_KEY required
0|wabar-ap | [WARN] GET /robots.txt 404 8ms { ip: '74.7.175.160', userId: null }
0|wabar-ap | [AdminApiService] makeAdminRequest error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [AdminApiService] makeAdminRequest error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [AdminApiService] makeAdminRequest error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [AdminApiService] makeAdminRequest error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [AdminApiService] makeAdminRequest error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [Cryptomus] Not configured - CRYPTOMUS_MERCHANT_ID and CRYPTOMUS_API_KEY required
0|wabar-ap | [AdminApiService] makeAdminRequest error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [AdminAPI] getOrderStatus error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [SMM] API Error for SMMAPIPROVIDER: Request failed with status code 404
0|wabar-ap | [SMM] Error data: {"data":[],"error_message":"Page not found.","error_code":100}
0|wabar-ap | [AdminApiService] makeAdminRequest error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [AdminApiService] makeAdminRequest error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [AdminAPI] getOrderStatus error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [SMM] API Error for SMMAPIPROVIDER: Request failed with status code 404
0|wabar-ap | [SMM] Error data: {"data":[],"error_message":"Page not found.","error_code":100}
0|wabar-ap | [AdminApiService] makeAdminRequest error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [AdminApiService] makeAdminRequest error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [AdminAPI] getOrderStatus error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [SMM] API Error for SMMAPIPROVIDER: Request failed with status code 404
0|wabar-ap | [SMM] Error data: {"data":[],"error_message":"Page not found.","error_code":100}
0|wabar-ap | [AdminApiService] makeAdminRequest error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [AdminApiService] makeAdminRequest error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [AdminAPI] getOrderStatus error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [SMM] API Error for SMMAPIPROVIDER: Request failed with status code 404
0|wabar-ap | [SMM] Error data: {"data":[],"error_message":"Page not found.","error_code":100}
0|wabar-ap | [AdminApiService] makeAdminRequest error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [AdminAPI] getOrderStatus error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [SMM] API Error for SMMAPIPROVIDER: Request failed with status code 404
0|wabar-ap | [SMM] Error data: {"data":[],"error_message":"Page not found.","error_code":100}
0|wabar-ap | [AdminApiService] makeAdminRequest error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [Cryptomus] Not configured - CRYPTOMUS_MERCHANT_ID and CRYPTOMUS_API_KEY required
0|wabar-ap | [Cryptomus] Not configured - CRYPTOMUS_MERCHANT_ID and CRYPTOMUS_API_KEY required
0|wabar-ap | [AdminApiService] makeAdminRequest error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [AdminAPI] getOrderStatus error: Cannot read properties of undefined (reading 'replace')
0|wabar-ap | [SMM] API Error for SMMAPIPROVIDER: Request failed with status code 404
0|wabar-ap | [SMM] Error data: {"data":[],"error_message":"Page not found.","error_code":100}
0|wabar-ap | [AdminApiService] makeAdminRequest error: Cannot read properties of undefined (reading 'replace')

/root/.pm2/logs/wabar-api-out.log last 100 lines:
0|wabar-ap |   ╔═══════════════════════════════════════════════════╗
0|wabar-ap |   ║                                                   ║
0|wabar-ap |   ║   🚀 DICREWA API Server                           ║
0|wabar-ap |   ║                                                   ║
0|wabar-ap |   ║   Server running on: http://localhost:3001        ║
0|wabar-ap |   ║   Environment: production                     ║
0|wabar-ap |   ║                                                   ║
0|wabar-ap |   ╚═══════════════════════════════════════════════════╝
0|wabar-ap |
0|wabar-ap | [Server] Loading existing WhatsApp sessions...
0|wabar-ap | [WA] Baileys module loaded successfully
0|wabar-ap | [WA] Baileys module loaded successfully
0|wabar-ap | [WA] Found 2 existing session(s)
0|wabar-ap | [WA] Loading session for device: cmkdins1e000tgjfgu76gitwi
0|wabar-ap | [WA:cmkdins1e000tgjfgu76gitwi] Using WA version 2.3000.1027934701, isLatest: true
0|wabar-ap | [WA] Loading session for device: cmkhxu6bu0017gja8vdpo8p5n
0|wabar-ap | [WA:cmkhxu6bu0017gja8vdpo8p5n] Using WA version 2.3000.1027934701, isLatest: true
0|wabar-ap | [Server] WhatsApp session loading complete
0|wabar-ap | [Server] Initializing Telegram bots...
0|wabar-ap | [Telegram] Loading existing bots...
0|wabar-ap | [Telegram] Loaded 0 bot(s)
0|wabar-ap | [Server] Telegram bot initialization complete
0|wabar-ap | [WA:cmkdins1e000tgjfgu76gitwi] QR Code generated
0|wabar-ap | [WA:cmkhxu6bu0017gja8vdpo8p5n] Connected as 62881025232851!
0|wabar-ap | GET /api/auth/me 304 21.375 ms - -
0|wabar-ap | GET /api/auth/me 304 23.541 ms - -
0|wabar-ap | [WA:cmkdins1e000tgjfgu76gitwi] QR Code generated
0|wabar-ap | GET /api/auth/me 304 9.793 ms - -
0|wabar-ap | GET /api/auth/me 304 7.492 ms - -
0|wabar-ap | [WA:cmkdins1e000tgjfgu76gitwi] QR Code generated
0|wabar-ap | GET /api/auth/me 304 13.559 ms - -
0|wabar-ap | [WA:cmkdins1e000tgjfgu76gitwi] QR Code generated
0|wabar-ap | [WA:cmkdins1e000tgjfgu76gitwi] QR Code generated
0|wabar-ap | GET /api/auth/me 304 8.775 ms - -
0|wabar-ap | [WA:cmkdins1e000tgjfgu76gitwi] QR Code generated
0|wabar-ap | GET /api/auth/me 304 11.895 ms - -
0|wabar-ap | [WA:cmkdins1e000tgjfgu76gitwi] Connection closed. StatusCode: 408
0|wabar-ap | [WA:cmkdins1e000tgjfgu76gitwi] Reconnecting in 5s...
0|wabar-ap | [WA:cmkdins1e000tgjfgu76gitwi] Using WA version 2.3000.1027934701, isLatest: true
0|wabar-ap | [WA:cmkdins1e000tgjfgu76gitwi] QR Code generated
0|wabar-ap | [Esewa] Initialized in PRODUCTION mode
0|wabar-ap | [BinancePay] Status: NOT CONFIGURED (Placeholder)
0|wabar-ap | [ManualPayment] Service initialized
0|wabar-ap | [PaymentGateway] All gateways loaded
0|wabar-ap |
0|wabar-ap |   ╔═══════════════════════════════════════════════════╗
0|wabar-ap |   ║                                                   ║
0|wabar-ap |   ║   🚀 DICREWA API Server                           ║
0|wabar-ap |   ║                                                   ║
0|wabar-ap |   ║   Server running on: http://localhost:3001        ║
0|wabar-ap |   ║   Environment: production                     ║
0|wabar-ap |   ║                                                   ║
0|wabar-ap |   ╚═══════════════════════════════════════════════════╝
0|wabar-ap |
0|wabar-ap | [Server] Loading existing WhatsApp sessions...
0|wabar-ap | [WA] Baileys module loaded successfully
0|wabar-ap | [WA] Baileys module loaded successfully
0|wabar-ap | [WA] Found 2 existing session(s)
0|wabar-ap | [WA] Loading session for device: cmkdins1e000tgjfgu76gitwi
0|wabar-ap | [WA:cmkdins1e000tgjfgu76gitwi] Using WA version 2.3000.1027934701, isLatest: true
0|wabar-ap | [WA] Loading session for device: cmkhxu6bu0017gja8vdpo8p5n
0|wabar-ap | [WA:cmkhxu6bu0017gja8vdpo8p5n] Using WA version 2.3000.1027934701, isLatest: true
0|wabar-ap | [Server] WhatsApp session loading complete
0|wabar-ap | [Server] Initializing Telegram bots...
0|wabar-ap | [Telegram] Loading existing bots...
0|wabar-ap | [Telegram] Loaded 0 bot(s)
0|wabar-ap | [Server] Telegram bot initialization complete
0|wabar-ap | [WA:cmkdins1e000tgjfgu76gitwi] QR Code generated
0|wabar-ap | [WA:cmkhxu6bu0017gja8vdpo8p5n] Connected as 62881025232851!
0|wabar-ap | GET /api/auth/me 304 23.189 ms - -
0|wabar-ap | GET /api/auth/me 304 13.527 ms - -
0|wabar-ap | [WA:cmkhxu6bu0017gja8vdpo8p5n] Message received from 152252513788018
0|wabar-ap | [BotHandler] Processing message from 152252513788018 (Panel: SMMAPIPROVIDER): Refill 3500...
0|wabar-ap | [CommandHandler] Looking for order 3500 in panel cmkhxtd260015gja8optiitpl
0|wabar-ap | [CommandHandler] Refreshing status for order 3500 from API...
0|wabar-ap | [AdminAPI] Getting status for order 3500 on panel SMMAPIPROVIDER
0|wabar-ap | [SMM] GET https://smmapiprovider.com/adminapi/v2 - Action: status
0|wabar-ap | [SMM] Request params: key, order
0|wabar-ap | [CommandHandler] Fetching provider info for order 3500
0|wabar-ap | [WA:cmkhxu6bu0017gja8vdpo8p5n] Response sent: smm_command (Panel: SMMAPIPROVIDER)
0|wabar-ap | prisma:error
0|wabar-ap | Invalid `prisma.message.update()` invocation:
0|wabar-ap |
0|wabar-ap |
0|wabar-ap | An operation failed because it depends on one or more records that were required but not found. No record was found for an update.
0|wabar-ap | prisma:error
0|wabar-ap | Invalid `prisma.message.update()` invocation:
0|wabar-ap |
0|wabar-ap |
0|wabar-ap | An operation failed because it depends on one or more records that were required but not found. No record was found for an update.
0|wabar-ap | prisma:error
0|wabar-ap | Invalid `prisma.message.update()` invocation:
0|wabar-ap |
0|wabar-ap |
0|wabar-ap | An operation failed because it depends on one or more records that were required but not found. No record was found for an update.
0|wabar-ap | [WA:cmkdins1e000tgjfgu76gitwi] QR Code generated
0|wabar-ap | GET /api/auth/me 304 11.513 ms - -
0|wabar-ap | [WA:cmkdins1e000tgjfgu76gitwi] QR Code generated
0|wabar-ap | GET /api/auth/me 304 9.140 ms - -
0|wabar-ap | [WA:cmkdins1e000tgjfgu76gitwi] QR Code generated

0|wabar-api  | [WA:cmkdins1e000tgjfgu76gitwi] QR Code generated