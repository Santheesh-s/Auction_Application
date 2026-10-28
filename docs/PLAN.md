# Campus Auction — Build Plan (for Antigravity)

Stack: **Express + React + Node.js + PostgreSQL** (ERN). Monorepo: `/client` (React + Vite), `/server` (Express).

---

## 0. How to use this with Antigravity

1. Create the **public GitHub repo first**, then put this file at `docs/PLAN.md`.
2. Open the repo in Antigravity. Tell the agent: *"Read docs/PLAN.md fully. Follow Section 1 (Agent rules) at all times. We will build one phase at a time."*
3. Give it **one phase per prompt** (Section 7). Review the plan it proposes before it codes.
4. After each phase: run the app, check the acceptance criteria, then **commit** (message suggested in each phase). The brief grades commit history.
5. Keep all planning in **one chat session** (the brief requires you to share that link). Come back to the same chat for schema tweaks, bugs, and decisions.

---

## 1. Agent rules (paste at the top of every session)

- TypeScript is optional; if used, use it on both sides. Prefer plain, readable code over clever code.
- **All money is integer rupees (INR).** No floats.
- **Server time is the only clock.** Never trust client time for closing, bidding, or extensions.
- **Every rule is enforced on the server.** The client only displays state.
- Bid placement, closing, and auto-bid resolution run **inside a DB transaction with `SELECT ... FOR UPDATE` on the listing row**.
- Auctions are closed by comparing `closes_at` to `now()`, never by `setTimeout`. A cron job finalizes closed auctions; bid endpoints also reject any bid after `closes_at` regardless of whether the cron has run.
- Validate every request body with `zod`. Return consistent errors: `{ error: { code, message } }`.
- Never return emails, password hashes, or any private account detail to other users. Public bidder identity = display name only.
- Write a migration for every schema change (`server/db/migrations/NNN_name.sql`).
- Small commits. One feature per commit. Update README when setup changes.

---

## 2. Tech choices

| Concern | Choice |
|---|---|
| Frontend | React + Vite, React Router, TanStack Query, Tailwind |
| Backend | Express, `pg` (raw SQL) or Drizzle, `zod`, `helmet`, `cors` |
| Auth | Email + password, bcrypt, JWT in httpOnly cookie; restrict to campus email domain via env var |
| Real-time | Socket.IO (room per listing `listing:{id}`, room per user `user:{id}`) |
| Uploads | `multer`, local `/uploads` folder served statically (Cloudinary if host has ephemeral disk) |
| Scheduler | `node-cron` every 5 seconds: finalize closed listings, run wanted-item matching is event-driven (not cron) |
| AI assistant | LLM API with tool calling, called only from the server |
| Deploy | Render/Railway (API + Postgres), Vercel/Netlify (client) |

---

## 3. Repo structure

```
/client
  src/pages        Home, Browse, ListingDetail, CreateListing, EditListing, MyListings,
                   MyBids, Notifications, Wanted, Assistant, Login, Register
  src/components   ListingCard, Countdown, BidForm, BidHistory, QnA, Filters, ...
  src/lib          api.ts, socket.ts, time.ts (server-offset-corrected clock)
/server
  src/index.ts
  src/routes       auth, listings, bids, sales, questions, notifications, wanted, assistant
  src/services     biddingService, auctionCloser, notificationService, wantedMatcher, assistantService
  src/db           pool.ts, migrate.ts, migrations/
  src/realtime     socket.ts
  src/middleware   auth.ts, validate.ts, errors.ts
/docs/PLAN.md
README.md
```

---

## 4. Database schema (migration 001)

```sql
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,                 -- public display name
  email         TEXT NOT NULL UNIQUE,          -- private
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE listing_status AS ENUM (
  'open',               -- accepting bids
  'pending_approval',   -- closed, has provisional winner, waiting for seller
  'unsold',             -- closed, no bids
  'approved',           -- seller approved; item reserved for winner
  'rejected',           -- seller rejected winning price
  'cancelled',          -- seller cancelled
  'completed',          -- campus handover confirmed
  'failed_pickup'       -- reserved but pickup failed
);

CREATE TABLE listings (
  id            SERIAL PRIMARY KEY,
  seller_id     INT NOT NULL REFERENCES users(id),
  title         TEXT NOT NULL,
  category      TEXT NOT NULL,                 -- cycle, calculator, books, electronics, other
  description   TEXT NOT NULL,
  condition     TEXT NOT NULL,                 -- new, like_new, good, fair, poor
  start_price   INT NOT NULL CHECK (start_price > 0),
  min_increment INT NOT NULL CHECK (min_increment > 0),
  current_price INT,                           -- NULL until first bid
  leading_bid_id INT,                          -- FK added after bids table
  winner_id     INT REFERENCES users(id),      -- set at closing
  closes_at     TIMESTAMPTZ NOT NULL,
  status        listing_status NOT NULL DEFAULT 'open',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_listings_status_closes ON listings(status, closes_at);
CREATE INDEX idx_listings_category ON listings(category);

CREATE TABLE listing_images (
  id         SERIAL PRIMARY KEY,
  listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  position   INT NOT NULL DEFAULT 0
);

CREATE TABLE bids (
  id         SERIAL PRIMARY KEY,
  listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  bidder_id  INT NOT NULL REFERENCES users(id),
  amount     INT NOT NULL,
  is_auto    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bids_listing ON bids(listing_id, amount DESC, created_at);
ALTER TABLE listings ADD FOREIGN KEY (leading_bid_id) REFERENCES bids(id);

CREATE TABLE auto_bids (                          -- maximums are PUBLIC per the brief
  id         SERIAL PRIMARY KEY,
  listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id    INT NOT NULL REFERENCES users(id),
  max_amount INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, user_id)
);

CREATE TABLE listing_events (                     -- audit trail of outcomes
  id         SERIAL PRIMARY KEY,
  listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,   -- created, edited, cancelled, closed_won, closed_unsold,
                              -- approved, rejected, handover_confirmed, pickup_failed, extended
  actor_id   INT REFERENCES users(id),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE questions (
  id          SERIAL PRIMARY KEY,
  listing_id  INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  asker_id    INT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL CHECK (char_length(body) <= 300),
  answer      TEXT CHECK (char_length(answer) <= 600),
  answered_at TIMESTAMPTZ,
  hidden      BOOLEAN NOT NULL DEFAULT false,    -- seller can hide spam
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL,
  listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
  message    TEXT NOT NULL,
  read       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user ON notifications(user_id, read, created_at DESC);

CREATE TABLE wanted_items (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id),
  keywords   TEXT NOT NULL,        -- e.g. "scientific calculator"
  category   TEXT,
  max_price  INT,                  -- compared to start_price of new listings
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE assistant_proposals (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id),
  listing_id INT NOT NULL REFERENCES listings(id),
  max_amount INT NOT NULL,         -- the limit the student agreed to
  status     TEXT NOT NULL DEFAULT 'pending',   -- pending, confirmed, expired, rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 5. Business rules (the source of truth)

### Listing rules
- Required: title, category, description, condition, ≥1 photo, start price, min increment, `closes_at` (must be in the future, at least a few minutes ahead).
- Seller **can edit** while `open`. Once any bid exists, price, increment, and closing time are locked (title/description/photos still editable). Log an `edited` event.
- Seller **can cancel** while `open` (with or without bids). Status → `cancelled`, log event, notify every bidder.
- Seller cannot bid on their own listing.

### Browsing
- Search: keyword over title + description (`ILIKE` or Postgres full-text).
- Filters: category, condition, price range (against current price, or start price if no bids), **closing soon** (e.g. next 1h/6h/24h), only `open` by default.
- Sorts: closing soonest, newest, price low→high.
- Detail page: item info, photos, leading bid, **full bid history**, own countdown, public auto-bid maximums, Q&A.

### Bidding rules
- First bid: `amount >= start_price`. Later bids: `amount >= current_price + min_increment`.
- Reject if `now() >= closes_at` or status ≠ `open`.
- Every bid stores bidder, amount, time. History is public. **Auto-bid maximums are public too.**
- Seller cannot bid; leader cannot outbid themselves with a manual bid (reject with a clear message).

### Bid transaction (one function: `placeBid(listingId, userId, amount, isAuto=false)`)
1. `BEGIN`
2. `SELECT * FROM listings WHERE id=$1 FOR UPDATE`
3. Validate status, time, increment, not seller, not current leader.
4. `INSERT` bid; update `current_price`, `leading_bid_id`.
5. **Extension rule:** if `closes_at - now() <= 30s` → set `closes_at = now() + 60s`, log `extended`.
6. **Run auto-bid resolution** (below).
7. `COMMIT`
8. After commit: emit socket events (`bid:new`, `auction:extended`), create notifications (outbid, etc.).

### Auto-bidding rules
- A user sets `max_amount` per listing. Must be ≥ the minimum valid bid right now. Can raise but not lower below what they've already bid.
- The system bids for them **only as much as needed to keep them in the lead**.
- Resolution loop (inside the same transaction, after any manual bid or when an auto-bid is created/raised):
  1. Find auto-bidders other than the current leader with `max_amount >= current_price + min_increment`. Pick the one with the **highest max** (tie → earliest `created_at`).
  2. They bid `min(their_max, current_price + min_increment)` as a bid with `is_auto = true`.
  3. Repeat until no eligible auto-bidder exists. (Terminates because price strictly increases and is capped by maxes.)
  4. If two auto-bidders compete, the loop naturally settles at roughly `min(top_max, second_max + increment)`. Optimization: jump directly to that price instead of looping rupee by rupee.
- **If the current leader has an auto max and a manual bid arrives below it**, the leader's auto-bid responds immediately with `manual + increment` (capped at max).
- Auto-bids that happen in the last 30 seconds also trigger the extension rule (they are valid bids).
- Never exceed the user's max. Never bid for the current leader against themselves.

### Closing (cron every 5s, plus lazy check on reads)
For each `open` listing with `closes_at <= now()` (lock row first):
- Has bids → status `pending_approval`, `winner_id` = highest bidder, log `closed_won`, notify seller + winner.
- No bids → status `unsold`, log `closed_unsold`, notify seller.
- Emit `auction:closed` to the listing room.

### Sale flow (state machine)
```
open ──cancel──────────────▶ cancelled
open ──time up, no bids────▶ unsold
open ──time up, bids───────▶ pending_approval
pending_approval ──seller approves──▶ approved   (item reserved for winner)
pending_approval ──seller rejects───▶ rejected
approved ──handover confirmed───────▶ completed
approved ──pickup failed────────────▶ failed_pickup
```
- Only the **seller** can approve/reject.
- **Handover confirmation:** the seller marks "handed over" and the winner confirms (or seller-confirm only if you want to keep it simple — decide and state it in README). `failed_pickup` can be set by the seller (with a note) after approval.
- Every transition writes a `listing_events` row with actor and note, and notifies the other party. The listing page shows the clear final outcome.

### Notifications
- Types: `outbid`, `auction_closing_soon` (optional), `won_pending_approval`, `winner_approved`, `rejected`, `cancelled`, `sold_handover`, `question_asked`, `question_answered`, `wanted_match`, `auto_bid_exhausted`.
- Stored in DB, pushed live via the user's socket room, shown in a bell dropdown with unread count.
- **Browser notifications:** a button "Enable browser notifications" calls `Notification.requestPermission()`. When a socket notification arrives and `document.hidden` is true, call `new Notification(title, {body})`. (The brief only requires this while the app is open in a background tab, so no service worker needed.)

### Questions before bidding
- Any logged-in non-seller can ask (max 300 chars). Rate limit: e.g. max 3 questions per user per listing, and 10 per hour overall.
- Seller answers once; answers are public on the listing, so repeated questions are rare. Show answered questions first.
- Seller can **hide** a question (spam). Hidden questions are removed from public view.
- Asker and seller get notifications.

### Never miss what you need (wanted items)
- Student saves: keywords, optional category, optional max price. Persisted in DB (survives being offline).
- On **every new listing created**, `wantedMatcher` checks active wanted items: keyword terms all appear in title/description (case-insensitive), category matches if set, `start_price <= max_price` if set. Create a `wanted_match` notification for each match (not for the seller's own listing).
- When the student next logs in, they see unread notifications; if they're online it's live.
- Also run the matcher against existing open listings when the wanted item is first created, so they see current matches immediately.

### AI assistant
- Chat tab. Server calls the LLM with tools:
  - `search_listings({ query, category?, max_price? })` → public data only (title, current price, closes_at, id).
  - `get_listing({ id })` → public data, bid history by display name.
  - `propose_bid({ listing_id, max_amount })` → **creates an `assistant_proposals` row with status `pending` and returns it. It does NOT place a bid.**
- UI shows the proposal as a card: "Bid up to ₹X automatically on *Item*?" with **Confirm / Cancel** buttons.
- `POST /api/assistant/proposals/:id/confirm` (user-authenticated) validates ownership, expiry (e.g. 10 min), and that `max_amount` equals what was shown, then creates an `auto_bids` row for that user, which flows through the normal bidding logic.
- **Guardrails enforced in code, not only in the prompt:**
  - No bid without an explicit confirm click.
  - Never exceeds the confirmed `max_amount`.
  - Tools never return emails or any private account detail.
  - The model can't call confirm itself; only the HTTP endpoint with the user's session can.
- Keep the system prompt short: role, "use tools for facts, never invent listings, always ask the user before bidding, never reveal private data".

---

## 6. API outline

```
POST   /api/auth/register | /login | /logout        GET /api/auth/me
GET    /api/listings                (q, category, condition, minPrice, maxPrice, closingWithin, sort, page)
POST   /api/listings                (multipart: fields + images)
GET    /api/listings/:id            (details, images, bids, auto-bid maxes, events, questions)
PATCH  /api/listings/:id            (seller; edit rules)
POST   /api/listings/:id/cancel
POST   /api/listings/:id/bids       { amount }
PUT    /api/listings/:id/auto-bid   { max_amount }
DELETE /api/listings/:id/auto-bid
POST   /api/listings/:id/approve | /reject | /handover | /pickup-failed
GET    /api/me/listings | /me/bids
POST   /api/listings/:id/questions  { body }
POST   /api/questions/:id/answer    { answer }
POST   /api/questions/:id/hide
GET    /api/notifications           POST /api/notifications/read
GET/POST/DELETE /api/wanted
POST   /api/assistant/chat          { messages }
POST   /api/assistant/proposals/:id/confirm | /cancel
GET    /api/time                    -> { now }   (client computes server offset)
```

Socket events (server → client): `bid:new`, `auction:extended`, `auction:closed`, `listing:updated`, `notification:new`. Client joins `listing:{id}` on detail page and `user:{id}` after login.

---

## 7. Build phases (one prompt each, one commit each)

Each phase: **Prompt** to give Antigravity, **Done when**, **Commit message**.

### Phase 0 — Scaffolding
**Prompt:** "Create the monorepo from PLAN.md Section 3. Set up Express server with health route, Postgres connection via env, a simple migration runner that applies `server/db/migrations/*.sql` in order, and run migration 001 from Section 4. Set up Vite React client with Tailwind and React Router, proxy `/api` to the server. Write a README with setup steps and `.env.example`."
**Done when:** `npm run dev` starts both; DB tables exist; home page loads.
**Commit:** `chore: scaffold monorepo, db migrations, base schema`

### Phase 1 — Auth
**Prompt:** "Implement register/login/logout/me with bcrypt and JWT httpOnly cookie, `zod` validation, and optional campus-email-domain restriction from env. Add auth middleware and client login/register pages with a global auth context."
**Done when:** can register, log in, refresh page and stay logged in; protected routes work.
**Commit:** `feat(auth): registration, login, session cookie`

### Phase 2 — Listings: create, edit, cancel
**Prompt:** "Implement create/edit/cancel listing per Section 5 rules, with multi-image upload via multer. Build CreateListing, EditListing, MyListings pages. Log `listing_events`."
**Done when:** seller creates a listing with photos; edit lock after bids is enforced (test once bids exist later); cancel works.
**Commit:** `feat(listings): create, edit, cancel with photo upload`

### Phase 3 — Browse and detail
**Prompt:** "Implement GET /api/listings with search, filters (category, condition, price, closing soon), sort, and pagination. Build Browse page with filters and ListingCard, and ListingDetail page showing details, images, current price, and a Countdown component using a server-time offset from GET /api/time."
**Done when:** search and every filter works; countdown is accurate and ticks.
**Commit:** `feat(browse): search, filters, listing detail with countdown`

### Phase 4 — Bidding core
**Prompt:** "Implement `placeBid` exactly as in Section 5 (transaction with `FOR UPDATE`, validations, increment rule, seller/leader restrictions) and the bid endpoint. Show bid form, leading bid, and full public bid history on the detail page. Write a test that fires 20 concurrent bids and verifies the final price and history are consistent."
**Done when:** invalid bids are rejected with clear messages; concurrency test passes.
**Commit:** `feat(bidding): atomic bid placement and public bid history`

### Phase 5 — Real-time
**Prompt:** "Add Socket.IO. Rooms per listing and per user, authenticated via the cookie. Emit `bid:new` after commit; update the detail page and browse cards live without refresh."
**Done when:** two browsers show bids appear instantly.
**Commit:** `feat(realtime): live bid updates via Socket.IO`

### Phase 6 — Closing and sale flow
**Prompt:** "Implement the `auctionCloser` cron (every 5s) per Section 5, plus the sale state machine endpoints approve/reject/handover/pickup-failed with permission checks and `listing_events`. Build seller and winner UI for each state and show a clear final outcome on the listing page. Emit `auction:closed`."
**Done when:** a listing with a short close time closes on its own, goes to `pending_approval` or `unsold`, and every transition is recorded and visible.
**Commit:** `feat(sale): auction closing and approval/handover workflow`

### Phase 7 — Notifications
**Prompt:** "Implement the notifications table service, creation hooks for outbid/closing/sale events, live push to user room, a bell dropdown with unread count, a notifications page, and a 'Enable browser notifications' button that shows Notification pop-ups when the tab is hidden."
**Done when:** being outbid shows a live bell update and a pop-up when the tab is in the background.
**Commit:** `feat(notifications): in-app and browser notifications`

### Phase 8 — Last-minute extensions
**Prompt:** "Add the extension rule into `placeBid`: if a valid bid lands within 30s of `closes_at`, set `closes_at = now() + 60s`, log `extended`, emit `auction:extended` so all viewers' countdowns update. Add a test."
**Done when:** bidding at T-10s moves the countdown to 60s for everyone watching.
**Commit:** `feat(bidding): last-30-second auction extension`

### Phase 9 — Automatic bidding
**Prompt:** "Implement auto-bidding exactly as in Section 5: set/raise/remove max, resolution loop inside the bid transaction, public maximums on the detail page, `auto_bid_exhausted` notification. Write tests: single auto-bidder, two competing auto-bidders, manual bid above max, manual bid below max, tie by earliest."
**Done when:** all test cases give correct final prices and leader, and no user is ever bid beyond their max.
**Commit:** `feat(bidding): proxy auto-bidding with public maximums`

### Phase 10 — Questions before bidding
**Prompt:** "Implement the Q&A per Section 5: ask with limits, seller answer, hide spam, notifications, UI on the listing page with answered questions first."
**Done when:** spam limits trigger; seller can answer and hide.
**Commit:** `feat(qa): buyer questions and seller answers per auction`

### Phase 11 — Wanted items
**Prompt:** "Implement wanted_items CRUD, the matcher run on every new listing, an initial match against existing open listings on creation, `wanted_match` notifications, and a Wanted page."
**Done when:** a student saves 'scientific calculator, up to ₹400', logs out, a matching listing is created, and on next login they have the notification.
**Commit:** `feat(wanted): saved searches with match notifications`

### Phase 12 — AI assistant
**Prompt:** "Implement the assistant per Section 5: chat endpoint with tool calling (`search_listings`, `get_listing`, `propose_bid`), the proposal card UI with Confirm/Cancel, and the confirm endpoint that creates an auto-bid capped at the agreed amount. Enforce all guardrails in code. Add tests that the model cannot place bids without confirm and tools never return private fields."
**Done when:** "find me a cycle under ₹2,000" returns real listings, "bid for me up to ₹1,800" produces a proposal, and nothing happens until Confirm.
**Commit:** `feat(assistant): AI tab with confirm-before-bid guardrails`

### Phase 13 — Polish and delivery
**Prompt:** "Add a seed script with realistic sample data (users, cycles, calculators, books with varied closing times, including some closing within 2 minutes for demo). Add loading/empty/error states, mobile responsiveness, README with setup, env vars, design decisions, and a list of features built vs skipped with reasons. Deploy."
**Done when:** a fresh clone runs with `npm run seed`; deployed URL works.
**Commit:** `chore: seed data, polish, docs, deployment`

---

## 8. Priority if time runs out

Must finish first: Phases 0–7 (everything in "The basics").
Then, in this order of value-for-effort: 8 (extension, tiny) → 9 (auto-bid) → 10 (Q&A) → 11 (wanted items) → 12 (AI assistant).
A smaller, **correct** set beats a larger buggy one. Be ready to explain why you chose this order.

---

## 9. Test checklist before submitting

- [ ] Bid below minimum rejected; first bid at start price accepted
- [ ] Bid after closing rejected, even if cron hasn't run
- [ ] 20 simultaneous bids → consistent state
- [ ] Seller can't bid on own item; leader can't outbid themselves manually
- [ ] Bid at T-10s extends to 60s and all viewers see it
- [ ] Auto-bid never exceeds max; competing auto-bids settle correctly
- [ ] Closing: with bids → pending approval; without → unsold
- [ ] Approve → reserved → handover → completed; reject, cancel, failed pickup show clear outcomes
- [ ] Outbid notification appears live and as browser pop-up in a background tab
- [ ] Wanted item matches a listing created while the student was offline
- [ ] Assistant never bids without Confirm and never exposes emails
- [ ] Public GitHub repo with a meaningful commit per phase; planning chat link ready to share

---

## 10. Be ready to explain (the brief says they'll ask)

- Why Postgres transactions and row locks for bidding.
- Why `closes_at` comparison instead of timers.
- Why server-side enforcement of every rule, including AI guardrails.
- Why you chose your build order and what you deliberately skipped.

---

## 11. Multi-College Isolation & Email Verification Specification

### Core Architectural Decisions:
1. **Registrable College Domain:**
   - Identity derived via `tldts.getDomain(email.split('@')[1])`. Subdomains like `students.kongu.edu` and `cse.iitm.ac.in` map cleanly to institutional boundaries (`kongu.edu`, `iitm.ac.in`).
   - Personal providers (`gmail.com`, `yahoo.com`, `outlook.com`, etc.) rejected.
2. **Migration `002_college_domain_and_verification.sql`:**
   - `users.college_domain` (NOT NULL, indexed).
   - `users.email_verified` (BOOLEAN, default false).
   - `listings.college_domain` (NOT NULL, indexed).
   - `wanted_items.college_domain` (NOT NULL, indexed).
   - `email_verifications` table with token hash, user_id, expires_at (24h).
3. **Strict Same-College Isolation:**
   - Feed and search query: `WHERE college_domain = $userCollege`.
   - Listing detail cross-college: returns **404 Not Found** (prevents cross-institution discovery).
   - Bidding, auto-bids, Q&A: rejected with **`FORBIDDEN_COLLEGE`** (403).
   - Socket rooms: `college:{domain}` and `user:{id}`. Cross-college listing room joins blocked.
   - Wanted alerts: match exclusively within the student's college domain.
   - AI assistant tools: strictly filtered by `college_domain`.
4. **Email Verification:**
   - Token sent on registration via Nodemailer (with dev console fallback).
   - Unverified users blocked from bidding (`EMAIL_NOT_VERIFIED` 403), creating listings, and Q&A.
5. **Zero Mock Data Policy:**
   - All sample listings, fake seed users, and demo accounts removed.
   - Tests run in an isolated test database (`data/test_pgdata`) and clean up after themselves.

