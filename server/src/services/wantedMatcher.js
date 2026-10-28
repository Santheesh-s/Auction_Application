import { db } from '../db/pool.js';
import { createNotification } from './notificationService.js';

function matchesKeywords(text, keywordsStr) {
  const textLower = text.toLowerCase();
  const words = keywordsStr
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.trim())
    .filter(Boolean);

  if (words.length === 0) return true;
  return words.every(word => textLower.includes(word));
}

export async function checkMatchesForNewListing(listing) {
  if (!listing.college_domain) return;

  const wantedRes = await db.query(
    `SELECT id, user_id, keywords, category, max_price, active
     FROM wanted_items
     WHERE active = true AND user_id != $1 AND LOWER(college_domain) = LOWER($2)`,
    [listing.seller_id, listing.college_domain]
  );

  const fullText = `${listing.title} ${listing.description}`;

  for (const item of wantedRes.rows) {
    if (item.category && item.category.trim() !== '') {
      if (item.category.toLowerCase() !== listing.category.toLowerCase()) {
        continue;
      }
    }

    if (item.max_price !== null && item.max_price !== undefined) {
      const priceToCheck = listing.current_price ?? listing.start_price;
      if (priceToCheck > item.max_price) {
        continue;
      }
    }

    if (!matchesKeywords(fullText, item.keywords)) {
      continue;
    }

    await createNotification(
      item.user_id,
      'wanted_match',
      `Match found for your alert "${item.keywords}": ${listing.title} starting at ₹${listing.start_price}`,
      listing.id
    );
  }
}

export async function checkMatchesForNewWantedItem(wantedItem) {
  if (!wantedItem.college_domain) return 0;

  const listingsRes = await db.query(
    `SELECT id, seller_id, title, description, category, start_price, current_price
     FROM listings
     WHERE status = 'open' AND closes_at > now() AND seller_id != $1 AND LOWER(college_domain) = LOWER($2)`,
    [wantedItem.user_id, wantedItem.college_domain]
  );

  let matchCount = 0;
  for (const listing of listingsRes.rows) {
    if (wantedItem.category && wantedItem.category.trim() !== '') {
      if (wantedItem.category.toLowerCase() !== listing.category.toLowerCase()) {
        continue;
      }
    }

    const priceToCheck = listing.current_price ?? listing.start_price;
    if (wantedItem.max_price !== null && wantedItem.max_price !== undefined) {
      if (priceToCheck > wantedItem.max_price) {
        continue;
      }
    }

    const fullText = `${listing.title} ${listing.description}`;
    if (!matchesKeywords(fullText, wantedItem.keywords)) {
      continue;
    }

    matchCount++;
    await createNotification(
      wantedItem.user_id,
      'wanted_match',
      `Existing match for your alert "${wantedItem.keywords}": ${listing.title} at ₹${priceToCheck}`,
      listing.id
    );
  }

  return matchCount;
}
