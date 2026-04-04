-- ============================================================================
-- Montage Render Output - Store rendered montage video URL
-- ============================================================================

-- Add columns for montage render output
ALTER TABLE scenes
ADD COLUMN IF NOT EXISTS montage_video_url TEXT,
ADD COLUMN IF NOT EXISTS montage_rendered_at TIMESTAMPTZ;

COMMENT ON COLUMN scenes.montage_video_url IS 'B2 URL of the rendered montage video';
COMMENT ON COLUMN scenes.montage_rendered_at IS 'Timestamp when the montage was last rendered';
