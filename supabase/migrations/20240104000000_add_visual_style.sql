-- Add visual_style to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS visual_style TEXT DEFAULT 'photorealistic';

-- Add extraction fields
ALTER TABLE projects ADD COLUMN IF NOT EXISTS auto_extract_inventory BOOLEAN DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS inventory_extracted_at TIMESTAMPTZ;

-- Add generation fields to characters
ALTER TABLE characters ADD COLUMN IF NOT EXISTS generation_prompt TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS generation_status TEXT DEFAULT 'pending';
ALTER TABLE characters ADD COLUMN IF NOT EXISTS generation_error TEXT;

-- Add generation fields to props
ALTER TABLE props ADD COLUMN IF NOT EXISTS generation_prompt TEXT;
ALTER TABLE props ADD COLUMN IF NOT EXISTS generation_status TEXT DEFAULT 'pending';
ALTER TABLE props ADD COLUMN IF NOT EXISTS generation_error TEXT;

-- Add generation fields to locations
ALTER TABLE locations ADD COLUMN IF NOT EXISTS generation_prompt TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS generation_status TEXT DEFAULT 'pending';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS generation_error TEXT;

-- Comments
COMMENT ON COLUMN projects.visual_style IS 'Visual style for generated images: photorealistic, cartoon, anime, cyberpunk, noir, watercolor';
COMMENT ON COLUMN projects.auto_extract_inventory IS 'If true, automatically extract inventory when script is generated';
