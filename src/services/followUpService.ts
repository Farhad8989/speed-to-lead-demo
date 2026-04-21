import { Lead } from '../types';
import { insertFollowUp, getPendingFollowUps, markFollowUpExecuted } from '../sheets/repositories/followUpRepository';
import { getMessagingProvider } from '../messaging/messagingFactory';
import { config } from '../config';
import { logger } from '../utils/logger';

// Delays come from config (env-configurable). Defaults: 24h / 72h / 168h.
// Override with NURTURE_DELAY_1_HOURS, NURTURE_DELAY_2_HOURS, NURTURE_DELAY_3_HOURS.
function getNurtureSequence() {
  return [
    {
      delayMs: config.nurture.delay1Ms,
      type: 'follow_up_day1',
      message: (name: string) =>
        `Hi ${name}! Just following up on our chat. A lot of our clients were in a similar position before working with us — happy to share a quick case study if that'd be useful. Any questions at all, just reply here. 😊`,
    },
    {
      delayMs: config.nurture.delay2Ms,
      type: 'follow_up_day3',
      message: (name: string) =>
        `Hey ${name}! One thing people often ask us is how long it takes to see results — typically our clients start seeing traction within the first 4–6 weeks. Would a quick 15-min call help you decide if we're a good fit? No pressure at all.`,
    },
    {
      delayMs: config.nurture.delay3Ms,
      type: 'follow_up_day7',
      message: (name: string) =>
        `Hi ${name}, last follow-up from me — I don't want to crowd your inbox! If the timing isn't right, no worries at all. We'll be here whenever you're ready. Feel free to reach out any time. 🙏`,
    },
  ];
}

export async function scheduleNurtureSequence(lead: Lead): Promise<void> {
  const now = Date.now();
  for (const step of getNurtureSequence()) {
    const scheduledAt = new Date(now + step.delayMs);
    await insertFollowUp(lead.id, step.type, scheduledAt, 'whatsapp', step.message(lead.name), lead.phone);
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
      const result = await whatsapp.send({ to: followUp.leadPhone, message: followUp.message });
      if (result.success) {
        await markFollowUpExecuted(followUp.id);
        logger.info(`[FOLLOW-UP] Executed ${followUp.type} for lead ${followUp.leadId}`);
      }
    } catch (err) {
      logger.error(`[FOLLOW-UP] Failed to execute ${followUp.id}`, { error: err });
    }
  }
}
