import { Router, Request, Response } from 'express';
import { findLeadByBookingToken, updateLead } from '../sheets/repositories/leadRepository';
import { getAllReps } from '../sheets/repositories/repRepository';
import { logger } from '../utils/logger';

const router = Router();

// GET — show confirmation page (prevents WhatsApp/Slack link-preview bots from consuming the token)
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

    const token = req.params.token;
    res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Book Your Discovery Call</title>
  <style>
    body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: white; border-radius: 12px; padding: 40px; max-width: 400px; text-align: center; box-shadow: 0 2px 16px rgba(0,0,0,0.1); }
    h1 { font-size: 1.5rem; margin-bottom: 12px; }
    p { color: #555; margin-bottom: 32px; }
    a.btn { display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 1rem; font-weight: 600; }
    a.btn:hover { background: #4338ca; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Book Your Free Discovery Call</h1>
    <p>Click the button below to choose a time that works for you. This is a one-time link.</p>
    <a class="btn" href="/api/book/${token}/confirm">Book Now &rarr;</a>
  </div>
</body>
</html>`);
  } catch (err) {
    logger.error('[BOOKING] Token page error', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).send('Something went wrong. Please contact us directly.');
  }
});

// GET confirm — mark used and redirect (only triggered by a real user click)
router.get('/:token/confirm', async (req: Request, res: Response) => {
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
