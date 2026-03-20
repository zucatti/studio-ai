-- Shorts Project Migration
-- Adds 'shorts_project' type and fields for shorts/plans

-- Add new project type (safe: IF NOT EXISTS equivalent for enum values)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'shorts_project' AND enumtypid = 'project_type'::regtype) THEN
    ALTER TYPE project_type ADD VALUE 'shorts_project';
  END IF;
END$$;

-- Add duration column to shots (for plan duration in seconds)
ALTER TABLE shots ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 5;

-- Add title column to scenes (for short title)
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS title TEXT;

-- Add index for faster shorts queries
CREATE INDEX IF NOT EXISTS idx_scenes_title ON scenes(title) WHERE title IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shots_duration ON shots(duration) WHERE duration IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN shots.duration IS 'Duration in seconds for shorts plans (default 5s)';
COMMENT ON COLUMN scenes.title IS 'Title for shorts (when scene is used as a short)';
