-- Add script_workshop_messages column to projects for storing chat history
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS script_workshop_messages JSONB DEFAULT '[]'::jsonb;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_projects_script_workshop ON projects(id) WHERE script_workshop_messages IS NOT NULL;
