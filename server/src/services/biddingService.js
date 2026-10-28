import { db } from '../db/pool.js';
import { AppError } from '../middleware/errors.js';
import { realtime } from '../realtime/socket.js';
import { createNotification } from './notificationService.js';

export async function placeBid(listingId, userId, amount, isAuto = false) {
  amount = Math.floor(amount);
  if (isNaN(amount) || amount <= 0) {
    throw new AppError('Bid amount must be a positive integer in rupees (INR)', 400, 'INVALID_AMOUNT');
  }

  const client = await db.connect();
  let previousLeaderId = null;
  let extended = false;
  let finalBidId = 0;
  let finalPrice = amount;
  let finalClosesAt = '';
  let listingTitle = '';
  const outbidUsers = new Set();
  const exhaustedAutoBidders = new Set();

  try {
    await client.query('BEGIN');

    // 1. Lock the listing row with SELECT ... FOR UPDATE
    const listingRes = await client.query(
      `SELECT id, seller_id, title, start_price, min_increment, current_price,
              leading_bid_id, status, closes_at, college_domain, now() as now
       FROM listings
       WHERE id = $1
       FOR UPDATE`,
      [listingId]
    );

    if (listingRes.rows.length === 0) {
      throw new AppError('Listing not found', 404, 'NOT_FOUND');
    }

    const listing = listingRes.rows[0];
    listingTitle = listing.title;
    const nowTime = new Date(listing.now).getTime();
    let closesAtTime = new Date(listing.closes_at).getTime();

    // Verify bidder identity and same college
    const userRes = await client.query(
      'SELECT id, college_domain, email_verified FROM users WHERE id = $1',
      [userId]
    );
    if (userRes.rows.length === 0) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    const bidder = userRes.rows[0];

    if (!bidder.email_verified) {
      throw new AppError('Email verification required to place bids', 403, 'EMAIL_NOT_VERIFIED');
    }

    if (!bidder.college_domain || !listing.college_domain || bidder.college_domain.toLowerCase().trim() !== listing.college_domain.toLowerCase().trim()) {
      throw new AppError('Participation is restricted to students of the same college', 403, 'FORBIDDEN_COLLEGE');
    }

    // 2. Validate status
    if (listing.status !== 'open') {
      throw new AppError(
        `Cannot bid: listing is ${listing.status.replace('_', ' ')}`,
        400,
        'LISTING_NOT_OPEN'
      );
    }

    // 3. Validate clock (server time is the only clock)
    if (nowTime >= closesAtTime) {
      throw new AppError('Auction has already closed', 400, 'AUCTION_CLOSED');
    }

    // 4. Validate seller cannot bid
    if (listing.seller_id === userId) {
      throw new AppError('Sellers cannot bid on their own listings', 403, 'SELLER_CANNOT_BID');
    }

    // 5. Determine current leader
    let currentLeaderId = null;
    if (listing.leading_bid_id) {
      const leadBidRes = await client.query(
        'SELECT bidder_id FROM bids WHERE id = $1',
        [listing.leading_bid_id]
      );
      if (leadBidRes.rows.length > 0) {
        currentLeaderId = leadBidRes.rows[0].bidder_id;
        previousLeaderId = currentLeaderId;
      }
    }

    // 6. Manual bidder cannot outbid themselves
    if (!isAuto && currentLeaderId === userId) {
      throw new AppError('You are already the highest bidder', 400, 'ALREADY_LEADING');
    }

    // 7. Validate minimum bid amount
    let minAllowed;
    if (listing.current_price === null) {
      minAllowed = listing.start_price;
    } else {
      minAllowed = listing.current_price + listing.min_increment;
    }

    if (amount < minAllowed) {
      throw new AppError(
        `Bid of ₹${amount} is below minimum allowed bid of ₹${minAllowed}`,
        400,
        'BID_TOO_LOW',
        { minAllowed, currentPrice: listing.current_price, minIncrement: listing.min_increment }
      );
    }

    // 8. Insert bid
    const insertBidRes = await client.query(
      `INSERT INTO bids (listing_id, bidder_id, amount, is_auto)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [listingId, userId, amount, isAuto]
    );
    finalBidId = insertBidRes.rows[0].id;
    finalPrice = amount;
    currentLeaderId = userId;

    if (previousLeaderId && previousLeaderId !== userId) {
      outbidUsers.add(previousLeaderId);
    }

    // 9. Extension rule: if closes_at - now() <= 30 seconds -> closes_at = now() + 60s
    let currentClosesAtIso = listing.closes_at;
    if (closesAtTime - nowTime <= 30 * 1000) {
      const newClosesAtDate = new Date(nowTime + 60 * 1000);
      currentClosesAtIso = newClosesAtDate.toISOString();
      closesAtTime = newClosesAtDate.getTime();
      extended = true;

      await client.query(
        `INSERT INTO listing_events (listing_id, type, actor_id, note)
         VALUES ($1, 'extended', $2, 'Auction extended by 60s due to bid in last 30s')`,
        [listingId, userId]
      );
    }

    await client.query(
      `UPDATE listings
       SET current_price = $1,
           leading_bid_id = $2,
           closes_at = $3,
           updated_at = now()
       WHERE id = $4`,
      [finalPrice, finalBidId, currentClosesAtIso, listingId]
    );

    // 10. Auto-bid resolution loop
    let currentPrice = finalPrice;
    let currentLeadingBidId = finalBidId;
    let leaderId = currentLeaderId;

    while (true) {
      const minRequired = currentPrice + listing.min_increment;

      const eligibleRes = await client.query(
        `SELECT ab.id, ab.user_id, ab.max_amount, ab.created_at
         FROM auto_bids ab
         JOIN users u ON ab.user_id = u.id
         WHERE ab.listing_id = $1
           AND ab.user_id != $2
           AND ab.max_amount >= $3
           AND LOWER(u.college_domain) = LOWER($4)
         ORDER BY ab.max_amount DESC, ab.created_at ASC
         LIMIT 1`,
        [listingId, leaderId, minRequired, listing.college_domain]
      );

      if (eligibleRes.rows.length === 0) {
        const exhaustedRes = await client.query(
          `SELECT user_id FROM auto_bids
           WHERE listing_id = $1 AND user_id != $2 AND max_amount < $3`,
          [listingId, leaderId, minRequired]
        );
        for (const ex of exhaustedRes.rows) {
          exhaustedAutoBidders.add(ex.user_id);
        }
        break;
      }

      const topCompetitor = eligibleRes.rows[0];
      const autoBidAmount = Math.min(topCompetitor.max_amount, minRequired);

      const autoBidRes = await client.query(
        `INSERT INTO bids (listing_id, bidder_id, amount, is_auto)
         VALUES ($1, $2, $3, true)
         RETURNING id`,
        [listingId, topCompetitor.user_id, autoBidAmount]
      );

      const newBidId = autoBidRes.rows[0].id;
      if (leaderId) {
        outbidUsers.add(leaderId);
      }
      leaderId = topCompetitor.user_id;
      currentPrice = autoBidAmount;
      currentLeadingBidId = newBidId;
      finalBidId = newBidId;
      finalPrice = autoBidAmount;

      if (closesAtTime - nowTime <= 30 * 1000) {
        const newClosesAtDate = new Date(nowTime + 60 * 1000);
        currentClosesAtIso = newClosesAtDate.toISOString();
        closesAtTime = newClosesAtDate.getTime();
        extended = true;

        await client.query(
          `INSERT INTO listing_events (listing_id, type, actor_id, note)
           VALUES ($1, 'extended', $2, 'Auction extended by 60s due to auto-bid in last 30s')`,
          [listingId, topCompetitor.user_id]
        );
      }

      await client.query(
        `UPDATE listings
         SET current_price = $1,
             leading_bid_id = $2,
             closes_at = $3,
             updated_at = now()
         WHERE id = $4`,
        [currentPrice, currentLeadingBidId, currentClosesAtIso, listingId]
      );
    }

    finalClosesAt = currentClosesAtIso;
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Real-time broadcasts and notifications
  let bidderName = 'Anonymous';
  const nameRes = await db.query(
    `SELECT u.name FROM bids b JOIN users u ON b.bidder_id = u.id WHERE b.id = $1`,
    [finalBidId]
  );
  if (nameRes.rows.length > 0) {
    bidderName = nameRes.rows[0].name;
  }

  realtime.emitBidNew(listingId, {
    id: finalBidId,
    listing_id: listingId,
    amount: finalPrice,
    bidder_id: userId,
    bidder_name: bidderName,
    is_auto: isAuto,
    created_at: new Date().toISOString(),
  });

  if (extended) {
    realtime.emitAuctionExtended(listingId, finalClosesAt);
  }

  for (const outbidUserId of outbidUsers) {
    if (outbidUserId !== userId) {
      createNotification(
        outbidUserId,
        'outbid',
        `You were outbid on "${listingTitle}". Current highest bid is ₹${finalPrice}.`,
        listingId
      ).catch(console.error);
    }
  }

  for (const exhUserId of exhaustedAutoBidders) {
    createNotification(
      exhUserId,
      'auto_bid_exhausted',
      `Your automatic bid limit on "${listingTitle}" has been exceeded by higher bids.`,
      listingId
    ).catch(console.error);
  }

  return {
    bidId: finalBidId,
    listingId,
    bidderId: userId,
    amount: finalPrice,
    isAuto,
    currentPrice: finalPrice,
    closesAt: finalClosesAt,
    extended,
    previousLeaderId,
  };
}

export async function setAutoBid(listingId, userId, maxAmount) {
  maxAmount = Math.floor(maxAmount);
  if (isNaN(maxAmount) || maxAmount <= 0) {
    throw new AppError('Maximum bid must be a positive integer in rupees (INR)', 400, 'INVALID_AMOUNT');
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const listingRes = await client.query(
      `SELECT id, seller_id, title, start_price, min_increment, current_price,
              leading_bid_id, status, closes_at, college_domain, now() as now
       FROM listings
       WHERE id = $1
       FOR UPDATE`,
      [listingId]
    );

    if (listingRes.rows.length === 0) {
      throw new AppError('Listing not found', 404, 'NOT_FOUND');
    }

    const listing = listingRes.rows[0];

    // Enforce verified status and same college
    const userRes = await client.query(
      'SELECT id, college_domain, email_verified FROM users WHERE id = $1',
      [userId]
    );
    if (userRes.rows.length === 0) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    const autoBidder = userRes.rows[0];

    if (!autoBidder.email_verified) {
      throw new AppError('Email verification required to configure auto-bids', 403, 'EMAIL_NOT_VERIFIED');
    }

    if (!autoBidder.college_domain || !listing.college_domain || autoBidder.college_domain.toLowerCase().trim() !== listing.college_domain.toLowerCase().trim()) {
      throw new AppError('Participation is restricted to students of the same college', 403, 'FORBIDDEN_COLLEGE');
    }
    if (listing.status !== 'open') {
      throw new AppError('Listing is not open for bidding', 400, 'NOT_OPEN');
    }

    const nowTime = new Date(listing.now).getTime();
    const closesAtTime = new Date(listing.closes_at).getTime();
    if (nowTime >= closesAtTime) {
      throw new AppError('Auction has already closed', 400, 'AUCTION_CLOSED');
    }

    if (listing.seller_id === userId) {
      throw new AppError('Sellers cannot auto-bid on their own listing', 403, 'SELLER_CANNOT_BID');
    }

    const minValidBid = listing.current_price === null
      ? listing.start_price
      : listing.current_price + listing.min_increment;

    if (maxAmount < minValidBid) {
      throw new AppError(
        `Auto-bid maximum ₹${maxAmount} must be at least the current minimum bid of ₹${minValidBid}`,
        400,
        'MAX_BID_TOO_LOW'
      );
    }

    const userMaxBidRes = await client.query(
      `SELECT MAX(amount) as max_user_bid FROM bids WHERE listing_id = $1 AND bidder_id = $2`,
      [listingId, userId]
    );
    const userMaxBid = userMaxBidRes.rows[0]?.max_user_bid;
    if (userMaxBid && maxAmount < userMaxBid) {
      throw new AppError(
        `Cannot set auto-bid lower than your existing bid of ₹${userMaxBid}`,
        400,
        'CANNOT_LOWER_BELOW_EXISTING_BID'
      );
    }

    await client.query(
      `INSERT INTO auto_bids (listing_id, user_id, max_amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (listing_id, user_id)
       DO UPDATE SET max_amount = EXCLUDED.max_amount, created_at = now()`,
      [listingId, userId, maxAmount]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Trigger bid if not leading
  const checkLeaderRes = await db.query(
    'SELECT current_price, leading_bid_id FROM listings WHERE id = $1',
    [listingId]
  );
  let isLeading = false;
  if (checkLeaderRes.rows[0]?.leading_bid_id) {
    const leadBid = await db.query(
      'SELECT bidder_id FROM bids WHERE id = $1',
      [checkLeaderRes.rows[0].leading_bid_id]
    );
    if (leadBid.rows[0]?.bidder_id === userId) {
      isLeading = true;
    }
  }

  if (!isLeading) {
    const listing = (await db.query(
      'SELECT start_price, current_price, min_increment FROM listings WHERE id = $1',
      [listingId]
    )).rows[0];

    const targetBid = listing.current_price === null
      ? listing.start_price
      : listing.current_price + listing.min_increment;

    if (maxAmount >= targetBid) {
      await placeBid(listingId, userId, targetBid, true);
    }
  }

  realtime.emitListingUpdated(listingId, { auto_bid_updated: true });
  return { maxAmount, listingId };
}

export async function removeAutoBid(listingId, userId) {
  await db.query('DELETE FROM auto_bids WHERE listing_id = $1 AND user_id = $2', [listingId, userId]);
  realtime.emitListingUpdated(listingId, { auto_bid_removed: true });
}
