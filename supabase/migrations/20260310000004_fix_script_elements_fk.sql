-- Fix script_elements character_id foreign key to point to global_assets instead of characters
-- Characters are now stored in global_assets table as part of the Bible system

ALTER TABLE script_elements
DROP CONSTRAINT IF EXISTS script_elements_character_id_fkey;

ALTER TABLE script_elements
ADD CONSTRAINT script_elements_character_id_fkey
FOREIGN KEY (character_id) REFERENCES global_assets(id) ON DELETE SET NULL;
