import dotenv from 'dotenv';
dotenv.config();
import { getSheets, getRows, updateRow } from '../src/sheets/sheetsClient';
import { config } from '../src/config';

const TABS_TO_CLEAR = ['Leads', 'Conversations', 'FollowUps'];
const HEADER_ROWS = 1;

async function clearTab(tab: string): Promise<void> {
  const rows = await getRows(tab);
  const dataRowCount = rows.length - HEADER_ROWS;
  if (dataRowCount <= 0) {
    console.log(`  ${tab}: already empty`);
    return;
  }

  const sheets = await getSheets();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: config.google.sheetsId,
  });

  const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === tab);
  if (!sheet?.properties?.sheetId && sheet?.properties?.sheetId !== 0) {
    throw new Error(`Sheet tab "${tab}" not found`);
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.google.sheetsId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheet.properties!.sheetId!,
              dimension: 'ROWS',
              startIndex: HEADER_ROWS,        // 0-based, skip header
              endIndex: rows.length,
            },
          },
        },
      ],
    },
  });

  console.log(`  ${tab}: deleted ${dataRowCount} data row(s)`);
}

async function resetRepLeadCounts(): Promise<void> {
  const TAB = 'SalesReps';
  const rows = await getRows(TAB);
  const dataRows = rows.slice(HEADER_ROWS);
  if (dataRows.length === 0) {
    console.log(`  ${TAB}: no reps found`);
    return;
  }

  for (let i = 0; i < dataRows.length; i++) {
    const row = [...dataRows[i]];
    row[5] = '0'; // currentLeadCount column
    await updateRow(TAB, i + 1 + HEADER_ROWS, row);
  }
  console.log(`  SalesReps: reset lead counts for ${dataRows.length} rep(s)`);
}

async function main() {
  console.log('Cleaning up all test data...\n');

  for (const tab of TABS_TO_CLEAR) {
    await clearTab(tab);
  }

  await resetRepLeadCounts();

  console.log('\nDone. Sheets are clean and ready for testing.');
}

main().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
