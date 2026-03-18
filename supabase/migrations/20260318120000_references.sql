-- References table for pose, composition, and style references
-- Using "project_references" because "references" is a reserved word in PostgreSQL
CREATE TABLE IF NOT EXISTS project_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pose', 'composition', 'style')),
  image_url TEXT NOT NULL,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_project_references_project_id ON project_references(project_id);
CREATE INDEX IF NOT EXISTS idx_project_references_type ON project_references(type);

-- RLS policies
ALTER TABLE project_references ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view references for their own projects
CREATE POLICY "Users can view own project references"
  ON project_references FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()::text
    )
  );

-- Policy: Users can insert references for their own projects
CREATE POLICY "Users can insert own project references"
  ON project_references FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()::text
    )
  );

-- Policy: Users can update references for their own projects
CREATE POLICY "Users can update own project references"
  ON project_references FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()::text
    )
  );

-- Policy: Users can delete references for their own projects
CREATE POLICY "Users can delete own project references"
  ON project_references FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()::text
    )
  );

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_project_references_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER project_references_updated_at
  BEFORE UPDATE ON project_references
  FOR EACH ROW
  EXECUTE FUNCTION update_project_references_updated_at();
