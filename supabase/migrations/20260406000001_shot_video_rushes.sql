-- Add video_rushes column to shots table
-- Stores all video generations for a shot (like rushes for characters)
-- Each rush has: url, model, provider, duration, prompt, createdAt, isSelected

ALTER TABLE shots ADD COLUMN IF NOT EXISTS video_rushes JSONB DEFAULT '[]';

-- Comment for documentation
COMMENT ON COLUMN shots.video_rushes IS 'Array of video generations: [{url, model, provider, duration, prompt, createdAt, isSelected}]';
