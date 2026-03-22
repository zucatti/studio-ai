-- Add audio/music support to shots
-- Audio mode: 'mute' | 'dialogue' | 'audio' | 'instrumental' | 'vocal'
ALTER TABLE shots ADD COLUMN IF NOT EXISTS audio_mode TEXT DEFAULT 'mute';
ALTER TABLE shots ADD COLUMN IF NOT EXISTS audio_asset_id UUID REFERENCES global_assets(id) ON DELETE SET NULL;
ALTER TABLE shots ADD COLUMN IF NOT EXISTS audio_start REAL DEFAULT 0; -- Start time in seconds
ALTER TABLE shots ADD COLUMN IF NOT EXISTS audio_end REAL; -- End time in seconds (null = use plan duration)

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_shots_audio_asset ON shots(audio_asset_id) WHERE audio_asset_id IS NOT NULL;

COMMENT ON COLUMN shots.audio_mode IS 'Audio mode: mute, dialogue, audio, instrumental, vocal';
COMMENT ON COLUMN shots.audio_asset_id IS 'Reference to global_assets for music/audio';
COMMENT ON COLUMN shots.audio_start IS 'Start time in the audio file (seconds)';
COMMENT ON COLUMN shots.audio_end IS 'End time in the audio file (seconds)';
