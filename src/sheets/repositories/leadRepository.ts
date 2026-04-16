import { v4 as uuidv4 } from 'uuid';
import { appendRow, getRows, updateRow } from '../sheetsClient';
import { Lead, LeadScore, LeadStatus, CreateLeadInput } from '../../types';

const TAB = 'Leads';
const HEADER_ROWS = 1;

function rowToLead(row: string[]): Lead {
  return {
    id: row[0] ?? '',
    name: row[1] ?? '',
    phone: row[2] ?? '',
    email: row[3] ?? '',
    serviceInterest: row[4] ?? '',
    score: (row[5] as LeadScore) || LeadScore.UNSCORED,
    status: (row[6] as LeadStatus) || LeadStatus.NEW,
    assignedRepId: row[7] ?? '',
    source: row[8] ?? '',
    responseTimeMs: parseInt(row[9] ?? '0', 10) || 0,
    createdAt: row[10] ?? '',
    updatedAt: row[11] ?? '',
    qualifiedAt: row[12] ?? '',
    notes: row[13] ?? '',
  };
}

function leadToRow(lead: Lead): (string | number)[] {
  return [
    lead.id, lead.name, lead.phone, lead.email, lead.serviceInterest,
    lead.score, lead.status, lead.assignedRepId, lead.source,
    lead.responseTimeMs, lead.createdAt, lead.updatedAt, lead.qualifiedAt, lead.notes,
  ];
}

export async function insertLead(input: CreateLeadInput): Promise<Lead> {
  const now = new Date().toISOString();
  const lead: Lead = {
    id: uuidv4(),
    name: input.name,
    phone: input.phone,
    email: input.email,
    serviceInterest: input.serviceInterest,
    score: LeadScore.UNSCORED,
    status: LeadStatus.NEW,
    assignedRepId: '',
    source: input.source ?? 'web',
    responseTimeMs: 0,
    createdAt: now,
    updatedAt: now,
    qualifiedAt: '',
    notes: '',
  };

  await appendRow(TAB, leadToRow(lead));
  return lead;
}

export async function getAllLeads(): Promise<Lead[]> {
  const rows = await getRows(TAB);
  return rows.slice(HEADER_ROWS).filter(r => r[0]).map(rowToLead);
}

export async function findLeadById(id: string): Promise<Lead | null> {
  const rows = await getRows(TAB);
  const row = rows.slice(HEADER_ROWS).find(r => r[0] === id);
  return row ? rowToLead(row) : null;
}

export async function findLeadByPhone(phone: string): Promise<Lead | null> {
  const rows = await getRows(TAB);
  const row = rows.slice(HEADER_ROWS).find(r => r[2] === phone);
  return row ? rowToLead(row) : null;
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<Lead | null> {
  const rows = await getRows(TAB);
  const dataRows = rows.slice(HEADER_ROWS);
  const rowIndex = dataRows.findIndex(r => r[0] === id);

  if (rowIndex === -1) return null;

  const updated: Lead = {
    ...rowToLead(dataRows[rowIndex]),
    ...updates,
    id, // prevent ID mutation
    updatedAt: new Date().toISOString(),
  };

  // +1 for 0→1-based index, +HEADER_ROWS to skip header
  await updateRow(TAB, rowIndex + 1 + HEADER_ROWS, leadToRow(updated));
  return updated;
}

export async function getLeadRowNumber(id: string): Promise<number | null> {
  const rows = await getRows(TAB);
  const dataRows = rows.slice(HEADER_ROWS);
  const rowIndex = dataRows.findIndex(r => r[0] === id);
  return rowIndex === -1 ? null : rowIndex + 1 + HEADER_ROWS;
}
