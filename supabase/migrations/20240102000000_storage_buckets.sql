-- ============================================================================
-- Storage Buckets for Project Assets
-- ============================================================================

-- Create bucket for project thumbnails
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-thumbnails',
  'project-thumbnails',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Create bucket for project assets (storyboards, frames, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-assets',
  'project-assets',
  true,
  52428800, -- 50MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Storage Policies
-- ============================================================================

-- Allow public read access to thumbnails
CREATE POLICY "Public read access for thumbnails"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-thumbnails');

-- Allow authenticated users to upload thumbnails
CREATE POLICY "Authenticated users can upload thumbnails"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'project-thumbnails');

-- Allow users to update their own thumbnails
CREATE POLICY "Users can update own thumbnails"
ON storage.objects FOR UPDATE
USING (bucket_id = 'project-thumbnails');

-- Allow users to delete their own thumbnails
CREATE POLICY "Users can delete own thumbnails"
ON storage.objects FOR DELETE
USING (bucket_id = 'project-thumbnails');

-- Same policies for project assets
CREATE POLICY "Public read access for assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'project-assets');

CREATE POLICY "Authenticated users can upload assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'project-assets');

CREATE POLICY "Users can update own assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'project-assets');

CREATE POLICY "Users can delete own assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'project-assets');
