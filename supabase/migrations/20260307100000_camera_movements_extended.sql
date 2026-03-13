-- Migration: Extended Camera Movements (38 movements)
-- Convert camera_movement from ENUM to TEXT for flexibility

-- Step 1: Add a new TEXT column
ALTER TABLE shots ADD COLUMN camera_movement_new TEXT DEFAULT 'static';

-- Step 2: Copy existing values
UPDATE shots SET camera_movement_new = camera_movement::TEXT WHERE camera_movement IS NOT NULL;

-- Step 3: Drop the old column
ALTER TABLE shots DROP COLUMN camera_movement;

-- Step 4: Rename the new column
ALTER TABLE shots RENAME COLUMN camera_movement_new TO camera_movement;

-- Step 5: Drop the old ENUM type
DROP TYPE IF EXISTS camera_movement;

-- Step 6: Add a CHECK constraint for valid values
ALTER TABLE shots ADD CONSTRAINT valid_camera_movement CHECK (
  camera_movement IS NULL OR camera_movement IN (
    'static',
    -- Dolly movements
    'slow_dolly_in',
    'slow_dolly_out',
    'fast_dolly_in',
    'dolly_zoom',
    -- Zoom movements
    'macro_zoom',
    'hyper_zoom',
    'smooth_zoom_in',
    'smooth_zoom_out',
    'snap_zoom',
    -- Special shots
    'over_the_shoulder',
    'fisheye',
    'reveal_wipe',
    'fly_through',
    'reveal_blur',
    'rack_focus',
    -- Tilt movements
    'tilt_up',
    'tilt_down',
    -- Truck movements
    'truck_left',
    'truck_right',
    -- Orbit movements
    'orbit_180',
    'orbit_360_fast',
    'slow_arc',
    -- Pedestal movements
    'pedestal_down',
    'pedestal_up',
    -- Crane movements
    'crane_up',
    'crane_down',
    -- Drone movements
    'drone_flyover',
    'drone_reveal',
    'drone_orbit',
    'drone_topdown',
    'fpv_dive',
    -- Tracking movements
    'tracking_backward',
    'tracking_forward',
    'tracking_side',
    'pov_walk',
    -- Other movements
    'handheld',
    'whip_pan',
    'dutch_roll',
    -- Legacy values (for backwards compatibility)
    'pan_left',
    'pan_right',
    'dolly_in',
    'dolly_out',
    'tracking',
    'crane'
  )
);

-- Step 7: Migrate old values to new equivalents
UPDATE shots SET camera_movement = 'slow_dolly_in' WHERE camera_movement = 'dolly_in';
UPDATE shots SET camera_movement = 'slow_dolly_out' WHERE camera_movement = 'dolly_out';
UPDATE shots SET camera_movement = 'tracking_side' WHERE camera_movement = 'tracking';
UPDATE shots SET camera_movement = 'crane_up' WHERE camera_movement = 'crane';
-- pan_left and pan_right are kept as-is for now (could map to whip_pan or truck movements)

-- Create camera_movements_preview table for storing preview images/videos
CREATE TABLE IF NOT EXISTS camera_movements_preview (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_key TEXT NOT NULL UNIQUE,
  preview_image_url TEXT,
  preview_video_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert all movements for preview generation tracking
INSERT INTO camera_movements_preview (movement_key) VALUES
  ('static'),
  ('slow_dolly_in'),
  ('slow_dolly_out'),
  ('fast_dolly_in'),
  ('dolly_zoom'),
  ('macro_zoom'),
  ('hyper_zoom'),
  ('smooth_zoom_in'),
  ('smooth_zoom_out'),
  ('snap_zoom'),
  ('over_the_shoulder'),
  ('fisheye'),
  ('reveal_wipe'),
  ('fly_through'),
  ('reveal_blur'),
  ('rack_focus'),
  ('tilt_up'),
  ('tilt_down'),
  ('truck_left'),
  ('truck_right'),
  ('orbit_180'),
  ('orbit_360_fast'),
  ('slow_arc'),
  ('pedestal_down'),
  ('pedestal_up'),
  ('crane_up'),
  ('crane_down'),
  ('drone_flyover'),
  ('drone_reveal'),
  ('drone_orbit'),
  ('drone_topdown'),
  ('fpv_dive'),
  ('tracking_backward'),
  ('tracking_forward'),
  ('tracking_side'),
  ('pov_walk'),
  ('handheld'),
  ('whip_pan'),
  ('dutch_roll')
ON CONFLICT (movement_key) DO NOTHING;
