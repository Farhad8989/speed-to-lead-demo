import { google, sheets_v4 } from 'googleapis';
import { config } from '../config';
import { logger } from '../utils/logger';

let sheetsInstance: sheets_v4.Sheets | null = null;

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
  const sheets = await getSheets();
  const row = values.map(v => (v === null || v === undefined ? '' : String(v)));

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.sheetsId,
    range: `${tab}!A:A`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}

export async function getRows(tab: string): Promise<string[][]> {
  const sheets = await getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.sheetsId,
    range: `${tab}!A:Z`,
  });
  return (response.data.values ?? []) as string[][];
}

// rowNumber is 1-based (row 1 = header, row 2 = first data row)
export async function updateRow(
  tab: string,
  rowNumber: number,
  values: (string | number | boolean | null)[]
): Promise<void> {
  const sheets = await getSheets();
  const row = values.map(v => (v === null || v === undefined ? '' : String(v)));

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.sheetsId,
    range: `${tab}!A${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}

export async function clearTabData(tab: string): Promise<void> {
  const sheets = await getSheets();
  const rows = await getRows(tab);
  if (rows.length <= 1) return; // only header or empty — nothing to clear

  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.sheetsId,
    range: `${tab}!A2:Z`,
  });
}

export async function deleteRow(tab: string, rowNumber: number): Promise<void> {
  const sheets = await getSheets();

  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: config.google.sheetsId,
  });

  const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === tab);
  if (!sheet?.properties?.sheetId === undefined) {
    throw new Error(`Sheet tab "${tab}" not found`);
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.google.sheetsId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheet!.properties!.sheetId!,
              dimension: 'ROWS',
              startIndex: rowNumber - 1, // 0-based
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  });
}
