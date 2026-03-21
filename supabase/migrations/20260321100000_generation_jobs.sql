-- Generation Jobs Queue
-- Tracks all async generation jobs (images, videos, etc.)

CREATE TYPE generation_job_type AS ENUM ('image', 'video', 'audio', 'look');
CREATE TYPE generation_job_status AS ENUM ('pending', 'queued', 'running', 'completed', 'failed', 'cancelled');

CREATE TABLE generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,

  -- What we're generating for
  asset_id UUID REFERENCES global_assets(id) ON DELETE CASCADE,
  asset_type TEXT, -- 'character', 'location', 'prop', 'shot'
  asset_name TEXT, -- Denormalized for display

  -- Job details
  job_type generation_job_type NOT NULL,
  job_subtype TEXT, -- 'front', 'profile', 'back', etc. for images

  -- Status tracking
  status generation_job_status NOT NULL DEFAULT 'pending',
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  message TEXT,

  -- fal.ai integration
  fal_request_id TEXT,
  fal_endpoint TEXT,

  -- Input/Output
  input_data JSONB NOT NULL DEFAULT '{}',
  result_data JSONB,
  error_message TEXT,

  -- Cost tracking
  estimated_cost DECIMAL(10, 4),
  actual_cost DECIMAL(10, 4),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  queued_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Indexes for common queries
  CONSTRAINT valid_progress CHECK (progress >= 0 AND progress <= 100)
);

-- Indexes
CREATE INDEX idx_generation_jobs_user_id ON generation_jobs(user_id);
CREATE INDEX idx_generation_jobs_status ON generation_jobs(status);
CREATE INDEX idx_generation_jobs_user_status ON generation_jobs(user_id, status);
CREATE INDEX idx_generation_jobs_asset_id ON generation_jobs(asset_id);
CREATE INDEX idx_generation_jobs_fal_request_id ON generation_jobs(fal_request_id);
CREATE INDEX idx_generation_jobs_created_at ON generation_jobs(created_at DESC);

-- RLS
ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own jobs"
  ON generation_jobs FOR SELECT
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can insert their own jobs"
  ON generation_jobs FOR INSERT
  WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can update their own jobs"
  ON generation_jobs FOR UPDATE
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "Users can delete their own jobs"
  ON generation_jobs FOR DELETE
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Service role bypass for webhooks
CREATE POLICY "Service role can do anything"
  ON generation_jobs FOR ALL
  USING (current_setting('role', true) = 'service_role');

COMMENT ON TABLE generation_jobs IS 'Queue for tracking async generation jobs (images, videos, etc.)';
