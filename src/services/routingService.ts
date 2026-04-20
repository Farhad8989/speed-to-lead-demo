import { v4 as uuidv4 } from 'uuid';
import { Lead, LeadScore, LeadStatus, SalesRep } from '../types';
import { getActiveReps, updateRepLeadCount } from '../sheets/repositories/repRepository';
import { updateLead } from '../sheets/repositories/leadRepository';
import { alertHotLead } from './alertService';
import { scheduleNurtureSequence } from './followUpService';
import { config } from '../config';
import { logger } from '../utils/logger';

function buildBookingUrl(lead: Lead, token: string): string {
  return `${config.app.baseUrl}/api/book/${token}`;
}

async function generateBookingToken(leadId: string): Promise<string> {
  const token = uuidv4();
  await updateLead(leadId, { bookingToken: token, bookingTokenUsed: false });
  return token;
}

export interface RouteLeadResult {
  lead: Lead;
  userMessage: string;
}

async function assignRepRoundRobin(lead: Lead): Promise<{ lead: Lead; rep: SalesRep | null }> {
  const reps = await getActiveReps();
  if (!reps.length) {
    logger.warn(`[ROUTING] No active reps available for lead ${lead.id}`);
    return { lead, rep: null };
  }

  const rep = reps.reduce((min, r) => r.currentLeadCount < min.currentLeadCount ? r : min);
  const updated = await updateLead(lead.id, { assignedRepId: rep.id }) ?? lead;
  await updateRepLeadCount(rep.id, 1);

  logger.info(`[ROUTING] Lead ${lead.id} assigned to rep ${rep.name} (${rep.id})`);
  await alertHotLead(updated, rep);

  return { lead: updated, rep };
}

export async function routeLead(lead: Lead): Promise<RouteLeadResult> {
  switch (lead.score) {
    case LeadScore.HOT: {
      const { lead: routed, rep } = await assignRepRoundRobin(lead);
      let bookingLine = '';
      if (rep?.bookingLink) {
        const token = await generateBookingToken(routed.id);
        const url = buildBookingUrl(routed, token);
        bookingLine = `\n\nBook your free 30-min discovery call here: ${url}`;
      }
      const repName = rep?.name ?? 'one of our specialists';
      logger.info(`[ROUTING] HOT lead ${lead.id} — rep assigned`);
      return {
        lead: routed,
        userMessage: `Great news, ${lead.name}! 🎉 You've been matched with ${repName}.${bookingLine}`,
      };
    }

    case LeadScore.WARM: {
      const updated = await updateLead(lead.id, { status: LeadStatus.NURTURING }) ?? lead;
      await scheduleNurtureSequence(updated);

      const reps = await getActiveReps();
      const rep = reps.length
        ? reps.reduce((min, r) => r.currentLeadCount < min.currentLeadCount ? r : min)
        : null;
      let bookingLine = '';
      if (rep?.bookingLink) {
        const token = await generateBookingToken(updated.id);
        const url = buildBookingUrl(updated, token);
        bookingLine = ` ${url} —`;
      }

      logger.info(`[ROUTING] WARM lead ${lead.id} — nurture sequence scheduled`);
      return {
        lead: updated,
        userMessage: `Hi ${lead.name}! Whenever you're ready, feel free to book a free discovery call:${bookingLine} no pressure at all. 😊`,
      };
    }

    case LeadScore.COLD: {
      const updated = await updateLead(lead.id, { status: LeadStatus.LOST }) ?? lead;
      logger.info(`[ROUTING] COLD lead ${lead.id} — marked LOST`);
      return {
        lead: updated,
        userMessage: `Thanks for chatting, ${lead.name}! Based on what you've shared, we may not be the best fit right now — but feel free to reach out anytime if your needs change. 😊`,
      };
    }

    default:
      logger.warn(`[ROUTING] Lead ${lead.id} has unexpected score: ${lead.score}`);
      return {
        lead,
        userMessage: `Thanks ${lead.name}! We'll be in touch soon.`,
      };
  }
}
