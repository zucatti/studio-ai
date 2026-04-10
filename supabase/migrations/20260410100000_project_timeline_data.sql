-- Add timeline_data column to projects for project-level Timeline Editor
-- This allows using the Timeline Editor at project scope (e.g., for music video clips)

ALTER TABLE projects ADD COLUMN IF NOT EXISTS timeline_data JSONB;

-- Add comment for documentation
COMMENT ON COLUMN projects.timeline_data IS 'JSON data for project-level Timeline Editor: tracks, clips, and playback state';
