-- ============================================================================
-- Sequences Assembly Cache
--
-- Adds caching columns to track assembled sequences and detect changes
-- ============================================================================

-- Add assembly columns to sequences
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS assembled_video_url TEXT;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS assembled_plan_hash TEXT;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS assembled_at TIMESTAMPTZ;

COMMENT ON COLUMN sequences.assembled_video_url IS 'B2 URL of the assembled sequence video (color-matched plans)';
COMMENT ON COLUMN sequences.assembled_plan_hash IS 'MD5 hash of plans data to detect changes (video URLs, durations, order)';
COMMENT ON COLUMN sequences.assembled_at IS 'Timestamp of last successful assembly';

-- Index for finding sequences that need re-assembly
CREATE INDEX IF NOT EXISTS idx_sequences_assembly ON sequences(scene_id, assembled_plan_hash);
