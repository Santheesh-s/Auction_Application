-- Truncate existing dev/demo data cleanly before adding NOT NULL columns
TRUNCATE TABLE users, listings, bids, auto_bids, listing_images, listing_events, questions, notifications, wanted_items, assistant_proposals CASCADE;

-- Users table updates
ALTER TABLE users ADD COLUMN college_domain TEXT NOT NULL;
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;

-- Listings table updates
ALTER TABLE listings ADD COLUMN college_domain TEXT NOT NULL;

-- Wanted items table updates
ALTER TABLE wanted_items ADD COLUMN college_domain TEXT NOT NULL;

-- Performance and isolation indexes
CREATE INDEX idx_users_college ON users(college_domain);
CREATE INDEX idx_listings_college_status ON listings(college_domain, status, closes_at);
CREATE INDEX idx_wanted_college ON wanted_items(college_domain);

-- Email verifications table
CREATE TABLE email_verifications (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_verif_token ON email_verifications(token_hash, used_at);
