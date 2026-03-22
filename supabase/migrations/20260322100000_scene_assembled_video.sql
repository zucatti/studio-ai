-- Add assembled_video_url and duration to scenes table for persisting concatenated videos
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS assembled_video_url TEXT;
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS assembled_video_duration REAL;

-- Add index for quick lookups
CREATE INDEX IF NOT EXISTS idx_scenes_assembled_video ON scenes(assembled_video_url) WHERE assembled_video_url IS NOT NULL;

COMMENT ON COLUMN scenes.assembled_video_url IS 'URL of the assembled video (all shots concatenated)';
COMMENT ON COLUMN scenes.assembled_video_duration IS 'Duration in seconds of the assembled video';
