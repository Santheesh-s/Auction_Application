import { Router } from 'express';
import { db } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/notifications
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const notificationsRes = await db.query(
      `SELECT id, user_id, type, listing_id, message, read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    const unreadCountRes = await db.query(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = false`,
      [req.user.id]
    );

    return res.json({
      notifications: notificationsRes.rows,
      unreadCount: parseInt(unreadCountRes.rows[0]?.count || '0', 10),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/read
router.post('/read', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.body;
    if (id) {
      await db.query('UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    } else {
      await db.query('UPDATE notifications SET read = true WHERE user_id = $1', [req.user.id]);
    }
    return res.json({ message: 'Marked as read' });
  } catch (err) {
    next(err);
  }
});

export default router;
