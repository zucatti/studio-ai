-- Migration: Credit Allocations
-- Purpose: Store budget allocations per user and provider

-- Create enum for budget periods
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'budget_period') THEN
        CREATE TYPE budget_period AS ENUM ('daily', 'weekly', 'monthly');
    END IF;
END$$;

-- Create enum for API providers
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'api_provider') THEN
        CREATE TYPE api_provider AS ENUM ('claude', 'fal', 'replicate', 'elevenlabs', 'xai', 'global');
    END IF;
END$$;

-- Create credit_allocations table
CREATE TABLE IF NOT EXISTS credit_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    provider api_provider NOT NULL,
    budget_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    budget_period budget_period NOT NULL DEFAULT 'monthly',
    alert_threshold_50 BOOLEAN NOT NULL DEFAULT true,
    alert_threshold_80 BOOLEAN NOT NULL DEFAULT true,
    alert_threshold_100 BOOLEAN NOT NULL DEFAULT true,
    block_on_limit BOOLEAN NOT NULL DEFAULT true,
    current_period_spent DECIMAL(10, 2) NOT NULL DEFAULT 0,
    period_start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_credit_allocations_user_id ON credit_allocations(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_allocations_provider ON credit_allocations(provider);
CREATE INDEX IF NOT EXISTS idx_credit_allocations_user_provider ON credit_allocations(user_id, provider);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_credit_allocations_updated_at ON credit_allocations;
CREATE TRIGGER update_credit_allocations_updated_at
    BEFORE UPDATE ON credit_allocations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE credit_allocations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own credit allocations" ON credit_allocations;
DROP POLICY IF EXISTS "Users can insert own credit allocations" ON credit_allocations;
DROP POLICY IF EXISTS "Users can update own credit allocations" ON credit_allocations;
DROP POLICY IF EXISTS "Users can delete own credit allocations" ON credit_allocations;
DROP POLICY IF EXISTS "Service role has full access to credit_allocations" ON credit_allocations;

-- Create RLS policies
CREATE POLICY "Users can view own credit allocations"
    ON credit_allocations FOR SELECT
    USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can insert own credit allocations"
    ON credit_allocations FOR INSERT
    WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can update own credit allocations"
    ON credit_allocations FOR UPDATE
    USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can delete own credit allocations"
    ON credit_allocations FOR DELETE
    USING (user_id = current_setting('app.current_user_id', true));

-- Service role bypass
CREATE POLICY "Service role has full access to credit_allocations"
    ON credit_allocations FOR ALL
    USING (current_setting('role', true) = 'service_role');

-- Function to reset period spending when period changes
CREATE OR REPLACE FUNCTION reset_period_spending_if_needed()
RETURNS TRIGGER AS $$
DECLARE
    should_reset BOOLEAN := false;
    period_duration INTERVAL;
BEGIN
    -- Determine period duration
    CASE NEW.budget_period
        WHEN 'daily' THEN period_duration := INTERVAL '1 day';
        WHEN 'weekly' THEN period_duration := INTERVAL '1 week';
        WHEN 'monthly' THEN period_duration := INTERVAL '1 month';
    END CASE;

    -- Check if period has elapsed
    IF NOW() >= (NEW.period_start_date + period_duration) THEN
        should_reset := true;
    END IF;

    -- Reset if needed
    IF should_reset THEN
        NEW.current_period_spent := 0;
        NEW.period_start_date := NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger for period reset
DROP TRIGGER IF EXISTS check_period_reset_credit_allocations ON credit_allocations;
CREATE TRIGGER check_period_reset_credit_allocations
    BEFORE UPDATE ON credit_allocations
    FOR EACH ROW
    EXECUTE FUNCTION reset_period_spending_if_needed();
