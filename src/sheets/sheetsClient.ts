import { google, sheets_v4 } from 'googleapis';
import { config } from '../config';
import { logger } from '../utils/logger';

let sheetsInstance: sheets_v4.Sheets | null = null;

// Retry a Sheets API call on 429 (quota exceeded) with exponential backoff.
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const delays = [5_000, 15_000, 45_000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const is429 =
        err?.code === 429 ||
        err?.status === 429 ||
        err?.errors?.[0]?.reason === 'rateLimitExceeded';
      if (is429 && attempt < delays.length) {
        logger.warn(`[SHEETS] Rate limited (429) — retrying in ${delays[attempt] / 1000}s (attempt ${attempt + 1})`);
        await new Promise(r => setTimeout(r, delays[attempt]));
        continue;
      }
      throw err;
    }
  }
  throw new Error('unreachable');
}

export async function getSheets(): Promise<sheets_v4.Sheets> {
  if (sheetsInstance) return sheetsInstance;

  // On Render (or any server env), pass the JSON directly via GOOGLE_SERVICE_ACCOUNT_JSON
  // Locally, fall back to the key file path
  const credentials = config.google.serviceAccountJson
    ? JSON.parse(config.google.serviceAccountJson)
    : undefined;

  const auth = new google.auth.GoogleAuth({
    ...(credentials ? { credentials } : { keyFile: config.google.serviceAccountKeyFile }),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsInstance = google.sheets({ version: 'v4', auth });
  logger.info('Google Sheets client initialized');
  return sheetsInstance;
}

export async function appendRow(
  tab: string,
  values: (string | number | boolean | null)[]
): Promise<void> {
  const row = values.map(v => (v === null || v === undefined ? '' : String(v)));
  await withRetry(async () => {
    const sheets = await getSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.sheetsId,
      range: `${tab}!A:A`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });
  });
}

export async function getRows(tab: string): Promise<string[][]> {
  return withRetry(async () => {
    const sheets = await getSheets();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.sheetsId,
      range: `${tab}!A:Z`,
    });
    return (response.data.values ?? []) as string[][];
  });
}

// rowNumber is 1-based (row 1 = header, row 2 = first data row)
export async function updateRow(
  tab: string,
  rowNumber: number,
  values: (string | number | boolean | null)[]
): Promise<void> {
  const row = values.map(v => (v === null || v === undefined ? '' : String(v)));
  await withRetry(async () => {
    const sheets = await getSheets();
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.sheetsId,
      range: `${tab}!A${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    });
  });
}

export async function clearTabData(tab: string): Promise<void> {
  const rows = await getRows(tab);
  if (rows.length <= 1) return; // only header or empty — nothing to clear

  await withRetry(async () => {
    const sheets = await getSheets();
    await sheets.spreadsheets.values.clear({
      spreadsheetId: config.google.sheetsId,
      range: `${tab}!A2:Z`,
    });
  });
}

// Cached tab ID lookup — avoids re-fetching spreadsheet metadata on every deleteRow call.
const tabIdCache = new Map<string, number>();

async function getTabSheetId(tab: string): Promise<number> {
  if (tabIdCache.has(tab)) return tabIdCache.get(tab)!;
  const sheetId = await withRetry(async () => {
    const sheets = await getSheets();
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: config.google.sheetsId });
    const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === tab);
    if (!sheet?.properties?.sheetId == null) throw new Error(`Sheet tab "${tab}" not found`);
    return sheet!.properties!.sheetId!;
  });
  tabIdCache.set(tab, sheetId);
  return sheetId;
}

export async function deleteRow(tab: string, rowNumber: number): Promise<void> {
  const sheetId = await getTabSheetId(tab);
  await withRetry(async () => {
    const sheets = await getSheets();
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.google.sheetsId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowNumber - 1, // 0-based
                endIndex: rowNumber,
              },
            },
          },
        ],
      },
    });
  });
}

// Delete multiple rows in a single batchUpdate (rows must be in descending order).
export async function deleteRows(tab: string, rowNumbers: number[]): Promise<void> {
  if (rowNumbers.length === 0) return;
  const sorted = [...rowNumbers].sort((a, b) => b - a); // descending — delete from bottom up
  const sheetId = await getTabSheetId(tab);
  await withRetry(async () => {
    const sheets = await getSheets();
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.google.sheetsId,
      requestBody: {
        requests: sorted.map(r => ({
          deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: r - 1, endIndex: r },
          },
        })),
      },
    });
  });
}
