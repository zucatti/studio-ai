-- ============================================================================
-- Plan Segments Redesign Migration
--
-- Restructure: Short → Plan → Shot(s)
-- - Short: conteneur simple avec langue
-- - Plan: unité de génération (≤15s) avec style cinématique + segments
-- - Shot/Segment: segment temporel dans un plan
-- ============================================================================

-- ============================================================================
-- 1. Add segments JSONB to shots (plans)
-- ============================================================================

-- Segments array: each segment is a shot within the plan
ALTER TABLE shots ADD COLUMN IF NOT EXISTS segments JSONB DEFAULT '[]';
COMMENT ON COLUMN shots.segments IS 'Array of Shot segments: [{id, start_time, end_time, shot_type, subject, framing, action, dialogue, environment, camera_movement}]';

-- ============================================================================
-- 2. Add translations JSONB to shots (plans)
-- ============================================================================

-- Translations array: each translation is a language version
ALTER TABLE shots ADD COLUMN IF NOT EXISTS translations JSONB DEFAULT '[]';
COMMENT ON COLUMN shots.translations IS 'Array of translations: [{language, audio_url, video_url, status}]';

-- ============================================================================
-- 3. Move cinematic_header to shots (plan level, not short level)
-- ============================================================================

-- Add cinematic_header to shots if not exists
ALTER TABLE shots ADD COLUMN IF NOT EXISTS cinematic_header JSONB DEFAULT NULL;
COMMENT ON COLUMN shots.cinematic_header IS 'Cinematic style configuration for this plan: lighting, camera, color_grade, tone';

-- ============================================================================
-- 4. Add plan title (optional, fallback to "Plan X")
-- ============================================================================

ALTER TABLE shots ADD COLUMN IF NOT EXISTS title TEXT DEFAULT NULL;
COMMENT ON COLUMN shots.title IS 'Optional plan title, fallback to "Plan 1", "Plan 2", etc.';

-- ============================================================================
-- 5. Update dialogue_language constraint to support more languages
-- ============================================================================

ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_dialogue_language_check;
ALTER TABLE scenes ADD CONSTRAINT scenes_dialogue_language_check
  CHECK (dialogue_language IN ('en', 'fr', 'es', 'de', 'it', 'pt', 'zh', 'ja', 'ko'));

-- ============================================================================
-- 6. Migrate existing shot data to segments format
-- ============================================================================

-- Convert existing shot columns into a single segment
UPDATE shots
SET segments = jsonb_build_array(
  jsonb_strip_nulls(jsonb_build_object(
    'id', gen_random_uuid()::text,
    'start_time', COALESCE(start_time, 0),
    'end_time', COALESCE(start_time, 0) + COALESCE(duration, 5),
    'shot_type', COALESCE(shot_type, 'medium'),
    'subject', COALESCE(shot_subject, ''),
    'framing', framing,
    'action', COALESCE(action, animation_prompt),
    'dialogue', CASE
      WHEN dialogue_text IS NOT NULL AND dialogue_character_id IS NOT NULL THEN
        jsonb_build_object(
          'character_id', dialogue_character_id,
          'character_name', '',
          'tone', dialogue_tone,
          'text', dialogue_text
        )
      ELSE NULL
    END,
    'environment', environment,
    'camera_movement', camera_movement,
    'camera_notes', NULL
  ))
)
WHERE (segments IS NULL OR segments = '[]')
  AND (shot_type IS NOT NULL OR animation_prompt IS NOT NULL OR dialogue_text IS NOT NULL);

-- ============================================================================
-- 7. Copy cinematic_header from scene to shots if scene has one
-- ============================================================================

UPDATE shots s
SET cinematic_header = sc.cinematic_header
FROM scenes sc
WHERE s.scene_id = sc.id
  AND s.cinematic_header IS NULL
  AND sc.cinematic_header IS NOT NULL
  AND sc.cinematic_header != '{}';

-- ============================================================================
-- 8. Add index for faster segment queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_shots_segments ON shots USING GIN (segments);
CREATE INDEX IF NOT EXISTS idx_shots_translations ON shots USING GIN (translations);

-- ============================================================================
-- 9. Add computed duration trigger (sum of segment durations)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_shot_duration_from_segments()
RETURNS TRIGGER AS $$
DECLARE
  total_duration DECIMAL(5,2);
BEGIN
  -- Calculate total duration from segments
  SELECT COALESCE(
    (SELECT MAX((seg->>'end_time')::DECIMAL)
     FROM jsonb_array_elements(NEW.segments) AS seg),
    NEW.duration
  ) INTO total_duration;

  NEW.duration = COALESCE(total_duration, 5);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_shot_duration ON shots;
CREATE TRIGGER trigger_update_shot_duration
  BEFORE INSERT OR UPDATE OF segments ON shots
  FOR EACH ROW
  WHEN (NEW.segments IS NOT NULL AND NEW.segments != '[]')
  EXECUTE FUNCTION update_shot_duration_from_segments();
