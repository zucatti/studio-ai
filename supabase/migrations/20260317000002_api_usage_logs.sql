-- Migration: API Usage Logs
-- Purpose: Store detailed history of all API calls for auditing and cost tracking

-- Create enum for operation status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'api_call_status') THEN
        CREATE TYPE api_call_status AS ENUM ('success', 'failed', 'blocked');
    END IF;
END$$;

-- Create api_usage_logs table
CREATE TABLE IF NOT EXISTS api_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    provider api_provider NOT NULL,
    model TEXT,
    endpoint TEXT,
    -- Token metrics (for Claude)
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    -- Character metrics (for ElevenLabs)
    characters INTEGER DEFAULT 0,
    -- Image metrics (for image generators)
    images_count INTEGER DEFAULT 0,
    -- Video metrics (for video generators)
    video_duration DECIMAL(10, 2) DEFAULT 0,
    -- Cost tracking
    estimated_cost DECIMAL(10, 4) NOT NULL DEFAULT 0,
    -- Operation details
    operation TEXT NOT NULL,
    status api_call_status NOT NULL DEFAULT 'success',
    error_message TEXT,
    -- Metadata for additional context
    metadata JSONB DEFAULT '{}',
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_id ON api_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_project_id ON api_usage_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_provider ON api_usage_logs(provider);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON api_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_provider ON api_usage_logs(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_created ON api_usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_status ON api_usage_logs(status);

-- Composite index for common queries (user + provider + date range)
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_provider_date
    ON api_usage_logs(user_id, provider, created_at DESC);

-- Enable RLS
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own api usage logs" ON api_usage_logs;
DROP POLICY IF EXISTS "Users can insert own api usage logs" ON api_usage_logs;
DROP POLICY IF EXISTS "Service role has full access to api_usage_logs" ON api_usage_logs;

-- Create RLS policies
CREATE POLICY "Users can view own api usage logs"
    ON api_usage_logs FOR SELECT
    USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can insert own api usage logs"
    ON api_usage_logs FOR INSERT
    WITH CHECK (user_id = current_setting('app.current_user_id', true));

-- Service role bypass (needed for API routes)
CREATE POLICY "Service role has full access to api_usage_logs"
    ON api_usage_logs FOR ALL
    USING (current_setting('role', true) = 'service_role');

-- Function to automatically update credit allocation spending
CREATE OR REPLACE FUNCTION update_credit_spending_on_log()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update for successful calls
    IF NEW.status = 'success' THEN
        -- Update provider-specific allocation
        UPDATE credit_allocations
        SET current_period_spent = current_period_spent + NEW.estimated_cost,
            updated_at = NOW()
        WHERE user_id = NEW.user_id
          AND provider = NEW.provider;

        -- Also update global allocation if it exists
        UPDATE credit_allocations
        SET current_period_spent = current_period_spent + NEW.estimated_cost,
            updated_at = NOW()
        WHERE user_id = NEW.user_id
          AND provider = 'global';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to update spending on log insert
DROP TRIGGER IF EXISTS update_spending_on_usage_log ON api_usage_logs;
CREATE TRIGGER update_spending_on_usage_log
    AFTER INSERT ON api_usage_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_credit_spending_on_log();
