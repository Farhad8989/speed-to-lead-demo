import { Router } from 'express';

// Phase 4: booking slot generation
const router = Router();

router.get('/:leadId', (_req, res) => {
  res.status(501).json({ error: 'Not implemented — coming in Phase 4' });
});

export default router;
