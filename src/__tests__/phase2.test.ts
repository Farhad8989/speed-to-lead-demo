import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';
dotenv.config();

import { getRows, deleteRow } from '../sheets/sheetsClient';
import { setupSheets } from '../sheets/sheetsSetup';
import { seedDemoReps } from '../sheets/repositories/repRepository';
import { findLeadById, findLeadByPhone } from '../sheets/repositories/leadRepository';
import { getConversationByLeadId } from '../sheets/repositories/conversationRepository';
import { createLead } from '../services/leadService';
import { LeadStatus } from '../types';

const TEST_PHONE = `+1555P2${Date.now()}`.slice(0, 15);
let createdLeadId: string;

beforeAll(async () => {
  await setupSheets();
  await seedDemoReps();
});

// --- createLead orchestrator ---
describe('leadService.createLead', () => {
  it('creates a lead, sends WhatsApp, moves to QUALIFYING', async () => {
    const lead = await createLead({
      name: 'Phase2 Tester',
      phone: TEST_PHONE,
      email: 'phase2@test.demo',
      serviceInterest: 'Web Development',
      source: 'test',
    });

    createdLeadId = lead.id;
    expect(lead.id).toBeTruthy();
    expect(lead.status).toBe(LeadStatus.QUALIFYING);
    expect(lead.responseTimeMs).toBeGreaterThan(0);
  }, 20_000);

  it('stores the outbound welcome message in Conversations', async () => {
    const convo = await getConversationByLeadId(createdLeadId);
    expect(convo.length).toBeGreaterThan(0);
    expect(convo[0].role).toBe('assistant');
    expect(convo[0].content).toContain('Phase2 Tester');
  });

  it('deduplicates: re-submitting same phone returns existing lead', async () => {
    const dup = await createLead({
      name: 'Phase2 Tester',
      phone: TEST_PHONE,
      email: 'phase2@test.demo',
      serviceInterest: 'Web Development',
      source: 'test',
    });
    expect(dup.id).toBe(createdLeadId);
  }, 15_000);
});

// --- Lead persisted in Sheets ---
describe('lead persisted in Sheets after createLead', () => {
  it('findLeadById returns the created lead', async () => {
    const lead = await findLeadById(createdLeadId);
    expect(lead).not.toBeNull();
    expect(lead?.phone).toBe(TEST_PHONE);
  });

  it('findLeadByPhone works', async () => {
    const lead = await findLeadByPhone(TEST_PHONE);
    expect(lead?.id).toBe(createdLeadId);
  });
});

// --- Cleanup ---
afterAll(async () => {
  if (!createdLeadId) return;

  const leadRows = await getRows('Leads');
  const leadIdx = leadRows.findIndex(r => r[0] === createdLeadId);
  if (leadIdx > 0) await deleteRow('Leads', leadIdx + 1);

  const convRows = await getRows('Conversations');
  const convIndices = convRows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r[1] === createdLeadId)
    .map(({ i }) => i + 1)
    .reverse();
  for (const idx of convIndices) await deleteRow('Conversations', idx);
});
