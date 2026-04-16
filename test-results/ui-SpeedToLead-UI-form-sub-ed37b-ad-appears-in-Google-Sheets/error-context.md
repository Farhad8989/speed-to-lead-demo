# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui.test.ts >> SpeedToLead UI >> form submits successfully and lead appears in Google Sheets
- Location: src\__tests__\ui.test.ts:30:7

# Error details

```
Error: Quota exceeded for quota metric 'Read requests' and limit 'Read requests per minute per user' of service 'sheets.googleapis.com' for consumer 'project_number:837849181946'.
```

# Test source

```ts
  1  | import { getSheets } from './sheetsClient';
  2  | import { config } from '../config';
  3  | import { logger } from '../utils/logger';
  4  | 
  5  | const TABS: Record<string, string[]> = {
  6  |   Leads: [
  7  |     'id', 'name', 'phone', 'email', 'serviceInterest', 'score',
  8  |     'status', 'assignedRepId', 'source', 'responseTimeMs',
  9  |     'createdAt', 'updatedAt', 'qualifiedAt', 'notes',
  10 |   ],
  11 |   Conversations: ['id', 'leadId', 'role', 'content', 'channel', 'createdAt'],
  12 |   SalesReps: ['id', 'name', 'email', 'phone', 'isActive', 'currentLeadCount'],
  13 |   FollowUps: ['id', 'leadId', 'type', 'scheduledAt', 'executedAt', 'channel', 'message'],
  14 |   Events: ['id', 'leadId', 'eventType', 'metadata', 'createdAt'],
  15 | };
  16 | 
  17 | export async function setupSheets(): Promise<void> {
  18 |   const sheets = await getSheets();
  19 |   const id = config.google.sheetsId;
  20 | 
  21 |   // Fetch existing tabs
> 22 |   const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: id });
     |                       ^ Error: Quota exceeded for quota metric 'Read requests' and limit 'Read requests per minute per user' of service 'sheets.googleapis.com' for consumer 'project_number:837849181946'.
  23 |   const existingTabs = new Set(
  24 |     spreadsheet.data.sheets?.map(s => s.properties?.title ?? '') ?? []
  25 |   );
  26 | 
  27 |   // Create missing tabs in one batch call
  28 |   const missing = Object.keys(TABS).filter(tab => !existingTabs.has(tab));
  29 |   if (missing.length > 0) {
  30 |     await sheets.spreadsheets.batchUpdate({
  31 |       spreadsheetId: id,
  32 |       requestBody: {
  33 |         requests: missing.map(tab => ({ addSheet: { properties: { title: tab } } })),
  34 |       },
  35 |     });
  36 |     logger.info(`Created sheet tabs: ${missing.join(', ')}`);
  37 |   }
  38 | 
  39 |   // Write headers for each tab if row 1 is empty
  40 |   for (const [tab, headers] of Object.entries(TABS)) {
  41 |     const resp = await sheets.spreadsheets.values.get({
  42 |       spreadsheetId: id,
  43 |       range: `${tab}!A1:A1`,
  44 |     });
  45 | 
  46 |     if (!resp.data.values?.length) {
  47 |       await sheets.spreadsheets.values.update({
  48 |         spreadsheetId: id,
  49 |         range: `${tab}!A1`,
  50 |         valueInputOption: 'RAW',
  51 |         requestBody: { values: [headers] },
  52 |       });
  53 |       logger.info(`Headers written for tab: ${tab}`);
  54 |     }
  55 |   }
  56 | 
  57 |   logger.info('Google Sheets setup complete');
  58 | }
  59 | 
```