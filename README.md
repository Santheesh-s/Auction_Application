# 🎓 Campus Auction — Real-Time Peer-to-Peer Student Marketplace

A full-stack web application designed exclusively for college campuses to buy and sell cycles, scientific calculators, textbooks, and hostel essentials with live atomic bidding, real-time clock extensions, proxy auto-bidding, and secure handover verification.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** v18+ (tested on Node v22)
- **npm** v9+
- Zero external database installation required (uses persistent embedded PostgreSQL via `@electric-sql/pglite` by default, or connects to external PostgreSQL if `DATABASE_URL` is configured).

### 2. Install Dependencies
```bash
# Install root, server, and client dependencies
npm install
npm --prefix server install
npm --prefix client install
```

### 3. Run Development Servers
Starts both Express backend (Port 5000) and Vite React frontend (Port 5173):
```bash
npm run dev
```
Open **[http://localhost:5173](http://localhost:5173)** in your browser. Register an account using your institution email.

### 4. Run Automated Tests
Executes the comprehensive concurrency and business logic test suite:
```bash
npm test
```

---

## 🏗️ Architecture & Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | React 19, Vite, React Router v7, Tailwind CSS, Lucide Icons, Canvas Confetti | Fast compilation, modern typography (Outfit & Inter), responsive glassmorphism |
| **Backend** | Node.js, Express, Socket.IO, Multer, Bcrypt, JsonWebToken, Zod | Pure modern JavaScript (ES Modules), atomic transaction control, strict schema validation |
| **Database** | PostgreSQL / `@electric-sql/pglite` (WebAssembly Postgres) | Native row locks (`SELECT ... FOR UPDATE`), ACID transactions, seamless zero-config local run |
| **Real-time** | Socket.IO (`listing:{id}`, `user:{id}` rooms) | Instant push of new bids, 30s extensions, auction closures, and outbid notifications |
| **Scheduler** | `node-cron` (every 5 seconds) | Server-side auction finalization and closing checks |

---

## ⚡ Core Business Rules & Implementation

### 1. Atomic Bidding & Anti-Sniping Protection
- All bids run inside a PostgreSQL transaction with **`SELECT ... FOR UPDATE`** on the listing row to eliminate race conditions.
- **Server Clock Authority:** Bid eligibility and closing timestamps are evaluated strictly against `now()` on the server clock.
- **Last-30-Second Extension Rule:** If a valid bid arrives within 30 seconds of `closes_at`, the auction is automatically extended by 60 seconds (`closes_at = now() + 60s`), logging an `extended` event and pushing live WebSocket updates to all viewers.
- **Seller & Leader Guardrails:** Sellers are barred from bidding on their own listings; current leading bidders cannot manually outbid themselves.

### 2. Automatic Proxy Bidding Resolution Loop
- Students can set a `max_amount` cap on any listing.
- The system bids automatically on their behalf **only as much as needed to maintain the lead** (`current_price + min_increment`).
- When two auto-bids compete, the transaction resolves the competing proxy limits until one is exhausted, firing an `auto_bid_exhausted` notification to the outbid student.
- Auto-bid maximums are displayed publicly for transparent campus trust.

### 3. Sale Workflow State Machine
```
open ──cancel (seller)─────────▶ cancelled
open ──time up, no bids────────▶ unsold
open ──time up, bids───────────▶ pending_approval
pending_approval ──seller approves──▶ approved (item reserved)
pending_approval ──seller rejects───▶ rejected
approved ──handover confirmed───────▶ completed
approved ──pickup failed────────────▶ failed_pickup
```
- Every transition logs an audit record in `listing_events` with actor ID and note.
- Both parties receive immediate in-app and browser notifications.

### 4. Wanted Items Alert Matcher
- Students save keyword search alerts with optional category and max budget.
- Event-driven matcher triggers on every new listing creation, sending live `wanted_match` notifications to students (even when offline).

### 5. AI Assistant with Strict Code Guardrails
- Natural language chat assistant supporting tools: `search_listings`, `get_listing`, and `propose_bid`.
- **Zero-Bidding Guardrail:** The model can only prepare an `assistant_proposals` card in `pending` state; it cannot place bids directly.
- Only the authenticated student clicking the **Confirm** button triggers auto-bid activation through the secure `/api/assistant/proposals/:id/confirm` endpoint.
- Private student emails and password hashes are never exposed through AI tool endpoints.

---

## 🧪 Test Suite Checklist

Run `npm test` to execute all 13 automated test suites:
- [x] Bid below minimum rejected; first bid at start price accepted
- [x] Subsequent bids must meet `current_price + min_increment`
- [x] Seller cannot bid on own item; leader cannot outbid themselves manually
- [x] Bid after `closes_at` is rejected immediately, even before cron runs
- [x] Bid within last 30s extends `closes_at` by 60s
- [x] 20 concurrent bids race condition resolves atomically without data race
- [x] Auto-bidding proxy never exceeds user max and settles competing maxes
- [x] Closing: with bids -> `pending_approval`; without bids -> `unsold`
- [x] Sale state machine: approve -> handover -> completed
- [x] Assistant guardrails: privacy (no emails) and proposal-before-bid enforcement
- [x] Sale state machine: reject by seller and pickup_failed outcomes
- [x] Wanted items: match notifications triggered for new listings (including offline)
- [x] Questions before bidding: buyer asks, seller answers, spam hidden

---

## 📝 Design Decisions Explained

1. **Why PostgreSQL Transactions & Row Locks (`SELECT ... FOR UPDATE`):**
   Campus auctions experience high concurrency in the final minutes. In-memory counters or non-locking reads suffer from dirty writes and lost updates. Row locks ensure every bid and auto-bid increment evaluates the true, isolated state of the auction.
2. **Why `closes_at <= now()` instead of `setTimeout`:**
   Node.js `setTimeout` can drift, fail on server restarts, and consume unbound memory. Comparing against the single server clock ensures that even if background schedulers delay by milliseconds, the bidding endpoints will never accept a bid past closing time.
3. **Why Server-Side Rule Enforcement:**
   Clients are inherently untrusted. All validation (increments, domain limits, timers, state transitions, AI guardrails) is enforced by Express middleware and database constraints.
