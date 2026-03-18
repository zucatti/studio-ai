-- Add thumbnail focal point for better image cropping
-- Stores x, y as percentages (0-100)

ALTER TABLE projects
ADD COLUMN thumbnail_focal_point JSONB DEFAULT '{"x": 50, "y": 25}'::jsonb;

-- Add comment explaining the field
COMMENT ON COLUMN projects.thumbnail_focal_point IS 'Focal point for thumbnail cropping. x, y as percentages (0-100). Default is center-top (50, 25) for face visibility.';
