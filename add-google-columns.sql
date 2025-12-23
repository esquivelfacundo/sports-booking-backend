-- Add Google OAuth columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS "googleId" VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(255);
