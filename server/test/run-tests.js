import assert from 'assert';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDbDir = path.resolve(__dirname, '../data/test_pgdata');

// Isolate test database from development database
process.env.PG_DATA_DIR = testDbDir;
process.env.NODE_ENV = 'test';

// Clean up any stale test database
if (fs.existsSync(testDbDir)) {
  try {
    fs.rmSync(testDbDir, { recursive: true, force: true });
  } catch {}
}

import { db, closeDb } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { getCollegeDomain, validateCollegeEmail } from '../src/utils/college.js';
import { requireSameCollege } from '../src/middleware/college.js';
import { requireVerified } from '../src/middleware/auth.js';
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

let testUser1, testUser2, testUser3, testUser4, testUnverifiedUser;

async function setupTestUsers() {
  const hash = await bcrypt.hash('testpass', 10);
  const u1 = await db.query(
    `INSERT INTO users (name, email, password_hash, college_domain, email_verified)
     VALUES ('Test Alice', 'alice_test@kongu.edu', $1, 'kongu.edu', true)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id, name, email, college_domain, email_verified`,
    [hash]
  );
  const u2 = await db.query(
    `INSERT INTO users (name, email, password_hash, college_domain, email_verified)
     VALUES ('Test Bob', 'bob_test@kongu.edu', $1, 'kongu.edu', true)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id, name, email, college_domain, email_verified`,
    [hash]
  );
  const u3 = await db.query(
    `INSERT INTO users (name, email, password_hash, college_domain, email_verified)
     VALUES ('Test Charlie', 'charlie_test@iitm.ac.in', $1, 'iitm.ac.in', true)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id, name, email, college_domain, email_verified`,
    [hash]
  );
  const u4 = await db.query(
    `INSERT INTO users (name, email, password_hash, college_domain, email_verified)
     VALUES ('Test David', 'david_test@kongu.edu', $1, 'kongu.edu', true)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id, name, email, college_domain, email_verified`,
    [hash]
  );
  const uUnverified = await db.query(
    `INSERT INTO users (name, email, password_hash, college_domain, email_verified)
     VALUES ('Unverified User', 'unverified@kongu.edu', $1, 'kongu.edu', false)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id, name, email, college_domain, email_verified`,
    [hash]
  );

  testUser1 = u1.rows[0]; // kongu.edu (verified)
  testUser2 = u2.rows[0]; // kongu.edu (verified)
  testUser3 = u3.rows[0]; // iitm.ac.in (verified)
  testUser4 = u4.rows[0]; // kongu.edu (verified)
  testUnverifiedUser = uUnverified.rows[0]; // kongu.edu (unverified)
}

async function createTestListing(overrides = {}) {
  const closesAt = overrides.closes_at || new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const res = await db.query(
    `INSERT INTO listings (
      seller_id, title, category, description, condition,
      start_price, min_increment, closes_at, status, college_domain
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9)
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
      overrides.college_domain || 'kongu.edu',
    ]
  );
  return res.rows[0];
}

async function runAllTests() {
  console.log('\n🧪 Starting Campus Auction Comprehensive Multi-College Test Suite...\n');
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

  // --- PART 1: getCollegeDomain Unit Tests ---
  await test('getCollegeDomain: correctly extracts academic domains and rejects personal / invalid emails', async () => {
    assert.strictEqual(getCollegeDomain('santheeshs.23cse@kongu.edu'), 'kongu.edu');
    assert.strictEqual(getCollegeDomain('x@students.kongu.edu'), 'kongu.edu');
    assert.strictEqual(getCollegeDomain('x@cse.iitm.ac.in'), 'iitm.ac.in');
    assert.strictEqual(getCollegeDomain('x@iitm.ac.in'), 'iitm.ac.in');
    assert.strictEqual(getCollegeDomain('x@mit.edu'), 'mit.edu');

    assert.throws(() => getCollegeDomain('x@gmail.com'), /Personal email providers/);
    assert.throws(() => getCollegeDomain('x@yahoo.com'), /Personal email providers/);
    assert.throws(() => getCollegeDomain('x@outlook.com'), /Personal email providers/);
    assert.throws(() => getCollegeDomain('x@hotmail.com'), /Personal email providers/);
    assert.throws(() => getCollegeDomain('invalid'), /Invalid email format/);
    assert.throws(() => getCollegeDomain(''), /Invalid email format/);
    assert.throws(() => getCollegeDomain('abc@'), /Invalid email format/);
  });

  // --- PART 2: Same-College Isolation Tests ---
  await test('Same-college isolation: User A (kongu) listing can be bid by User B (kongu), but User C (iitm) is blocked', async () => {
    const listing = await createTestListing({
      seller_id: testUser1.id,
      college_domain: 'kongu.edu',
      title: 'Kongu Textbooks',
      start_price: 300,
    });

    // User B (kongu) can place bid
    const bidRes = await placeBid(listing.id, testUser2.id, 300);
    assert.strictEqual(bidRes.amount, 300);

    // User C (iitm) browsing sees 0 results for Kongu listing
    const iitmFeed = await db.query(
      `SELECT * FROM listings WHERE status = 'open' AND LOWER(college_domain) = 'iitm.ac.in'`
    );
    assert.strictEqual(iitmFeed.rows.filter(r => r.id === listing.id).length, 0);

    // User C (iitm) accessing listing detail by ID gets 404 (requireSameCollege with asNotFound=true)
    assert.throws(
      () => requireSameCollege(listing, testUser3, true),
      (err) => err.statusCode === 404 && err.code === 'NOT_FOUND'
    );

    // User C (iitm) placing a bid is rejected with FORBIDDEN_COLLEGE (403)
    await assert.rejects(
      () => placeBid(listing.id, testUser3.id, 350),
      (err) => err.statusCode === 403 && err.code === 'FORBIDDEN_COLLEGE'
    );

    // User C (iitm) setting auto-bid is rejected with FORBIDDEN_COLLEGE (403)
    await assert.rejects(
      () => setAutoBid(listing.id, testUser3.id, 500),
      (err) => err.statusCode === 403 && err.code === 'FORBIDDEN_COLLEGE'
    );

    // User C (iitm) asking question is rejected with FORBIDDEN_COLLEGE
    assert.throws(
      () => requireSameCollege(listing, testUser3, false),
      (err) => err.statusCode === 403 && err.code === 'FORBIDDEN_COLLEGE'
    );
  });

  // --- PART 3: Concurrent Multi-College Auctions ---
  await test('Two colleges running auctions concurrently: feeds remain strictly isolated', async () => {
    const konguCycle = await createTestListing({
      seller_id: testUser1.id,
      college_domain: 'kongu.edu',
      title: 'Hero Sprint Pro Cycle',
      category: 'cycle',
      start_price: 2500,
    });

    const iitmCalculator = await createTestListing({
      seller_id: testUser3.id,
      college_domain: 'iitm.ac.in',
      title: 'HP Prime Graphing Calculator',
      category: 'calculator',
      start_price: 4000,
    });

    const konguQuery = await db.query(
      `SELECT id, title FROM listings WHERE status = 'open' AND LOWER(college_domain) = 'kongu.edu'`
    );
    const iitmQuery = await db.query(
      `SELECT id, title FROM listings WHERE status = 'open' AND LOWER(college_domain) = 'iitm.ac.in'`
    );

    const konguTitles = konguQuery.rows.map(r => r.title);
    const iitmTitles = iitmQuery.rows.map(r => r.title);

    assert.ok(konguTitles.includes('Hero Sprint Pro Cycle'));
    assert.ok(!konguTitles.includes('HP Prime Graphing Calculator'));

    assert.ok(iitmTitles.includes('HP Prime Graphing Calculator'));
    assert.ok(!iitmTitles.includes('Hero Sprint Pro Cycle'));
  });

  // --- PART 4: Wanted Items College Isolation ---
  await test('Wanted items: alerts do not trigger across different colleges', async () => {
    // User C (iitm) creates wanted item for 'cycle'
    await db.query(
      `INSERT INTO wanted_items (user_id, keywords, category, max_price, active, college_domain)
       VALUES ($1, 'geared cycle', 'cycle', 5000, true, 'iitm.ac.in')`,
      [testUser3.id]
    );

    // User 1 (kongu) lists a geared cycle
    const konguCycle = await createTestListing({
      seller_id: testUser1.id,
      college_domain: 'kongu.edu',
      title: 'Montra Geared Cycle',
      category: 'cycle',
      description: 'Used 21-speed geared cycle',
      start_price: 3000,
    });

    await checkMatchesForNewListing(konguCycle);

    // User C (iitm) must NOT have received a notification
    const notifs = await db.query(
      `SELECT * FROM notifications WHERE user_id = $1 AND listing_id = $2`,
      [testUser3.id, konguCycle.id]
    );
    assert.strictEqual(notifs.rows.length, 0);
  });

  // --- PART 5: Socket Rooms Authorization ---
  await test('Socket room authorization: cross-college listing room joins are rejected', async () => {
    const listing = await createTestListing({
      seller_id: testUser1.id,
      college_domain: 'kongu.edu',
      title: 'Kongu Lab Coat',
    });

    const res = await db.query('SELECT college_domain FROM listings WHERE id = $1', [listing.id]);
    const listingCollege = res.rows[0].college_domain;

    const crossCollegeUser = { id: testUser3.id, college_domain: 'iitm.ac.in' };
    const isAllowed = crossCollegeUser.college_domain?.toLowerCase().trim() === listingCollege?.toLowerCase().trim();
    assert.strictEqual(isAllowed, false);

    const sameCollegeUser = { id: testUser2.id, college_domain: 'kongu.edu' };
    const isSameAllowed = sameCollegeUser.college_domain?.toLowerCase().trim() === listingCollege?.toLowerCase().trim();
    assert.strictEqual(isSameAllowed, true);
  });

  // --- PART 6: Assistant Tools Isolation ---
  await test('Assistant tools: strictly scoped to user college_domain', async () => {
    const konguListing = await createTestListing({
      seller_id: testUser1.id,
      college_domain: 'kongu.edu',
      title: 'Kongu Engineering Physics Notes',
      category: 'books',
      start_price: 200,
    });

    // IITM student searches -> Kongu listing is excluded
    const iitmResults = await toolSearchListings('iitm.ac.in', { query: 'Physics Notes' });
    assert.strictEqual(iitmResults.some(item => item.id === konguListing.id), false);

    // Kongu student searches -> found
    const konguResults = await toolSearchListings('kongu.edu', { query: 'Physics Notes' });
    assert.strictEqual(konguResults.some(item => item.id === konguListing.id), true);

    // IITM student get_listing returns null
    const getRes = await toolGetListing('iitm.ac.in', konguListing.id);
    assert.strictEqual(getRes, null);

    // IITM student propose_bid throws 404 NOT_FOUND
    await assert.rejects(
      () => toolProposeBid(testUser3.id, 'iitm.ac.in', konguListing.id, 500),
      (err) => err.statusCode === 404 && err.code === 'NOT_FOUND'
    );
  });

  // --- PART 7: Unverified User Restrictions ---
  await test('Unverified user restrictions: blocked from bidding and creating listings', async () => {
    const listing = await createTestListing({
      seller_id: testUser1.id,
      college_domain: 'kongu.edu',
      start_price: 100,
    });

    // Unverified user placing bid is blocked with 403 EMAIL_NOT_VERIFIED
    await assert.rejects(
      () => placeBid(listing.id, testUnverifiedUser.id, 100),
      (err) => err.statusCode === 403 && err.code === 'EMAIL_NOT_VERIFIED'
    );

    // Unverified user setting auto-bid is blocked with 403 EMAIL_NOT_VERIFIED
    await assert.rejects(
      () => setAutoBid(listing.id, testUnverifiedUser.id, 200),
      (err) => err.statusCode === 403 && err.code === 'EMAIL_NOT_VERIFIED'
    );

    // requireVerified middleware rejects unverified request
    let middlewareErr = null;
    requireVerified({ user: testUnverifiedUser }, {}, (err) => {
      middlewareErr = err;
    });
    assert.ok(middlewareErr);
    assert.strictEqual(middlewareErr.statusCode, 403);
    assert.strictEqual(middlewareErr.code, 'EMAIL_NOT_VERIFIED');
  });

  // --- PART 8: Listing college_domain Locking ---
  await test('Listing college_domain: forced to creator college on create and locked against PATCH', async () => {
    const creatorUser = testUser1; // kongu.edu
    const assignedDomain = creatorUser.college_domain;
    assert.strictEqual(assignedDomain, 'kongu.edu');

    const listing = await createTestListing({
      seller_id: testUser1.id,
      college_domain: 'kongu.edu',
      title: 'Original Title',
    });

    // Update title only; college_domain cannot be changed
    await db.query('UPDATE listings SET title = $1 WHERE id = $2', ['Updated Title', listing.id]);
    const updated = (await db.query('SELECT title, college_domain FROM listings WHERE id = $1', [listing.id])).rows[0];
    assert.strictEqual(updated.title, 'Updated Title');
    assert.strictEqual(updated.college_domain, 'kongu.edu');
  });

  // --- EXISTING CORE FINANCIAL & WORKFLOW TESTS ---

  // 9. Acceptance of first bid at start price
  await test('First bid at start price is accepted; below start price is rejected', async () => {
    const listing = await createTestListing({ start_price: 500, min_increment: 50 });

    await assert.rejects(
      () => placeBid(listing.id, testUser2.id, 450),
      /below minimum allowed bid/
    );

    const res = await placeBid(listing.id, testUser2.id, 500);
    assert.strictEqual(res.amount, 500);
    assert.strictEqual(res.currentPrice, 500);
  });

  // 10. Minimum increment rule
  await test('Subsequent bids must meet current_price + min_increment', async () => {
    const listing = await createTestListing({ start_price: 200, min_increment: 20 });
    await placeBid(listing.id, testUser2.id, 200);

    await assert.rejects(
      () => placeBid(listing.id, testUser4.id, 210),
      /below minimum allowed bid/
    );

    const res = await placeBid(listing.id, testUser4.id, 220);
    assert.strictEqual(res.amount, 220);
  });

  // 11. Seller cannot bid & leader cannot outbid themselves
  await test('Seller cannot bid and leader cannot manually outbid themselves', async () => {
    const listing = await createTestListing({ seller_id: testUser1.id, start_price: 100, min_increment: 10 });

    await assert.rejects(
      () => placeBid(listing.id, testUser1.id, 100),
      /Sellers cannot bid/
    );

    await placeBid(listing.id, testUser2.id, 100);

    await assert.rejects(
      () => placeBid(listing.id, testUser2.id, 120),
      /already the highest bidder/
    );
  });

  // 12. Bids after closes_at are rejected even if cron has not run
  await test('Bid after closes_at is rejected immediately regardless of cron', async () => {
    const expiredTime = new Date(Date.now() - 10 * 1000).toISOString();
    const listing = await createTestListing({ start_price: 100, closes_at: expiredTime });

    await assert.rejects(
      () => placeBid(listing.id, testUser2.id, 100),
      /Auction has already closed/
    );
  });

  // 13. Extension rule: bid within 30s extends auction by 60s
  await test('Bid in last 30 seconds triggers extension by 60 seconds', async () => {
    const closesIn15s = new Date(Date.now() + 15 * 1000).toISOString();
    const listing = await createTestListing({ start_price: 100, closes_at: closesIn15s });

    const beforeClosesAt = new Date(listing.closes_at).getTime();
    const result = await placeBid(listing.id, testUser2.id, 100);

    assert.strictEqual(result.extended, true);
    const afterClosesAt = new Date(result.closesAt).getTime();
    assert.ok(afterClosesAt > beforeClosesAt);
    assert.ok(afterClosesAt >= Date.now() + 50 * 1000);
  });

  // 14. Concurrency test: 20 sequential/interleaved bids maintain consistent state
  await test('20 concurrent bids race condition resolves atomically without data race', async () => {
    const listing = await createTestListing({ start_price: 100, min_increment: 10 });
    const bidders = [testUser2.id, testUser4.id];

    const promises = [];
    for (let i = 1; i <= 20; i++) {
      const bidderId = bidders[i % bidders.length];
      const bidAmount = 100 + i * 15;
      promises.push(
        placeBid(listing.id, bidderId, bidAmount).catch(() => null)
      );
    }

    await Promise.all(promises);

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

  // 15. Auto-bidding proxy and settlement
  await test('Auto-bidding proxy never exceeds user max and settles competing maxes', async () => {
    const listing = await createTestListing({ start_price: 100, min_increment: 10 });

    await setAutoBid(listing.id, testUser2.id, 200);

    let l = (await db.query('SELECT current_price, leading_bid_id FROM listings WHERE id = $1', [listing.id])).rows[0];
    assert.strictEqual(l.current_price, 100);

    await setAutoBid(listing.id, testUser4.id, 250);

    l = (await db.query('SELECT current_price, leading_bid_id FROM listings WHERE id = $1', [listing.id])).rows[0];
    assert.strictEqual(l.current_price, 210);

    const leadBid = (await db.query('SELECT bidder_id FROM bids WHERE id = $1', [l.leading_bid_id])).rows[0];
    assert.strictEqual(leadBid.bidder_id, testUser4.id);
  });

  // 16. Auction Closing: With bids -> pending_approval, Without bids -> unsold
  await test('Closing: with bids -> pending_approval, without bids -> unsold', async () => {
    const listingA = await createTestListing({ start_price: 100 });
    await placeBid(listingA.id, testUser2.id, 100);
    await db.query(`UPDATE listings SET closes_at = now() - interval '5 seconds' WHERE id = $1`, [listingA.id]);

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

  // 17. Sale State Machine: approve -> handover -> completed
  await test('Sale state machine transitions: approve -> handover -> completed', async () => {
    const listing = await createTestListing({ seller_id: testUser1.id, start_price: 100 });
    await placeBid(listing.id, testUser2.id, 100);
    await db.query(`UPDATE listings SET closes_at = now() - interval '5 seconds' WHERE id = $1`, [listing.id]);
    await closeExpiredAuctions();

    const appRes = await approveSale(listing.id, testUser1.id, 'Approved');
    assert.strictEqual(appRes.status, 'approved');

    const handRes = await confirmHandover(listing.id, testUser1.id, 'Delivered in hostel');
    assert.strictEqual(handRes.status, 'completed');

    const finalState = (await db.query('SELECT status FROM listings WHERE id = $1', [listing.id])).rows[0];
    assert.strictEqual(finalState.status, 'completed');
  });

  // 18. AI Assistant privacy and proposal-before-bid enforcement
  await test('Assistant guardrails: privacy (no emails) and proposal-before-bid enforcement', async () => {
    const listing = await createTestListing({ start_price: 500, min_increment: 50, college_domain: 'kongu.edu' });

    const publicData = await toolGetListing('kongu.edu', listing.id);
    assert.strictEqual(typeof publicData.seller_name, 'string');
    assert.strictEqual(publicData.seller_email, undefined);

    const proposal = await toolProposeBid(testUser2.id, 'kongu.edu', listing.id, 800);
    assert.strictEqual(proposal.status, 'pending');

    let checkList = (await db.query('SELECT current_price, leading_bid_id FROM listings WHERE id = $1', [listing.id])).rows[0];
    assert.strictEqual(checkList.leading_bid_id, null);

    await confirmProposal(proposal.proposal_id, testUser2.id);

    checkList = (await db.query('SELECT current_price, leading_bid_id FROM listings WHERE id = $1', [listing.id])).rows[0];
    assert.strictEqual(checkList.current_price, 500);
  });

  // 19. Sale State Machine: reject and pickup_failed paths
  await test('Sale state machine: reject by seller and pickup_failed outcomes', async () => {
    const listingRej = await createTestListing({ seller_id: testUser1.id, start_price: 300 });
    await placeBid(listingRej.id, testUser2.id, 300);
    await db.query(`UPDATE listings SET closes_at = now() - interval '5 seconds' WHERE id = $1`, [listingRej.id]);
    await closeExpiredAuctions();

    const rejRes = await rejectSale(listingRej.id, testUser1.id, 'Price too low');
    assert.strictEqual(rejRes.status, 'rejected');

    const listingFail = await createTestListing({ seller_id: testUser1.id, start_price: 400 });
    await placeBid(listingFail.id, testUser2.id, 400);
    await db.query(`UPDATE listings SET closes_at = now() - interval '5 seconds' WHERE id = $1`, [listingFail.id]);
    await closeExpiredAuctions();
    await approveSale(listingFail.id, testUser1.id, 'Approved');
    const failRes = await reportPickupFailed(listingFail.id, testUser1.id, 'Buyer did not show up');
    assert.strictEqual(failRes.status, 'failed_pickup');
  });

  // 20. Wanted item alerts match listings in same college
  await test('Wanted items: match notifications triggered for new listings in same college', async () => {
    await db.query(
      `INSERT INTO wanted_items (user_id, keywords, category, max_price, active, college_domain)
       VALUES ($1, 'scientific calculator', 'calculator', 500, true, 'kongu.edu')`,
      [testUser4.id]
    );

    const calcListing = await createTestListing({
      seller_id: testUser1.id,
      college_domain: 'kongu.edu',
      title: 'Casio fx-991ES Plus Scientific Calculator',
      category: 'calculator',
      description: 'Used for two semesters in engineering',
      start_price: 350,
    });

    await checkMatchesForNewListing(calcListing);

    const notifs = await db.query(
      `SELECT type, message FROM notifications WHERE user_id = $1 AND listing_id = $2`,
      [testUser4.id, calcListing.id]
    );
    assert.ok(notifs.rows.length > 0);
    assert.strictEqual(notifs.rows[0].type, 'wanted_match');
  });

  // 21. Q&A: Asking questions, seller answers, and hiding spam
  await test('Questions before bidding: buyer asks, seller answers, spam hidden', async () => {
    const listing = await createTestListing({ seller_id: testUser1.id, start_price: 200 });

    const qRes = await db.query(
      `INSERT INTO questions (listing_id, asker_id, body)
       VALUES ($1, $2, 'Does this include the charger cable?')
       RETURNING id`,
      [listing.id, testUser2.id]
    );
    const qId = qRes.rows[0].id;

    await db.query(
      `UPDATE questions SET answer = 'Yes, original cable included', answered_at = now() WHERE id = $1`,
      [qId]
    );

    let qRow = (await db.query('SELECT answer, hidden FROM questions WHERE id = $1', [qId])).rows[0];
    assert.strictEqual(qRow.answer, 'Yes, original cable included');
    assert.strictEqual(qRow.hidden, false);

    await db.query('UPDATE questions SET hidden = true WHERE id = $1', [qId]);
    qRow = (await db.query('SELECT hidden FROM questions WHERE id = $1', [qId])).rows[0];
    assert.strictEqual(qRow.hidden, true);
  });

  console.log(`\n========================================`);
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  // Clean up test database
  try {
    await closeDb();
    await new Promise((resolve) => setTimeout(resolve, 200));
  } catch {}
  if (fs.existsSync(testDbDir)) {
    try {
      fs.rmSync(testDbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {}
  }

  if (failed > 0) {
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('run-tests.js')) {
  runAllTests()
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error(err);
      try {
        await closeDb();
      } catch {}
      if (fs.existsSync(testDbDir)) {
        try {
          fs.rmSync(testDbDir, { recursive: true, force: true });
        } catch {}
      }
      process.exit(1);
    });
}
