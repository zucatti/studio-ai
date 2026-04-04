-- Add status field to rush_images for workflow:
-- 'pending' = just generated, shown in Rush for selection
-- 'selected' = approved, shown in Gallery
-- 'rejected' = discarded/garbage

ALTER TABLE rush_images
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'
CHECK (status IN ('pending', 'selected', 'rejected'));

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_rush_images_status ON rush_images(status);

-- Update existing rows to have 'pending' status (they might have NULL)
UPDATE rush_images SET status = 'pending' WHERE status IS NULL;
