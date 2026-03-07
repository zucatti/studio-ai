-- Add preprod and video generation fields to shots table

-- Suggested duration based on Claude analysis
ALTER TABLE shots ADD COLUMN IF NOT EXISTS suggested_duration DECIMAL(4,2);

-- Video provider preference
ALTER TABLE shots ADD COLUMN IF NOT EXISTS video_provider TEXT DEFAULT 'runway';

-- Video generation metadata
ALTER TABLE shots ADD COLUMN IF NOT EXISTS video_duration DECIMAL(4,2);
ALTER TABLE shots ADD COLUMN IF NOT EXISTS video_generation_id TEXT;
ALTER TABLE shots ADD COLUMN IF NOT EXISTS video_generation_progress JSONB;

-- Comments
COMMENT ON COLUMN shots.suggested_duration IS 'AI-suggested duration in seconds based on dialogue and action';
COMMENT ON COLUMN shots.video_provider IS 'Video generation provider: runway, kling';
COMMENT ON COLUMN shots.video_duration IS 'Actual video duration in seconds';
COMMENT ON COLUMN shots.video_generation_id IS 'External generation ID from video provider';
