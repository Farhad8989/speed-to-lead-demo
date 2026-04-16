import { v4 as uuidv4 } from 'uuid';
import { appendRow, getRows, updateRow } from '../sheetsClient';
import { FollowUp } from '../../types';

const TAB = 'FollowUps';
const HEADER_ROWS = 1;

function rowToFollowUp(row: string[]): FollowUp {
  return {
    id: row[0] ?? '',
    leadId: row[1] ?? '',
    type: row[2] ?? '',
    scheduledAt: row[3] ?? '',
    executedAt: row[4] ?? '',
    channel: row[5] ?? '',
    message: row[6] ?? '',
  };
}

function followUpToRow(f: FollowUp): string[] {
  return [f.id, f.leadId, f.type, f.scheduledAt, f.executedAt, f.channel, f.message];
}

export async function insertFollowUp(
  leadId: string,
  type: string,
  scheduledAt: Date,
  channel: string,
  message: string
): Promise<FollowUp> {
  const followUp: FollowUp = {
    id: uuidv4(),
    leadId,
    type,
    scheduledAt: scheduledAt.toISOString(),
    executedAt: '',
    channel,
    message,
  };

  await appendRow(TAB, followUpToRow(followUp));
  return followUp;
}

export async function getPendingFollowUps(): Promise<FollowUp[]> {
  const rows = await getRows(TAB);
  const now = new Date().toISOString();
  return rows
    .slice(HEADER_ROWS)
    .filter(r => r[0] && !r[4] && r[3] <= now)
    .map(rowToFollowUp);
}

export async function markFollowUpExecuted(id: string): Promise<void> {
  const rows = await getRows(TAB);
  const dataRows = rows.slice(HEADER_ROWS);
  const rowIndex = dataRows.findIndex(r => r[0] === id);
  if (rowIndex === -1) return;

  const f = rowToFollowUp(dataRows[rowIndex]);
  f.executedAt = new Date().toISOString();
  await updateRow(TAB, rowIndex + 1 + HEADER_ROWS, followUpToRow(f));
}

export async function getFollowUpsByLeadId(leadId: string): Promise<FollowUp[]> {
  const rows = await getRows(TAB);
  return rows
    .slice(HEADER_ROWS)
    .filter(r => r[0] && r[1] === leadId)
    .map(rowToFollowUp);
}
