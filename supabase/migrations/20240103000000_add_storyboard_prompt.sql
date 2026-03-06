-- Add storyboard_prompt column to store the optimized English prompt used for generation
ALTER TABLE shots ADD COLUMN IF NOT EXISTS storyboard_prompt TEXT;

-- Add comment
COMMENT ON COLUMN shots.storyboard_prompt IS 'Optimized English prompt used for SDXL storyboard generation';
