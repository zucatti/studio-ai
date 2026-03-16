-- ============================================================================
-- Project Generic Assets - Track imported generic characters per project
-- ============================================================================

-- Generic characters are predefined system characters (FOULE, VOIX, etc.)
-- This table tracks which generic characters are imported to each project
CREATE TABLE IF NOT EXISTS project_generic_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    generic_asset_id TEXT NOT NULL, -- generic:crowd, generic:voice, etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, generic_asset_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_generic_assets_project_id ON project_generic_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_project_generic_assets_generic_id ON project_generic_assets(generic_asset_id);

-- Row Level Security
ALTER TABLE project_generic_assets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can access project_generic_assets through project" ON project_generic_assets;
DROP POLICY IF EXISTS "Service role has full access to project_generic_assets" ON project_generic_assets;

-- Project generic assets: access through project ownership
CREATE POLICY "Users can access project_generic_assets through project"
    ON project_generic_assets FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = project_generic_assets.project_id
            AND projects.user_id = current_setting('app.current_user_id', true)
        )
    );

-- Service role bypass
CREATE POLICY "Service role has full access to project_generic_assets"
    ON project_generic_assets FOR ALL
    USING (current_setting('role', true) = 'service_role');
