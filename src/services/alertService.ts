import { Lead, SalesRep } from '../types';
import { config } from '../config';
import { logger } from '../utils/logger';

export async function alertHotLead(lead: Lead, rep: SalesRep): Promise<void> {
  const message =
    `🔥 HOT LEAD ALERT\n` +
    `Lead: ${lead.name} (${lead.phone})\n` +
    `Interest: ${lead.serviceInterest}\n` +
    `Notes: ${lead.notes}\n` +
    `Assigned to: ${rep.name} (${rep.email})\n` +
    `Qualified at: ${lead.qualifiedAt}`;

  logger.info(`[ALERT] ${message}`);

  if (config.alerts.webhookUrl) {
    try {
      await fetch(config.alerts.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
    } catch (err) {
      logger.error('[ALERT] Failed to send Slack webhook', { error: err });
    }
  }
}
