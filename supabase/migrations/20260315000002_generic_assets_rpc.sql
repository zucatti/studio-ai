-- ============================================================================
-- RPC function for inserting generic assets (bypasses PostgREST schema cache)
-- ============================================================================

CREATE OR REPLACE FUNCTION insert_project_generic_asset(
    p_project_id UUID,
    p_generic_asset_id TEXT
)
RETURNS TABLE (
    id UUID,
    project_id UUID,
    generic_asset_id TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id UUID;
BEGIN
    -- Generate new UUID
    v_id := gen_random_uuid();

    -- Insert and return the new row
    INSERT INTO project_generic_assets (id, project_id, generic_asset_id)
    VALUES (v_id, p_project_id, p_generic_asset_id);

    RETURN QUERY SELECT
        v_id,
        p_project_id,
        p_generic_asset_id,
        NOW();
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION insert_project_generic_asset(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION insert_project_generic_asset(UUID, TEXT) TO authenticated;
