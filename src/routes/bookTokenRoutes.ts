import { Router, Request, Response } from 'express';
import { findLeadByBookingToken, updateLead } from '../sheets/repositories/leadRepository';
import { getAllReps } from '../sheets/repositories/repRepository';
import { logger } from '../utils/logger';

const router = Router();

router.get('/:token', async (req: Request, res: Response) => {
  try {
    const lead = await findLeadByBookingToken(req.params.token);
    if (!lead) {
      res.status(404).send('Booking link not found or expired.');
      return;
    }
    if (lead.bookingTokenUsed) {
      res.status(410).send('This booking link has already been used. Please contact your rep directly.');
      return;
    }

    await updateLead(lead.id, { bookingTokenUsed: true });

    const reps = await getAllReps();
    const rep = reps.find(r => r.id === lead.assignedRepId);
    const destination = rep?.bookingLink ?? 'https://calendly.com';

    logger.info(`[BOOKING] Token redeemed for lead ${lead.id} → ${destination}`);
    res.redirect(302, destination);
  } catch (err) {
    logger.error('[BOOKING] Token redirect error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).send('Something went wrong. Please contact us directly.');
  }
});

export default router;
