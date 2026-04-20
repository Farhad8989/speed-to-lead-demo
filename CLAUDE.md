# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start with nodemon (tsx, watches src/, ignores tests)
npm run build      # tsc compile to dist/
npm test           # vitest run (all tests, requires .env with real Sheets creds)
npm run test:watch # vitest watch mode

# Run a single test file
npx vitest run src/__tests__/fixes.test.ts

# Run tests matching a pattern
npx vitest run --reporter=verbose -t "Fix 1"
```

**Local dev:** copy `.env.example` to `.env`. Set `MESSAGING_MODE=mock` and `AI_PROVIDER=mock` to run without live API calls. For Sheets, either set `GOOGLE_SERVICE_ACCOUNT_JSON` (inline JSON, single-line) or point `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` at a credentials file.

**Type-check without building:**
```bash
npx tsc --noEmit
```

## Architecture

### Request flow (inbound WhatsApp message)

```
POST /api/webhooks/twilio  (or /meta)
  → findLeadByPhone()              — look up lead in Sheets
  → processReply(lead, text)       — insert user msg, build history, call AI
      → if ###QUALIFICATION_COMPLETE### in reply:
          finalize(lead, result)   — write score + QUALIFIED to Sheets
          routeLead(qualified)     — assign rep / schedule nurture, return { lead, userMessage }
      → reply with userMessage (single send — routing service never sends directly)
  → insertMessage(ASSISTANT, reply)  — persist to Conversations sheet
  → return TwiML / 200
```

### Provider pattern

Both AI and messaging use a factory + interface pattern so implementations are swappable:

- **`src/ai/aiFactory.ts`** — singleton; returns `IAIProvider` based on `AI_PROVIDER` env var (`gemini` | `openrouter` | `mock`)
- **`src/messaging/messagingFactory.ts`** — returns `IMessagingProvider` based on `MESSAGING_MODE` (`live` | `mock`) and `MESSAGING_PROVIDER` (`twilio` | `meta`). In tests, mock this module entirely.

When `MESSAGING_MODE=mock`, all sends are no-ops that return `{ success: true }`.

### Google Sheets as database

All persistence goes through `src/sheets/sheetsClient.ts` which exposes `appendRow`, `getRows`, `updateRow`, `clearTabData`, `deleteRow`. Repositories in `src/sheets/repositories/` wrap these with typed read/write logic.

**Column layout is positional** — adding a new field means appending a new column index to both `rowToX()` and `xToRow()` in the relevant repository. Current Leads columns: 0–13 (core fields), 14 (`bookingToken`), 15 (`bookingTokenUsed`).

`sheetsSetup.ts` creates missing tabs and writes headers idempotently on every startup.

**Critical:** `GOOGLE_SERVICE_ACCOUNT_JSON` must be a single-line JSON string with `\n` escape sequences in the private key — not literal newlines. Literal newlines cause `JSON.parse` to crash at startup.

### Gemini conversation constraint

Gemini's `generateContent` requires `contents` to start with a `user` turn. The welcome message is stored as `assistant` in Conversations, so the first inbound reply would produce a model-first history — Gemini returns `response.text = ''` silently (no exception). `GeminiProvider.chat()` strips any leading `model` turns before calling the API to prevent this. If AI replies go silent with no error logged, this is the first thing to check.

### Qualification flow

`processReply()` in `src/services/qualificationService.ts`:
1. Saves user message to Conversations sheet
2. Loads full history + builds system prompt (service-specific knowledge base from `knowledge/`)
3. Calls AI; if response contains `###QUALIFICATION_COMPLETE###`, strips that block from `replyText` before returning — the marker/JSON must never be stored in history or sent to the user
4. On JSON parse failure, falls back to `WARM` score rather than surfacing raw JSON

### Routing

`routeLead()` in `src/services/routingService.ts` returns `{ lead: Lead; userMessage: string }` — it does **not** send WhatsApp directly. The webhook layer sends exactly one message using `userMessage`. Scoring outcomes:
- **HOT** → round-robin rep assignment, `alertHotLead()` email, booking token URL in message
- **WARM** → status → NURTURING, nurture sequence scheduled (5 min / 1 hr / 24 hr), booking token URL in message
- **COLD** → status → LOST, graceful exit message, no booking URL

### Booking tokens

When a HOT or WARM lead is routed, a UUID token is generated and saved to `lead.bookingToken`. The WhatsApp message contains `{APP_BASE_URL}/api/book/{token}`. The `GET /api/book/:token` route (in `src/routes/bookTokenRoutes.ts`) validates the token, marks it used, and 302-redirects to the assigned rep's Calendly link. Returns 404 (unknown) or 410 (already used).

### Cron / follow-ups

`node-cron` runs `executePendingFollowUps()` every 5 minutes in production. Follow-ups are rows in the `FollowUps` sheet with a `scheduledAt` timestamp; the job sends any that are past-due and marks them executed. On Render free tier, the cron only runs while the instance is awake.

## Testing

Tests use **real Google Sheets** (no Sheets mocking) and mock AI + messaging:

```typescript
vi.mock('../ai/aiFactory', () => ({ getAIProvider: () => new MockAIProvider() }));
vi.mock('../messaging/messagingFactory', () => ({ getMessagingProvider: () => new MockMessagingProvider() }));
```

`MockAIProvider` (in `src/ai/mockAIProvider.ts`) returns canned questions for the first 3 user messages, then emits `###QUALIFICATION_COMPLETE###` on the 4th.

Each test file creates leads with unique phone numbers and deletes all created rows in `afterAll`. HTTP-level tests for booking routes use **supertest** with an inline Express app (no need to start the full server).

Test files:
- `phase1.test.ts` — Sheets CRUD, repo layer
- `phase2.test.ts` — Lead creation flow
- `phase3-4.test.ts` — Full E2E: multi-turn AI qualification → finalize → route
- `fixes.test.ts` — Targeted tests for the 4 bug fixes (AI stripping, single-message, email alert, booking tokens)

## Deployment (Render)

Deployed at `https://speed-to-lead-demo.onrender.com` (free tier — cold starts after 15 min idle).

- **Logs API:** `GET https://api.render.com/v1/logs?ownerId=tea-d4jgbea4d50c73cl6gn0&resource=srv-d7gelfdckfvc73b5q60g&limit=50&direction=desc`
- **Reset demo data:** `POST /api/debug/reset` — clears all tabs, reseeds 3 demo reps
- **Debug AI:** `GET /api/debug/ai` — fires a live AI ping and returns the response

To re-push env vars via Render API, always serialize `GOOGLE_SERVICE_ACCOUNT_JSON` with `JSON.stringify()` first.
