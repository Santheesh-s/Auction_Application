import { db } from '../db/pool.js';
import { AppError } from '../middleware/errors.js';
import { setAutoBid } from './biddingService.js';

// TOOL 1: search_listings (Strictly public info)
export async function toolSearchListings(params = {}) {
  let sql = `
    SELECT id, title, category, condition, start_price, current_price, closes_at, status
    FROM listings
    WHERE status = 'open' AND closes_at > now()
  `;
  const values = [];
  let paramIdx = 1;

  if (params.query) {
    sql += ` AND (title ILIKE $${paramIdx} OR description ILIKE $${paramIdx})`;
    values.push(`%${params.query}%`);
    paramIdx++;
  }

  if (params.category) {
    sql += ` AND category ILIKE $${paramIdx}`;
    values.push(`%${params.category}%`);
    paramIdx++;
  }

  if (params.max_price) {
    sql += ` AND COALESCE(current_price, start_price) <= $${paramIdx}`;
    values.push(params.max_price);
    paramIdx++;
  }

  sql += ` ORDER BY closes_at ASC LIMIT 6`;

  const res = await db.query(sql, values);
  return res.rows.map(item => ({
    id: item.id,
    title: item.title,
    category: item.category,
    condition: item.condition,
    price: item.current_price ?? item.start_price,
    closes_at: item.closes_at,
  }));
}

// TOOL 2: get_listing (Public details & bids with display name ONLY)
export async function toolGetListing(listingId) {
  const listingRes = await db.query(
    `SELECT l.id, l.title, l.description, l.category, l.condition, l.start_price,
            l.min_increment, l.current_price, l.closes_at, l.status,
            u.name as seller_name
     FROM listings l
     JOIN users u ON l.seller_id = u.id
     WHERE l.id = $1`,
    [listingId]
  );

  if (listingRes.rows.length === 0) return null;
  const listing = listingRes.rows[0];

  const bidsRes = await db.query(
    `SELECT b.id, b.amount, b.is_auto, b.created_at, u.name as bidder_name
     FROM bids b
     JOIN users u ON b.bidder_id = u.id
     WHERE b.listing_id = $1
     ORDER BY b.amount DESC, b.created_at ASC
     LIMIT 10`,
    [listingId]
  );

  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    category: listing.category,
    condition: listing.condition,
    current_price: listing.current_price ?? listing.start_price,
    min_increment: listing.min_increment,
    seller_name: listing.seller_name,
    closes_at: listing.closes_at,
    status: listing.status,
    recent_bids: bidsRes.rows,
  };
}

// TOOL 3: propose_bid (Does NOT bid; creates proposal card for user confirmation)
export async function toolProposeBid(userId, listingId, maxAmount) {
  const listingRes = await db.query(
    `SELECT id, title, status, closes_at FROM listings WHERE id = $1`,
    [listingId]
  );

  if (listingRes.rows.length === 0) {
    throw new AppError('Listing not found', 404, 'NOT_FOUND');
  }

  const listing = listingRes.rows[0];
  if (listing.status !== 'open') {
    throw new AppError('Listing is no longer open for bidding', 400, 'NOT_OPEN');
  }

  const proposalRes = await db.query(
    `INSERT INTO assistant_proposals (user_id, listing_id, max_amount, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id, status, created_at`,
    [userId, listingId, Math.floor(maxAmount)]
  );

  return {
    proposal_id: proposalRes.rows[0].id,
    listing_id: listing.id,
    listing_title: listing.title,
    max_amount: Math.floor(maxAmount),
    status: 'pending',
  };
}

// Confirm Proposal (Only called via user session HTTP endpoint)
export async function confirmProposal(proposalId, userId) {
  const proposalRes = await db.query(
    `SELECT id, user_id, listing_id, max_amount, status, created_at
     FROM assistant_proposals
     WHERE id = $1`,
    [proposalId]
  );

  if (proposalRes.rows.length === 0) {
    throw new AppError('Proposal not found', 404, 'NOT_FOUND');
  }

  const proposal = proposalRes.rows[0];
  if (proposal.user_id !== userId) {
    throw new AppError('You do not own this proposal', 403, 'FORBIDDEN');
  }

  if (proposal.status !== 'pending') {
    throw new AppError(`Proposal is already ${proposal.status}`, 400, 'ALREADY_PROCESSED');
  }

  // Check 10-minute expiry
  const ageMs = Date.now() - new Date(proposal.created_at).getTime();
  if (ageMs > 10 * 60 * 1000) {
    await db.query(`UPDATE assistant_proposals SET status = 'expired' WHERE id = $1`, [proposalId]);
    throw new AppError('Proposal has expired (10 minute limit)', 400, 'PROPOSAL_EXPIRED');
  }

  // Execute auto-bid using verified setAutoBid
  await setAutoBid(proposal.listing_id, userId, proposal.max_amount);
  await db.query(`UPDATE assistant_proposals SET status = 'confirmed' WHERE id = $1`, [proposalId]);

  return { success: true, listing_id: proposal.listing_id, max_amount: proposal.max_amount };
}

export async function cancelProposal(proposalId, userId) {
  const proposalRes = await db.query(
    `SELECT user_id, status FROM assistant_proposals WHERE id = $1`,
    [proposalId]
  );

  if (proposalRes.rows.length === 0) {
    throw new AppError('Proposal not found', 404, 'NOT_FOUND');
  }

  if (proposalRes.rows[0].user_id !== userId) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }

  await db.query(`UPDATE assistant_proposals SET status = 'rejected' WHERE id = $1`, [proposalId]);
  return { success: true };
}

export async function handleAssistantChat(userId, messages) {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content?.trim() || '';
  const textLower = lastUserMsg.toLowerCase();

  // Intent: propose bid
  const bidMatch = textLower.match(/(?:bid|place bid|auto[- ]?bid|offer)\s+(?:for me\s+)?(?:up to\s+)?₹?\s*(\d+)(?:\s+(?:on|for)\s+(?:listing\s*#?|#)?(\d+|[a-z\s]+))?/i);

  if (bidMatch) {
    const amount = parseInt(bidMatch[1], 10);
    const target = bidMatch[2]?.trim();

    let listingId = null;
    if (target && /^\d+$/.test(target)) {
      listingId = parseInt(target, 10);
    } else {
      const queryStr = target || 'cycle';
      const searchRes = await toolSearchListings({ query: queryStr });
      if (searchRes.length > 0) {
        listingId = searchRes[0].id;
      }
    }

    if (listingId && amount > 0) {
      const proposal = await toolProposeBid(userId, listingId, amount);
      return {
        reply: `I have prepared a bid proposal for **${proposal.listing_title}** up to **₹${amount}**. Because safety guardrails require your explicit approval, please confirm below to activate this automatic bid:`,
        proposal: {
          id: proposal.proposal_id,
          listing_id: proposal.listing_id,
          listing_title: proposal.listing_title,
          max_amount: proposal.max_amount,
          status: proposal.status,
        },
      };
    }
  }

  // Intent: search
  const priceMatch = textLower.match(/(?:under|below|less than|max)\s*₹?\s*(\d+)/i);
  const maxPrice = priceMatch ? parseInt(priceMatch[1], 10) : undefined;

  let cleanQuery = lastUserMsg
    .replace(/(?:find|show|search|look for|get|under|below|less than|max|₹|\d+|me|a|an|the|please)/gi, '')
    .trim();

  const results = await toolSearchListings({
    query: cleanQuery || undefined,
    max_price: maxPrice,
  });

  if (results.length > 0) {
    return {
      reply: `I found ${results.length} active auction(s) matching your request:${results.map(r => `\n- **#${r.id} ${r.title}** (${r.condition}) — Current: ₹${r.price}`).join('')}\n\nWould you like me to prepare an automatic bid proposal for any of these? Say "Bid up to ₹X on listing #ID".`,
      listings: results,
    };
  }

  return {
    reply: `I'm your Campus Auction AI Assistant! I can help you find textbook, cycle, and calculator auctions or set up safe auto-bids. Try asking:
- "Find me a cycle under ₹2000"
- "Show scientific calculators"
- "Bid up to ₹500 on listing #1"`,
  };
}
