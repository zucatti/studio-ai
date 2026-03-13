-- ============================================================================
-- Update Pipeline - Add decoupage step
-- ============================================================================

-- Add 'decoupage' value to pipeline_step enum if it doesn't exist
ALTER TYPE pipeline_step ADD VALUE IF NOT EXISTS 'decoupage';

-- Note: 'synopsis' and 'reperage' were never added to the enum in this database,
-- so we don't need to migrate any projects from those values.
-- The application code has been updated to use the new pipeline:
-- brainstorming → script → decoupage → storyboard → preprod → production
