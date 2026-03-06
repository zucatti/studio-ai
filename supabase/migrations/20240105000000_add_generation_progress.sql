-- Add generation_progress column to track multi-image generation progress
-- Stores JSON like: {"current": 1, "total": 3}

ALTER TABLE characters
ADD COLUMN IF NOT EXISTS generation_progress JSONB;

ALTER TABLE props
ADD COLUMN IF NOT EXISTS generation_progress JSONB;

ALTER TABLE locations
ADD COLUMN IF NOT EXISTS generation_progress JSONB;

-- Add comment for documentation
COMMENT ON COLUMN characters.generation_progress IS 'Tracks multi-image generation progress: {current: number, total: number}';
COMMENT ON COLUMN props.generation_progress IS 'Tracks multi-image generation progress: {current: number, total: number}';
COMMENT ON COLUMN locations.generation_progress IS 'Tracks multi-image generation progress: {current: number, total: number}';
