import { Router } from 'express';
import { AppError } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import {
  approveSale,
  rejectSale,
  confirmHandover,
  reportPickupFailed,
} from '../services/auctionCloser.js';

const router = Router({ mergeParams: true });

// POST /api/listings/:id/approve
router.post('/:id/approve', requireAuth, async (req, res, next) => {
  try {
    const listingId = parseInt(req.params.id, 10);
    if (isNaN(listingId)) throw new AppError('Invalid listing ID', 400, 'INVALID_ID');

    const result = await approveSale(listingId, req.user.id, req.body.note);
    return res.json({ message: 'Sale approved and item reserved for buyer', ...result });
  } catch (err) {
    next(err);
  }
});

// POST /api/listings/:id/reject
router.post('/:id/reject', requireAuth, async (req, res, next) => {
  try {
    const listingId = parseInt(req.params.id, 10);
    if (isNaN(listingId)) throw new AppError('Invalid listing ID', 400, 'INVALID_ID');

    const result = await rejectSale(listingId, req.user.id, req.body.note);
    return res.json({ message: 'Sale rejected', ...result });
  } catch (err) {
    next(err);
  }
});

// POST /api/listings/:id/handover
router.post('/:id/handover', requireAuth, async (req, res, next) => {
  try {
    const listingId = parseInt(req.params.id, 10);
    if (isNaN(listingId)) throw new AppError('Invalid listing ID', 400, 'INVALID_ID');

    const result = await confirmHandover(listingId, req.user.id, req.body.note);
    return res.json({ message: 'Campus handover confirmed. Transaction complete!', ...result });
  } catch (err) {
    next(err);
  }
});

// POST /api/listings/:id/pickup-failed
router.post('/:id/pickup-failed', requireAuth, async (req, res, next) => {
  try {
    const listingId = parseInt(req.params.id, 10);
    if (isNaN(listingId)) throw new AppError('Invalid listing ID', 400, 'INVALID_ID');

    const result = await reportPickupFailed(listingId, req.user.id, req.body.note);
    return res.json({ message: 'Pickup marked as failed', ...result });
  } catch (err) {
    next(err);
  }
});

export default router;
