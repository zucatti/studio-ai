-- Transition fields on shots (transition vers le plan SUIVANT)
-- transition_type: 'cut' = no transition (default), 'fadeblack', 'fadewhite', 'dissolve'
-- transition_duration: 0 = no transition, only meaningful when type != 'cut'
ALTER TABLE shots
  ADD COLUMN IF NOT EXISTS transition_type VARCHAR(50) DEFAULT 'cut',
  ADD COLUMN IF NOT EXISTS transition_duration REAL DEFAULT 0;

-- Assembled video on sections
ALTER TABLE music_sections
  ADD COLUMN IF NOT EXISTS assembled_video_url TEXT,
  ADD COLUMN IF NOT EXISTS assembled_video_duration REAL;
