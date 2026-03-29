-- Add video_prompt column to shots table
-- Stores the prompt used for video generation (animation + context)

ALTER TABLE shots
ADD COLUMN IF NOT EXISTS video_prompt TEXT DEFAULT NULL;

COMMENT ON COLUMN shots.video_prompt IS 'The full prompt used for video generation (includes animation_prompt + context)';
