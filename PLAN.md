# Speed to Lead Automation System — Implementation Plan

## Context

Build a production-grade "Speed to Lead" automation system that contacts inbound leads within seconds, qualifies them via AI-driven WhatsApp conversation, routes them to sales reps, and automates follow-ups. Designed for real business use.

## Tech Choices

| Concern | Choice | Why |
|---------|--------|-----|
| Runtime | Node.js + Express (TypeScript) | Best ecosystem for webhooks/APIs |
| Database | Google Sheets (Service Account) | Shareable with team, visible in real-time, no DB setup |
| AI | Google Gemini (pluggable interface) | Default; generic `IAIProvider` supports Claude/OpenAI swap via env var |
| WhatsApp | Twilio WhatsApp API | Industry standard, free sandbox |
| Email | Nodemailer (SMTP) | Works locally with Ethereal test inbox — no account needed |
| Scheduler | `node-cron` + in-memory `setTimeout` | Cron for persistence/recovery, setTimeout for short-delay accuracy |

## Google Sheets as Database

- One Google Sheet with 5 tabs (worksheets) acting as tables
- Service Account authenticates via JSON key file — no user login needed
- Share the sheet with whoever needs access — they see leads appear in real-time
- Uses `googleapis` npm package (official Google APIs client)
- Messaging fires before DB write on the critical path (Sheets has ~100ms latency)

**Sheet tabs:** Leads, Conversations, SalesReps, FollowUps, Events

## Project Structure

```
SpeedToAddLeadDemo/
├── public/
│   └── index.html                   # Test form (simulates lead ad)
├── src/
│   ├── index.ts                     # Express server entry
│   ├── config.ts                    # Env-based typed config
│   ├── types.ts                     # Shared interfaces/enums
│   ├── sheets/
│   │   ├── sheetsClient.ts          # Google Sheets API client (Service Account auth)
│   │   ├── sheetsSetup.ts           # Creates tabs + headers if missing
│   │   └── repositories/
│   │       ├── leadRepository.ts
│   │       ├── conversationRepository.ts
│   │       ├── repRepository.ts
│   │       └── followUpRepository.ts
│   ├── routes/
│   │   ├── leadRoutes.ts            # POST /api/leads, GET /api/leads
│   │   ├── webhookRoutes.ts         # POST /api/webhooks/twilio (inbound WhatsApp)
│   │   ├── analyticsRoutes.ts       # GET /api/analytics/*
│   │   └── bookingRoutes.ts         # GET /api/booking/:leadId
│   ├── services/
│   │   ├── leadService.ts           # Lead creation orchestrator
│   │   ├── qualificationService.ts  # AI conversation + scoring
│   │   ├── routingService.ts        # Hot/Warm/Cold routing + round-robin
│   │   ├── alertService.ts          # Hot-lead notifications
│   │   ├── bookingService.ts        # Time-slot generation
│   │   ├── followUpService.ts       # Schedule & execute follow-ups
│   │   └── analyticsService.ts      # Stats queries
│   ├── messaging/
│   │   ├── messagingProvider.ts     # IMessagingProvider interface
│   │   ├── whatsappProvider.ts      # Twilio implementation
│   │   ├── emailProvider.ts         # Nodemailer implementation
│   │   ├── mockMessagingProvider.ts # Console-log mock for local dev
│   │   └── messagingFactory.ts      # Factory from config
│   ├── ai/
│   │   ├── aiProvider.ts            # IAIProvider interface
│   │   ├── geminiProvider.ts        # @google/genai implementation
│   │   ├── claudeProvider.ts        # Stub for future
│   │   ├── openaiProvider.ts        # Stub for future
│   │   ├── mockAIProvider.ts        # Deterministic mock
│   │   ├── aiFactory.ts             # Factory reads AI_PROVIDER env
│   │   └── prompts.ts              # Qualification system prompt
│   ├── scheduler/
│   │   ├── followUpScheduler.ts     # node-cron sweep every 60s
│   │   └── jobs.ts                  # Job definitions
│   ├── middleware/
│   │   ├── errorHandler.ts
│   │   ├── logger.ts               # Request logging
│   │   └── twilioValidator.ts       # Webhook signature check
│   └── utils/
│       ├── logger.ts               # Winston logger
│       └── helpers.ts
├── credentials/                     # Service account key (gitignored)
├── .env.example
├── .gitignore
├── tsconfig.json
├── nodemon.json
└── package.json
```

## Key Interfaces

### IAIProvider (pluggable AI — strategy pattern)

```typescript
interface IAIProvider {
  readonly name: string;
  complete(prompt: string, options?: AICompletionOptions): Promise<string>;
  chat(messages: ChatMessage[], options?: AICompletionOptions): Promise<string>;
  completeJSON<T>(prompt: string, schema: object, options?: AICompletionOptions): Promise<T>;
}
```

Factory reads `AI_PROVIDER` env var (`gemini | openai | claude | mock`).

### IMessagingProvider

```typescript
interface IMessagingProvider {
  readonly channel: 'whatsapp' | 'email' | 'sms';
  send(options: SendMessageOptions): Promise<SendMessageResult>;
}
```

Factory reads `MESSAGING_MODE` env var (`live | mock`).

## Core Workflow

```
Lead submits form ──► POST /api/leads
                          │
                          ├─► Send WhatsApp greeting (Twilio)  ◄── instant, before DB write
                          ├─► Send Email greeting (Nodemailer)
                          ├─► Save lead to Sheets (status: QUALIFYING)
                          │
User replies on WhatsApp ──► POST /api/webhooks/twilio
                                  │
                                  ├─► Look up lead by phone (Sheets)
                                  ├─► Load conversation history (Sheets)
                                  ├─► Send history to AI (Gemini)
                                  ├─► AI asks next question OR outputs score
                                  ├─► Send AI response via WhatsApp
                                  │
                          (after 3-5 exchanges)
                                  │
                                  ├─► AI outputs ###QUALIFICATION_COMPLETE### + JSON
                                  ├─► Parse score: Hot / Warm / Cold
                                  │
                          ┌───────┴───────────────┐
                          │                       │
                     HOT lead               WARM/COLD lead
                          │                       │
                   ├─ Round-robin assign    ├─ Schedule nurture
                   ├─ Alert sales rep       │   sequence
                   ├─ Send booking link     ├─ Follow-ups:
                   └─ Log event             │   5min, 1hr, 24hr
                                            └─ Log event
```

## WhatsApp Async Conversation Design

Twilio inbound WhatsApp → our webhook. We reply via REST API (not TwiML) because:
- We need time to call the AI before responding
- Decouples inbound from outbound
- More control over timing

The webhook returns empty `<Response/>` TwiML and sends the reply separately via `client.messages.create()`.

## Google Sheets Schema

### Leads tab (columns A-N)
| id | name | phone | email | serviceInterest | score | status | assignedRepId | source | responseTimeMs | createdAt | updatedAt | qualifiedAt | notes |

### Conversations tab (columns A-F)
| id | leadId | role | content | channel | createdAt |

### SalesReps tab (columns A-F)
| id | name | email | phone | isActive | currentLeadCount |

### FollowUps tab (columns A-G)
| id | leadId | type | scheduledAt | executedAt | channel | message |

### Events tab (columns A-E)
| id | leadId | eventType | metadata | createdAt |

## Implementation Order (6 phases)

### Phase 1: Foundation
1. **Project scaffolding** — npm init, install deps, tsconfig, nodemon, .gitignore, .env.example
2. **Config + Logger** — `config.ts` (typed env), `utils/logger.ts` (Winston)
3. **Google Sheets layer** — `sheetsClient.ts` (Service Account auth), `sheetsSetup.ts` (create tabs + headers), all 4 repositories
4. **Express skeleton** — server, middleware, route mounting, error handler

**Phase 1 Test:**
- `npm run dev` starts on port 3000 without errors
- `GET /` returns a health check response
- On startup, Google Sheet has all 5 tabs with correct headers
- Vitest: verify Sheets connection, repository CRUD (insert lead, read it back, update it)
- Open Google Sheet in browser — confirm tabs and headers exist

### Phase 2: Lead Capture + Messaging
5. **Messaging providers** — interface, mock, WhatsApp (Twilio), Email (Nodemailer), factory
6. **Lead capture + test form** — `POST /api/leads`, `leadService.createLead()`, `public/index.html`
7. **Twilio webhook** — `POST /api/webhooks/twilio`, parse inbound, store message

**Phase 2 Test:**
- Open `http://localhost:3000` — test form renders
- Submit form — console shows mock WhatsApp + email logs
- `GET /api/leads` returns lead with status `QUALIFYING`
- Google Sheet — new row in Leads tab
- `curl POST /api/webhooks/twilio` — message stored in Conversations tab
- Vitest: leadService.createLead() saves + fires messaging, webhook stores messages

### Phase 3: AI Qualification
8. **AI providers** — interface, mock, Gemini (`@google/genai`), factory, prompts.ts
9. **Qualification service** — `startQualification()`, `processReply()`, `finalize()`
10. **Wire webhook → qualification** — connect inbound WhatsApp to qualification flow

**Phase 3 Test:**
- Submit lead, then 4-5 curl webhooks simulating replies
- Mock AI asks canned questions, scores as WARM
- Conversations tab has full history
- Leads tab shows: NEW → QUALIFYING → QUALIFIED, score set
- Vitest: MockAIProvider responses, qualification flow, finalize() sets score
- Optional: test with `AI_PROVIDER=gemini` if key is set

### Phase 4: Routing + Alerts + Booking
11. **Routing service** — Hot/Warm/Cold logic, round-robin, seed demo reps
12. **Alert service** — Console log + optional Slack webhook
13. **Booking service** — Time slots, booking link via WhatsApp

**Phase 4 Test:**
- HOT lead → assignedRepId set, console alert
- WARM lead → NURTURING status, follow-ups in FollowUps tab
- 3 leads → assigned to different reps (round-robin)
- `GET /api/booking/:leadId` returns time slots
- Vitest: routing per score, round-robin distribution, booking slot generation

### Phase 5: Follow-Ups + Analytics
14. **Follow-up scheduler** — node-cron + setTimeout, nurture sequences
15. **Analytics endpoints** — response time, conversion, sources, rep stats

**Phase 5 Test:**
- WARM lead → 3 follow-up records in FollowUps tab
- After 5+ min → follow-up executed, mock message sent
- Analytics endpoints return valid data
- Vitest: followUpService records, scheduler execution, analytics query shapes

### Phase 6: Polish
16. **Error handling** — rate limiting, duplicate leads, conversation timeout (24hr → COLD)
17. **End-to-end test** — Full flow with mock providers: form → qualification → routing → follow-ups → analytics
18. **README** — Setup, architecture, API reference, testing guide

## Environment Config (.env.example)

```
PORT=3000
NODE_ENV=development
AI_PROVIDER=mock
GEMINI_API_KEY=
GOOGLE_SHEETS_ID=your-spreadsheet-id-here
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./credentials/service-account.json
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=leads@speedtolead.demo
MESSAGING_MODE=mock
ALERT_WEBHOOK_URL=
```

## Google Sheets Setup (one-time, before coding)

1. Google Cloud Console → create/use project → enable Google Sheets API
2. Create Service Account → download JSON key file
3. Save as `credentials/service-account.json` (gitignored)
4. Create a Google Sheet → copy Sheet ID from URL
5. Share sheet with service account email
6. Set `GOOGLE_SHEETS_ID` and `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` in `.env`

## NPM Packages

**Runtime**: express, googleapis, @google/genai, twilio, nodemailer, node-cron, uuid, dotenv, cors, helmet, winston, express-rate-limit
**Dev**: typescript, tsx, nodemon, vitest, @types/*

## Advanced Features (TODO — after core)

- Lead enrichment (company, income lookup)
- Voice AI calls within 60 seconds
- Predictive lead scoring (ML)
- Multi-language automation
- A/B testing response messages
- Real Facebook/Google Lead Ads integration (consider n8n as trigger layer)
- Frontend dashboard (React)
