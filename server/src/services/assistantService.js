import { db } from '../db/pool.js';
import { AppError } from '../middleware/errors.js';
import { setAutoBid } from './biddingService.js';

// TOOL 1: search_listings (Strictly public info, scoped to user college)
export async function toolSearchListings(collegeDomain, params = {}) {
  if (!collegeDomain) return [];

  let sql = `
    SELECT id, title, category, condition, start_price, current_price, closes_at, status
    FROM listings
    WHERE status = 'open' AND closes_at > now() AND LOWER(college_domain) = LOWER($1)
  `;
  const values = [collegeDomain];
  let paramIdx = 2;

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

// TOOL 2: get_listing (Public details & bids with display name ONLY, scoped to user college)
export async function toolGetListing(collegeDomain, listingId) {
  const listingRes = await db.query(
    `SELECT l.id, l.title, l.description, l.category, l.condition, l.start_price,
            l.min_increment, l.current_price, l.closes_at, l.status, l.college_domain,
            u.name as seller_name
     FROM listings l
     JOIN users u ON l.seller_id = u.id
     WHERE l.id = $1`,
    [listingId]
  );

  if (listingRes.rows.length === 0) return null;
  const listing = listingRes.rows[0];

  if (!collegeDomain || listing.college_domain?.toLowerCase().trim() !== collegeDomain.toLowerCase().trim()) {
    return null; // Hide cross-college listings
  }

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
export async function toolProposeBid(userId, collegeDomain, listingId, maxAmount) {
  const listingRes = await db.query(
    `SELECT id, title, status, closes_at, college_domain FROM listings WHERE id = $1`,
    [listingId]
  );

  if (listingRes.rows.length === 0) {
    throw new AppError('Listing not found', 404, 'NOT_FOUND');
  }

  const listing = listingRes.rows[0];

  if (!collegeDomain || listing.college_domain?.toLowerCase().trim() !== collegeDomain.toLowerCase().trim()) {
    throw new AppError('Listing not found', 404, 'NOT_FOUND');
  }

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

/**
 * Calls Google AI Studio Gemini API with function calling capabilities.
 */
async function callGeminiAssistant(user, messages) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const collegeDomain = user.college_domain || user.collegeDomain;
  const collegeName = user.college_name || collegeDomain || 'Campus';
  const isVerified = Boolean(user.email_verified || user.emailVerified);

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const tools = [
    {
      functionDeclarations: [
        {
          name: 'search_listings',
          description: 'Search for active peer-to-peer auctions in the student campus.',
          parameters: {
            type: 'OBJECT',
            properties: {
              query: { type: 'STRING', description: 'Keywords like cycle, calculator, textbook, notes' },
              category: { type: 'STRING', description: 'Item category (cycle, calculator, books, electronics, other)' },
              max_price: { type: 'NUMBER', description: 'Maximum price ceiling in rupees (INR)' }
            }
          }
        },
        {
          name: 'get_listing',
          description: 'Get details, condition, current price, and bid history of a listing by its ID.',
          parameters: {
            type: 'OBJECT',
            properties: {
              listing_id: { type: 'INTEGER', description: 'The numeric ID of the listing' }
            },
            required: ['listing_id']
          }
        },
        {
          name: 'propose_bid',
          description: 'Prepare an automatic bid proposal card for the student to confirm. NEVER places a bid directly without student approval.',
          parameters: {
            type: 'OBJECT',
            properties: {
              listing_id: { type: 'INTEGER', description: 'The numeric ID of the listing' },
              max_amount: { type: 'NUMBER', description: 'Maximum bid ceiling in rupees (INR)' }
            },
            required: ['listing_id', 'max_amount']
          }
        }
      ]
    }
  ];

  const systemInstruction = {
    parts: [{
      text: `You are the Campus Auction AI Assistant for students at ${collegeName} (${collegeDomain}).
Help students discover peer-to-peer auctions, check item details, and set up safe automated bid proposals.

SAFETY GUARDRAILS & STRICT RULES:
1. NEVER place bids directly on behalf of a student. When a user asks to bid or auto-bid, you MUST call 'propose_bid'. This creates an interactive proposal card that the user must manually click to confirm.
2. Participation is strictly isolated to students of ${collegeDomain}. Never suggest or attempt to access listings from other colleges.
3. Privacy: NEVER reveal student emails or private contact info. Only refer to students by their public display name.
4. Always be friendly, concise, and format currency in Indian Rupees (₹).`
    }]
  };

  // Convert chat history (last 10 messages max)
  const conversation = messages.slice(-10).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content || '' }]
  }));

  const payload = {
    systemInstruction,
    contents: conversation,
    tools
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    console.warn(`Gemini API returned status ${res.status}:`, errText);
    return null;
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (!candidate) return null;

  const modelParts = candidate.content?.parts || [];
  const functionCallPart = modelParts.find(p => p.functionCall);

  let capturedProposal = null;
  let capturedListings = null;

  if (functionCallPart && functionCallPart.functionCall) {
    const fn = functionCallPart.functionCall;
    const fnName = fn.name;
    const fnArgs = fn.args || {};
    let toolResult = {};

    if (fnName === 'search_listings') {
      const results = await toolSearchListings(collegeDomain, fnArgs);
      capturedListings = results;
      toolResult = { listings: results };
    } else if (fnName === 'get_listing') {
      const result = await toolGetListing(collegeDomain, fnArgs.listing_id);
      toolResult = { listing: result || 'Listing not found or belongs to another college' };
    } else if (fnName === 'propose_bid') {
      if (!isVerified) {
        toolResult = { error: 'Your college email is not verified yet. Verification is required to create bid proposals.' };
      } else {
        try {
          const proposal = await toolProposeBid(user.id, collegeDomain, fnArgs.listing_id, fnArgs.max_amount);
          capturedProposal = proposal;
          toolResult = {
            success: true,
            proposal_id: proposal.proposal_id,
            listing_title: proposal.listing_title,
            max_amount: proposal.max_amount,
            message: 'Bid proposal prepared. User must click confirm on the card to execute.'
          };
        } catch (err) {
          toolResult = { error: err.message || 'Could not prepare bid proposal' };
        }
      }
    }

    // Feed tool output back to Gemini
    conversation.push(candidate.content);
    conversation.push({
      role: 'user',
      parts: [{
        functionResponse: {
          name: fnName,
          response: toolResult
        }
      }]
    });

    const secondRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction,
        contents: conversation,
        tools
      })
    });

    if (secondRes.ok) {
      const secondData = await secondRes.json();
      const secondCandidate = secondData.candidates?.[0];
      const replyText = secondCandidate?.content?.parts?.map(p => p.text).filter(Boolean).join('\n') || '';
      return {
        reply: replyText || 'Here are the details for your request.',
        proposal: capturedProposal ? {
          id: capturedProposal.proposal_id,
          listing_id: capturedProposal.listing_id,
          listing_title: capturedProposal.listing_title,
          max_amount: capturedProposal.max_amount,
          status: capturedProposal.status,
        } : undefined,
        listings: capturedListings || undefined
      };
    }
  }

  const finalReply = modelParts.map(p => p.text).filter(Boolean).join('\n');
  if (finalReply) {
    return { reply: finalReply };
  }

  return null;
}

export async function handleAssistantChat(user, messages) {
  // If GEMINI_API_KEY is configured, prioritize Gemini AI
  if (process.env.GEMINI_API_KEY) {
    try {
      const geminiRes = await callGeminiAssistant(user, messages);
      if (geminiRes && geminiRes.reply) {
        return geminiRes;
      }
    } catch (err) {
      console.error('Gemini Assistant call failed, falling back to local matcher:', err);
    }
  }

  const userId = user.id;
  const collegeDomain = user.college_domain || user.collegeDomain;
  const isVerified = Boolean(user.email_verified || user.emailVerified);

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
      const searchRes = await toolSearchListings(collegeDomain, { query: queryStr });
      if (searchRes.length > 0) {
        listingId = searchRes[0].id;
      }
    }

    if (listingId && amount > 0) {
      if (!isVerified) {
        return {
          reply: `I found listing #${listingId}, but your college email is not verified yet. Please verify your email before creating automated bid proposals.`,
        };
      }

      try {
        const proposal = await toolProposeBid(userId, collegeDomain, listingId, amount);
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
      } catch (err) {
        if (err.statusCode === 404) {
          return {
            reply: `I couldn't find an active listing with ID #${listingId} in your college (${collegeDomain}).`,
          };
        }
        throw err;
      }
    }
  }

  // Intent: search
  const priceMatch = textLower.match(/(?:under|below|less than|max)\s*₹?\s*(\d+)/i);
  const maxPrice = priceMatch ? parseInt(priceMatch[1], 10) : undefined;

  let cleanQuery = lastUserMsg
    .replace(/(?:find|show|search|look for|get|under|below|less than|max|₹|\d+|me|a|an|the|please)/gi, '')
    .trim();

  const results = await toolSearchListings(collegeDomain, {
    query: cleanQuery || undefined,
    max_price: maxPrice,
  });

  if (results.length > 0) {
    return {
      reply: `I found ${results.length} active auction(s) in ${collegeDomain} matching your request:${results.map(r => `\n- **#${r.id} ${r.title}** (${r.condition}) — Current: ₹${r.price}`).join('')}\n\nWould you like me to prepare an automatic bid proposal for any of these? Say "Bid up to ₹X on listing #ID".`,
      listings: results,
    };
  }

  return {
    reply: `I'm your Campus Auction AI Assistant for ${collegeDomain || 'your campus'}! I can help you find textbook, cycle, and calculator auctions or set up safe auto-bids. Try asking:
- "Find me a cycle under ₹2000"
- "Show scientific calculators"
- "Bid up to ₹500 on listing #1"`,
  };
}
