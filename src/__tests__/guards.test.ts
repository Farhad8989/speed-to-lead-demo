/**
 * Tests for Phase 2 guards:
 *   - Spam guard middleware (debounce + rate limit)
 *   - Status guard (skip AI for QUALIFIED/LOST leads)
 *   - Duplicate phone → 409 from POST /api/leads
 *
 * AI and messaging are mocked. Sheets are real.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';
dotenv.config();

vi.mock('../middleware/twilioValidator', () => ({
  twilioValidator: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../middleware/twilioIdempotency', () => ({
  twilioIdempotency: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../ai/aiFactory', () => ({
  getAIProvider: () => ({
    name: 'mock',
    chat: vi.fn().mockResolvedValue('Mock AI reply'),
    complete: vi.fn().mockResolvedValue('ok'),
    completeJSON: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock('../messaging/messagingFactory', () => ({
  getMessagingProvider: () => ({
    channel: 'whatsapp',
    send: vi.fn().mockResolvedValue({ messageId: 'mock-id', success: true }),
  }),
}));

import express from 'express';
import request from 'supertest';
import { spamGuard } from '../middleware/spamGuard';
import webhookRoutes from '../routes/webhookRoutes';
import leadRoutes from '../routes/leadRoutes';
import { setupSheets } from '../sheets/sheetsSetup';
import { seedDemoReps } from '../sheets/repositories/repRepository';
import { insertLead, updateLead } from '../sheets/repositories/leadRepository';
import { getRows, deleteRows } from '../sheets/sheetsClient';
import { LeadStatus } from '../types';

const createdLeadIds: string[] = [];

beforeAll(async () => {
  await setupSheets();
  await seedDemoReps();
}, 30_000);

afterAll(async () => {
  if (!createdLeadIds.length) return;
  const idSet = new Set(createdLeadIds);
  const [leadRows, convRows] = await Promise.all([getRows('Leads'), getRows('Conversations')]);
  const leadIdxs = leadRows.map((_, i) => i + 1).filter((_, i) => idSet.has(leadRows[i]?.[0]));
  const convIdxs = convRows.map((_, i) => i + 1).filter((_, i) => idSet.has(convRows[i]?.[1]));
  await deleteRows('Leads', leadIdxs);
  await deleteRows('Conversations', convIdxs);
}, 60_000);

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSpamApp() {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  // Minimal handler after spamGuard — returns a message so we can tell it passed through
  app.post('/test', spamGuard, (_req, res) => {
    res.status(200).set('Content-Type', 'text/xml').send('<Response><Message>OK</Message></Response>');
  });
  return app;
}

function makeWebhookApp() {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use('/api/webhooks', webhookRoutes);
  return app;
}

function makeLeadsApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/leads', leadRoutes);
  return app;
}

// ── Spam guard ─────────────────────────────────────────────────────────────────

describe('Spam guard — debounce + rate limit', () => {
  it('allows first message from a new phone', async () => {
    const phone = `+1555SGA${Date.now()}`.slice(0, 15);
    const res = await request(makeSpamApp())
      .post('/test')
      .type('form')
      .send({ From: `whatsapp:${phone}`, Body: 'hello' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('OK');
  });

  it('blocks second message from same phone within 3s debounce', async () => {
    const phone = `+1555SGB${Date.now()}`.slice(0, 15);
    const app = makeSpamApp();
    await request(app).post('/test').type('form').send({ From: `whatsapp:${phone}`, Body: 'first' });
    // Second message arrives immediately (well under 3s)
    const second = await request(app).post('/test').type('form').send({ From: `whatsapp:${phone}`, Body: 'spam' });
    expect(second.text).toBe('<Response/>');
  });

  it('allows a message with no From header (bypasses guard)', async () => {
    const res = await request(makeSpamApp())
      .post('/test')
      .type('form')
      .send({ Body: 'no phone' });
    expect(res.text).toContain('OK');
  });
});

// ── Status guard ───────────────────────────────────────────────────────────────

describe('Status guard — skips AI for terminal lead statuses', () => {
  it('returns empty TwiML (no message) when lead is QUALIFIED', async () => {
    const phone = `+1555SGC${Date.now()}`.slice(0, 15);
    const lead = await insertLead({
      name: 'Guard QUAL',
      phone,
      email: 'guardqual@test.demo',
      serviceInterest: 'SEO',
      source: 'test',
    });
    createdLeadIds.push(lead.id);
    await updateLead(lead.id, { status: LeadStatus.QUALIFIED });

    const res = await request(makeWebhookApp())
      .post('/api/webhooks/twilio')
      .type('form')
      .send({ From: `whatsapp:${phone}`, Body: 'I want to buy!', MessageSid: `SM_QUAL_${Date.now()}` });

    expect(res.status).toBe(200);
    // No <Message> body — status guard skipped AI
    expect(res.text).toBe('<Response/>');
  }, 30_000);

  it('returns empty TwiML (no message) when lead is LOST', async () => {
    const phone = `+1555SGD${Date.now()}`.slice(0, 15);
    const lead = await insertLead({
      name: 'Guard LOST',
      phone,
      email: 'guardlost@test.demo',
      serviceInterest: 'SEO',
      source: 'test',
    });
    createdLeadIds.push(lead.id);
    await updateLead(lead.id, { status: LeadStatus.LOST });

    const res = await request(makeWebhookApp())
      .post('/api/webhooks/twilio')
      .type('form')
      .send({ From: `whatsapp:${phone}`, Body: 'hello again', MessageSid: `SM_LOST_${Date.now()}` });

    expect(res.status).toBe(200);
    expect(res.text).toBe('<Response/>');
  }, 30_000);

  it('calls AI and returns a message when lead is QUALIFYING', async () => {
    const phone = `+1555SGE${Date.now()}`.slice(0, 15);
    const lead = await insertLead({
      name: 'Guard QUALIFYING',
      phone,
      email: 'guardqualifying@test.demo',
      serviceInterest: 'SEO',
      source: 'test',
    });
    createdLeadIds.push(lead.id);
    // status defaults to QUALIFYING — do not update

    const res = await request(makeWebhookApp())
      .post('/api/webhooks/twilio')
      .type('form')
      .send({ From: `whatsapp:${phone}`, Body: 'hi there', MessageSid: `SM_QUAL2_${Date.now()}` });

    expect(res.status).toBe(200);
    // AI returned 'Mock AI reply' → should appear in TwiML
    expect(res.text).toContain('Mock AI reply');
  }, 30_000);
});

// ── Duplicate phone 409 ────────────────────────────────────────────────────────

describe('Duplicate phone returns 409 from POST /api/leads', () => {
  it('returns 201 on first submission and 409 on re-submission with same phone', async () => {
    const phone = `+1555SGF${Date.now()}`.slice(0, 15);
    const payload = {
      name: 'Dup Phone Test',
      phone,
      email: 'dupphone@test.demo',
      serviceInterest: 'Web Development',
      source: 'test',
    };

    const app = makeLeadsApp();

    const first = await request(app).post('/api/leads').send(payload);
    expect(first.status).toBe(201);
    expect(first.body.lead.id).toBeTruthy();
    createdLeadIds.push(first.body.lead.id);

    const second = await request(app).post('/api/leads').send(payload);
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/already exists/i);
    // Response includes the existing lead
    expect(second.body.lead.id).toBe(first.body.lead.id);
  }, 30_000);

  it('returns 400 when required fields are missing', async () => {
    const res = await request(makeLeadsApp())
      .post('/api/leads')
      .send({ name: 'Missing Fields' });
    expect(res.status).toBe(400);
  });
});
