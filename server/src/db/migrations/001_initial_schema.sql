-- Campus Auction Initial Schema Migration 001

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE listing_status AS ENUM (
    'open',
    'pending_approval',
    'unsold',
    'approved',
    'rejected',
    'cancelled',
    'completed',
    'failed_pickup'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS listings (
  id            SERIAL PRIMARY KEY,
  seller_id     INT NOT NULL REFERENCES users(id),
  title         TEXT NOT NULL,
  category      TEXT NOT NULL,
  description   TEXT NOT NULL,
  condition     TEXT NOT NULL,
  start_price   INT NOT NULL CHECK (start_price > 0),
  min_increment INT NOT NULL CHECK (min_increment > 0),
  current_price INT,
  leading_bid_id INT,
  winner_id     INT REFERENCES users(id),
  closes_at     TIMESTAMPTZ NOT NULL,
  status        listing_status NOT NULL DEFAULT 'open',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listings_status_closes ON listings(status, closes_at);
CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category);

CREATE TABLE IF NOT EXISTS listing_images (
  id         SERIAL PRIMARY KEY,
  listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  position   INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bids (
  id         SERIAL PRIMARY KEY,
  listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  bidder_id  INT NOT NULL REFERENCES users(id),
  amount     INT NOT NULL,
  is_auto    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bids_listing ON bids(listing_id, amount DESC, created_at);

DO $$ BEGIN
  ALTER TABLE listings ADD CONSTRAINT fk_leading_bid FOREIGN KEY (leading_bid_id) REFERENCES bids(id);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS auto_bids (
  id         SERIAL PRIMARY KEY,
  listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id    INT NOT NULL REFERENCES users(id),
  max_amount INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, user_id)
);

CREATE TABLE IF NOT EXISTS listing_events (
  id         SERIAL PRIMARY KEY,
  listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  actor_id   INT REFERENCES users(id),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS questions (
  id          SERIAL PRIMARY KEY,
  listing_id  INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  asker_id    INT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL CHECK (char_length(body) <= 300),
  answer      TEXT CHECK (char_length(answer) <= 600),
  answered_at TIMESTAMPTZ,
  hidden      BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL,
  listing_id INT REFERENCES listings(id) ON DELETE CASCADE,
  message    TEXT NOT NULL,
  read       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read, created_at DESC);

CREATE TABLE IF NOT EXISTS wanted_items (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id),
  keywords   TEXT NOT NULL,
  category   TEXT,
  max_price  INT,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assistant_proposals (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id),
  listing_id INT NOT NULL REFERENCES listings(id),
  max_amount INT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
