import { Router, Request, Response } from 'express';
import { findLeadById, findLeadByBookingToken, updateLead } from '../sheets/repositories/leadRepository';
import { getAllReps } from '../sheets/repositories/repRepository';
import { generateTimeSlots } from '../services/bookingService';
import { logger } from '../utils/logger';

const router = Router();

// Legacy time-slot preview endpoint (used by analytics / demo UI)
router.get('/:leadId', async (req: Request, res: Response) => {
  const lead = await findLeadById(req.params.leadId);
  if (!lead) {
    res.status(404).json({ error: 'Lead not found' });
    return;
  }

  const slots = generateTimeSlots();
  res.json({ leadId: lead.id, name: lead.name, slots });
});

export default router;
