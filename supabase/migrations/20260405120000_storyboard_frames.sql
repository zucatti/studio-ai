-- ============================================================================
-- Storyboard Frames - Visual exploration of script
-- ============================================================================

-- Storyboard frames table
CREATE TABLE IF NOT EXISTS storyboard_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id UUID REFERENCES scenes(id) ON DELETE SET NULL,
  script_element_id UUID REFERENCES script_elements(id) ON DELETE SET NULL,

  -- Content
  description TEXT NOT NULL DEFAULT '',
  sketch_url TEXT,
  sketch_prompt TEXT,

  -- Generation status
  generation_status TEXT NOT NULL DEFAULT 'pending' CHECK (generation_status IN ('pending', 'generating', 'completed', 'failed')),
  generation_error TEXT,

  -- Ordering
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_storyboard_frames_project ON storyboard_frames(project_id);
CREATE INDEX idx_storyboard_frames_scene ON storyboard_frames(scene_id);
CREATE INDEX idx_storyboard_frames_sort ON storyboard_frames(project_id, sort_order);

-- RLS
ALTER TABLE storyboard_frames ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own project's frames
-- Note: user_id is TEXT (Auth0 sub), auth.uid()::text casts UUID to TEXT
CREATE POLICY storyboard_frames_policy ON storyboard_frames
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = storyboard_frames.project_id
      AND projects.user_id = current_setting('app.current_user_id', true)
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_storyboard_frames_updated_at
  BEFORE UPDATE ON storyboard_frames
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
