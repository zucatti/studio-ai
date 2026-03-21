-- Rush images table (generated photos stored in gallery)
CREATE TABLE IF NOT EXISTS rush_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  url TEXT NOT NULL,
  prompt TEXT,
  aspect_ratio TEXT DEFAULT '16:9',
  model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching rush images by project
CREATE INDEX IF NOT EXISTS idx_rush_images_project_id ON rush_images(project_id);
CREATE INDEX IF NOT EXISTS idx_rush_images_user_id ON rush_images(user_id);
CREATE INDEX IF NOT EXISTS idx_rush_images_created_at ON rush_images(created_at DESC);

-- Add animation_prompt column to shots table for video animation instructions
ALTER TABLE shots ADD COLUMN IF NOT EXISTS animation_prompt TEXT;

-- Enable RLS
ALTER TABLE rush_images ENABLE ROW LEVEL SECURITY;

-- RLS policies for rush_images (via project ownership check)
CREATE POLICY "Users can view their project rush images"
  ON rush_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = rush_images.project_id
      AND projects.user_id = rush_images.user_id
    )
  );

CREATE POLICY "Users can insert their own rush images"
  ON rush_images
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = rush_images.project_id
      AND projects.user_id = rush_images.user_id
    )
  );

CREATE POLICY "Users can delete their own rush images"
  ON rush_images
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = rush_images.project_id
      AND projects.user_id = rush_images.user_id
    )
  );
