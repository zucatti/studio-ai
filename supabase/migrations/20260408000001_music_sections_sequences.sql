-- ============================================================================
-- Music Sections ↔ Sequences Integration
--
-- Allow sequences to be used in music video projects (not just shorts).
-- Music sections can link to a sequence for visual content.
-- ============================================================================

-- ============================================================================
-- 1. Make sequences more flexible (can belong to scene OR project)
-- ============================================================================

-- Make scene_id nullable
ALTER TABLE sequences ALTER COLUMN scene_id DROP NOT NULL;

-- Add project_id for project-level sequences (music video)
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- Create index for project_id lookups
CREATE INDEX IF NOT EXISTS idx_sequences_project ON sequences(project_id);

-- Add constraint: either scene_id OR project_id must be set
ALTER TABLE sequences DROP CONSTRAINT IF EXISTS sequences_parent_check;
ALTER TABLE sequences ADD CONSTRAINT sequences_parent_check
  CHECK (
    (scene_id IS NOT NULL AND project_id IS NULL) OR
    (scene_id IS NULL AND project_id IS NOT NULL)
  );

COMMENT ON COLUMN sequences.project_id IS 'For music video projects: sequences belong directly to project';

-- ============================================================================
-- 2. Add sequence_id to music_sections
-- ============================================================================

ALTER TABLE music_sections ADD COLUMN IF NOT EXISTS sequence_id UUID REFERENCES sequences(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_music_sections_sequence ON music_sections(sequence_id);

COMMENT ON COLUMN music_sections.sequence_id IS 'Optional: linked sequence for visual content. Can be shared across sections.';

-- ============================================================================
-- 3. Update RLS policies for sequences to include project-level access
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS sequences_select_policy ON sequences;
DROP POLICY IF EXISTS sequences_insert_policy ON sequences;
DROP POLICY IF EXISTS sequences_update_policy ON sequences;
DROP POLICY IF EXISTS sequences_delete_policy ON sequences;

-- Policy: Users can view sequences they own (via scene OR project)
CREATE POLICY sequences_select_policy ON sequences FOR SELECT
  USING (
    -- Via scene (shorts)
    EXISTS (
      SELECT 1 FROM scenes s
      JOIN projects p ON s.project_id = p.id
      WHERE s.id = sequences.scene_id
      AND p.user_id = auth.uid()::text
    )
    OR
    -- Via project (music video)
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = sequences.project_id
      AND p.user_id = auth.uid()::text
    )
  );

-- Policy: Users can insert sequences for their own scenes/projects
CREATE POLICY sequences_insert_policy ON sequences FOR INSERT
  WITH CHECK (
    -- Via scene
    (
      scene_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM scenes s
        JOIN projects p ON s.project_id = p.id
        WHERE s.id = sequences.scene_id
        AND p.user_id = auth.uid()::text
      )
    )
    OR
    -- Via project
    (
      project_id IS NOT NULL AND
      EXISTS (
        SELECT 1 FROM projects p
        WHERE p.id = sequences.project_id
        AND p.user_id = auth.uid()::text
      )
    )
  );

-- Policy: Users can update sequences they own
CREATE POLICY sequences_update_policy ON sequences FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM scenes s
      JOIN projects p ON s.project_id = p.id
      WHERE s.id = sequences.scene_id
      AND p.user_id = auth.uid()::text
    )
    OR
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = sequences.project_id
      AND p.user_id = auth.uid()::text
    )
  );

-- Policy: Users can delete sequences they own
CREATE POLICY sequences_delete_policy ON sequences FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM scenes s
      JOIN projects p ON s.project_id = p.id
      WHERE s.id = sequences.scene_id
      AND p.user_id = auth.uid()::text
    )
    OR
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = sequences.project_id
      AND p.user_id = auth.uid()::text
    )
  );
