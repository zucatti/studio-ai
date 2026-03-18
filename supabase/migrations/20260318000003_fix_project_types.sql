-- Fix project_type enum to match code expectations
-- Add missing values: movie, portfolio, photo_series

ALTER TYPE project_type ADD VALUE IF NOT EXISTS 'movie';
ALTER TYPE project_type ADD VALUE IF NOT EXISTS 'portfolio';
ALTER TYPE project_type ADD VALUE IF NOT EXISTS 'photo_series';
