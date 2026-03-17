-- Add aspect_ratio column to projects table
-- Supported formats: 16:9 (landscape), 9:16 (portrait/mobile), 1:1 (square), 21:9 (cinematic)

-- Create enum type for aspect ratios
DO $$ BEGIN
  CREATE TYPE aspect_ratio AS ENUM ('16:9', '9:16', '1:1', '21:9');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add column to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS aspect_ratio aspect_ratio NOT NULL DEFAULT '16:9';

-- Add comment
COMMENT ON COLUMN projects.aspect_ratio IS 'Video aspect ratio format: 16:9 (landscape), 9:16 (portrait), 1:1 (square), 21:9 (cinematic)';
