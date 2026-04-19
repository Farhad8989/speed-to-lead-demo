import { getSheets } from './sheetsClient';
import { config } from '../config';
import { logger } from '../utils/logger';

const TABS: Record<string, string[]> = {
  Leads: [
    'id', 'name', 'phone', 'email', 'serviceInterest', 'score',
    'status', 'assignedRepId', 'source', 'responseTimeMs',
    'createdAt', 'updatedAt', 'qualifiedAt', 'notes',
  ],
  Conversations: ['id', 'leadId', 'role', 'content', 'channel', 'createdAt'],
  SalesReps: ['id', 'name', 'email', 'phone', 'isActive', 'currentLeadCount', 'bookingLink'],
  FollowUps: ['id', 'leadId', 'type', 'scheduledAt', 'executedAt', 'channel', 'message'],
  Events: ['id', 'leadId', 'eventType', 'metadata', 'createdAt'],
};

export async function setupSheets(): Promise<void> {
  const sheets = await getSheets();
  const id = config.google.sheetsId;

  // Fetch existing tabs
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: id });
  const existingTabs = new Set(
    spreadsheet.data.sheets?.map(s => s.properties?.title ?? '') ?? []
  );

  // Create missing tabs in one batch call
  const missing = Object.keys(TABS).filter(tab => !existingTabs.has(tab));
  if (missing.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        requests: missing.map(tab => ({ addSheet: { properties: { title: tab } } })),
      },
    });
    logger.info(`Created sheet tabs: ${missing.join(', ')}`);
  }

  // Write headers for each tab if row 1 is empty
  for (const [tab, headers] of Object.entries(TABS)) {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${tab}!A1:A1`,
    });

    if (!resp.data.values?.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: id,
        range: `${tab}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
      logger.info(`Headers written for tab: ${tab}`);
    }
  }

  logger.info('Google Sheets setup complete');
}
