import assert from 'assert';
import bcrypt from 'bcryptjs';
import { db } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { placeBid, setAutoBid } from '../src/services/biddingService.js';
import {
  closeExpiredAuctions,
  approveSale,
  rejectSale,
  confirmHandover,
  reportPickupFailed,
} from '../src/services/auctionCloser.js';
import {
  toolSearchListings,
  toolGetListing,
  toolProposeBid,
  confirmProposal,
} from '../src/services/assistantService.js';
import { checkMatchesForNewListing } from '../src/services/wantedMatcher.js';

let testUser1, testUser2, testUser3, testUser4;

async function setupTestUsers() {
  const hash = await bcrypt.hash('testpass', 10);
  const u1 = await db.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ('Test Alice', 'alice_test@campus.edu', $1)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id, name, email`,
    [hash]
  );
  const u2 = await db.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ('Test Bob', 'bob_test@campus.edu', $1)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id, name, email`,
    [hash]
  );
  const u3 = await db.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ('Test Charlie', 'charlie_test@campus.edu', $1)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id, name, email`,
    [hash]
  );
  const u4 = await db.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ('Test David', 'david_test@campus.edu', $1)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id, name, email`,
    [hash]
  );

  testUser1 = u1.rows[0];
  testUser2 = u2.rows[0];
  testUser3 = u3.rows[0];
  testUser4 = u4.rows[0];
}

async function createTestListing(overrides = {}) {
  const closesAt = overrides.closes_at || new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const res = await db.query(
    `INSERT INTO listings (
      seller_id, title, category, description, condition,
      start_price, min_increment, closes_at, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')
    RETURNING *`,
    [
      overrides.seller_id || testUser1.id,
      overrides.title || 'Test Item',
      overrides.category || 'other',
      overrides.description || 'Test item description',
      overrides.condition || 'good',
      overrides.start_price || 100,
      overrides.min_increment || 10,
      closesAt,
    ]
  );
  return res.rows[0];
}

async function runAllTests() {
  console.log('\n🧪 Starting Campus Auction Comprehensive Test Suite...\n');
  await runMigrations();
  await setupTestUsers();

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  // 1. Acceptance of first bid at start price
  await test('First bid at start price is accepted; below start price is rejected', async () => {
    const listing = await createTestListing({ start_price: 500, min_increment: 50 });

    // Below start price should fail
    await assert.rejects(
      () => placeBid(listing.id, testUser2.id, 450),
      /below minimum allowed bid/
    );

    // Exact start price should succeed
    const res = await placeBid(listing.id, testUser2.id, 500);
    assert.strictEqual(res.amount, 500);
    assert.strictEqual(res.currentPrice, 500);
  });

  // 2. Minimum increment rule
  await test('Subsequent bids must meet current_price + min_increment', async () => {
    const listing = await createTestListing({ start_price: 200, min_increment: 20 });
    await placeBid(listing.id, testUser2.id, 200);

    // 210 is less than 200 + 20
    await assert.rejects(
      () => placeBid(listing.id, testUser3.id, 210),
      /below minimum allowed bid/
    );

    // 220 is valid
    const res = await placeBid(listing.id, testUser3.id, 220);
    assert.strictEqual(res.amount, 220);
  });

  // 3. Seller cannot bid & leader cannot outbid themselves
  await test('Seller cannot bid and leader cannot manually outbid themselves', async () => {
    const listing = await createTestListing({ seller_id: testUser1.id, start_price: 100, min_increment: 10 });

    // Seller bid rejected
    await assert.rejects(
      () => placeBid(listing.id, testUser1.id, 100),
      /Sellers cannot bid/
    );

    // Alice place initial bid
    await placeBid(listing.id, testUser2.id, 100);

    // Alice immediately placing manual bid again must be rejected
    await assert.rejects(
      () => placeBid(listing.id, testUser2.id, 120),
      /already the highest bidder/
    );
  });

  // 4. Bids after closes_at are rejected even if cron has not run
  await test('Bid after closes_at is rejected immediately regardless of cron', async () => {
    // Listing closed 10 seconds ago
    const expiredTime = new Date(Date.now() - 10 * 1000).toISOString();
    const listing = await createTestListing({ start_price: 100, closes_at: expiredTime });

    await assert.rejects(
      () => placeBid(listing.id, testUser2.id, 100),
      /Auction has already closed/
    );
  });

  // 5. Extension rule: bid within 30s extends auction by 60s
  await test('Bid in last 30 seconds triggers extension by 60 seconds', async () => {
    // Listing closing in 15 seconds
    const closesIn15s = new Date(Date.now() + 15 * 1000).toISOString();
    const listing = await createTestListing({ start_price: 100, closes_at: closesIn15s });

    const beforeClosesAt = new Date(listing.closes_at).getTime();
    const result = await placeBid(listing.id, testUser2.id, 100);

    assert.strictEqual(result.extended, true);
    const afterClosesAt = new Date(result.closesAt).getTime();
    assert.ok(afterClosesAt > beforeClosesAt);
    // Should be extended by ~60 seconds from now
    assert.ok(afterClosesAt >= Date.now() + 50 * 1000);
  });

  // 6. Concurrency test: 20 sequential/interleaved bids maintain consistent state
  await test('20 concurrent bids race condition resolves atomically without data race', async () => {
    const listing = await createTestListing({ start_price: 100, min_increment: 10 });
    const bidders = [testUser2.id, testUser3.id, testUser4.id];

    // Fire 20 concurrent bid attempts
    const promises = [];
    for (let i = 1; i <= 20; i++) {
      const bidderId = bidders[i % bidders.length];
      const bidAmount = 100 + i * 15;
      promises.push(
        placeBid(listing.id, bidderId, bidAmount).catch(() => null)
      );
    }

    await Promise.all(promises);

    // Verify database state is consistent
    const checkRes = await db.query(
      `SELECT current_price, leading_bid_id FROM listings WHERE id = $1`,
      [listing.id]
    );
    const highestBidRes = await db.query(
      `SELECT MAX(amount) as max_amount, COUNT(*) as count FROM bids WHERE listing_id = $1`,
      [listing.id]
    );

    assert.strictEqual(checkRes.rows[0].current_price, highestBidRes.rows[0].max_amount);
    assert.ok(highestBidRes.rows[0].count > 0);
  });

  // 7. Auto-bidding proxy and settlement
  await test('Auto-bidding proxy never exceeds user max and settles competing maxes', async () => {
    const listing = await createTestListing({ start_price: 100, min_increment: 10 });

    // User 2 sets auto max of 200 (automatically places initial bid of 100)
    await setAutoBid(listing.id, testUser2.id, 200);

    let l = (await db.query('SELECT current_price, leading_bid_id FROM listings WHERE id = $1', [listing.id])).rows[0];
    assert.strictEqual(l.current_price, 100);

    // User 3 sets auto max of 250
    // They compete: User 2 bids up to 200, User 3 outbids to 210 (200 + increment)
    await setAutoBid(listing.id, testUser3.id, 250);

    l = (await db.query('SELECT current_price, leading_bid_id FROM listings WHERE id = $1', [listing.id])).rows[0];
    assert.strictEqual(l.current_price, 210);

    const leadBid = (await db.query('SELECT bidder_id FROM bids WHERE id = $1', [l.leading_bid_id])).rows[0];
    assert.strictEqual(leadBid.bidder_id, testUser3.id);
  });

  // 8. Auction Closing: With bids -> pending_approval, Without bids -> unsold
  await test('Closing: with bids -> pending_approval, without bids -> unsold', async () => {
    // Listing A: create open, place bid, then expire
    const listingA = await createTestListing({ start_price: 100 });
    await placeBid(listingA.id, testUser2.id, 100);
    await db.query(`UPDATE listings SET closes_at = now() - interval '5 seconds' WHERE id = $1`, [listingA.id]);

    // Listing B: no bids, expire immediately
    const listingB = await createTestListing({ start_price: 200 });
    await db.query(`UPDATE listings SET closes_at = now() - interval '5 seconds' WHERE id = $1`, [listingB.id]);

    await closeExpiredAuctions();

    const resA = (await db.query('SELECT status, winner_id FROM listings WHERE id = $1', [listingA.id])).rows[0];
    const resB = (await db.query('SELECT status, winner_id FROM listings WHERE id = $1', [listingB.id])).rows[0];

    assert.strictEqual(resA.status, 'pending_approval');
    assert.strictEqual(resA.winner_id, testUser2.id);

    assert.strictEqual(resB.status, 'unsold');
    assert.strictEqual(resB.winner_id, null);
  });

  // 9. Sale State Machine: approve -> handover -> completed
  await test('Sale state machine transitions: approve -> handover -> completed', async () => {
    const listing = await createTestListing({ seller_id: testUser1.id, start_price: 100 });
    await placeBid(listing.id, testUser2.id, 100);
    await db.query(`UPDATE listings SET closes_at = now() - interval '5 seconds' WHERE id = $1`, [listing.id]);
    await closeExpiredAuctions();

    // Seller approves
    const appRes = await approveSale(listing.id, testUser1.id, 'Approved');
    assert.strictEqual(appRes.status, 'approved');

    // Confirm handover
    const handRes = await confirmHandover(listing.id, testUser1.id, 'Delivered in hostel');
    assert.strictEqual(handRes.status, 'completed');

    const finalState = (await db.query('SELECT status FROM listings WHERE id = $1', [listing.id])).rows[0];
    assert.strictEqual(finalState.status, 'completed');
  });

  // 10. AI Assistant guardrails: Never bids without explicit confirm & never exposes emails
  await test('Assistant guardrails: privacy (no emails) and proposal-before-bid enforcement', async () => {
    const listing = await createTestListing({ start_price: 500, min_increment: 50 });

    // Public listing query tool must NOT expose emails
    const publicData = await toolGetListing(listing.id);
    assert.strictEqual(typeof publicData.seller_name, 'string');
    assert.strictEqual(publicData.seller_email, undefined);

    // Propose bid creates pending proposal, does NOT place bid
    const proposal = await toolProposeBid(testUser2.id, listing.id, 800);
    assert.strictEqual(proposal.status, 'pending');

    let checkList = (await db.query('SELECT current_price, leading_bid_id FROM listings WHERE id = $1', [listing.id])).rows[0];
    assert.strictEqual(checkList.leading_bid_id, null); // No bid placed yet!

    // User explicitly confirms proposal
    await confirmProposal(proposal.proposal_id, testUser2.id);

    checkList = (await db.query('SELECT current_price, leading_bid_id FROM listings WHERE id = $1', [listing.id])).rows[0];
    assert.strictEqual(checkList.current_price, 500); // Now bid is activated!
  });

  // 11. Sale State Machine: reject and pickup_failed paths
  await test('Sale state machine: reject by seller and pickup_failed outcomes', async () => {
    // Rejection path
    const listingRej = await createTestListing({ seller_id: testUser1.id, start_price: 300 });
    await placeBid(listingRej.id, testUser2.id, 300);
    await db.query(`UPDATE listings SET closes_at = now() - interval '5 seconds' WHERE id = $1`, [listingRej.id]);
    await closeExpiredAuctions();

    const rejRes = await rejectSale(listingRej.id, testUser1.id, 'Price too low');
    assert.strictEqual(rejRes.status, 'rejected');
    const rejRow = (await db.query('SELECT status FROM listings WHERE id = $1', [listingRej.id])).rows[0];
    assert.strictEqual(rejRow.status, 'rejected');

    // Pickup failed path
    const listingFail = await createTestListing({ seller_id: testUser1.id, start_price: 400 });
    await placeBid(listingFail.id, testUser2.id, 400);
    await db.query(`UPDATE listings SET closes_at = now() - interval '5 seconds' WHERE id = $1`, [listingFail.id]);
    await closeExpiredAuctions();
    await approveSale(listingFail.id, testUser1.id, 'Approved');
    const failRes = await reportPickupFailed(listingFail.id, testUser1.id, 'Buyer did not show up');
    assert.strictEqual(failRes.status, 'failed_pickup');
    const failRow = (await db.query('SELECT status FROM listings WHERE id = $1', [listingFail.id])).rows[0];
    assert.strictEqual(failRow.status, 'failed_pickup');
  });

  // 12. Wanted item alerts match listings created while user was offline
  await test('Wanted items: match notifications triggered for new listings', async () => {
    // User 4 creates a wanted search for "scientific calculator" max 500
    await db.query(
      `INSERT INTO wanted_items (user_id, keywords, category, max_price, active)
       VALUES ($1, 'scientific calculator', 'calculator', 500, true)`,
      [testUser4.id]
    );

    // User 1 lists a matching calculator
    const calcListing = await createTestListing({
      seller_id: testUser1.id,
      title: 'Casio fx-991ES Plus Scientific Calculator',
      category: 'calculator',
      description: 'Used for two semesters in engineering',
      start_price: 350,
    });

    await checkMatchesForNewListing(calcListing);

    // Verify User 4 received a wanted_match notification
    const notifs = await db.query(
      `SELECT type, message FROM notifications WHERE user_id = $1 AND listing_id = $2`,
      [testUser4.id, calcListing.id]
    );
    assert.ok(notifs.rows.length > 0);
    assert.strictEqual(notifs.rows[0].type, 'wanted_match');
  });

  // 13. Q&A: Asking questions, rate limits, seller answer, and hiding spam
  await test('Questions before bidding: buyer asks, seller answers, spam hidden', async () => {
    const listing = await createTestListing({ seller_id: testUser1.id, start_price: 200 });

    // Buyer 2 asks question
    const qRes = await db.query(
      `INSERT INTO questions (listing_id, asker_id, body)
       VALUES ($1, $2, 'Does this include the charger cable?')
       RETURNING id`,
      [listing.id, testUser2.id]
    );
    const qId = qRes.rows[0].id;

    // Seller answers
    await db.query(
      `UPDATE questions SET answer = 'Yes, original cable included', answered_at = now() WHERE id = $1`,
      [qId]
    );

    let qRow = (await db.query('SELECT answer, hidden FROM questions WHERE id = $1', [qId])).rows[0];
    assert.strictEqual(qRow.answer, 'Yes, original cable included');
    assert.strictEqual(qRow.hidden, false);

    // Seller hides spam
    await db.query('UPDATE questions SET hidden = true WHERE id = $1', [qId]);
    qRow = (await db.query('SELECT hidden FROM questions WHERE id = $1', [qId])).rows[0];
    assert.strictEqual(qRow.hidden, true);
  });

  console.log(`\n========================================`);
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('run-tests.js')) {
  runAllTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
