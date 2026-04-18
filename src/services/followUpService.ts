import { Lead } from '../types';
import { insertFollowUp, getPendingFollowUps, markFollowUpExecuted } from '../sheets/repositories/followUpRepository';
import { getMessagingProvider } from '../messaging/messagingFactory';
import { logger } from '../utils/logger';

const NURTURE_SEQUENCE = [
  { delayMs: 5 * 60 * 1000,      type: 'follow_up_5min', message: (name: string) => `Hi ${name}! Just checking in — do you have any questions about our services? We're here to help. 😊` },
  { delayMs: 60 * 60 * 1000,     type: 'follow_up_1hr',  message: (name: string) => `Hey ${name}, still thinking it over? Happy to answer any questions or schedule a quick call at your convenience.` },
  { delayMs: 24 * 60 * 60 * 1000, type: 'follow_up_24hr', message: (name: string) => `Hi ${name}! We wanted to follow up one more time. If you're ready to move forward or have any questions, just reply here.` },
];

export async function scheduleNurtureSequence(lead: Lead): Promise<void> {
  const now = Date.now();
  for (const step of NURTURE_SEQUENCE) {
    const scheduledAt = new Date(now + step.delayMs);
    await insertFollowUp(lead.id, step.type, scheduledAt, 'whatsapp', step.message(lead.name));
    logger.info(`[FOLLOW-UP] Scheduled ${step.type} for lead ${lead.id} at ${scheduledAt.toISOString()}`);
  }
}

export async function executePendingFollowUps(): Promise<void> {
  const pending = await getPendingFollowUps();
  if (!pending.length) return;

  logger.info(`[FOLLOW-UP] Executing ${pending.length} pending follow-up(s)`);
  const whatsapp = getMessagingProvider('whatsapp');

  for (const followUp of pending) {
    try {
      const result = await whatsapp.send({ to: followUp.leadId, message: followUp.message });
      if (result.success) {
        await markFollowUpExecuted(followUp.id);
        logger.info(`[FOLLOW-UP] Executed ${followUp.type} for lead ${followUp.leadId}`);
      }
    } catch (err) {
      logger.error(`[FOLLOW-UP] Failed to execute ${followUp.id}`, { error: err });
    }
  }
}
