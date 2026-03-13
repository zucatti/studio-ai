-- ============================================================================
-- Audio Timeline Support - Music Videos & Dialogue Lip Sync
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE project_type AS ENUM ('film', 'music_video', 'commercial', 'short', 'other');
CREATE TYPE audio_asset_type AS ENUM ('music', 'voice', 'sfx', 'ambiance', 'dialogue');

-- ============================================================================
-- PROJECTS - Add audio fields
-- ============================================================================

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS project_type project_type DEFAULT 'film',
ADD COLUMN IF NOT EXISTS audio_url TEXT,
ADD COLUMN IF NOT EXISTS audio_duration DECIMAL(10,3),  -- Duration in seconds (millisecond precision)
ADD COLUMN IF NOT EXISTS audio_waveform_data JSONB;     -- Waveform peaks array for UI

-- ============================================================================
-- SCENES - Add timeline fields
-- ============================================================================

ALTER TABLE scenes
ADD COLUMN IF NOT EXISTS start_time DECIMAL(10,3),  -- Start time in audio timeline (seconds)
ADD COLUMN IF NOT EXISTS end_time DECIMAL(10,3);    -- End time in audio timeline (seconds)

-- ============================================================================
-- SHOTS - Add audio/lip sync fields
-- ============================================================================

ALTER TABLE shots
ADD COLUMN IF NOT EXISTS start_time DECIMAL(10,3),           -- Start time within scene
ADD COLUMN IF NOT EXISTS end_time DECIMAL(10,3),             -- End time within scene
ADD COLUMN IF NOT EXISTS has_vocals BOOLEAN DEFAULT FALSE,   -- Does this segment have vocals?
ADD COLUMN IF NOT EXISTS lip_sync_enabled BOOLEAN DEFAULT FALSE,  -- Use lip sync mode?
ADD COLUMN IF NOT EXISTS singing_character_id UUID REFERENCES characters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shots_singing_character ON shots(singing_character_id);

-- ============================================================================
-- AUDIO ASSETS - Multiple audio tracks per project
-- ============================================================================

CREATE TABLE IF NOT EXISTS audio_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type audio_asset_type NOT NULL DEFAULT 'music',
    file_url TEXT NOT NULL,
    duration DECIMAL(10,3) NOT NULL,              -- Duration in seconds
    waveform_data JSONB,                          -- Waveform peaks for visualization
    is_master BOOLEAN DEFAULT FALSE,              -- Is this the master/main audio?
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audio_assets_project_id ON audio_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_audio_assets_is_master ON audio_assets(project_id, is_master);

-- ============================================================================
-- VOCAL SEGMENTS - Detected or manual vocal regions
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocal_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audio_asset_id UUID NOT NULL REFERENCES audio_assets(id) ON DELETE CASCADE,
    start_time DECIMAL(10,3) NOT NULL,  -- Start time in seconds
    end_time DECIMAL(10,3) NOT NULL,    -- End time in seconds
    confidence DECIMAL(3,2),            -- Detection confidence 0.00-1.00 (null if manual)
    lyrics TEXT,                        -- Optional lyrics for this segment
    character_id UUID REFERENCES characters(id) ON DELETE SET NULL,  -- Who sings/speaks this?
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vocal_segments_audio_asset ON vocal_segments(audio_asset_id);
CREATE INDEX IF NOT EXISTS idx_vocal_segments_time ON vocal_segments(audio_asset_id, start_time, end_time);

-- ============================================================================
-- SHOT AUDIO ASSIGNMENT - Link shots to audio segments
-- ============================================================================

CREATE TABLE IF NOT EXISTS shot_audio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shot_id UUID NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
    audio_asset_id UUID NOT NULL REFERENCES audio_assets(id) ON DELETE CASCADE,
    start_time DECIMAL(10,3) NOT NULL,  -- Start time in the audio asset
    end_time DECIMAL(10,3) NOT NULL,    -- End time in the audio asset
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(shot_id, audio_asset_id)     -- One audio asset per shot
);

CREATE INDEX IF NOT EXISTS idx_shot_audio_shot ON shot_audio(shot_id);
CREATE INDEX IF NOT EXISTS idx_shot_audio_asset ON shot_audio(audio_asset_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_audio_assets_updated_at
    BEFORE UPDATE ON audio_assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE audio_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocal_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shot_audio ENABLE ROW LEVEL SECURITY;

-- Audio assets: access through project ownership
CREATE POLICY "Users can access audio_assets through project"
    ON audio_assets FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = audio_assets.project_id
            AND projects.user_id = current_setting('app.current_user_id', true)
        )
    );

-- Vocal segments: access through audio_asset -> project ownership
CREATE POLICY "Users can access vocal_segments through project"
    ON vocal_segments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM audio_assets
            JOIN projects ON projects.id = audio_assets.project_id
            WHERE audio_assets.id = vocal_segments.audio_asset_id
            AND projects.user_id = current_setting('app.current_user_id', true)
        )
    );

-- Shot audio: access through shot -> scene -> project ownership
CREATE POLICY "Users can access shot_audio through project"
    ON shot_audio FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM shots
            JOIN scenes ON scenes.id = shots.scene_id
            JOIN projects ON projects.id = scenes.project_id
            WHERE shots.id = shot_audio.shot_id
            AND projects.user_id = current_setting('app.current_user_id', true)
        )
    );

-- Service role bypass
CREATE POLICY "Service role has full access to audio_assets"
    ON audio_assets FOR ALL
    USING (current_setting('role', true) = 'service_role');

CREATE POLICY "Service role has full access to vocal_segments"
    ON vocal_segments FOR ALL
    USING (current_setting('role', true) = 'service_role');

CREATE POLICY "Service role has full access to shot_audio"
    ON shot_audio FOR ALL
    USING (current_setting('role', true) = 'service_role');
