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

  // Pick rep with lowest current lead count
  const rep = reps.reduce((min, r) => r.currentLeadCount < min.currentLeadCount ? r : min);

  const updated = await updateLead(lead.id, { assignedRepId: rep.id }) ?? lead;
  await updateRepLeadCount(rep.id, 1);

  logger.info(`[ROUTING] Lead ${lead.id} assigned to rep ${rep.name} (${rep.id})`);
  await alertHotLead(updated, rep);

  const whatsapp = getMessagingProvider('whatsapp');
  await whatsapp.send({
    to: lead.phone,
    message:
      `Great news, ${lead.name}! 🎉 You've been matched with ${rep.name}, one of our specialists. ` +
      `They'll be in touch with you very soon. In the meantime, feel free to ask me anything!`,
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

    case LeadScore.WARM:
    case LeadScore.COLD: {
      const status = lead.score === LeadScore.WARM ? LeadStatus.NURTURING : LeadStatus.NURTURING;
      const updated = await updateLead(lead.id, { status }) ?? lead;
      await scheduleNurtureSequence(updated);
      logger.info(`[ROUTING] ${lead.score} lead ${lead.id} — nurture sequence scheduled`);
      return updated;
    }

    default:
      logger.warn(`[ROUTING] Lead ${lead.id} has unexpected score: ${lead.score}`);
      return lead;
  }
}
