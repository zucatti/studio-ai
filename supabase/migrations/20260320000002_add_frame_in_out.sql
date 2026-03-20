-- Add frame_in and frame_out columns to shots table
-- These define the animation range (0-100%) for video generation

ALTER TABLE shots ADD COLUMN IF NOT EXISTS frame_in INTEGER DEFAULT 0;
ALTER TABLE shots ADD COLUMN IF NOT EXISTS frame_out INTEGER DEFAULT 100;

-- Add check constraints to ensure valid range
ALTER TABLE shots ADD CONSTRAINT shots_frame_in_range CHECK (frame_in >= 0 AND frame_in <= 100);
ALTER TABLE shots ADD CONSTRAINT shots_frame_out_range CHECK (frame_out >= 0 AND frame_out <= 100);
ALTER TABLE shots ADD CONSTRAINT shots_frame_in_before_out CHECK (frame_in < frame_out);
