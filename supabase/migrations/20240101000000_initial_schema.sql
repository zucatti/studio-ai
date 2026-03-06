-- ============================================================================
-- Studio IA - Initial Database Schema
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE project_status AS ENUM ('draft', 'in_progress', 'completed');
CREATE TYPE pipeline_step AS ENUM ('brainstorming', 'script', 'storyboard', 'library', 'preprod', 'production');
CREATE TYPE scene_int_ext AS ENUM ('INT', 'EXT', 'INT/EXT');
CREATE TYPE time_of_day AS ENUM ('JOUR', 'NUIT', 'AUBE', 'CREPUSCULE');
CREATE TYPE shot_type AS ENUM ('wide', 'medium', 'close_up', 'extreme_close_up', 'over_shoulder', 'pov');
CREATE TYPE camera_angle AS ENUM ('eye_level', 'low_angle', 'high_angle', 'dutch_angle', 'birds_eye', 'worms_eye');
CREATE TYPE camera_movement AS ENUM ('static', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'dolly_in', 'dolly_out', 'tracking', 'crane', 'handheld');
CREATE TYPE generation_status AS ENUM ('not_started', 'pending', 'generating', 'completed', 'failed');
CREATE TYPE prop_type AS ENUM ('object', 'vehicle', 'furniture', 'weapon', 'food', 'other');
CREATE TYPE location_type AS ENUM ('interior', 'exterior');

-- ============================================================================
-- PROJECTS
-- ============================================================================

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    status project_status NOT NULL DEFAULT 'draft',
    current_step pipeline_step NOT NULL DEFAULT 'brainstorming',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_status ON projects(status);

-- ============================================================================
-- BRAINSTORMING
-- ============================================================================

CREATE TABLE brainstorming (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id)
);

-- ============================================================================
-- SCENES
-- ============================================================================

CREATE TABLE scenes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scene_number INTEGER NOT NULL,
    int_ext scene_int_ext NOT NULL DEFAULT 'INT',
    location TEXT NOT NULL DEFAULT '',
    time_of_day time_of_day NOT NULL DEFAULT 'JOUR',
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scenes_project_id ON scenes(project_id);
CREATE INDEX idx_scenes_sort_order ON scenes(project_id, sort_order);

-- ============================================================================
-- SHOTS
-- ============================================================================

CREATE TABLE shots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    shot_number INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',

    -- Camera settings
    shot_type shot_type DEFAULT 'medium',
    camera_angle camera_angle DEFAULT 'eye_level',
    camera_movement camera_movement DEFAULT 'static',
    camera_notes TEXT,

    -- Visual assets
    storyboard_image_url TEXT,
    first_frame_url TEXT,
    last_frame_url TEXT,
    first_frame_prompt TEXT,
    last_frame_prompt TEXT,

    -- Generation
    generated_video_url TEXT,
    generation_status generation_status NOT NULL DEFAULT 'not_started',
    generation_error TEXT,

    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shots_scene_id ON shots(scene_id);
CREATE INDEX idx_shots_sort_order ON shots(scene_id, sort_order);

-- ============================================================================
-- DIALOGUES
-- ============================================================================

CREATE TABLE dialogues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shot_id UUID NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
    character_name TEXT NOT NULL,
    content TEXT NOT NULL,
    parenthetical TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dialogues_shot_id ON dialogues(shot_id);

-- ============================================================================
-- ACTIONS
-- ============================================================================

CREATE TABLE actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shot_id UUID NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_actions_shot_id ON actions(shot_id);

-- ============================================================================
-- CHARACTERS (Library)
-- ============================================================================

CREATE TABLE characters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    visual_description TEXT NOT NULL DEFAULT '',
    age TEXT,
    gender TEXT,
    reference_images TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_characters_project_id ON characters(project_id);

-- ============================================================================
-- PROPS (Library)
-- ============================================================================

CREATE TABLE props (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type prop_type NOT NULL DEFAULT 'object',
    visual_description TEXT NOT NULL DEFAULT '',
    reference_images TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_props_project_id ON props(project_id);

-- ============================================================================
-- LOCATIONS (Library)
-- ============================================================================

CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type location_type NOT NULL DEFAULT 'interior',
    visual_description TEXT NOT NULL DEFAULT '',
    lighting TEXT,
    mood TEXT,
    reference_images TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_locations_project_id ON locations(project_id);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_brainstorming_updated_at
    BEFORE UPDATE ON brainstorming
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scenes_updated_at
    BEFORE UPDATE ON scenes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shots_updated_at
    BEFORE UPDATE ON shots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_characters_updated_at
    BEFORE UPDATE ON characters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_props_updated_at
    BEFORE UPDATE ON props
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_locations_updated_at
    BEFORE UPDATE ON locations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE brainstorming ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE shots ENABLE ROW LEVEL SECURITY;
ALTER TABLE dialogues ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE props ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- Projects: users can only access their own projects
CREATE POLICY "Users can view own projects"
    ON projects FOR SELECT
    USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can insert own projects"
    ON projects FOR INSERT
    WITH CHECK (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can update own projects"
    ON projects FOR UPDATE
    USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can delete own projects"
    ON projects FOR DELETE
    USING (user_id = current_setting('app.current_user_id', true));

-- Brainstorming: access through project ownership
CREATE POLICY "Users can access brainstorming through project"
    ON brainstorming FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = brainstorming.project_id
            AND projects.user_id = current_setting('app.current_user_id', true)
        )
    );

-- Scenes: access through project ownership
CREATE POLICY "Users can access scenes through project"
    ON scenes FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = scenes.project_id
            AND projects.user_id = current_setting('app.current_user_id', true)
        )
    );

-- Shots: access through scene -> project ownership
CREATE POLICY "Users can access shots through project"
    ON shots FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM scenes
            JOIN projects ON projects.id = scenes.project_id
            WHERE scenes.id = shots.scene_id
            AND projects.user_id = current_setting('app.current_user_id', true)
        )
    );

-- Dialogues: access through shot -> scene -> project ownership
CREATE POLICY "Users can access dialogues through project"
    ON dialogues FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM shots
            JOIN scenes ON scenes.id = shots.scene_id
            JOIN projects ON projects.id = scenes.project_id
            WHERE shots.id = dialogues.shot_id
            AND projects.user_id = current_setting('app.current_user_id', true)
        )
    );

-- Actions: access through shot -> scene -> project ownership
CREATE POLICY "Users can access actions through project"
    ON actions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM shots
            JOIN scenes ON scenes.id = shots.scene_id
            JOIN projects ON projects.id = scenes.project_id
            WHERE shots.id = actions.shot_id
            AND projects.user_id = current_setting('app.current_user_id', true)
        )
    );

-- Characters: access through project ownership
CREATE POLICY "Users can access characters through project"
    ON characters FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = characters.project_id
            AND projects.user_id = current_setting('app.current_user_id', true)
        )
    );

-- Props: access through project ownership
CREATE POLICY "Users can access props through project"
    ON props FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = props.project_id
            AND projects.user_id = current_setting('app.current_user_id', true)
        )
    );

-- Locations: access through project ownership
CREATE POLICY "Users can access locations through project"
    ON locations FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.id = locations.project_id
            AND projects.user_id = current_setting('app.current_user_id', true)
        )
    );

-- ============================================================================
-- SERVICE ROLE BYPASS (for API routes using service role key)
-- ============================================================================

CREATE POLICY "Service role has full access to projects"
    ON projects FOR ALL
    USING (current_setting('role', true) = 'service_role');

CREATE POLICY "Service role has full access to brainstorming"
    ON brainstorming FOR ALL
    USING (current_setting('role', true) = 'service_role');

CREATE POLICY "Service role has full access to scenes"
    ON scenes FOR ALL
    USING (current_setting('role', true) = 'service_role');

CREATE POLICY "Service role has full access to shots"
    ON shots FOR ALL
    USING (current_setting('role', true) = 'service_role');

CREATE POLICY "Service role has full access to dialogues"
    ON dialogues FOR ALL
    USING (current_setting('role', true) = 'service_role');

CREATE POLICY "Service role has full access to actions"
    ON actions FOR ALL
    USING (current_setting('role', true) = 'service_role');

CREATE POLICY "Service role has full access to characters"
    ON characters FOR ALL
    USING (current_setting('role', true) = 'service_role');

CREATE POLICY "Service role has full access to props"
    ON props FOR ALL
    USING (current_setting('role', true) = 'service_role');

CREATE POLICY "Service role has full access to locations"
    ON locations FOR ALL
    USING (current_setting('role', true) = 'service_role');
