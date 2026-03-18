-- Add generation metadata to shots table
-- Stores: original_prompt, optimized_prompt, model, references, resolution, etc.

ALTER TABLE shots
ADD COLUMN IF NOT EXISTS generation_metadata JSONB DEFAULT NULL;

-- Add storyboard_prompt if not exists (for optimized prompt)
ALTER TABLE shots
ADD COLUMN IF NOT EXISTS storyboard_prompt TEXT DEFAULT NULL;

COMMENT ON COLUMN shots.generation_metadata IS 'JSON metadata about image generation: model, references, resolution, etc.';
COMMENT ON COLUMN shots.storyboard_prompt IS 'The optimized English prompt sent to the AI model';
