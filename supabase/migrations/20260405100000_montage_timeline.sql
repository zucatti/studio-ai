-- ============================================================================
-- Montage Timeline - Store full timeline editor state
-- ============================================================================

-- Add montage_data column to scenes table to store timeline state
ALTER TABLE scenes
ADD COLUMN IF NOT EXISTS montage_data JSONB;

-- Index for querying scenes with montage data
CREATE INDEX IF NOT EXISTS idx_scenes_montage_data ON scenes USING gin(montage_data);

COMMENT ON COLUMN scenes.montage_data IS 'Full montage timeline state (tracks, clips, etc.) stored as JSON';
