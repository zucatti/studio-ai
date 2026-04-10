-- Add timeline_data column to scenes for the unified Timeline Editor
-- This replaces montage_data with a more structured approach

ALTER TABLE scenes ADD COLUMN IF NOT EXISTS timeline_data JSONB;

-- Add comment for documentation
COMMENT ON COLUMN scenes.timeline_data IS 'JSON data for Timeline Editor: tracks, clips, and playback state';
