import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';
dotenv.config();

import { getSheets } from '../sheets/sheetsClient';
import { setupSheets } from '../sheets/sheetsSetup';
import { insertLead, findLeadById, findLeadByPhone, updateLead, getAllLeads } from '../sheets/repositories/leadRepository';
import { getAllReps, seedDemoReps } from '../sheets/repositories/repRepository';
import { insertMessage, getConversationByLeadId } from '../sheets/repositories/conversationRepository';
import { insertFollowUp, getPendingFollowUps, markFollowUpExecuted } from '../sheets/repositories/followUpRepository';
import { ConversationRole, LeadScore, LeadStatus } from '../types';
import { deleteRow, getRows } from '../sheets/sheetsClient';

const TEST_PHONE = `+155500${Date.now()}`;
let testLeadId: string;

// --- Sheets connection ---
describe('Google Sheets connection', () => {
  it('authenticates and returns a sheets client', async () => {
    const sheets = await getSheets();
    expect(sheets).toBeDefined();
  });

  it('can read the spreadsheet metadata', async () => {
    const { config } = await import('../config');
    const sheets = await getSheets();
    const resp = await sheets.spreadsheets.get({ spreadsheetId: config.google.sheetsId });
    expect(resp.data.spreadsheetId).toBe(config.google.sheetsId);
  });
});

// --- Sheet setup ---
describe('sheetsSetup', () => {
  beforeAll(async () => {
    await setupSheets();
    await seedDemoReps();
  });

  it('creates all 5 required tabs', async () => {
    const { config } = await import('../config');
    const sheets = await getSheets();
    const resp = await sheets.spreadsheets.get({ spreadsheetId: config.google.sheetsId });
    const titles = resp.data.sheets?.map(s => s.properties?.title) ?? [];
    expect(titles).toContain('Leads');
    expect(titles).toContain('Conversations');
    expect(titles).toContain('SalesReps');
    expect(titles).toContain('FollowUps');
    expect(titles).toContain('Events');
  });

  it('Leads tab has correct headers', async () => {
    const rows = await getRows('Leads');
    const headers = rows[0];
    expect(headers).toContain('id');
    expect(headers).toContain('phone');
    expect(headers).toContain('score');
    expect(headers).toContain('status');
  });
});

// --- Lead repository CRUD ---
describe('leadRepository', () => {
  it('inserts a lead and returns it', async () => {
    const lead = await insertLead({
      name: 'Test User Phase1',
      phone: TEST_PHONE,
      email: 'test@phase1.demo',
      serviceInterest: 'Web Development',
      source: 'test',
    });

    testLeadId = lead.id;
    expect(lead.id).toBeTruthy();
    expect(lead.name).toBe('Test User Phase1');
    expect(lead.status).toBe(LeadStatus.NEW);
    expect(lead.score).toBe(LeadScore.UNSCORED);
  });

  it('finds a lead by ID', async () => {
    const lead = await findLeadById(testLeadId);
    expect(lead).not.toBeNull();
    expect(lead?.name).toBe('Test User Phase1');
  });

  it('finds a lead by phone', async () => {
    const lead = await findLeadByPhone(TEST_PHONE);
    expect(lead).not.toBeNull();
    expect(lead?.id).toBe(testLeadId);
  });

  it('updates a lead', async () => {
    const updated = await updateLead(testLeadId, {
      status: LeadStatus.QUALIFYING,
      score: LeadScore.WARM,
    });
    expect(updated?.status).toBe(LeadStatus.QUALIFYING);
    expect(updated?.score).toBe(LeadScore.WARM);

    // Verify persisted in Sheets
    const fresh = await findLeadById(testLeadId);
    expect(fresh?.status).toBe(LeadStatus.QUALIFYING);
  });

  it('returns all leads (non-empty after insert)', async () => {
    const leads = await getAllLeads();
    expect(leads.length).toBeGreaterThan(0);
    expect(leads.some(l => l.id === testLeadId)).toBe(true);
  });

  it('findLeadById returns null for unknown ID', async () => {
    const result = await findLeadById('nonexistent-id-00000000');
    expect(result).toBeNull();
  });

  it('findLeadByPhone returns null for unknown phone', async () => {
    const result = await findLeadByPhone('+19999999999');
    expect(result).toBeNull();
  });
});

// --- Conversation repository ---
describe('conversationRepository', () => {
  it('inserts a message', async () => {
    const msg = await insertMessage(testLeadId, ConversationRole.USER, 'Hello, I need help', 'whatsapp');
    expect(msg.id).toBeTruthy();
    expect(msg.leadId).toBe(testLeadId);
  });

  it('retrieves conversation by lead ID', async () => {
    const convo = await getConversationByLeadId(testLeadId);
    expect(convo.length).toBeGreaterThan(0);
    expect(convo[0].content).toBe('Hello, I need help');
  });
});

// --- SalesRep repository ---
describe('repRepository', () => {
  it('returns seeded demo reps', async () => {
    const reps = await getAllReps();
    expect(reps.length).toBeGreaterThan(0);
    expect(reps[0].name).toBeTruthy();
  });

  it('seedDemoReps is idempotent — calling twice does not duplicate reps', async () => {
    const before = await getAllReps();
    await seedDemoReps(); // second call — should be a no-op
    const after = await getAllReps();
    expect(after.length).toBe(before.length);
  });
});

// --- FollowUp repository ---
describe('followUpRepository', () => {
  let followUpId: string;

  it('inserts a follow-up scheduled in the past', async () => {
    const pastDate = new Date(Date.now() - 60_000); // 1 min ago
    const fu = await insertFollowUp(testLeadId, 'nurture-1', pastDate, 'whatsapp', 'Just checking in!', '+10000000000');
    followUpId = fu.id;
    expect(fu.id).toBeTruthy();
    expect(fu.executedAt).toBe('');
  });

  it('retrieves pending follow-ups', async () => {
    const pending = await getPendingFollowUps();
    expect(pending.some(f => f.id === followUpId)).toBe(true);
  });

  it('marks a follow-up as executed', async () => {
    await markFollowUpExecuted(followUpId);
    const pending = await getPendingFollowUps();
    expect(pending.some(f => f.id === followUpId)).toBe(false);
  });

  it('getFollowUpsByLeadId returns only that lead\'s follow-ups', async () => {
    const { getFollowUpsByLeadId } = await import('../sheets/repositories/followUpRepository');
    const myFollowUps = await getFollowUpsByLeadId(testLeadId);
    expect(myFollowUps.every(f => f.leadId === testLeadId)).toBe(true);
  });
});

// --- Cleanup test rows ---
afterAll(async () => {
  // Remove all lead rows matching TEST_PHONE (catches stale rows from interrupted prior runs)
  const rows = await getRows('Leads');
  const staleIndices = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r[2] === TEST_PHONE)
    .map(({ i }) => i + 1)
    .reverse();
  for (const idx of staleIndices) await deleteRow('Leads', idx);

  // Remove test conversation rows
  const convRows = await getRows('Conversations');
  const convIndices = convRows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r[1] === testLeadId)
    .map(({ i }) => i + 1)
    .reverse();
  for (const idx of convIndices) await deleteRow('Conversations', idx);

  // Remove test follow-up rows
  const fuRows = await getRows('FollowUps');
  const fuIndices = fuRows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r[1] === testLeadId)
    .map(({ i }) => i + 1)
    .reverse();
  for (const idx of fuIndices) await deleteRow('FollowUps', idx);
});
