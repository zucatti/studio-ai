-- Add dialogue columns to shots table for lip-sync support
ALTER TABLE shots ADD COLUMN IF NOT EXISTS has_dialogue BOOLEAN DEFAULT FALSE;
ALTER TABLE shots ADD COLUMN IF NOT EXISTS dialogue_text TEXT;
ALTER TABLE shots ADD COLUMN IF NOT EXISTS dialogue_character_id UUID REFERENCES global_assets(id) ON DELETE SET NULL;
ALTER TABLE shots ADD COLUMN IF NOT EXISTS dialogue_audio_url TEXT;

-- Index for faster queries on dialogue-enabled shots
CREATE INDEX IF NOT EXISTS idx_shots_has_dialogue ON shots(has_dialogue) WHERE has_dialogue = TRUE;
