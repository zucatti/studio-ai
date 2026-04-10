-- Migration: Allow multiple books per project
-- Removes the UNIQUE constraint on project_id to support short story collections

-- Drop the unique constraint
ALTER TABLE books DROP CONSTRAINT IF EXISTS books_project_id_key;

-- Update comment
COMMENT ON TABLE books IS 'Books/novels for writing projects. Multiple books allowed per project.';
