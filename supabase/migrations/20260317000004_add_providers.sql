-- Migration: Add new API providers (PiAPI, Creatomate)
-- Remove unused providers (claude, xai)

-- Add new values to api_provider enum
ALTER TYPE api_provider ADD VALUE IF NOT EXISTS 'piapi';
ALTER TYPE api_provider ADD VALUE IF NOT EXISTS 'creatomate';

-- Note: PostgreSQL doesn't support removing enum values directly
-- The old values (claude, xai) will remain but won't be used
