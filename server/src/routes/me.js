import { Router } from 'express';
import { db } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/me/listings - Listings created by the authenticated user
router.get('/listings', requireAuth, async (req, res, next) => {
  try {
    const listingsRes = await db.query(
      `SELECT l.id, l.title, l.category, l.condition, l.start_price, l.min_increment,
              l.current_price, l.closes_at, l.status, l.created_at, l.college_domain,
              w.name as winner_name,
              (SELECT url FROM listing_images WHERE listing_id = l.id ORDER BY position ASC LIMIT 1) as primary_image,
              (SELECT COUNT(*) FROM bids WHERE listing_id = l.id) as bid_count
       FROM listings l
       LEFT JOIN users w ON l.winner_id = w.id
       WHERE l.seller_id = $1 AND l.college_domain = $2
       ORDER BY l.created_at DESC`,
      [req.user.id, req.user.college_domain]
    );

    return res.json({ listings: listingsRes.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/me/bids - Auctions where authenticated user has placed bids
router.get('/bids', requireAuth, async (req, res, next) => {
  try {
    const bidsRes = await db.query(
      `SELECT DISTINCT ON (l.id)
              l.id as listing_id, l.title, l.category, l.condition, l.start_price,
              l.current_price, l.closes_at, l.status, l.winner_id, l.college_domain,
              (SELECT MAX(amount) FROM bids WHERE listing_id = l.id AND bidder_id = $1) as my_highest_bid,
              (SELECT url FROM listing_images WHERE listing_id = l.id ORDER BY position ASC LIMIT 1) as primary_image,
              (l.winner_id = $1) as is_winner,
              EXISTS (
                SELECT 1 FROM bids lead_b
                WHERE lead_b.id = l.leading_bid_id AND lead_b.bidder_id = $1
              ) as is_leading
       FROM listings l
       JOIN bids b ON l.id = b.listing_id
       WHERE b.bidder_id = $1 AND l.college_domain = $2
       ORDER BY l.id, l.closes_at ASC`,
      [req.user.id, req.user.college_domain]
    );

    return res.json({ bids: bidsRes.rows });
  } catch (err) {
    next(err);
  }
});

export default router;
