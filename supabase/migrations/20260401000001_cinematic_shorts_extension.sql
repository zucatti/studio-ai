-- ============================================================================
-- Cinematic Shorts Extension Migration
-- Extends the existing Shorts/Plans system for cinematic mega-prompt generation
-- ============================================================================

-- ============================================================================
-- 1. Extend scenes (shorts) table with cinematic fields
-- ============================================================================

-- Cinematic header configuration (wizard-based settings)
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS cinematic_header JSONB DEFAULT '{}';
COMMENT ON COLUMN scenes.cinematic_header IS 'Cinematic style configuration: lighting, camera, color_grade, tone';

-- Character to Element/Voice mappings
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS character_mappings JSONB DEFAULT '[]';
COMMENT ON COLUMN scenes.character_mappings IS 'Array of {character_id, element_index, voice_index} for Kling Omni';

-- Generation mode: standard (per-shot) or cinematic (mega-prompt)
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS generation_mode TEXT DEFAULT 'standard';
COMMENT ON COLUMN scenes.generation_mode IS 'Video generation mode: standard or cinematic';

-- Dialogue language for lip-sync handling
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS dialogue_language TEXT DEFAULT 'en';
COMMENT ON COLUMN scenes.dialogue_language IS 'Dialogue language: en, fr, es, zh - determines lip-sync approach';

-- ============================================================================
-- 2. Extend shots (plans) table with cinematic shot details
-- ============================================================================

-- Shot subject (what/who is the focus)
ALTER TABLE shots ADD COLUMN IF NOT EXISTS shot_subject TEXT;
COMMENT ON COLUMN shots.shot_subject IS 'Primary subject of the shot: "Sarah eyes", "kitchen doorway"';

-- Framing description
ALTER TABLE shots ADD COLUMN IF NOT EXISTS framing TEXT;
COMMENT ON COLUMN shots.framing IS 'Framing details: "Tight close-up from nose up"';

-- Action description
ALTER TABLE shots ADD COLUMN IF NOT EXISTS action TEXT;
COMMENT ON COLUMN shots.action IS 'What happens in the shot: "Her eyes widen slightly"';

-- Environment description
ALTER TABLE shots ADD COLUMN IF NOT EXISTS environment TEXT;
COMMENT ON COLUMN shots.environment IS 'Environment details: "Kitchen background softly blurred"';

-- Dialogue tone/delivery
ALTER TABLE shots ADD COLUMN IF NOT EXISTS dialogue_tone TEXT;
COMMENT ON COLUMN shots.dialogue_tone IS 'How dialogue is delivered: "flatly", "coldly", "whispers"';

-- Start time for timeline positioning
ALTER TABLE shots ADD COLUMN IF NOT EXISTS start_time DECIMAL(5,2) DEFAULT 0;
COMMENT ON COLUMN shots.start_time IS 'Start time in seconds within the mega-prompt timeline';

-- ============================================================================
-- 3. Create cinematic_presets table for reusable configurations
-- ============================================================================

CREATE TABLE IF NOT EXISTS cinematic_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,  -- NULL = global preset
  name TEXT NOT NULL,
  description TEXT,
  config JSONB NOT NULL,  -- CinematicHeaderConfig JSON
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster lookup
CREATE INDEX IF NOT EXISTS idx_cinematic_presets_user ON cinematic_presets(user_id);
CREATE INDEX IF NOT EXISTS idx_cinematic_presets_project ON cinematic_presets(project_id);
CREATE INDEX IF NOT EXISTS idx_cinematic_presets_default ON cinematic_presets(user_id, is_default) WHERE is_default = TRUE;

-- Comments
COMMENT ON TABLE cinematic_presets IS 'Reusable cinematic style presets for video generation';
COMMENT ON COLUMN cinematic_presets.config IS 'CinematicHeaderConfig: lighting, camera, color_grade, tone settings';
COMMENT ON COLUMN cinematic_presets.is_default IS 'Whether this is the default preset for the user/project';

-- ============================================================================
-- 4. Add RLS policies for cinematic_presets
-- ============================================================================

ALTER TABLE cinematic_presets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view own presets" ON cinematic_presets;
DROP POLICY IF EXISTS "Users can insert own presets" ON cinematic_presets;
DROP POLICY IF EXISTS "Users can update own presets" ON cinematic_presets;
DROP POLICY IF EXISTS "Users can delete own presets" ON cinematic_presets;

-- Users can view their own presets
CREATE POLICY "Users can view own presets"
  ON cinematic_presets FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own presets
CREATE POLICY "Users can insert own presets"
  ON cinematic_presets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own presets
CREATE POLICY "Users can update own presets"
  ON cinematic_presets FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own presets
CREATE POLICY "Users can delete own presets"
  ON cinematic_presets FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 5. Trigger to update updated_at on cinematic_presets
-- ============================================================================

CREATE OR REPLACE FUNCTION update_cinematic_presets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cinematic_presets_updated_at ON cinematic_presets;
CREATE TRIGGER trigger_cinematic_presets_updated_at
  BEFORE UPDATE ON cinematic_presets
  FOR EACH ROW
  EXECUTE FUNCTION update_cinematic_presets_updated_at();

-- ============================================================================
-- 6. Add constraint for generation_mode values
-- ============================================================================

ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_generation_mode_check;
ALTER TABLE scenes ADD CONSTRAINT scenes_generation_mode_check
  CHECK (generation_mode IN ('standard', 'cinematic'));

-- ============================================================================
-- 7. Add constraint for dialogue_language values
-- ============================================================================

ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_dialogue_language_check;
ALTER TABLE scenes ADD CONSTRAINT scenes_dialogue_language_check
  CHECK (dialogue_language IN ('en', 'fr', 'es', 'zh'));
