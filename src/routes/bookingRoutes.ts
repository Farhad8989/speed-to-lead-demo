import { Router, Request, Response } from 'express';
import { findLeadById } from '../sheets/repositories/leadRepository';
import { generateTimeSlots } from '../services/bookingService';

const router = Router();

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
