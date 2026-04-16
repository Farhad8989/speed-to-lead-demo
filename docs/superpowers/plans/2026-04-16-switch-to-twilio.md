# Switch to Twilio WhatsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Meta WhatsApp Cloud API with Twilio sandbox for instant, template-free WhatsApp messaging during demo/testing.

**Architecture:** Switch the active messaging provider from `MetaWhatsAppProvider` to the existing `WhatsAppProvider` (Twilio) by adding a `messaging.provider` config key. Simplify `leadService` to send one free-form welcome message (no template dance). Wire the Twilio webhook handler to reply via TwiML so AI responses flow back to the user.

**Tech Stack:** Twilio Node SDK (`twilio`), Express TwiML response, OpenRouter AI, existing `WhatsAppProvider` class.

---

### Task 1: Add `messaging.provider` to config

**Files:**
- Modify: `src/config.ts`
- Modify: `.env`

- [ ] **Step 1: Update `src/config.ts` messaging block**

Replace the existing `messaging` block:
```typescript
messaging: {
  mode: optionalEnv('MESSAGING_MODE', 'mock') as 'live' | 'mock',
  provider: optionalEnv('MESSAGING_PROVIDER', 'twilio') as 'twilio' | 'meta',
},
```

- [ ] **Step 2: Update `.env`**

Add/update these lines:
```
MESSAGING_MODE=live
MESSAGING_PROVIDER=twilio
```

---

### Task 2: Route messagingFactory to Twilio

**Files:**
- Modify: `src/messaging/messagingFactory.ts`

- [ ] **Step 1: Update factory to use WhatsAppProvider for Twilio**

Replace the full contents of `src/messaging/messagingFactory.ts`:
```typescript
import { IMessagingProvider } from './messagingProvider';
import { MockMessagingProvider } from './mockMessagingProvider';
import { MetaWhatsAppProvider } from './metaWhatsappProvider';
import { WhatsAppProvider } from './whatsappProvider';
import { EmailProvider } from './emailProvider';
import { config } from '../config';

export function getMessagingProvider(
  channel: 'whatsapp' | 'email' | 'sms' = 'whatsapp'
): IMessagingProvider {
  if (config.messaging.mode === 'mock') {
    return new MockMessagingProvider(channel);
  }

  switch (channel) {
    case 'whatsapp':
      return config.messaging.provider === 'twilio'
        ? new WhatsAppProvider()
        : new MetaWhatsAppProvider();
    case 'email':
      return new EmailProvider();
    default:
      return new MockMessagingProvider(channel);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

---

### Task 3: Simplify leadService — remove template dance

**Files:**
- Modify: `src/services/leadService.ts`

Twilio sandbox allows free-form messages immediately — no `hello_world` template or sleep needed.

- [ ] **Step 1: Remove template-specific imports and simplify `createLead`**

Replace the full contents of `src/services/leadService.ts`:
```typescript
import { insertLead, findLeadByPhone, updateLead } from '../sheets/repositories/leadRepository';
import { insertMessage } from '../sheets/repositories/conversationRepository';
import { getMessagingProvider } from '../messaging/messagingFactory';
import { CreateLeadInput, LeadStatus, ConversationRole } from '../types';
import { logger } from '../utils/logger';

const SERVICE_OPTIONS: Record<string, string> = {
  'Web Development':
    `What do you need built?\n` +
    `1️⃣ New website from scratch\n` +
    `2️⃣ Redesign existing site\n` +
    `3️⃣ Custom web application\n` +
    `4️⃣ Ask your own question`,

  'Mobile App':
    `What are you looking to build?\n` +
    `1️⃣ iOS app\n` +
    `2️⃣ Android app\n` +
    `3️⃣ Both iOS & Android\n` +
    `4️⃣ Ask your own question`,

  'Digital Marketing':
    `What's your main focus?\n` +
    `1️⃣ Paid ads (Google / Meta)\n` +
    `2️⃣ Social media marketing\n` +
    `3️⃣ Email campaigns\n` +
    `4️⃣ Ask your own question`,

  'SEO':
    `Which best describes your goal?\n` +
    `1️⃣ Rank higher on Google\n` +
    `2️⃣ Drive more organic traffic\n` +
    `3️⃣ Local SEO / Google Maps\n` +
    `4️⃣ Ask your own question`,

  'Consulting':
    `What kind of support do you need?\n` +
    `1️⃣ Business strategy\n` +
    `2️⃣ Operations improvement\n` +
    `3️⃣ Digital transformation\n` +
    `4️⃣ Ask your own question`,
};

const DEFAULT_OPTIONS = (service: string) =>
  `What aspect of ${service} interests you most?\n` +
  `1️⃣ Getting started\n` +
  `2️⃣ Pricing & packages\n` +
  `3️⃣ Talk to an expert\n` +
  `4️⃣ Ask your own question`;

const WELCOME_MESSAGE = (name: string, service: string) => {
  const options = SERVICE_OPTIONS[service] ?? DEFAULT_OPTIONS(service);
  return `Hi ${name}! Thanks for your interest in ${service}.\n\n${options}\n\nReply with the number of your choice to get started! 🚀`;
};

export async function createLead(input: CreateLeadInput) {
  const start = Date.now();

  // Deduplicate by phone
  const existing = await findLeadByPhone(input.phone);
  if (existing) {
    logger.info(`Lead already exists for phone ${input.phone}`, { leadId: existing.id });
    return existing;
  }

  const lead = await insertLead(input);
  logger.info(`Lead created`, { leadId: lead.id, phone: lead.phone });

  const whatsapp = getMessagingProvider('whatsapp');
  const welcomeText = WELCOME_MESSAGE(lead.name, lead.serviceInterest);

  const result = await whatsapp.send({ to: lead.phone, message: welcomeText });

  if (result.success) {
    await insertMessage(lead.id, ConversationRole.ASSISTANT, welcomeText, 'whatsapp');
    logger.info(`Welcome message sent to lead ${lead.id}`);
  } else {
    logger.warn(`Welcome message failed for lead ${lead.id}`);
    await insertMessage(lead.id, ConversationRole.ASSISTANT, welcomeText, 'whatsapp');
  }

  const responseTimeMs = Date.now() - start;
  const updated = await updateLead(lead.id, {
    status: LeadStatus.QUALIFYING,
    responseTimeMs,
  });

  logger.info(`Lead moved to QUALIFYING in ${responseTimeMs}ms`, { leadId: lead.id });

  return updated ?? lead;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

---

### Task 4: Add AI reply to Twilio webhook handler

**Files:**
- Modify: `src/routes/webhookRoutes.ts`

The Twilio handler currently stores inbound messages but never replies. We use a TwiML `<Message>` response — Twilio delivers it as a WhatsApp reply without a separate API call.

- [ ] **Step 1: Replace the Twilio webhook POST handler**

Replace the full contents of `src/routes/webhookRoutes.ts`:
```typescript
import { Router, Request, Response } from 'express';
import { findLeadByPhone } from '../sheets/repositories/leadRepository';
import { getConversationByLeadId, insertMessage } from '../sheets/repositories/conversationRepository';
import { getMessagingProvider } from '../messaging/messagingFactory';
import { getAIProvider } from '../ai/aiFactory';
import { ConversationRole } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';
import { QUALIFICATION_SYSTEM_PROMPT } from '../ai/prompts';

const router = Router();

// ── Meta WhatsApp Cloud API webhook ──────────────────────────────────────────

router.get('/meta', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.meta.webhookVerifyToken) {
    logger.info('[META WEBHOOK] Verified');
    res.status(200).send(challenge);
  } else {
    logger.warn('[META WEBHOOK] Verification failed');
    res.sendStatus(403);
  }
});

router.post('/meta', async (req: Request, res: Response) => {
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages?.length) return;

    for (const msg of messages) {
      const phone = `+${msg.from}`;
      const text: string = msg.text?.body ?? msg.type ?? '';

      logger.info(`[META WEBHOOK] Inbound message from ${phone}`, { text });

      const lead = await findLeadByPhone(phone);
      if (!lead) {
        logger.warn(`[META WEBHOOK] No lead found for ${phone}`);
        continue;
      }

      await insertMessage(lead.id, ConversationRole.USER, text, 'whatsapp');

      const history = await getConversationByLeadId(lead.id);
      const chatMessages = [
        {
          role: 'system' as const,
          content:
            `${QUALIFICATION_SYSTEM_PROMPT}\n\n` +
            `Lead name: ${lead.name}\n` +
            `Service interest: ${lead.serviceInterest}\n` +
            `Keep replies concise and friendly, under 150 words. ` +
            `If the user picks a numbered option (1-3), acknowledge it and ask a relevant follow-up. ` +
            `If they pick 4 or ask a free-form question, answer it helpfully as a sales expert for ${lead.serviceInterest}.`,
        },
        ...history.map(m => ({
          role: m.role === ConversationRole.USER ? 'user' as const : 'assistant' as const,
          content: m.content,
        })),
      ];

      const ai = getAIProvider();
      const aiReply = await ai.chat(chatMessages);

      const replyText = aiReply.includes('###QUALIFICATION_COMPLETE###')
        ? `Thanks ${lead.name}! Based on our chat, one of our specialists will be in touch with you shortly. 🚀`
        : aiReply;

      const whatsapp = getMessagingProvider('whatsapp');
      const result = await whatsapp.send({ to: phone, message: replyText });

      if (result.success) {
        await insertMessage(lead.id, ConversationRole.ASSISTANT, replyText, 'whatsapp');
        logger.info(`[META WEBHOOK] AI reply sent to lead ${lead.id}`);
      } else {
        logger.warn(`[META WEBHOOK] Failed to send AI reply to lead ${lead.id}`);
      }
    }
  } catch (err) {
    logger.error('[META WEBHOOK] Error processing inbound message', { error: err });
  }
});

// ── Twilio webhook ────────────────────────────────────────────────────────────

router.post('/twilio', async (req: Request, res: Response) => {
  const from: string = req.body?.From ?? '';   // e.g. "whatsapp:+601124249650"
  const body: string = req.body?.Body ?? '';
  const phone = from.replace(/^whatsapp:/i, '');

  logger.info(`[TWILIO WEBHOOK] Inbound WhatsApp from ${phone}`, { body });

  // Default empty TwiML — overwritten if we have a reply
  let replyText = '';

  try {
    if (phone && body) {
      const lead = await findLeadByPhone(phone);
      if (!lead) {
        logger.warn(`[TWILIO WEBHOOK] No lead found for ${phone}`);
      } else {
        await insertMessage(lead.id, ConversationRole.USER, body, 'whatsapp');

        const history = await getConversationByLeadId(lead.id);
        const chatMessages = [
          {
            role: 'system' as const,
            content:
              `${QUALIFICATION_SYSTEM_PROMPT}\n\n` +
              `Lead name: ${lead.name}\n` +
              `Service interest: ${lead.serviceInterest}\n` +
              `Keep replies concise and friendly, under 150 words. ` +
              `If the user picks a numbered option (1-3), acknowledge it and ask a relevant follow-up. ` +
              `If they pick 4 or ask a free-form question, answer it helpfully as a sales expert for ${lead.serviceInterest}.`,
          },
          ...history.map(m => ({
            role: m.role === ConversationRole.USER ? 'user' as const : 'assistant' as const,
            content: m.content,
          })),
        ];

        const ai = getAIProvider();
        const aiReply = await ai.chat(chatMessages);

        replyText = aiReply.includes('###QUALIFICATION_COMPLETE###')
          ? `Thanks ${lead.name}! Based on our chat, one of our specialists will be in touch with you shortly. 🚀`
          : aiReply;

        await insertMessage(lead.id, ConversationRole.ASSISTANT, replyText, 'whatsapp');
        logger.info(`[TWILIO WEBHOOK] AI reply stored for lead ${lead.id}`);
      }
    }
  } catch (err) {
    logger.error('[TWILIO WEBHOOK] Error processing inbound message', { error: err });
  }

  // Respond with TwiML — Twilio delivers this as the WhatsApp reply
  const twiml = replyText
    ? `<Response><Message>${replyText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Message></Response>`
    : `<Response/>`;

  res.status(200).set('Content-Type', 'text/xml').send(twiml);
});

export default router;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

---

### Task 5: Wire ngrok for Twilio webhook + verify sandbox join

**No code changes — setup steps.**

- [ ] **Step 1: Ensure your phone has joined the Twilio sandbox**

Send from your WhatsApp to `+1 415 523 8886`:
```
join <your-sandbox-word>
```
Find the exact word in Twilio Console → Messaging → Try it out → Send a WhatsApp message.

- [ ] **Step 2: Start the server**

```bash
npx nodemon
```

- [ ] **Step 3: Start ngrok**

```bash
ngrok http 3000
```

Copy the `https://xxxx.ngrok-free.app` URL.

- [ ] **Step 4: Configure Twilio sandbox webhook**

In Twilio Console → Messaging → Try it out → Send a WhatsApp message:
- Set **"When a message comes in"** to: `https://xxxx.ngrok-free.app/api/webhooks/twilio`
- Method: `HTTP POST`
- Save

- [ ] **Step 5: Submit a new lead via the form**

Open `http://localhost:3000`, fill in your phone number and select a service, submit.

Expected: You receive a WhatsApp welcome message within a few seconds.

- [ ] **Step 6: Reply to the WhatsApp message**

Send any reply (e.g. `1` or `Tell me about pricing`).

Expected: AI reply arrives in WhatsApp within ~5 seconds.
