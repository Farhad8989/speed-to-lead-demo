# Speed to Lead — Skill Reference (Phase 1 + Phase 2)

Reusable blueprint for building a lead capture and WhatsApp messaging system using Node.js, Google Sheets as a database, and Meta WhatsApp Cloud API.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript (CommonJS, ES2022) |
| Framework | Express |
| Database | Google Sheets (via Service Account) |
| WhatsApp | Meta WhatsApp Cloud API (no SDK, raw HTTPS) |
| Email | Nodemailer |
| Logging | Winston (console only in dev) |
| Testing | Vitest (real integration tests, no mocks for DB) |
| Dev server | tsx + nodemon |

---

## Project Structure

```
src/
  config.ts                        # Typed env config
  types.ts                         # All shared interfaces and enums
  index.ts                         # Express entry point
  sheets/
    sheetsClient.ts                # Google Sheets CRUD primitives
    sheetsSetup.ts                 # Creates tabs + headers on startup
    repositories/
      leadRepository.ts
      conversationRepository.ts
      repRepository.ts
      followUpRepository.ts
  messaging/
    messagingProvider.ts           # IMessagingProvider interface
    metaWhatsappProvider.ts        # Meta WhatsApp Cloud API
    emailProvider.ts               # Nodemailer
    mockMessagingProvider.ts       # Silent logger (for tests)
    messagingFactory.ts            # Returns provider based on MESSAGING_MODE
  services/
    leadService.ts                 # createLead() orchestrator
  routes/
    leadRoutes.ts                  # GET/POST /api/leads
    webhookRoutes.ts               # POST /api/webhooks/twilio (inbound WhatsApp)
  middleware/
    errorHandler.ts
    logger.ts
    twilioValidator.ts
  utils/
    logger.ts                      # Winston instance
    helpers.ts                     # sleep(), normalizePhone(), msToHuman()
public/
  index.html                       # Lead capture form (vanilla HTML/JS)
credentials/
  service-account.json             # Google Service Account key (never commit)
```

---

## npm install (copy-paste)

```bash
npm install express googleapis openai twilio nodemailer node-cron uuid winston helmet cors express-rate-limit dotenv
npm install -D typescript tsx nodemon vitest @types/express @types/node @types/cors @types/nodemailer @types/uuid @types/node-cron
```

---

## Phase 1 — Google Sheets Database

### Google Sheets Setup (do this once)
1. Create a Google Cloud project → enable **Google Sheets API**
2. Create a **Service Account** → download JSON key → save as `credentials/service-account.json`
3. Share your spreadsheet with the service account email (give **Editor** access)
4. Copy the spreadsheet ID from the URL: `docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`

### sheetsClient.ts — Core Primitives

```typescript
export async function getSheets(): Promise<sheets_v4.Sheets>   // singleton
export async function appendRow(tab: string, values: string[]): Promise<void>
export async function getRows(tab: string): Promise<string[][]> // row[0] = headers
export async function updateRow(tab: string, rowNumber: number, values: string[]): Promise<void>
export async function deleteRow(tab: string, rowNumber: number): Promise<void>
```

**Row number arithmetic — always gets this wrong first time:**
- `getRows()` returns all rows including header at index 0
- Data starts at array index 1
- Sheet row number = array index + 1 (0-based array → 1-based sheet)
- Example: `rows[3]` → sheet row 4 → pass `4` to `updateRow()`/`deleteRow()`

### sheetsSetup.ts — Auto-create tabs on startup

Call `await setupSheets()` at server start. It checks which tabs exist and creates missing ones in a single `batchUpdate`, then writes headers to empty tabs.

```typescript
const TABS = [
  { name: 'Leads',         headers: ['id','name','phone','email','serviceInterest','score','status','assignedRepId','source','responseTimeMs','createdAt','updatedAt','qualifiedAt','notes'] },
  { name: 'Conversations', headers: ['id','leadId','role','content','channel','createdAt'] },
  { name: 'SalesReps',     headers: ['id','name','email','phone','isActive','currentLeadCount'] },
  { name: 'FollowUps',     headers: ['id','leadId','type','scheduledAt','executedAt','channel','message'] },
  { name: 'Events',        headers: ['id','leadId','eventType','metadata','createdAt'] },
];
```

### Repository Pattern

```typescript
// INSERT — build values array in exact column order
export async function insertLead(input: CreateLeadInput): Promise<Lead> {
  const id = uuidv4();
  const now = new Date().toISOString();
  await appendRow('Leads', [id, input.name, input.phone, input.email, ...]);
  return rowToLead([id, input.name, ...]);
}

// FIND BY ID — getRows() → find → map
export async function findLeadById(id: string): Promise<Lead | null> {
  const rows = await getRows('Leads');
  const row = rows.find(r => r[0] === id);
  return row ? rowToLead(row) : null;
}

// UPDATE — fetch existing, merge, write full row back
export async function updateLead(id: string, updates: Partial<Lead>): Promise<Lead | null> {
  const rows = await getRows('Leads');
  const idx = rows.findIndex(r => r[0] === id);
  if (idx < 0) return null;
  const merged = { ...rowToLead(rows[idx]), ...updates, updatedAt: new Date().toISOString() };
  await updateRow('Leads', idx + 1, leadToRow(merged));
  return merged;
}
```

### Key Enums

```typescript
enum LeadStatus { NEW, QUALIFYING, QUALIFIED, NURTURING, CONVERTED, LOST }
enum LeadScore  { HOT, WARM, COLD, UNSCORED }
enum ConversationRole { USER = 'user', ASSISTANT = 'assistant', SYSTEM = 'system' }
```

### Environment Variables (Phase 1)

```env
GOOGLE_SHEETS_ID=your_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./credentials/service-account.json
```

---

## Phase 2 — Lead Capture + WhatsApp Messaging

### Lead Creation Flow

```
POST /api/leads
  → leadService.createLead()
      1. findLeadByPhone() → dedup check (return existing if found)
      2. insertLead()      → save to Sheets, status = NEW
      3. send hello_world template → opens WhatsApp session
      4. sleep(1000)       → wait for Meta to register session
      5. send free-form welcome text → personalised message delivered
      6. insertMessage()   → log outbound message to Conversations tab
      7. updateLead()      → status = QUALIFYING, responseTimeMs = elapsed
  ← returns Lead object
```

### Meta WhatsApp Cloud API — Critical Rules

**Rule 1: First outbound message MUST be an approved template.**
WhatsApp silently accepts free-form text via the API (returns 200 + message ID) but NEVER delivers it to the recipient. This is the most confusing bug — no error, just silent non-delivery.

**Rule 2: After the template is sent, you are in a 24-hour session window.**
Within that window you can send free-form text freely. The window resets each time the lead replies.

**Rule 3: Always use API version v25.0 (not v19.0).**
Older versions may accept calls but behave differently. Set `META_WHATSAPP_API_VERSION=v25.0`.

**The correct two-step first-contact sequence:**
```typescript
// Step 1: Send template to open the session
await whatsapp.send({ to: phone, message: '', useTemplate: true });

// Step 2: Wait 1 second for Meta to register the session
await sleep(1000);

// Step 3: Send the real personalised message
await whatsapp.send({ to: phone, message: welcomeText });
```

**API payloads:**
```typescript
// Template message (opens session)
{
  messaging_product: 'whatsapp',
  to: '+601124249650',
  type: 'template',
  template: { name: 'hello_world', language: { code: 'en_US' } }
}

// Free-form text (only after session is open)
{
  messaging_product: 'whatsapp',
  to: '+601124249650',
  type: 'text',
  text: { body: 'Hi Farhad! Thanks for your interest...' }
}

// Endpoint
POST https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/messages
Authorization: Bearer {ACCESS_TOKEN}
```

### Meta Setup Steps

1. **developers.facebook.com** → Create App → type: Business
2. Add **WhatsApp** product → Getting Started
3. Copy **Phone Number ID** and **temporary Access Token**
4. Under "To" → **Manage phone number list** → add your test number → verify via OTP
5. Click "Send message" to confirm it works from the console before testing from code

**Permanent token (avoids 24h expiry):**
1. **business.facebook.com** → Settings → System Users → Create
2. Add Assets → your app → Full Control
3. Generate Token → check `whatsapp_business_messaging` + `whatsapp_business_management`
4. Save — this token never expires

### Messaging Factory Pattern

```typescript
// MESSAGING_MODE=mock  → MockMessagingProvider (logs only, no real sends — use in tests)
// MESSAGING_MODE=live  → MetaWhatsAppProvider or EmailProvider
export function getMessagingProvider(channel: 'whatsapp' | 'email' | 'sms'): IMessagingProvider
```

### Inbound Webhook (receiving replies)

Requires a public URL. Use ngrok for dev (`npx ngrok http 3000`).

```typescript
// POST /api/webhooks/twilio  (Twilio sends form-encoded body)
// POST /api/webhooks/meta    (Meta sends JSON body)
const phone = req.body.From.replace(/^whatsapp:/i, '');
const lead  = await findLeadByPhone(phone);
if (lead) await insertMessage(lead.id, ConversationRole.USER, req.body.Body, 'whatsapp');
res.status(200).set('Content-Type', 'text/xml').send('<Response/>');

// Meta also requires a GET verification endpoint:
router.get('/meta', (req, res) => {
  if (req.query['hub.verify_token'] === process.env.META_VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else res.sendStatus(403);
});
```

### Environment Variables (Phase 2)

```env
MESSAGING_MODE=live
META_PHONE_NUMBER_ID=1093918583802324
META_ACCESS_TOKEN=EAAxxxxx...            # refresh every 24h or use permanent token
META_WHATSAPP_API_VERSION=v25.0          # always v25.0, never v19.0
META_WHATSAPP_TEMPLATE=hello_world       # used to open session before free-form text
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
EMAIL_FROM=leads@yourdomain.com
```

---

## Testing Strategy

- Use **Vitest** with real Google Sheets (no mocks for the DB layer — caught real bugs)
- Set `MESSAGING_MODE=mock` in tests — no real WhatsApp messages sent
- Unique test phones: `const TEST_PHONE = \`+1555TEST${Date.now()}\`.slice(0, 15)`
- Always clean up in `afterAll`:

```typescript
afterAll(async () => {
  const rows = await getRows('Leads');
  const idx = rows.findIndex(r => r[0] === testLeadId);
  if (idx > 0) await deleteRow('Leads', idx + 1);
});
```

- `beforeAll`: always call `setupSheets()` + `seedDemoReps()` — tests fail silently if tabs don't exist

---

## Issues Encountered and Definitive Fixes

### 1. WhatsApp message delivered but never received
**Symptom:** Meta API returns 200 + a valid message ID. No error in logs. Lead never gets the message.
**Cause:** Sent a free-form text message as the first outbound message to a new number.
**Fix:** Always send a template first to open the session, wait 1 second, then send free-form text.
```typescript
await whatsapp.send({ to, message: '', useTemplate: true });
await sleep(1000);
await whatsapp.send({ to, message: welcomeText });
```

### 2. Meta access token expires every 24 hours
**Symptom:** Messages stop being delivered overnight. API returns 401.
**Fix:** Generate a permanent System User token in Meta Business Manager (see setup steps above). Never use the temporary token from the API Setup page in production.

### 3. Wrong API version (v19.0)
**Symptom:** API calls succeed but behaviour is inconsistent.
**Fix:** Always use `v25.0`. Set `META_WHATSAPP_API_VERSION=v25.0` in `.env`.

### 4. Recipient not in allowed list (#131030)
**Symptom:** `(#131030) Recipient phone number not in allowed list`
**Cause:** With a test phone number, Meta only delivers to numbers you have explicitly whitelisted.
**Fix:** In the Meta developer console → WhatsApp → API Setup → Manage phone number list → add the number → verify via OTP.

### 5. Port 3000 EADDRINUSE after crash
**Symptom:** `Error: listen EADDRINUSE: address already in use :::3000`
**Fix on Windows:**
```powershell
powershell -Command "Get-Process -Name node | Stop-Process -Force"
```
Then restart the server.

### 6. Old server serving stale code
**Symptom:** Code changes have no effect, server returns old responses.
**Cause:** A previous node process is still listening on port 3000. The new process crashes silently with EADDRINUSE.
**Fix:** Always kill all node processes before starting a new server session (use command above). Check with `netstat -ano | findstr ":3000"`.

### 7. Dedup returning old lead, no new WhatsApp sent
**Symptom:** Resubmitting the same phone number returns an existing lead without sending a message.
**Cause:** `createLead()` correctly deduplicates. This is intentional — same phone = same lead.
**Fix for testing:** Delete the test lead row from Sheets before resubmitting. Use the cleanup script:
```typescript
// scripts/cleanup.ts
const rows = await getRows('Leads');
const idx = rows.findIndex(r => r[2] === '+601124249650');
if (idx > 0) await deleteRow('Leads', idx + 1);
```

### 8. updateRow needs full row, not just changed fields
**Symptom:** Partial update wipes other columns (they become empty strings).
**Cause:** Google Sheets `update` replaces the entire row range.
**Fix:** Always fetch the existing row first, merge changes, then write the full row back.
```typescript
const existing = rowToLead(rows[idx]);
const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
await updateRow('Leads', idx + 1, leadToRow(merged));
```

### 9. seedDemoReps() not called in tests
**Symptom:** `repRepository > returns seeded demo reps` fails with "expected 0 to be greater than 0".
**Cause:** `seedDemoReps()` is called in `index.ts` `start()` but not in the test `beforeAll`.
**Fix:** Call both in the test `beforeAll`:
```typescript
beforeAll(async () => {
  await setupSheets();
  await seedDemoReps();
});
```

### 10. tsx -e produces no output on Windows
**Symptom:** Running `npx tsx -e "console.log('hello')"` shows nothing.
**Fix:** Write the script to a `.ts` file and run it with `npx tsx scripts/myscript.ts` instead.

---

## Key Gotchas Summary

| # | Issue | Fix |
|---|-------|-----|
| 1 | Free-form text silently not delivered | Send template first, sleep(1000), then text |
| 2 | Token expires every 24h | Use permanent System User token |
| 3 | Wrong API version | Always use v25.0 |
| 4 | Recipient not in allowed list | Add number in Meta console + verify OTP |
| 5 | Port 3000 stuck | `powershell "Get-Process node | Stop-Process -Force"` |
| 6 | Stale server serving old code | Kill all node before restarting |
| 7 | Dedup blocks test resend | Delete test lead row before resubmitting |
| 8 | updateRow wipes columns | Merge full row before writing |
| 9 | seedDemoReps not in test | Add to `beforeAll` in test file |
| 10 | tsx -e no output on Windows | Use a `.ts` file instead of inline -e |
