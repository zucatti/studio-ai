-- ============================================================================
-- Global Assets - Shared assets across projects (Bible)
-- ============================================================================

-- Global asset types (create only if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'global_asset_type') THEN
        CREATE TYPE global_asset_type AS ENUM ('character', 'location', 'prop', 'audio');
    END IF;
END$$;

-- Global assets table (user's asset library)
CREATE TABLE IF NOT EXISTS global_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    asset_type global_asset_type NOT NULL,
    name TEXT NOT NULL,
    -- Flexible data storage based on asset type
    data JSONB NOT NULL DEFAULT '{}',
    reference_images TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_global_assets_user_id ON global_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_global_assets_type ON global_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_global_assets_tags ON global_assets USING GIN(tags);

-- Project assets junction table (links global assets to projects with optional overrides)
CREATE TABLE IF NOT EXISTS project_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    global_asset_id UUID NOT NULL REFERENCES global_assets(id) ON DELETE CASCADE,
    -- Local overrides specific to this project
    local_overrides JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, global_asset_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_assets_project_id ON project_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_project_assets_global_asset_id ON project_assets(global_asset_id);

-- Updated at trigger for global_assets (drop and recreate to be safe)
DROP TRIGGER IF EXISTS update_global_assets_updated_at ON global_assets;
CREATE TRIGGER update_global_assets_updated_at
    BEFORE UPDATE ON global_assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE global_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_assets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own global assets" ON global_assets;
DROP POLICY IF EXISTS "Users can insert own global assets" ON global_assets;
DROP POLICY IF EXISTS "Users can update own global assets" ON global_assets;
DROP POLICY IF EXISTS "Users can delete own global assets" ON global_assets;
DROP POLICY IF EXISTS "Users can access project_assets through project" ON project_assets;
DROP POLICY IF EXISTS "Service role has full access to global_assets" ON global_assets;
DROP POLICY IF EXISTS "Service role has full access to project_assets" ON project_assets;

-- Users can only access their own global assets
CREATE POLICY "Users can view own global assets"
    ON global_assets FOR SELECT
    USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can insert own global assets"
    ON global_assets FOR INSERT
    WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can update own global assets"
    ON global_assets FOR UPDATE
    USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can delete own global assets"
    ON global_assets FOR DELETE
    USING (user_id = current_setting('app.current_user_id', true));

-- Project assets: access through project ownership
CREATE POLICY "Users can access project_assets through project"
    ON project_assets FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = project_assets.project_id
            AND projects.user_id = current_setting('app.current_user_id', true)
        )
    );

-- Service role bypass
CREATE POLICY "Service role has full access to global_assets"
    ON global_assets FOR ALL
    USING (current_setting('role', true) = 'service_role');

CREATE POLICY "Service role has full access to project_assets"
    ON project_assets FOR ALL
    USING (current_setting('role', true) = 'service_role');
