-- Provider Balance Snapshots
-- Stores periodic snapshots of provider balances/usage to calculate spending diffs

CREATE TABLE IF NOT EXISTS provider_balance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL, -- 'claude', 'fal', 'runway', 'elevenlabs'

  -- Balance/usage values at snapshot time
  balance DECIMAL(12, 4), -- Current balance (fal, runway) - decreases with usage
  cumulative_cost DECIMAL(12, 4), -- Cumulative cost (claude) - increases with usage
  cumulative_usage DECIMAL(12, 4), -- Cumulative usage units (elevenlabs characters)

  -- Metadata
  snapshot_type TEXT NOT NULL DEFAULT 'periodic', -- 'daily_start', 'periodic', 'manual'
  raw_data JSONB, -- Full response from provider API for debugging

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_snapshots_user_provider_date
  ON provider_balance_snapshots(user_id, provider, created_at DESC);

CREATE INDEX idx_snapshots_type_date
  ON provider_balance_snapshots(snapshot_type, created_at DESC);

-- Function to get the most recent snapshot for a provider
CREATE OR REPLACE FUNCTION get_latest_snapshot(
  p_user_id TEXT,
  p_provider TEXT,
  p_before TIMESTAMPTZ DEFAULT NOW()
)
RETURNS provider_balance_snapshots AS $$
  SELECT * FROM provider_balance_snapshots
  WHERE user_id = p_user_id
    AND provider = p_provider
    AND created_at < p_before
  ORDER BY created_at DESC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Function to get daily start snapshot (most recent with type 'daily_start')
CREATE OR REPLACE FUNCTION get_daily_start_snapshot(
  p_user_id TEXT,
  p_provider TEXT,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS provider_balance_snapshots AS $$
  SELECT * FROM provider_balance_snapshots
  WHERE user_id = p_user_id
    AND provider = p_provider
    AND snapshot_type = 'daily_start'
    AND created_at::DATE = p_date
  ORDER BY created_at ASC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- RLS policies
ALTER TABLE provider_balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own snapshots"
  ON provider_balance_snapshots FOR SELECT
  USING (user_id = auth.uid()::TEXT);

CREATE POLICY "Service role can manage snapshots"
  ON provider_balance_snapshots FOR ALL
  USING (auth.role() = 'service_role');

-- Comment
COMMENT ON TABLE provider_balance_snapshots IS
  'Stores periodic snapshots of provider balances to calculate spending over time periods';
