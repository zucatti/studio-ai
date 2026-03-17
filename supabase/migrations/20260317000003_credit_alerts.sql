-- Migration: Credit Alerts
-- Purpose: Store alert notifications when budget thresholds are reached

-- Create credit_alerts table
CREATE TABLE IF NOT EXISTS credit_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    provider api_provider NOT NULL,
    threshold_percent INTEGER NOT NULL,
    budget_amount DECIMAL(10, 2) NOT NULL,
    spent_amount DECIMAL(10, 2) NOT NULL,
    acknowledged BOOLEAN NOT NULL DEFAULT false,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_credit_alerts_user_id ON credit_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_alerts_user_acknowledged ON credit_alerts(user_id, acknowledged);
CREATE INDEX IF NOT EXISTS idx_credit_alerts_user_provider ON credit_alerts(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_credit_alerts_created_at ON credit_alerts(created_at DESC);

-- Composite index for fetching unacknowledged alerts per user
CREATE INDEX IF NOT EXISTS idx_credit_alerts_user_unack
    ON credit_alerts(user_id, acknowledged, created_at DESC)
    WHERE acknowledged = false;

-- Enable RLS
ALTER TABLE credit_alerts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own credit alerts" ON credit_alerts;
DROP POLICY IF EXISTS "Users can update own credit alerts" ON credit_alerts;
DROP POLICY IF EXISTS "Service role has full access to credit_alerts" ON credit_alerts;

-- Create RLS policies
CREATE POLICY "Users can view own credit alerts"
    ON credit_alerts FOR SELECT
    USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can update own credit alerts"
    ON credit_alerts FOR UPDATE
    USING (user_id = current_setting('app.current_user_id', true));

-- Service role bypass (needed for API routes to create alerts)
CREATE POLICY "Service role has full access to credit_alerts"
    ON credit_alerts FOR ALL
    USING (current_setting('role', true) = 'service_role');

-- Function to create alerts when thresholds are crossed
CREATE OR REPLACE FUNCTION check_and_create_credit_alert()
RETURNS TRIGGER AS $$
DECLARE
    allocation_record RECORD;
    spent_percent DECIMAL;
    alert_exists BOOLEAN;
BEGIN
    -- Fetch the allocation that was just updated
    SELECT * INTO allocation_record
    FROM credit_allocations
    WHERE id = NEW.id;

    -- Skip if no budget set
    IF allocation_record.budget_amount <= 0 THEN
        RETURN NEW;
    END IF;

    -- Calculate spent percentage
    spent_percent := (allocation_record.current_period_spent / allocation_record.budget_amount) * 100;

    -- Check 50% threshold
    IF spent_percent >= 50 AND spent_percent < 80 AND allocation_record.alert_threshold_50 THEN
        -- Check if alert already exists for this threshold in current period
        SELECT EXISTS(
            SELECT 1 FROM credit_alerts
            WHERE user_id = allocation_record.user_id
              AND provider = allocation_record.provider
              AND threshold_percent = 50
              AND created_at >= allocation_record.period_start_date
        ) INTO alert_exists;

        IF NOT alert_exists THEN
            INSERT INTO credit_alerts (user_id, provider, threshold_percent, budget_amount, spent_amount)
            VALUES (
                allocation_record.user_id,
                allocation_record.provider,
                50,
                allocation_record.budget_amount,
                allocation_record.current_period_spent
            );
        END IF;
    END IF;

    -- Check 80% threshold
    IF spent_percent >= 80 AND spent_percent < 100 AND allocation_record.alert_threshold_80 THEN
        SELECT EXISTS(
            SELECT 1 FROM credit_alerts
            WHERE user_id = allocation_record.user_id
              AND provider = allocation_record.provider
              AND threshold_percent = 80
              AND created_at >= allocation_record.period_start_date
        ) INTO alert_exists;

        IF NOT alert_exists THEN
            INSERT INTO credit_alerts (user_id, provider, threshold_percent, budget_amount, spent_amount)
            VALUES (
                allocation_record.user_id,
                allocation_record.provider,
                80,
                allocation_record.budget_amount,
                allocation_record.current_period_spent
            );
        END IF;
    END IF;

    -- Check 100% threshold
    IF spent_percent >= 100 AND allocation_record.alert_threshold_100 THEN
        SELECT EXISTS(
            SELECT 1 FROM credit_alerts
            WHERE user_id = allocation_record.user_id
              AND provider = allocation_record.provider
              AND threshold_percent = 100
              AND created_at >= allocation_record.period_start_date
        ) INTO alert_exists;

        IF NOT alert_exists THEN
            INSERT INTO credit_alerts (user_id, provider, threshold_percent, budget_amount, spent_amount)
            VALUES (
                allocation_record.user_id,
                allocation_record.provider,
                100,
                allocation_record.budget_amount,
                allocation_record.current_period_spent
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to check alerts on allocation update
DROP TRIGGER IF EXISTS check_credit_alert_on_update ON credit_allocations;
CREATE TRIGGER check_credit_alert_on_update
    AFTER UPDATE OF current_period_spent ON credit_allocations
    FOR EACH ROW
    EXECUTE FUNCTION check_and_create_credit_alert();
