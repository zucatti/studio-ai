-- Make image_url nullable for poses (they come from the library, no image needed)
ALTER TABLE global_references ALTER COLUMN image_url DROP NOT NULL;

-- Add pose_library_id to track which library pose was used (optional)
ALTER TABLE global_references ADD COLUMN pose_library_id TEXT;
