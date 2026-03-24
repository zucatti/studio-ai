-- Music sections table for Clip (music video) projects
-- Sections represent parts of the song: intro, verse, chorus, bridge, outro, etc.

-- Create section type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'music_section_type') THEN
    CREATE TYPE music_section_type AS ENUM (
      'intro',
      'verse',
      'chorus',
      'bridge',
      'outro',
      'instrumental',
      'custom'
    );
  END IF;
END$$;

-- Create music_sections table
CREATE TABLE IF NOT EXISTS music_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  section_type music_section_type NOT NULL DEFAULT 'custom',
  start_time DOUBLE PRECISION NOT NULL,
  end_time DOUBLE PRECISION NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#64748b',
  mood VARCHAR(255),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_time_range CHECK (start_time < end_time)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_music_sections_project_id ON music_sections(project_id);
CREATE INDEX IF NOT EXISTS idx_music_sections_sort_order ON music_sections(project_id, sort_order);

-- Add section_id and relative_start to shots table for linking shots to music sections
ALTER TABLE shots
  ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES music_sections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS relative_start DOUBLE PRECISION DEFAULT 0;

-- Create index for section_id lookups
CREATE INDEX IF NOT EXISTS idx_shots_section_id ON shots(section_id);

-- Add trigger to update updated_at on music_sections
CREATE OR REPLACE FUNCTION update_music_sections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_music_sections_updated_at ON music_sections;
CREATE TRIGGER trigger_music_sections_updated_at
  BEFORE UPDATE ON music_sections
  FOR EACH ROW
  EXECUTE FUNCTION update_music_sections_updated_at();

-- Enable RLS
ALTER TABLE music_sections ENABLE ROW LEVEL SECURITY;

-- RLS policies for music_sections
CREATE POLICY "Users can view their own project sections"
  ON music_sections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = music_sections.project_id
      AND projects.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert sections for their own projects"
  ON music_sections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = music_sections.project_id
      AND projects.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can update their own project sections"
  ON music_sections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = music_sections.project_id
      AND projects.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete their own project sections"
  ON music_sections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = music_sections.project_id
      AND projects.user_id = auth.uid()::text
    )
  );
