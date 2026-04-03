-- Add assembly caching columns to sequences table
-- These allow caching assembled sequence videos and detecting when re-assembly is needed

ALTER TABLE sequences ADD COLUMN IF NOT EXISTS assembled_video_url TEXT;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS assembled_plan_hash TEXT;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS assembled_at TIMESTAMPTZ;

-- Index for quick lookups by hash
CREATE INDEX IF NOT EXISTS idx_sequences_assembled_plan_hash ON sequences(assembled_plan_hash);

COMMENT ON COLUMN sequences.assembled_video_url IS 'B2 URL of the assembled video for this sequence';
COMMENT ON COLUMN sequences.assembled_plan_hash IS 'MD5 hash of plan URLs+durations+order to detect changes';
COMMENT ON COLUMN sequences.assembled_at IS 'Timestamp when the sequence was last assembled';
