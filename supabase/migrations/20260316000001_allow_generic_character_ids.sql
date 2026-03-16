-- Allow generic character IDs (like 'generic:group') in script_elements
-- Generic characters have string IDs, not UUIDs, so we need to change the column type

-- First, drop the foreign key constraint
ALTER TABLE script_elements
DROP CONSTRAINT IF EXISTS script_elements_character_id_fkey;

-- Change character_id from UUID to TEXT to accept both UUIDs and generic IDs
ALTER TABLE script_elements
ALTER COLUMN character_id TYPE TEXT USING character_id::TEXT;

-- Drop the old index and create a new one for TEXT type
DROP INDEX IF EXISTS idx_script_elements_character_id;
CREATE INDEX idx_script_elements_character_id ON script_elements(character_id);

-- Add a comment explaining the column can contain both types
COMMENT ON COLUMN script_elements.character_id IS 'Can be a UUID (global_assets.id) or a generic character ID (e.g., generic:group)';
