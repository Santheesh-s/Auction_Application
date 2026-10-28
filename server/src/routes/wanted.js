import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { AppError } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { checkMatchesForNewWantedItem } from '../services/wantedMatcher.js';

const router = Router();

const wantedSchema = z.object({
  keywords: z.string().min(2, 'Keywords must be at least 2 characters'),
  category: z.string().optional().nullable(),
  max_price: z.number().int().positive().optional().nullable(),
});

// GET /api/wanted
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, user_id, keywords, category, max_price, active, created_at
       FROM wanted_items
       WHERE user_id = $1 AND active = true
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    return res.json({ wantedItems: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/wanted
router.post('/', requireAuth, validate({ body: wantedSchema }), async (req, res, next) => {
  try {
    const { keywords, category, max_price } = req.body;

    const result = await db.query(
      `INSERT INTO wanted_items (user_id, keywords, category, max_price, active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, user_id, keywords, category, max_price, active, created_at`,
      [
        req.user.id,
        keywords.trim(),
        category?.trim() || null,
        max_price ? Math.floor(max_price) : null,
      ]
    );

    const createdItem = result.rows[0];

    // Immediately check existing open listings per PLAN.md Section 5
    const matchCount = await checkMatchesForNewWantedItem(createdItem);

    return res.status(201).json({
      wantedItem: createdItem,
      matchCount,
      message: matchCount > 0
        ? `Alert saved! Found ${matchCount} matching open listing(s). Check your notifications.`
        : 'Alert saved! We will notify you when a matching item is listed.',
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/wanted/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError('Invalid alert ID', 400, 'INVALID_ID');

    const result = await db.query(
      `UPDATE wanted_items SET active = false WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Wanted item alert not found', 404, 'NOT_FOUND');
    }

    return res.json({ message: 'Alert removed' });
  } catch (err) {
    next(err);
  }
});

export default router;
