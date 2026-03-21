-- Migration: Update API Providers ENUM
-- Purpose: Add new providers (wavespeed, runway, modelslab, creatomate) and remove deprecated ones (replicate, xai, piapi)

-- Add new values to the api_provider enum
DO $$
BEGIN
    -- Add wavespeed
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'wavespeed' AND enumtypid = 'api_provider'::regtype) THEN
        ALTER TYPE api_provider ADD VALUE 'wavespeed';
    END IF;

    -- Add runway
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'runway' AND enumtypid = 'api_provider'::regtype) THEN
        ALTER TYPE api_provider ADD VALUE 'runway';
    END IF;

    -- Add modelslab
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'modelslab' AND enumtypid = 'api_provider'::regtype) THEN
        ALTER TYPE api_provider ADD VALUE 'modelslab';
    END IF;

    -- Add creatomate
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'creatomate' AND enumtypid = 'api_provider'::regtype) THEN
        ALTER TYPE api_provider ADD VALUE 'creatomate';
    END IF;
END$$;

-- Note: PostgreSQL doesn't support removing values from ENUMs easily
-- The old values (replicate, xai) will remain but won't be used
-- To fully remove them would require recreating the type and all dependent columns
