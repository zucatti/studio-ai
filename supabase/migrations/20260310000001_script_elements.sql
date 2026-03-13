-- ============================================================================
-- Script Elements - Structured script content (actions, dialogues, transitions, notes)
-- ============================================================================

-- Script element types (create only if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'script_element_type') THEN
        CREATE TYPE script_element_type AS ENUM ('action', 'dialogue', 'transition', 'note');
    END IF;
END$$;

-- Dialogue extensions (cinematic notation)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dialogue_extension') THEN
        CREATE TYPE dialogue_extension AS ENUM ('V.O.', 'O.S.', 'CONT''D', 'FILTERED', 'PRE-LAP');
    END IF;
END$$;

-- Script elements table
CREATE TABLE IF NOT EXISTS script_elements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    type script_element_type NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    -- For dialogues
    character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
    character_name TEXT,
    parenthetical TEXT,
    extension dialogue_extension,
    -- Ordering
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_script_elements_scene_id ON script_elements(scene_id);
CREATE INDEX IF NOT EXISTS idx_script_elements_sort_order ON script_elements(scene_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_script_elements_type ON script_elements(type);
CREATE INDEX IF NOT EXISTS idx_script_elements_character_id ON script_elements(character_id);

-- Updated at trigger (drop and recreate to be safe)
DROP TRIGGER IF EXISTS update_script_elements_updated_at ON script_elements;
CREATE TRIGGER update_script_elements_updated_at
    BEFORE UPDATE ON script_elements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE script_elements ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate
DROP POLICY IF EXISTS "Users can access script_elements through project" ON script_elements;
DROP POLICY IF EXISTS "Service role has full access to script_elements" ON script_elements;

-- Users can access script_elements through scene -> project ownership
CREATE POLICY "Users can access script_elements through project"
    ON script_elements FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM scenes
            JOIN projects ON projects.id = scenes.project_id
            WHERE scenes.id = script_elements.scene_id
            AND projects.user_id = current_setting('app.current_user_id', true)
        )
    );

-- Service role bypass
CREATE POLICY "Service role has full access to script_elements"
    ON script_elements FOR ALL
    USING (current_setting('role', true) = 'service_role');
