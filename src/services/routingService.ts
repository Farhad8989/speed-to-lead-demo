import { Lead, LeadScore, LeadStatus } from '../types';
import { getActiveReps, updateRepLeadCount } from '../sheets/repositories/repRepository';
import { updateLead } from '../sheets/repositories/leadRepository';
import { getMessagingProvider } from '../messaging/messagingFactory';
import { alertHotLead } from './alertService';
import { scheduleNurtureSequence } from './followUpService';
import { logger } from '../utils/logger';

async function assignRepRoundRobin(lead: Lead): Promise<Lead> {
  const reps = await getActiveReps();
  if (!reps.length) {
    logger.warn(`[ROUTING] No active reps available for lead ${lead.id}`);
    return lead;
  }

  const rep = reps.reduce((min, r) => r.currentLeadCount < min.currentLeadCount ? r : min);

  const updated = await updateLead(lead.id, { assignedRepId: rep.id }) ?? lead;
  await updateRepLeadCount(rep.id, 1);

  logger.info(`[ROUTING] Lead ${lead.id} assigned to rep ${rep.name} (${rep.id})`);
  await alertHotLead(updated, rep);

  const bookingLine = rep.bookingLink
    ? `\n\nBook your free 30-min discovery call here: ${rep.bookingLink}`
    : '';

  const whatsapp = getMessagingProvider('whatsapp');
  await whatsapp.send({
    to: lead.phone,
    message:
      `Great news, ${lead.name}! 🎉 You've been matched with ${rep.name}, one of our specialists.${bookingLine}`,
  });

  return updated;
}

export async function routeLead(lead: Lead): Promise<Lead> {
  switch (lead.score) {
    case LeadScore.HOT: {
      const routed = await assignRepRoundRobin(lead);
      logger.info(`[ROUTING] HOT lead ${lead.id} — rep assigned, booking link sent`);
      return routed;
    }

    case LeadScore.WARM: {
      const updated = await updateLead(lead.id, { status: LeadStatus.NURTURING }) ?? lead;
      await scheduleNurtureSequence(updated);

      // Send booking link from rep with lowest load
      const reps = await getActiveReps();
      if (reps.length) {
        const rep = reps.reduce((min, r) => r.currentLeadCount < min.currentLeadCount ? r : min);
        if (rep.bookingLink) {
          const whatsapp = getMessagingProvider('whatsapp');
          await whatsapp.send({
            to: lead.phone,
            message: `Hi ${lead.name}! Whenever you're ready, feel free to book a free discovery call with our team: ${rep.bookingLink} — no pressure at all. 😊`,
          });
        }
      }

      logger.info(`[ROUTING] WARM lead ${lead.id} — nurture sequence scheduled, booking link sent`);
      return updated;
    }

    case LeadScore.COLD: {
      const updated = await updateLead(lead.id, { status: LeadStatus.LOST }) ?? lead;
      logger.info(`[ROUTING] COLD lead ${lead.id} — marked LOST`);
      return updated;
    }

    default:
      logger.warn(`[ROUTING] Lead ${lead.id} has unexpected score: ${lead.score}`);
      return lead;
  }
}
