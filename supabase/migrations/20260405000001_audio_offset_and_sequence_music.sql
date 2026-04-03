-- ============================================================================
-- Audio Offset for Shots + Music for Sequences
--
-- Allows precise audio positioning like in Filmora:
-- - audio_offset: where the audio starts in the video timeline
-- - audio_volume: volume level for mixing
--
-- Also adds music support at sequence level (cascade: shot > sequence > short)
-- ============================================================================

-- ============================================================================
-- 1. Add audio_offset and audio_volume to shots
-- ============================================================================

ALTER TABLE shots ADD COLUMN IF NOT EXISTS audio_offset REAL DEFAULT 0;
ALTER TABLE shots ADD COLUMN IF NOT EXISTS audio_volume REAL DEFAULT 1.0;

COMMENT ON COLUMN shots.audio_offset IS 'Where the audio region starts in the video timeline (seconds). 0 = start of video.';
COMMENT ON COLUMN shots.audio_volume IS 'Audio volume for mixing (0.0 - 1.0). Default 1.0 = full volume.';

-- ============================================================================
-- 2. Add music fields to sequences (sequence-level music)
-- ============================================================================

ALTER TABLE sequences ADD COLUMN IF NOT EXISTS music_asset_id UUID REFERENCES global_assets(id) ON DELETE SET NULL;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS music_start REAL DEFAULT 0;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS music_end REAL;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS music_offset REAL DEFAULT 0;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS music_volume REAL DEFAULT 0.5;

COMMENT ON COLUMN sequences.music_asset_id IS 'Global asset ID for sequence background music (overrides short-level music)';
COMMENT ON COLUMN sequences.music_start IS 'Start time in the music file (seconds)';
COMMENT ON COLUMN sequences.music_end IS 'End time in the music file (seconds). NULL = until sequence ends';
COMMENT ON COLUMN sequences.music_offset IS 'Where the music starts in the sequence timeline (seconds)';
COMMENT ON COLUMN sequences.music_volume IS 'Music volume (0.0 - 1.0). Default 0.5 for background.';

-- Index for music asset lookups
CREATE INDEX IF NOT EXISTS idx_sequences_music_asset ON sequences(music_asset_id) WHERE music_asset_id IS NOT NULL;
