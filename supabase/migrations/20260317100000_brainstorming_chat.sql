-- Add chat history and brainstorming versions to brainstorming table

-- Chat messages history (JSON array)
ALTER TABLE brainstorming
ADD COLUMN IF NOT EXISTS chat_messages jsonb DEFAULT '[]'::jsonb;

-- Brainstorming version history for undo/redo
ALTER TABLE brainstorming
ADD COLUMN IF NOT EXISTS versions jsonb DEFAULT '[]'::jsonb;

-- Current version index (for undo/redo navigation)
ALTER TABLE brainstorming
ADD COLUMN IF NOT EXISTS version_index integer DEFAULT -1;

-- Add comment for documentation
COMMENT ON COLUMN brainstorming.chat_messages IS 'Chat history with AI assistant as JSON array of {role, content, timestamp}';
COMMENT ON COLUMN brainstorming.versions IS 'Version history of brainstorming content for undo/redo as JSON array of {content, timestamp, source}';
COMMENT ON COLUMN brainstorming.version_index IS 'Current position in version history (-1 = latest)';
