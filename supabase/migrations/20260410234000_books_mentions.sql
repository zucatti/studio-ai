-- Add mentions column to books table
ALTER TABLE books ADD COLUMN IF NOT EXISTS mentions TEXT;
