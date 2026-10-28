-- Add college_name column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS college_name TEXT;
