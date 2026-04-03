-- ============================================================================
-- Add cinematic_header to sequences table
-- ============================================================================

-- Cinematic header (Description cinématique) belongs to the sequence level
-- All plans in a sequence share the same cinematic style
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS cinematic_header JSONB;

COMMENT ON COLUMN sequences.cinematic_header IS 'Cinematic style configuration (genre, lighting, camera, color grade, etc.) shared by all plans in the sequence';
