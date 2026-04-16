import { Router, Request, Response } from 'express';
import { createLead } from '../services/leadService';
import { getAllLeads, findLeadById } from '../sheets/repositories/leadRepository';
import { logger } from '../utils/logger';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const leads = await getAllLeads();
    res.json({ leads, total: leads.length });
  } catch (err) {
    logger.error('GET /leads failed', { error: err });
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const lead = await findLeadById(req.params.id);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    res.json({ lead });
  } catch (err) {
    logger.error('GET /leads/:id failed', { error: err });
    res.status(500).json({ error: 'Failed to fetch lead' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { name, phone, email, serviceInterest, source } = req.body;

  if (!name || !phone || !email || !serviceInterest) {
    res.status(400).json({ error: 'name, phone, email, and serviceInterest are required' });
    return;
  }

  try {
    const lead = await createLead({ name, phone, email, serviceInterest, source: source ?? 'web' });
    res.status(201).json({ lead });
  } catch (err) {
    logger.error('POST /leads failed', { error: err });
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

export default router;
