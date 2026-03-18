-- Project Types & Quick Shot Workflow
-- Adds project types with simplified workflow for portfolio/photo_series projects

-- Create project_type enum
DO $$ BEGIN
  CREATE TYPE project_type AS ENUM ('movie', 'short', 'music_video', 'portfolio', 'photo_series');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add project_type column to projects
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS project_type project_type NOT NULL DEFAULT 'short';

COMMENT ON COLUMN projects.project_type IS 'Type of project: movie, short, music_video (full pipeline), portfolio, photo_series (simplified quick shot workflow)';

-- Create shot_status enum
DO $$ BEGIN
  CREATE TYPE shot_status AS ENUM ('draft', 'selected', 'rush', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add status column to shots
ALTER TABLE shots
ADD COLUMN IF NOT EXISTS status shot_status NOT NULL DEFAULT 'draft';

COMMENT ON COLUMN shots.status IS 'Shot status: draft (new), selected (kept for gallery), rush (discarded), archived';

-- Make scene_id nullable for quick shots (portfolio/photo_series don't require scenes)
ALTER TABLE shots ALTER COLUMN scene_id DROP NOT NULL;

-- Add project_id to shots for quick shots without scenes
ALTER TABLE shots
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- Add index for project_id lookups
CREATE INDEX IF NOT EXISTS idx_shots_project_id ON shots(project_id);

-- Backfill project_id for existing shots
UPDATE shots s
SET project_id = sc.project_id
FROM scenes sc
WHERE s.scene_id = sc.id
AND s.project_id IS NULL;

-- Add new aspect ratios to enum
ALTER TYPE aspect_ratio ADD VALUE IF NOT EXISTS '4:5';
ALTER TYPE aspect_ratio ADD VALUE IF NOT EXISTS '2:3';

-- Add comment
COMMENT ON TYPE aspect_ratio IS 'Video/image aspect ratio: 16:9 (landscape), 9:16 (portrait), 1:1 (square), 4:5 (Instagram portrait), 21:9 (cinematic), 2:3 (portrait photo)';
