-- ============================================================================
-- Generic Assets Customization - Allow customization and duplication
-- ============================================================================

-- Add columns for per-project customization
ALTER TABLE project_generic_assets
ADD COLUMN IF NOT EXISTS name_override TEXT,
ADD COLUMN IF NOT EXISTS local_overrides JSONB DEFAULT '{}';

-- Drop the old uniqueness constraint to allow duplications with different name_override
ALTER TABLE project_generic_assets
DROP CONSTRAINT IF EXISTS project_generic_assets_project_id_generic_asset_id_key;

-- New constraint: same generic can exist multiple times with different name_override
-- Use COALESCE to handle NULL name_override (original import without customization)
CREATE UNIQUE INDEX IF NOT EXISTS project_generic_assets_unique_variant
ON project_generic_assets (project_id, generic_asset_id, COALESCE(name_override, ''));

-- Add comment for documentation
COMMENT ON COLUMN project_generic_assets.name_override IS 'Custom name for this instance (e.g., "FEMME AGEE" instead of "FEMME")';
COMMENT ON COLUMN project_generic_assets.local_overrides IS 'JSONB overrides: description, visual_description, age, gender, reference_images_metadata, looks, voice_id';

-- Update the RPC function to return new columns
CREATE OR REPLACE FUNCTION insert_project_generic_asset(
    p_project_id UUID,
    p_generic_asset_id TEXT,
    p_name_override TEXT DEFAULT NULL,
    p_local_overrides JSONB DEFAULT '{}'
)
RETURNS TABLE(id UUID, project_id UUID, generic_asset_id TEXT, name_override TEXT, local_overrides JSONB, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    INSERT INTO project_generic_assets (project_id, generic_asset_id, name_override, local_overrides)
    VALUES (p_project_id, p_generic_asset_id, p_name_override, p_local_overrides)
    RETURNING
        project_generic_assets.id,
        project_generic_assets.project_id,
        project_generic_assets.generic_asset_id,
        project_generic_assets.name_override,
        project_generic_assets.local_overrides,
        project_generic_assets.created_at;
END;
$$;
