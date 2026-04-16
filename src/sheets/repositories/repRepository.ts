import { v4 as uuidv4 } from 'uuid';
import { appendRow, getRows, updateRow } from '../sheetsClient';
import { SalesRep } from '../../types';

const TAB = 'SalesReps';
const HEADER_ROWS = 1;

const DEMO_REPS = [
  { name: 'Alice Johnson', email: 'alice@speedtolead.demo', phone: '+15550101', isActive: true },
  { name: 'Bob Smith',     email: 'bob@speedtolead.demo',   phone: '+15550102', isActive: true },
  { name: 'Carol Davis',   email: 'carol@speedtolead.demo', phone: '+15550103', isActive: true },
];

function rowToRep(row: string[]): SalesRep {
  return {
    id: row[0] ?? '',
    name: row[1] ?? '',
    email: row[2] ?? '',
    phone: row[3] ?? '',
    isActive: row[4] === 'true',
    currentLeadCount: parseInt(row[5] ?? '0', 10) || 0,
  };
}

function repToRow(rep: SalesRep): (string | number | boolean)[] {
  return [rep.id, rep.name, rep.email, rep.phone, rep.isActive, rep.currentLeadCount];
}

export async function getAllReps(): Promise<SalesRep[]> {
  const rows = await getRows(TAB);
  return rows.slice(HEADER_ROWS).filter(r => r[0]).map(rowToRep);
}

export async function getActiveReps(): Promise<SalesRep[]> {
  const reps = await getAllReps();
  return reps.filter(r => r.isActive);
}

export async function updateRepLeadCount(id: string, delta: number): Promise<void> {
  const rows = await getRows(TAB);
  const dataRows = rows.slice(HEADER_ROWS);
  const rowIndex = dataRows.findIndex(r => r[0] === id);
  if (rowIndex === -1) return;

  const rep = rowToRep(dataRows[rowIndex]);
  rep.currentLeadCount = Math.max(0, rep.currentLeadCount + delta);
  await updateRow(TAB, rowIndex + 1 + HEADER_ROWS, repToRow(rep));
}

export async function seedDemoReps(): Promise<void> {
  const existing = await getAllReps();
  if (existing.length > 0) return;

  for (const rep of DEMO_REPS) {
    await appendRow(TAB, [uuidv4(), rep.name, rep.email, rep.phone, rep.isActive, 0]);
  }
}
