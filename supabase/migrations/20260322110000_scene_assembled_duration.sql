-- Add assembled_video_duration to scenes table
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS assembled_video_duration REAL;

COMMENT ON COLUMN scenes.assembled_video_duration IS 'Duration in seconds of the assembled video (from FFmpeg)';
