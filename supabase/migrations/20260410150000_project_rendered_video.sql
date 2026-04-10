-- Add rendered_video_url column to projects for Timeline Editor renders
-- This stores the output of project-level montage renders (e.g., music video clips)

ALTER TABLE projects ADD COLUMN IF NOT EXISTS rendered_video_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS rendered_video_duration REAL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS rendered_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN projects.rendered_video_url IS 'URL of the rendered timeline video (from Timeline Editor)';
COMMENT ON COLUMN projects.rendered_video_duration IS 'Duration in seconds of the rendered video';
COMMENT ON COLUMN projects.rendered_at IS 'Timestamp when the video was last rendered';
