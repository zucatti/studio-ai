/**
 * Storyboard Types
 *
 * Storyboard frames are visual explorations of the script.
 * They don't have timing or structure - just images representing moments.
 */

export interface StoryboardFrame {
  id: string;
  project_id: string;
  scene_id: string | null;
  script_element_id: string | null;

  // Content
  description: string;
  sketch_url: string | null;
  sketch_prompt: string | null;

  // Generation
  generation_status: 'pending' | 'generating' | 'completed' | 'failed';
  generation_error: string | null;

  // Ordering
  sort_order: number;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface StoryboardFrameInsert {
  project_id: string;
  scene_id?: string | null;
  script_element_id?: string | null;
  description: string;
  sort_order?: number;
}

export interface StoryboardFrameUpdate {
  description?: string;
  sketch_url?: string | null;
  sketch_prompt?: string | null;
  generation_status?: StoryboardFrame['generation_status'];
  generation_error?: string | null;
  sort_order?: number;
}

/**
 * Frame with scene context for display
 */
export interface StoryboardFrameWithContext extends StoryboardFrame {
  scene?: {
    scene_number: number;
    int_ext: string;
    location: string;
    time_of_day: string;
  } | null;
  script_element?: {
    type: string;
    content: string;
    character_name?: string | null;
  } | null;
}
