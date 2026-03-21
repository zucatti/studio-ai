-- Add dialogue text hash for audio caching optimization
-- Only regenerate audio when dialogue text actually changes

ALTER TABLE shots
ADD COLUMN IF NOT EXISTS dialogue_text_hash TEXT;

COMMENT ON COLUMN shots.dialogue_text_hash IS 'MD5 hash of dialogue_text for audio caching. Audio is only regenerated if hash changes.';
