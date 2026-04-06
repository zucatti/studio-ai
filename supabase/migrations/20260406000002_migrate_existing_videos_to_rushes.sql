-- Migrate existing generated videos to video_rushes array
-- This ensures old videos are preserved in the rushes history

UPDATE shots
SET video_rushes = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'url', generated_video_url,
    'model', COALESCE(video_provider, 'unknown'),
    'provider', 'fal',
    'duration', COALESCE(video_duration, 5),
    'createdAt', COALESCE(updated_at, created_at, NOW())::text,
    'isSelected', true
  )
)
WHERE generated_video_url IS NOT NULL
  AND (video_rushes IS NULL OR video_rushes = '[]'::jsonb);

-- Log how many were migrated
DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM shots
  WHERE generated_video_url IS NOT NULL
    AND video_rushes IS NOT NULL
    AND video_rushes != '[]'::jsonb;

  RAISE NOTICE 'Migrated % existing videos to rushes', migrated_count;
END $$;
