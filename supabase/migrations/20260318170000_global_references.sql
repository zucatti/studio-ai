-- Drop old project_references table (new feature, no data yet)
DROP TABLE IF EXISTS project_references;

-- Global references table (like global_assets)
CREATE TABLE global_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pose', 'composition', 'style')),
  image_url TEXT NOT NULL,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Junction table to link references to projects
CREATE TABLE project_reference_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  global_reference_id UUID NOT NULL REFERENCES global_references(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, global_reference_id)
);

-- Indexes
CREATE INDEX idx_global_references_user_id ON global_references(user_id);
CREATE INDEX idx_global_references_type ON global_references(type);
CREATE INDEX idx_project_reference_links_project ON project_reference_links(project_id);
CREATE INDEX idx_project_reference_links_ref ON project_reference_links(global_reference_id);

-- RLS for global_references
ALTER TABLE global_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own global references"
  ON global_references FOR SELECT
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert own global references"
  ON global_references FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update own global references"
  ON global_references FOR UPDATE
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can delete own global references"
  ON global_references FOR DELETE
  USING (user_id = auth.uid()::text);

-- RLS for project_reference_links
ALTER TABLE project_reference_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own project reference links"
  ON project_reference_links FOR SELECT
  USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "Users can insert own project reference links"
  ON project_reference_links FOR INSERT
  WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "Users can delete own project reference links"
  ON project_reference_links FOR DELETE
  USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()::text)
  );

-- Trigger for updated_at on global_references
CREATE OR REPLACE FUNCTION update_global_references_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER global_references_updated_at
  BEFORE UPDATE ON global_references
  FOR EACH ROW
  EXECUTE FUNCTION update_global_references_updated_at();
