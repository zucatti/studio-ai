-- ============================================================================
-- Sequences, Music & Transitions Migration
--
-- New architecture:
-- Short (conteneur global)
-- ├── music_asset_id, music_volume, music_fade_in/out
-- │
-- └── Sequences[] (groupes de plans contigus)
--     ├── transition_in: Transition à l'ENTRÉE de cette séquence
--     ├── transition_out: Transition à la SORTIE de cette séquence
--     └── plans[] (color matched + cuts)
-- ============================================================================

-- ============================================================================
-- 1. Table: sequences (groupes de plans contigus)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  title TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Transitions
  transition_in TEXT DEFAULT NULL,      -- Transition à l'ENTRÉE de cette séquence
  transition_out TEXT DEFAULT NULL,     -- Transition à la SORTIE de cette séquence
  transition_duration REAL DEFAULT 0.5, -- Durée des transitions (secondes)

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE sequences IS 'Sequences group contiguous shots within a short for color matching and transitions';
COMMENT ON COLUMN sequences.transition_in IS 'Transition type for entering this sequence (e.g., fadeblack, dissolve)';
COMMENT ON COLUMN sequences.transition_out IS 'Transition type for exiting this sequence (e.g., fadeblack, dissolve)';
COMMENT ON COLUMN sequences.transition_duration IS 'Duration of transitions in seconds';

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sequences_scene ON sequences(scene_id);
CREATE INDEX IF NOT EXISTS idx_sequences_sort ON sequences(scene_id, sort_order);

-- ============================================================================
-- 2. Link shots (plans) to sequences
-- ============================================================================

ALTER TABLE shots ADD COLUMN IF NOT EXISTS sequence_id UUID REFERENCES sequences(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_shots_sequence ON shots(sequence_id);

COMMENT ON COLUMN shots.sequence_id IS 'Optional sequence this shot belongs to. NULL = auto-assign to default sequence';

-- ============================================================================
-- 3. Short-level music settings (on scenes table)
-- ============================================================================

ALTER TABLE scenes ADD COLUMN IF NOT EXISTS music_asset_id UUID REFERENCES global_assets(id);
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS music_volume REAL DEFAULT 0.3;
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS music_fade_in REAL DEFAULT 0;
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS music_fade_out REAL DEFAULT 2;

COMMENT ON COLUMN scenes.music_asset_id IS 'Global asset ID for background music';
COMMENT ON COLUMN scenes.music_volume IS 'Music volume (0-1), default 0.3 for background';
COMMENT ON COLUMN scenes.music_fade_in IS 'Fade-in duration in seconds';
COMMENT ON COLUMN scenes.music_fade_out IS 'Fade-out duration in seconds';

-- ============================================================================
-- 4. Transition type constraint
-- ============================================================================

-- Valid transition types that can be used
CREATE OR REPLACE FUNCTION is_valid_transition_type(t TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN t IS NULL OR t IN (
    -- Basic
    'dissolve', 'fade',
    -- Fade to/from color
    'fadeblack', 'fadewhite',
    -- Zoom
    'crosszoom', 'zoomin', 'zoomout',
    -- Slide
    'slideleft', 'slideright', 'slideup', 'slidedown',
    -- Wipe
    'directionalwipe',
    -- Shape
    'circleopen', 'circleclose', 'radial',
    -- 3D
    'cube'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add constraints
ALTER TABLE sequences DROP CONSTRAINT IF EXISTS sequences_transition_in_check;
ALTER TABLE sequences DROP CONSTRAINT IF EXISTS sequences_transition_out_check;
ALTER TABLE sequences ADD CONSTRAINT sequences_transition_in_check
  CHECK (is_valid_transition_type(transition_in));
ALTER TABLE sequences ADD CONSTRAINT sequences_transition_out_check
  CHECK (is_valid_transition_type(transition_out));

-- ============================================================================
-- 5. Updated_at trigger for sequences
-- ============================================================================

CREATE OR REPLACE FUNCTION update_sequences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sequences_updated_at ON sequences;
CREATE TRIGGER trigger_sequences_updated_at
  BEFORE UPDATE ON sequences
  FOR EACH ROW
  EXECUTE FUNCTION update_sequences_updated_at();

-- ============================================================================
-- 6. Row Level Security for sequences
-- ============================================================================

ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view sequences of scenes they own
DROP POLICY IF EXISTS sequences_select_policy ON sequences;
CREATE POLICY sequences_select_policy ON sequences FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM scenes s
      JOIN projects p ON s.project_id = p.id
      WHERE s.id = sequences.scene_id
      AND p.user_id = auth.uid()::text
    )
  );

-- Policy: Users can insert sequences for scenes they own
DROP POLICY IF EXISTS sequences_insert_policy ON sequences;
CREATE POLICY sequences_insert_policy ON sequences FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scenes s
      JOIN projects p ON s.project_id = p.id
      WHERE s.id = sequences.scene_id
      AND p.user_id = auth.uid()::text
    )
  );

-- Policy: Users can update sequences of scenes they own
DROP POLICY IF EXISTS sequences_update_policy ON sequences;
CREATE POLICY sequences_update_policy ON sequences FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM scenes s
      JOIN projects p ON s.project_id = p.id
      WHERE s.id = sequences.scene_id
      AND p.user_id = auth.uid()::text
    )
  );

-- Policy: Users can delete sequences of scenes they own
DROP POLICY IF EXISTS sequences_delete_policy ON sequences;
CREATE POLICY sequences_delete_policy ON sequences FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM scenes s
      JOIN projects p ON s.project_id = p.id
      WHERE s.id = sequences.scene_id
      AND p.user_id = auth.uid()::text
    )
  );
