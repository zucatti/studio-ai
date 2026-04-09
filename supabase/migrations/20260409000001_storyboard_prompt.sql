-- Add storyboard_prompt field to shots table
-- Every generated image should have its generation prompt saved

ALTER TABLE shots ADD COLUMN IF NOT EXISTS storyboard_prompt TEXT;

-- Comment for clarity
COMMENT ON COLUMN shots.storyboard_prompt IS 'The prompt used to generate the storyboard image';
