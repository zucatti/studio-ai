-- Add style_bible field to scenes table
-- Style Bible is a persistent ending line for all prompts in a short (Kling AI best practice)

ALTER TABLE scenes
ADD COLUMN IF NOT EXISTS style_bible TEXT DEFAULT NULL;

-- Add comment
COMMENT ON COLUMN scenes.style_bible IS 'Persistent style ending line for all prompts (e.g., "cinematic lighting, 35mm film grain, moody color grade")';
