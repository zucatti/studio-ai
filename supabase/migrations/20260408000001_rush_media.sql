-- Rush media table (unified images + videos for rush/gallery workflow)
-- Replaces rush_images with support for both media types

CREATE TABLE IF NOT EXISTS rush_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  prompt TEXT,
  aspect_ratio TEXT DEFAULT '9:16',
  model TEXT,
  provider TEXT,
  duration NUMERIC,               -- For videos (in seconds)
  thumbnail_url TEXT,             -- For videos
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'selected', 'rejected')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_rush_media_project ON rush_media(project_id);
CREATE INDEX IF NOT EXISTS idx_rush_media_status ON rush_media(status);
CREATE INDEX IF NOT EXISTS idx_rush_media_media_type ON rush_media(media_type);
CREATE INDEX IF NOT EXISTS idx_rush_media_created_at ON rush_media(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rush_media_user_id ON rush_media(user_id);

-- Enable RLS
ALTER TABLE rush_media ENABLE ROW LEVEL SECURITY;

-- RLS policies (via project ownership check)
CREATE POLICY "Users can view their project rush media"
  ON rush_media
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = rush_media.project_id
      AND projects.user_id = rush_media.user_id
    )
  );

CREATE POLICY "Users can insert their own rush media"
  ON rush_media
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = rush_media.project_id
      AND projects.user_id = rush_media.user_id
    )
  );

CREATE POLICY "Users can update their own rush media"
  ON rush_media
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = rush_media.project_id
      AND projects.user_id = rush_media.user_id
    )
  );

CREATE POLICY "Users can delete their own rush media"
  ON rush_media
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = rush_media.project_id
      AND projects.user_id = rush_media.user_id
    )
  );

-- Allow service role to bypass RLS
CREATE POLICY "Service role has full access to rush_media"
  ON rush_media
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Migrate existing data from rush_images
INSERT INTO rush_media (id, project_id, user_id, url, media_type, prompt, aspect_ratio, model, status, created_at)
SELECT id, project_id, user_id, url, 'image', prompt, aspect_ratio, model, COALESCE(status, 'pending'), created_at
FROM rush_images
ON CONFLICT (id) DO NOTHING;
