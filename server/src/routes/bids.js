import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { placeBid, setAutoBid, removeAutoBid } from '../services/biddingService.js';

const router = Router({ mergeParams: true });

const bidSchema = z.object({
  amount: z.number().int().positive('Bid amount must be a positive integer in rupees (INR)'),
});

const autoBidSchema = z.object({
  max_amount: z.number().int().positive('Maximum auto-bid amount must be a positive integer in rupees (INR)'),
});

// POST /api/listings/:id/bids
router.post(
  '/:id/bids',
  requireAuth,
  validate({ body: bidSchema }),
  async (req, res, next) => {
    try {
      const listingId = parseInt(req.params.id, 10);
      if (isNaN(listingId)) throw new AppError('Invalid listing ID', 400, 'INVALID_ID');

      const { amount } = req.body;
      const result = await placeBid(listingId, req.user.id, amount, false);

      return res.status(201).json({
        message: 'Bid placed successfully',
        bid: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/listings/:id/auto-bid
router.put(
  '/:id/auto-bid',
  requireAuth,
  validate({ body: autoBidSchema }),
  async (req, res, next) => {
    try {
      const listingId = parseInt(req.params.id, 10);
      if (isNaN(listingId)) throw new AppError('Invalid listing ID', 400, 'INVALID_ID');

      const { max_amount } = req.body;
      const result = await setAutoBid(listingId, req.user.id, max_amount);

      return res.json({
        message: 'Auto-bid configured successfully',
        autoBid: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/listings/:id/auto-bid
router.delete(
  '/:id/auto-bid',
  requireAuth,
  async (req, res, next) => {
    try {
      const listingId = parseInt(req.params.id, 10);
      if (isNaN(listingId)) throw new AppError('Invalid listing ID', 400, 'INVALID_ID');

      await removeAutoBid(listingId, req.user.id);
      return res.json({ message: 'Auto-bid removed successfully' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
