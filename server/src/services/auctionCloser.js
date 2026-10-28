import cron from 'node-cron';
import { db } from '../db/pool.js';
import { AppError } from '../middleware/errors.js';
import { realtime } from '../realtime/socket.js';
import { createNotification } from './notificationService.js';

let cronTask = null;

export async function closeExpiredAuctions() {
  const candidates = await db.query(
    `SELECT id FROM listings WHERE status = 'open' AND closes_at <= now()`
  );

  let closedCount = 0;

  for (const row of candidates.rows) {
    const listingId = row.id;
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const lockRes = await client.query(
        `SELECT id, seller_id, title, status, closes_at, current_price, leading_bid_id, now() as now
         FROM listings
         WHERE id = $1
         FOR UPDATE`,
        [listingId]
      );

      if (lockRes.rows.length === 0) {
        await client.query('ROLLBACK');
        continue;
      }

      const listing = lockRes.rows[0];
      if (listing.status !== 'open' || new Date(listing.now).getTime() < new Date(listing.closes_at).getTime()) {
        await client.query('ROLLBACK');
        continue;
      }

      if (listing.leading_bid_id && listing.current_price !== null) {
        const bidRes = await client.query(
          'SELECT bidder_id FROM bids WHERE id = $1',
          [listing.leading_bid_id]
        );
        const winnerId = bidRes.rows[0]?.bidder_id;

        await client.query(
          `UPDATE listings
           SET status = 'pending_approval',
               winner_id = $1,
               updated_at = now()
           WHERE id = $2`,
          [winnerId, listingId]
        );

        await client.query(
          `INSERT INTO listing_events (listing_id, type, actor_id, note)
           VALUES ($1, 'closed_won', $2, $3)`,
          [listingId, winnerId, `Auction closed with winning bid of ₹${listing.current_price}`]
        );

        await client.query('COMMIT');
        closedCount++;

        realtime.emitAuctionClosed(listingId, {
          status: 'pending_approval',
          winner_id: winnerId,
          final_price: listing.current_price,
        });

        createNotification(
          listing.seller_id,
          'won_pending_approval',
          `Auction for "${listing.title}" closed at ₹${listing.current_price}! Awaiting your approval.`,
          listingId
        ).catch(console.error);

        if (winnerId) {
          createNotification(
            winnerId,
            'won_pending_approval',
            `Congratulations! You placed the top bid of ₹${listing.current_price} for "${listing.title}". Waiting for seller approval.`,
            listingId
          ).catch(console.error);
        }
      } else {
        await client.query(
          `UPDATE listings
           SET status = 'unsold',
               updated_at = now()
           WHERE id = $1`,
          [listingId]
        );

        await client.query(
          `INSERT INTO listing_events (listing_id, type, actor_id, note)
           VALUES ($1, 'closed_unsold', $2, 'Auction closed with no bids placed')`,
          [listingId, listing.seller_id]
        );

        await client.query('COMMIT');
        closedCount++;

        realtime.emitAuctionClosed(listingId, {
          status: 'unsold',
          winner_id: null,
          final_price: null,
        });

        createNotification(
          listing.seller_id,
          'cancelled',
          `Your auction for "${listing.title}" ended without any bids.`,
          listingId
        ).catch(console.error);
      }
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Error closing listing ${listingId}:`, err);
    } finally {
      client.release();
    }
  }

  return closedCount;
}

export function startAuctionCloserCron() {
  if (cronTask) return;
  cronTask = cron.schedule('*/5 * * * * *', async () => {
    try {
      await closeExpiredAuctions();
    } catch (err) {
      console.error('Error in auctionCloser cron:', err);
    }
  });
  console.log('Auction closer cron started (runs every 5s)');
}

export async function approveSale(listingId, sellerId, note) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query('SELECT id, seller_id, winner_id, title, status, current_price FROM listings WHERE id = $1 FOR UPDATE', [listingId]);

    if (res.rows.length === 0) throw new AppError('Listing not found', 404, 'NOT_FOUND');
    const listing = res.rows[0];

    if (listing.seller_id !== sellerId) {
      throw new AppError('Only the seller can approve this sale', 403, 'FORBIDDEN');
    }
    if (listing.status !== 'pending_approval') {
      throw new AppError(`Cannot approve: listing status is ${listing.status}`, 400, 'INVALID_STATUS');
    }

    await client.query(
      `UPDATE listings SET status = 'approved', updated_at = now() WHERE id = $1`,
      [listingId]
    );

    await client.query(
      `INSERT INTO listing_events (listing_id, type, actor_id, note)
       VALUES ($1, 'approved', $2, $3)`,
      [listingId, sellerId, note || 'Seller approved the winning bid. Item reserved.']
    );

    await client.query('COMMIT');
    realtime.emitListingUpdated(listingId, { status: 'approved' });

    if (listing.winner_id) {
      createNotification(
        listing.winner_id,
        'winner_approved',
        `Great news! The seller approved your bid of ₹${listing.current_price} for "${listing.title}". Please coordinate campus pickup!`,
        listingId
      ).catch(console.error);
    }

    return { status: 'approved' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function rejectSale(listingId, sellerId, note) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query('SELECT id, seller_id, winner_id, title, status FROM listings WHERE id = $1 FOR UPDATE', [listingId]);

    if (res.rows.length === 0) throw new AppError('Listing not found', 404, 'NOT_FOUND');
    const listing = res.rows[0];

    if (listing.seller_id !== sellerId) {
      throw new AppError('Only the seller can reject this sale', 403, 'FORBIDDEN');
    }
    if (listing.status !== 'pending_approval') {
      throw new AppError(`Cannot reject: listing status is ${listing.status}`, 400, 'INVALID_STATUS');
    }

    await client.query(
      `UPDATE listings SET status = 'rejected', updated_at = now() WHERE id = $1`,
      [listingId]
    );

    await client.query(
      `INSERT INTO listing_events (listing_id, type, actor_id, note)
       VALUES ($1, 'rejected', $2, $3)`,
      [listingId, sellerId, note || 'Seller rejected the winning price.']
    );

    await client.query('COMMIT');
    realtime.emitListingUpdated(listingId, { status: 'rejected' });

    if (listing.winner_id) {
      createNotification(
        listing.winner_id,
        'rejected',
        `The seller did not accept the final price for "${listing.title}".`,
        listingId
      ).catch(console.error);
    }

    return { status: 'rejected' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function confirmHandover(listingId, actorId, note) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query('SELECT id, seller_id, winner_id, title, status FROM listings WHERE id = $1 FOR UPDATE', [listingId]);

    if (res.rows.length === 0) throw new AppError('Listing not found', 404, 'NOT_FOUND');
    const listing = res.rows[0];

    if (listing.seller_id !== actorId && listing.winner_id !== actorId) {
      throw new AppError('Only the seller or buyer can confirm handover', 403, 'FORBIDDEN');
    }
    if (listing.status !== 'approved') {
      throw new AppError(`Cannot confirm handover: listing status is ${listing.status}`, 400, 'INVALID_STATUS');
    }

    await client.query(
      `UPDATE listings SET status = 'completed', updated_at = now() WHERE id = $1`,
      [listingId]
    );

    await client.query(
      `INSERT INTO listing_events (listing_id, type, actor_id, note)
       VALUES ($1, 'handover_confirmed', $2, $3)`,
      [listingId, actorId, note || 'Campus handover confirmed. Sale complete!']
    );

    await client.query('COMMIT');
    realtime.emitListingUpdated(listingId, { status: 'completed' });

    const otherParty = actorId === listing.seller_id ? listing.winner_id : listing.seller_id;
    if (otherParty) {
      createNotification(
        otherParty,
        'sold_handover',
        `Campus handover for "${listing.title}" has been confirmed as completed!`,
        listingId
      ).catch(console.error);
    }

    return { status: 'completed' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function reportPickupFailed(listingId, sellerId, note) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query('SELECT id, seller_id, winner_id, title, status FROM listings WHERE id = $1 FOR UPDATE', [listingId]);

    if (res.rows.length === 0) throw new AppError('Listing not found', 404, 'NOT_FOUND');
    const listing = res.rows[0];

    if (listing.seller_id !== sellerId) {
      throw new AppError('Only the seller can report failed pickup', 403, 'FORBIDDEN');
    }
    if (listing.status !== 'approved') {
      throw new AppError(`Cannot mark failed pickup: listing status is ${listing.status}`, 400, 'INVALID_STATUS');
    }

    await client.query(
      `UPDATE listings SET status = 'failed_pickup', updated_at = now() WHERE id = $1`,
      [listingId]
    );

    await client.query(
      `INSERT INTO listing_events (listing_id, type, actor_id, note)
       VALUES ($1, 'pickup_failed', $2, $3)`,
      [listingId, sellerId, note || 'Pickup failed or buyer did not show up.']
    );

    await client.query('COMMIT');
    realtime.emitListingUpdated(listingId, { status: 'failed_pickup' });

    if (listing.winner_id) {
      createNotification(
        listing.winner_id,
        'rejected',
        `The campus pickup for "${listing.title}" was marked as failed by the seller.`,
        listingId
      ).catch(console.error);
    }

    return { status: 'failed_pickup' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
