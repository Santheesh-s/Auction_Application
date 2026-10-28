import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { AppError } from '../middleware/errors.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { requireSameCollege } from '../middleware/college.js';
import { validate } from '../middleware/validate.js';
import { createNotification } from '../services/notificationService.js';
import { realtime } from '../realtime/socket.js';

const router = Router();

const askSchema = z.object({
  body: z.string().min(3, 'Question must be at least 3 characters').max(300, 'Question cannot exceed 300 characters'),
});

const answerSchema = z.object({
  answer: z.string().min(1, 'Answer cannot be empty').max(600, 'Answer cannot exceed 600 characters'),
});

// POST /api/listings/:id/questions
router.post(
  '/listings/:id/questions',
  requireAuth,
  requireVerified,
  validate({ body: askSchema }),
  async (req, res, next) => {
    try {
      const listingId = parseInt(req.params.id, 10);
      if (isNaN(listingId)) throw new AppError('Invalid listing ID', 400, 'INVALID_ID');

      const listingRes = await db.query(
        'SELECT id, seller_id, title, status, college_domain FROM listings WHERE id = $1',
        [listingId]
      );

      if (listingRes.rows.length === 0) throw new AppError('Listing not found', 404, 'NOT_FOUND');
      const listing = listingRes.rows[0];

      requireSameCollege(listing, req.user, false);

      if (listing.seller_id === req.user.id) {
        throw new AppError('Sellers cannot ask questions on their own listings', 400, 'CANNOT_ASK_OWN_LISTING');
      }

      const userQuestionsForListing = await db.query(
        'SELECT COUNT(*) as count FROM questions WHERE listing_id = $1 AND asker_id = $2',
        [listingId, req.user.id]
      );
      if (parseInt(userQuestionsForListing.rows[0]?.count || '0', 10) >= 3) {
        throw new AppError('You have reached the maximum limit of 3 questions on this listing', 429, 'RATE_LIMIT_REACHED');
      }

      const userQuestionsHour = await db.query(
        `SELECT COUNT(*) as count FROM questions WHERE asker_id = $1 AND created_at > now() - interval '1 hour'`,
        [req.user.id]
      );
      if (parseInt(userQuestionsHour.rows[0]?.count || '0', 10) >= 10) {
        throw new AppError('Rate limit exceeded: max 10 questions per hour', 429, 'HOURLY_RATE_LIMIT');
      }

      const { body } = req.body;
      const insertRes = await db.query(
        `INSERT INTO questions (listing_id, asker_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, created_at`,
        [listingId, req.user.id, body.trim()]
      );

      createNotification(
        listing.seller_id,
        'question_asked',
        `${req.user.name} asked a question about "${listing.title}": "${body.trim()}"`,
        listingId
      ).catch(console.error);

      realtime.emitListingUpdated(listingId, { question_asked: true });

      return res.status(201).json({
        id: insertRes.rows[0].id,
        message: 'Question posted successfully',
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/questions/:id/answer
router.post(
  '/questions/:id/answer',
  requireAuth,
  requireVerified,
  validate({ body: answerSchema }),
  async (req, res, next) => {
    try {
      const questionId = parseInt(req.params.id, 10);
      if (isNaN(questionId)) throw new AppError('Invalid question ID', 400, 'INVALID_ID');

      const qRes = await db.query(
        `SELECT q.id, q.listing_id, q.asker_id, q.body, l.seller_id, l.title as listing_title, l.college_domain
         FROM questions q
         JOIN listings l ON q.listing_id = l.id
         WHERE q.id = $1`,
        [questionId]
      );

      if (qRes.rows.length === 0) throw new AppError('Question not found', 404, 'NOT_FOUND');
      const question = qRes.rows[0];

      requireSameCollege(question, req.user, false);

      if (question.seller_id !== req.user.id) {
        throw new AppError('Only the seller can answer questions for this listing', 403, 'FORBIDDEN');
      }

      const { answer } = req.body;
      await db.query(
        `UPDATE questions SET answer = $1, answered_at = now() WHERE id = $2`,
        [answer.trim(), questionId]
      );

      createNotification(
        question.asker_id,
        'question_answered',
        `Seller answered your question about "${question.listing_title}": "${answer.trim()}"`,
        question.listing_id
      ).catch(console.error);

      realtime.emitListingUpdated(question.listing_id, { question_answered: true });

      return res.json({ message: 'Answer posted successfully' });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/questions/:id/hide
router.post('/questions/:id/hide', requireAuth, requireVerified, async (req, res, next) => {
  try {
    const questionId = parseInt(req.params.id, 10);
    if (isNaN(questionId)) throw new AppError('Invalid question ID', 400, 'INVALID_ID');

    const qRes = await db.query(
      `SELECT q.id, q.listing_id, l.seller_id, l.college_domain
       FROM questions q
       JOIN listings l ON q.listing_id = l.id
       WHERE q.id = $1`,
      [questionId]
    );

    if (qRes.rows.length === 0) throw new AppError('Question not found', 404, 'NOT_FOUND');
    const question = qRes.rows[0];

    requireSameCollege(question, req.user, false);

    if (question.seller_id !== req.user.id) {
      throw new AppError('Only the seller can hide questions', 403, 'FORBIDDEN');
    }

    await db.query('UPDATE questions SET hidden = true WHERE id = $1', [questionId]);
    realtime.emitListingUpdated(question.listing_id, { question_hidden: true });

    return res.json({ message: 'Question hidden' });
  } catch (err) {
    next(err);
  }
});

export default router;
