import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { db } from '../db/pool.js';
import { AppError } from '../middleware/errors.js';
import { requireAuth, optionalAuth, requireVerified } from '../middleware/auth.js';
import { requireSameCollege } from '../middleware/college.js';
import { realtime } from '../realtime/socket.js';
import { createNotification } from '../services/notificationService.js';
import { checkMatchesForNewListing } from '../services/wantedMatcher.js';

const router = Router();

const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new AppError('Only image files are permitted', 400, 'INVALID_FILE_TYPE'));
    }
  },
});

// GET /api/listings
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const q = req.query.q;
    const category = req.query.category;
    const condition = req.query.condition;
    const minPrice = req.query.minPrice ? parseInt(req.query.minPrice, 10) : undefined;
    const maxPrice = req.query.maxPrice ? parseInt(req.query.maxPrice, 10) : undefined;
    const closingWithin = req.query.closingWithin;
    const status = req.query.status || 'open';
    const sort = req.query.sort || 'closing_soon';
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '12', 10)));
    const offset = (page - 1) * limit;

    const conditions = [];
    const values = [];
    let pIdx = 1;

    // Enforce same-college isolation: authenticated user's college takes strict precedence
    const userCollege = req.user?.college_domain || req.query.college_domain || null;
    if (userCollege) {
      conditions.push(`l.college_domain = $${pIdx}`);
      values.push(userCollege.toLowerCase().trim());
      pIdx++;
    } else {
      // Unauthenticated with no college filter specified -> return empty list
      conditions.push(`1 = 0`);
    }

    if (status !== 'all') {
      conditions.push(`l.status = $${pIdx}`);
      values.push(status);
      pIdx++;
    }

    if (q && q.trim()) {
      conditions.push(`(l.title ILIKE $${pIdx} OR l.description ILIKE $${pIdx})`);
      values.push(`%${q.trim()}%`);
      pIdx++;
    }

    if (category && category !== 'all') {
      conditions.push(`l.category = $${pIdx}`);
      values.push(category);
      pIdx++;
    }

    if (condition && condition !== 'all') {
      conditions.push(`l.condition = $${pIdx}`);
      values.push(condition);
      pIdx++;
    }

    if (minPrice !== undefined && !isNaN(minPrice)) {
      conditions.push(`COALESCE(l.current_price, l.start_price) >= $${pIdx}`);
      values.push(minPrice);
      pIdx++;
    }
    if (maxPrice !== undefined && !isNaN(maxPrice)) {
      conditions.push(`COALESCE(l.current_price, l.start_price) <= $${pIdx}`);
      values.push(maxPrice);
      pIdx++;
    }

    if (closingWithin) {
      let hours = 24;
      if (closingWithin === '1h') hours = 1;
      else if (closingWithin === '6h') hours = 6;
      else if (closingWithin === '24h') hours = 24;

      conditions.push(`l.closes_at > now() AND l.closes_at <= now() + interval '${hours} hours'`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderBy = 'l.closes_at ASC';
    if (sort === 'newest') {
      orderBy = 'l.created_at DESC';
    } else if (sort === 'price_asc') {
      orderBy = 'COALESCE(l.current_price, l.start_price) ASC';
    } else if (sort === 'price_desc') {
      orderBy = 'COALESCE(l.current_price, l.start_price) DESC';
    }

    const countSql = `SELECT COUNT(*) as total FROM listings l ${whereClause}`;
    const countRes = await db.query(countSql, values);
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    const dataSql = `
      SELECT l.id, l.seller_id, l.title, l.category, l.description, l.condition,
             l.start_price, l.min_increment, l.current_price, l.closes_at, l.status,
             l.created_at, u.name as seller_name,
             (SELECT url FROM listing_images WHERE listing_id = l.id ORDER BY position ASC LIMIT 1) as primary_image,
             (SELECT COUNT(*) FROM bids WHERE listing_id = l.id) as bid_count
      FROM listings l
      JOIN users u ON l.seller_id = u.id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${pIdx} OFFSET $${pIdx + 1}
    `;

    values.push(limit, offset);
    const dataRes = await db.query(dataSql, values);

    return res.json({
      listings: dataRes.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/listings/:id
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const listingId = parseInt(req.params.id, 10);
    if (isNaN(listingId)) throw new AppError('Invalid listing ID', 400, 'INVALID_ID');

    const listingRes = await db.query(
      `SELECT l.id, l.seller_id, l.title, l.category, l.description, l.condition,
              l.start_price, l.min_increment, l.current_price, l.leading_bid_id,
              l.winner_id, l.closes_at, l.status, l.created_at, l.updated_at,
              l.college_domain,
              u.name as seller_name,
              w.name as winner_name
       FROM listings l
       JOIN users u ON l.seller_id = u.id
       LEFT JOIN users w ON l.winner_id = w.id
       WHERE l.id = $1`,
      [listingId]
    );

    if (listingRes.rows.length === 0) {
      throw new AppError('Listing not found', 404, 'NOT_FOUND');
    }

    const listing = listingRes.rows[0];

    // Enforce same-college isolation: return 404 to avoid leaking existence
    if (req.user) {
      requireSameCollege(listing, req.user, true);
    } else if (req.query.college_domain) {
      if (listing.college_domain.toLowerCase() !== req.query.college_domain.toLowerCase().trim()) {
        throw new AppError('Listing not found', 404, 'NOT_FOUND');
      }
    }

    const imagesRes = await db.query(
      `SELECT id, url, position FROM listing_images WHERE listing_id = $1 ORDER BY position ASC`,
      [listingId]
    );

    const bidsRes = await db.query(
      `SELECT b.id, b.amount, b.is_auto, b.created_at, u.name as bidder_name
       FROM bids b
       JOIN users u ON b.bidder_id = u.id
       WHERE b.listing_id = $1
       ORDER BY b.amount DESC, b.created_at ASC`,
      [listingId]
    );

    const autoBidsRes = await db.query(
      `SELECT ab.id, ab.max_amount, ab.created_at, u.name as user_name
       FROM auto_bids ab
       JOIN users u ON ab.user_id = u.id
       WHERE ab.listing_id = $1
       ORDER BY ab.max_amount DESC, ab.created_at ASC`,
      [listingId]
    );

    const eventsRes = await db.query(
      `SELECT le.id, le.type, le.note, le.created_at, u.name as actor_name
       FROM listing_events le
       LEFT JOIN users u ON le.actor_id = u.id
       WHERE le.listing_id = $1
       ORDER BY le.created_at ASC`,
      [listingId]
    );

    const questionsRes = await db.query(
      `SELECT q.id, q.body, q.answer, q.answered_at, q.hidden, q.created_at,
              u.name as asker_name
       FROM questions q
       JOIN users u ON q.asker_id = u.id
       WHERE q.listing_id = $1 AND (q.hidden = false OR $2 = true)
       ORDER BY (q.answer IS NOT NULL) DESC, q.created_at DESC`,
      [listingId, req.user?.id === listing.seller_id]
    );

    let userState = null;
    if (req.user) {
      const userAutoBid = await db.query(
        `SELECT max_amount FROM auto_bids WHERE listing_id = $1 AND user_id = $2`,
        [listingId, req.user.id]
      );
      const isLeader = bidsRes.rows.length > 0 && bidsRes.rows[0].bidder_name === req.user.name;

      userState = {
        isSeller: req.user.id === listing.seller_id,
        isWinner: req.user.id === listing.winner_id,
        isLeading: isLeader,
        myAutoBidMax: userAutoBid.rows[0]?.max_amount ?? null,
      };
    }

    return res.json({
      listing,
      images: imagesRes.rows,
      bids: bidsRes.rows,
      autoBids: autoBidsRes.rows,
      events: eventsRes.rows,
      questions: questionsRes.rows,
      userState,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/listings
router.post('/', requireAuth, requireVerified, upload.array('images', 5), async (req, res, next) => {
  const client = await db.connect();
  try {
    const {
      title,
      category,
      description,
      condition,
      start_price,
      min_increment,
      closes_at,
    } = req.body;

    if (!title || !category || !description || !condition || !start_price || !min_increment || !closes_at) {
      throw new AppError('All listing fields are required', 400, 'MISSING_FIELDS');
    }

    const startPriceInt = parseInt(start_price, 10);
    const minIncInt = parseInt(min_increment, 10);
    if (isNaN(startPriceInt) || startPriceInt <= 0) {
      throw new AppError('Start price must be a positive integer in rupees (INR)', 400, 'INVALID_START_PRICE');
    }
    if (isNaN(minIncInt) || minIncInt <= 0) {
      throw new AppError('Minimum increment must be a positive integer in rupees (INR)', 400, 'INVALID_MIN_INCREMENT');
    }

    const closesAtDate = new Date(closes_at);
    if (isNaN(closesAtDate.getTime()) || closesAtDate.getTime() <= Date.now() + 30 * 1000) {
      throw new AppError('Closing time must be at least 30 seconds in the future', 400, 'INVALID_CLOSING_TIME');
    }

    const files = req.files || [];
    if (files.length === 0) {
      throw new AppError('At least one photo is required for the listing', 400, 'IMAGE_REQUIRED');
    }

    await client.query('BEGIN');

    // Force college_domain = seller's college_domain from session (ignore any client-supplied value)
    const listingRes = await client.query(
      `INSERT INTO listings (
        seller_id, title, category, description, condition,
        start_price, min_increment, closes_at, status, college_domain
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9)
      RETURNING id, college_domain`,
      [
        req.user.id,
        title.trim(),
        category.trim(),
        description.trim(),
        condition.trim(),
        startPriceInt,
        minIncInt,
        closesAtDate.toISOString(),
        req.user.college_domain,
      ]
    );

    const listingId = listingRes.rows[0].id;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const imageUrl = `/uploads/${file.filename}`;
      await client.query(
        `INSERT INTO listing_images (listing_id, url, position) VALUES ($1, $2, $3)`,
        [listingId, imageUrl, i]
      );
    }

    await client.query(
      `INSERT INTO listing_events (listing_id, type, actor_id, note)
       VALUES ($1, 'created', $2, 'Listing created')`,
      [listingId, req.user.id]
    );

    await client.query('COMMIT');

    checkMatchesForNewListing({
      id: listingId,
      seller_id: req.user.id,
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      start_price: startPriceInt,
      college_domain: req.user.college_domain,
    }).catch(console.error);

    return res.status(201).json({ id: listingId, message: 'Listing created successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// PATCH /api/listings/:id
router.patch('/:id', requireAuth, requireVerified, async (req, res, next) => {
  const listingId = parseInt(req.params.id, 10);
  if (isNaN(listingId)) throw new AppError('Invalid listing ID', 400, 'INVALID_ID');

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const listingRes = await client.query(
      'SELECT id, seller_id, status, leading_bid_id, college_domain FROM listings WHERE id = $1 FOR UPDATE',
      [listingId]
    );

    if (listingRes.rows.length === 0) throw new AppError('Listing not found', 404, 'NOT_FOUND');
    const listing = listingRes.rows[0];

    requireSameCollege(listing, req.user, false);

    if (listing.seller_id !== req.user.id) {
      throw new AppError('Only the seller can edit this listing', 403, 'FORBIDDEN');
    }
    if (listing.status !== 'open') {
      throw new AppError('Only open listings can be edited', 400, 'NOT_OPEN');
    }

    const hasBids = listing.leading_bid_id !== null;
    const { title, description, category, condition, start_price, min_increment, closes_at } = req.body;

    if (hasBids && (start_price !== undefined || min_increment !== undefined || closes_at !== undefined)) {
      throw new AppError(
        'Price, minimum increment, and closing time are locked because bids already exist',
        400,
        'FINANCIAL_FIELDS_LOCKED'
      );
    }

    const updates = [];
    const values = [];
    let pIdx = 1;

    if (title !== undefined) {
      updates.push(`title = $${pIdx++}`);
      values.push(title.trim());
    }
    if (description !== undefined) {
      updates.push(`description = $${pIdx++}`);
      values.push(description.trim());
    }
    if (category !== undefined) {
      updates.push(`category = $${pIdx++}`);
      values.push(category.trim());
    }
    if (condition !== undefined) {
      updates.push(`condition = $${pIdx++}`);
      values.push(condition.trim());
    }

    if (!hasBids) {
      if (start_price !== undefined) {
        const sp = parseInt(start_price, 10);
        if (sp <= 0) throw new AppError('Start price must be > 0', 400, 'INVALID_PRICE');
        updates.push(`start_price = $${pIdx++}`);
        values.push(sp);
      }
      if (min_increment !== undefined) {
        const mi = parseInt(min_increment, 10);
        if (mi <= 0) throw new AppError('Increment must be > 0', 400, 'INVALID_INCREMENT');
        updates.push(`min_increment = $${pIdx++}`);
        values.push(mi);
      }
      if (closes_at !== undefined) {
        const ca = new Date(closes_at);
        if (ca.getTime() <= Date.now()) throw new AppError('Closes at must be future', 400, 'INVALID_CLOSES_AT');
        updates.push(`closes_at = $${pIdx++}`);
        values.push(ca.toISOString());
      }
    }

    updates.push(`updated_at = now()`);
    values.push(listingId);

    const updateSql = `UPDATE listings SET ${updates.join(', ')} WHERE id = $${pIdx}`;
    await client.query(updateSql, values);

    await client.query(
      `INSERT INTO listing_events (listing_id, type, actor_id, note)
       VALUES ($1, 'edited', $2, 'Listing details updated by seller')`,
      [listingId, req.user.id]
    );

    await client.query('COMMIT');
    realtime.emitListingUpdated(listingId, { edited: true });

    return res.json({ message: 'Listing updated successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// POST /api/listings/:id/cancel
router.post('/:id/cancel', requireAuth, requireVerified, async (req, res, next) => {
  const listingId = parseInt(req.params.id, 10);
  if (isNaN(listingId)) throw new AppError('Invalid listing ID', 400, 'INVALID_ID');

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const listingRes = await client.query(
      'SELECT id, seller_id, title, status, college_domain FROM listings WHERE id = $1 FOR UPDATE',
      [listingId]
    );

    if (listingRes.rows.length === 0) throw new AppError('Listing not found', 404, 'NOT_FOUND');
    const listing = listingRes.rows[0];

    requireSameCollege(listing, req.user, false);

    if (listing.seller_id !== req.user.id) {
      throw new AppError('Only the seller can cancel this listing', 403, 'FORBIDDEN');
    }
    if (listing.status !== 'open') {
      throw new AppError(`Cannot cancel listing in status ${listing.status}`, 400, 'INVALID_STATUS');
    }

    await client.query(`UPDATE listings SET status = 'cancelled', updated_at = now() WHERE id = $1`, [listingId]);
    await client.query(
      `INSERT INTO listing_events (listing_id, type, actor_id, note)
       VALUES ($1, 'cancelled', $2, 'Listing cancelled by seller')`,
      [listingId, req.user.id]
    );

    const biddersRes = await client.query(
      'SELECT DISTINCT bidder_id FROM bids WHERE listing_id = $1',
      [listingId]
    );

    await client.query('COMMIT');

    realtime.emitListingUpdated(listingId, { status: 'cancelled' });

    for (const b of biddersRes.rows) {
      createNotification(
        b.bidder_id,
        'cancelled',
        `The listing "${listing.title}" you bid on was cancelled by the seller.`,
        listingId
      ).catch(console.error);
    }

    return res.json({ message: 'Listing cancelled successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

export default router;
