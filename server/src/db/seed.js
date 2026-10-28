import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { db } from './pool.js';
import { runMigrations } from './migrate.js';

// Helper to write an SVG placeholder image if none exists
function ensureSeedImages(uploadsDir) {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const items = [
    { filename: 'cycle_hero.svg', title: 'Campus Geared Cycle', color: '#3b82f6', icon: '🚲' },
    { filename: 'calculator.svg', title: 'Casio fx-991EX Calculator', color: '#10b981', icon: '🔢' },
    { filename: 'clrs_book.svg', title: 'Introduction to Algorithms', color: '#8b5cf6', icon: '📚' },
    { filename: 'headphones.svg', title: 'Wireless Headphones', color: '#f59e0b', icon: '🎧' },
    { filename: 'desk_lamp.svg', title: 'LED Study Desk Lamp', color: '#ec4899', icon: '💡' },
    { filename: 'kettle.svg', title: 'Hostel Electric Kettle', color: '#06b6d4', icon: '🫖' },
  ];

  for (const item of items) {
    const filePath = path.join(uploadsDir, item.filename);
    if (!fs.existsSync(filePath)) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${item.color};stop-opacity:0.85" />
            <stop offset="100%" style="stop-color:#0f172a;stop-opacity:0.95" />
          </linearGradient>
        </defs>
        <rect width="600" height="400" fill="url(#grad)" rx="16"/>
        <text x="300" y="180" font-family="system-ui, -apple-system, sans-serif" font-size="80" text-anchor="middle" dominant-baseline="middle">${item.icon}</text>
        <text x="300" y="270" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="24" fill="#ffffff" text-anchor="middle">${item.title}</text>
        <text x="300" y="310" font-family="system-ui, -apple-system, sans-serif" font-size="15" fill="#94a3b8" text-anchor="middle">Campus Verified Student Auction</text>
      </svg>`;
      fs.writeFileSync(filePath, svg);
    }
  }
}

export async function seed() {
  console.log('Seeding database with sample campus data...');
  await runMigrations();

  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  ensureSeedImages(uploadsDir);

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Seed Users
  const users = [
    { name: 'Aarav Sharma', email: 'aarav@campus.edu' },
    { name: 'Priya Patel', email: 'priya@campus.edu' },
    { name: 'Rohan Verma', email: 'rohan@campus.edu' },
    { name: 'Ananya Iyer', email: 'ananya@campus.edu' },
    { name: 'Kavya Reddy', email: 'kavya@campus.edu' },
  ];

  const userIds = [];
  for (const u of users) {
    const res = await db.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [u.name, u.email, passwordHash]
    );
    userIds.push(res.rows[0].id);
  }

  // 2. Clear old demo listings if re-seeding
  await db.query(`DELETE FROM listings WHERE seller_id = ANY($1)`, [userIds]);

  const now = Date.now();
  const closingIn2Min = new Date(now + 2 * 60 * 1000).toISOString();
  const closingIn1Hour = new Date(now + 60 * 60 * 1000).toISOString();
  const closingIn4Hours = new Date(now + 4 * 60 * 60 * 1000).toISOString();
  const closingIn2Days = new Date(now + 48 * 60 * 60 * 1000).toISOString();

  // 3. Seed Sample Listings
  const listingsData = [
    {
      seller_id: userIds[0],
      title: 'Hercules 21-Speed Mountain Cycle (with Bell & Lock)',
      category: 'cycle',
      condition: 'good',
      description: 'Used for 2 semesters, recently serviced with new brake pads and smooth gears. Includes a sturdy combination cable lock and bright LED reflector. Perfect for commuting between hostels and lecture halls.',
      start_price: 1800,
      min_increment: 100,
      closes_at: closingIn2Min, // Demo quick close!
      image: '/uploads/cycle_hero.svg',
    },
    {
      seller_id: userIds[1],
      title: 'Casio fx-991EX ClassWiz Scientific Calculator',
      category: 'calculator',
      condition: 'like_new',
      description: 'Approved for university engineering examinations. High-resolution screen with QR code function, 552 functions including matrix, vectors, and equation solving. Barely used with protective slide-on hard case.',
      start_price: 600,
      min_increment: 50,
      closes_at: closingIn1Hour,
      image: '/uploads/calculator.svg',
    },
    {
      seller_id: userIds[2],
      title: 'Introduction to Algorithms (CLRS 3rd Edition)',
      category: 'books',
      condition: 'good',
      description: 'The definitive textbook for CS algorithms and data structures. Clean pages, no missing leaves, minor pencil markings in chapters 1-4. Must-have for placements and semester exams.',
      start_price: 350,
      min_increment: 25,
      closes_at: closingIn4Hours,
      image: '/uploads/clrs_book.svg',
    },
    {
      seller_id: userIds[3],
      title: 'Sony Active Noise Cancelling Headphones (WH-CH720N)',
      category: 'electronics',
      condition: 'like_new',
      description: 'Over-ear headphones with 35 hours battery life and dual noise sensor technology. Essential for studying in noisy campus library or hostel dorms. Comes with original charging cable.',
      start_price: 2400,
      min_increment: 100,
      closes_at: closingIn2Days,
      image: '/uploads/headphones.svg',
    },
    {
      seller_id: userIds[0],
      title: 'Wipro 12W LED Desk Lamp with 3 Color Modes',
      category: 'other',
      condition: 'like_new',
      description: 'Adjustable gooseneck study lamp with touch dimmer control and warm/neutral/cool light modes. USB powered, ideal for late-night exam prep without disturbing roommates.',
      start_price: 200,
      min_increment: 20,
      closes_at: closingIn4Hours,
      image: '/uploads/desk_lamp.svg',
    },
    {
      seller_id: userIds[4],
      title: 'Pigeon 1.5L Stainless Steel Electric Kettle',
      category: 'other',
      condition: 'good',
      description: 'Boils water, Maggie noodles, or coffee in 2 minutes. Automatic shut-off and boil-dry protection. Works perfectly on standard hostel socket.',
      start_price: 250,
      min_increment: 25,
      closes_at: closingIn2Days,
      image: '/uploads/kettle.svg',
    },
  ];

  for (const item of listingsData) {
    const listRes = await db.query(
      `INSERT INTO listings (
        seller_id, title, category, description, condition,
        start_price, min_increment, closes_at, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')
      RETURNING id`,
      [
        item.seller_id,
        item.title,
        item.category,
        item.description,
        item.condition,
        item.start_price,
        item.min_increment,
        item.closes_at,
      ]
    );
    const listingId = listRes.rows[0].id;

    // Insert image
    await db.query(
      `INSERT INTO listing_images (listing_id, url, position) VALUES ($1, $2, 0)`,
      [listingId, item.image]
    );

    // Initial event
    await db.query(
      `INSERT INTO listing_events (listing_id, type, actor_id, note)
       VALUES ($1, 'created', $2, 'Initial listing created')`,
      [listingId, item.seller_id]
    );

    // Seed some initial bids on cycle and calculator
    if (item.category === 'cycle') {
      const bid1 = await db.query(
        `INSERT INTO bids (listing_id, bidder_id, amount, is_auto)
         VALUES ($1, $2, 1800, false) RETURNING id`,
        [listingId, userIds[1]]
      );
      const bid2 = await db.query(
        `INSERT INTO bids (listing_id, bidder_id, amount, is_auto)
         VALUES ($1, $2, 1900, false) RETURNING id`,
        [listingId, userIds[2]]
      );
      await db.query(
        `UPDATE listings SET current_price = 1900, leading_bid_id = $1 WHERE id = $2`,
        [bid2.rows[0].id, listingId]
      );
    } else if (item.category === 'calculator') {
      const bid1 = await db.query(
        `INSERT INTO bids (listing_id, bidder_id, amount, is_auto)
         VALUES ($1, $2, 600, false) RETURNING id`,
        [listingId, userIds[3]]
      );
      await db.query(
        `UPDATE listings SET current_price = 600, leading_bid_id = $1 WHERE id = $2`,
        [bid1.rows[0].id, listingId]
      );
    }
  }

  // 4. Seed sample Q&A
  const firstListing = (await db.query('SELECT id, seller_id FROM listings LIMIT 1')).rows[0];
  if (firstListing) {
    await db.query(
      `INSERT INTO questions (listing_id, asker_id, body, answer, answered_at)
       VALUES ($1, $2, 'Is the seat height adjustable for taller students?', 'Yes! It has a quick-release lever and easily adjusts up to 6ft height.', now())`,
      [firstListing.id, userIds[3]]
    );
  }

  console.log('Seed completed successfully!');
  console.log('Sample login credentials:');
  console.log('  Email: aarav@campus.edu (Seller of cycle)');
  console.log('  Email: priya@campus.edu (Bidder & seller of calculator)');
  console.log('  Email: rohan@campus.edu (Leading bidder on cycle)');
  console.log('  Password for all: password123');
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}
