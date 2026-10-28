import { Router } from 'express';

const router = Router();

// GET /api/time - Returns the current server clock for client-side offset correction
router.get('/', (_req, res) => {
  return res.json({ now: new Date().toISOString() });
});

export default router;
