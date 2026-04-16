import { Router } from 'express';

// Phase 5: analytics implementation
const router = Router();

router.get('/summary', (_req, res) => {
  res.status(501).json({ error: 'Not implemented — coming in Phase 5' });
});

export default router;
