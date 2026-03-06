// ============================================================================
// Supabase Database Types - Generated from schema
// ============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Enums
export type ProjectStatus = 'draft' | 'in_progress' | 'completed';
export type PipelineStep = 'brainstorming' | 'script' | 'storyboard' | 'library' | 'preprod' | 'production';
export type SceneIntExt = 'INT' | 'EXT' | 'INT/EXT';
export type TimeOfDay = 'JOUR' | 'NUIT' | 'AUBE' | 'CREPUSCULE';
export type ShotType = 'wide' | 'medium' | 'close_up' | 'extreme_close_up' | 'over_shoulder' | 'pov';
export type CameraAngle = 'eye_level' | 'low_angle' | 'high_angle' | 'dutch_angle' | 'birds_eye' | 'worms_eye';
export type CameraMovement = 'static' | 'pan_left' | 'pan_right' | 'tilt_up' | 'tilt_down' | 'dolly_in' | 'dolly_out' | 'tracking' | 'crane' | 'handheld';
export type GenerationStatus = 'not_started' | 'pending' | 'generating' | 'completed' | 'failed';
export type PropType = 'object' | 'vehicle' | 'furniture' | 'weapon' | 'food' | 'other';
export type LocationType = 'interior' | 'exterior';

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          thumbnail_url: string | null;
          status: ProjectStatus;
          current_step: PipelineStep;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          thumbnail_url?: string | null;
          status?: ProjectStatus;
          current_step?: PipelineStep;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          thumbnail_url?: string | null;
          status?: ProjectStatus;
          current_step?: PipelineStep;
          created_at?: string;
          updated_at?: string;
        };
      };
      brainstorming: {
        Row: {
          id: string;
          project_id: string;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      scenes: {
        Row: {
          id: string;
          project_id: string;
          scene_number: number;
          int_ext: SceneIntExt;
          location: string;
          time_of_day: TimeOfDay;
          description: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          scene_number: number;
          int_ext?: SceneIntExt;
          location?: string;
          time_of_day?: TimeOfDay;
          description?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          scene_number?: number;
          int_ext?: SceneIntExt;
          location?: string;
          time_of_day?: TimeOfDay;
          description?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      shots: {
        Row: {
          id: string;
          scene_id: string;
          shot_number: number;
          description: string;
          shot_type: ShotType | null;
          camera_angle: CameraAngle | null;
          camera_movement: CameraMovement | null;
          camera_notes: string | null;
          storyboard_image_url: string | null;
          first_frame_url: string | null;
          last_frame_url: string | null;
          first_frame_prompt: string | null;
          last_frame_prompt: string | null;
          generated_video_url: string | null;
          generation_status: GenerationStatus;
          generation_error: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scene_id: string;
          shot_number: number;
          description?: string;
          shot_type?: ShotType | null;
          camera_angle?: CameraAngle | null;
          camera_movement?: CameraMovement | null;
          camera_notes?: string | null;
          storyboard_image_url?: string | null;
          first_frame_url?: string | null;
          last_frame_url?: string | null;
          first_frame_prompt?: string | null;
          last_frame_prompt?: string | null;
          generated_video_url?: string | null;
          generation_status?: GenerationStatus;
          generation_error?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          scene_id?: string;
          shot_number?: number;
          description?: string;
          shot_type?: ShotType | null;
          camera_angle?: CameraAngle | null;
          camera_movement?: CameraMovement | null;
          camera_notes?: string | null;
          storyboard_image_url?: string | null;
          first_frame_url?: string | null;
          last_frame_url?: string | null;
          first_frame_prompt?: string | null;
          last_frame_prompt?: string | null;
          generated_video_url?: string | null;
          generation_status?: GenerationStatus;
          generation_error?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      dialogues: {
        Row: {
          id: string;
          shot_id: string;
          character_name: string;
          content: string;
          parenthetical: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          shot_id: string;
          character_name: string;
          content: string;
          parenthetical?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          shot_id?: string;
          character_name?: string;
          content?: string;
          parenthetical?: string | null;
          sort_order?: number;
          created_at?: string;
        };
      };
      actions: {
        Row: {
          id: string;
          shot_id: string;
          content: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          shot_id: string;
          content: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          shot_id?: string;
          content?: string;
          sort_order?: number;
          created_at?: string;
        };
      };
      characters: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          description: string;
          visual_description: string;
          age: string | null;
          gender: string | null;
          reference_images: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          description?: string;
          visual_description?: string;
          age?: string | null;
          gender?: string | null;
          reference_images?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          description?: string;
          visual_description?: string;
          age?: string | null;
          gender?: string | null;
          reference_images?: string[];
          created_at?: string;
          updated_at?: string;
        };
      };
      props: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          type: PropType;
          visual_description: string;
          reference_images: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          type?: PropType;
          visual_description?: string;
          reference_images?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          type?: PropType;
          visual_description?: string;
          reference_images?: string[];
          created_at?: string;
          updated_at?: string;
        };
      };
      locations: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          type: LocationType;
          visual_description: string;
          lighting: string | null;
          mood: string | null;
          reference_images: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          type?: LocationType;
          visual_description?: string;
          lighting?: string | null;
          mood?: string | null;
          reference_images?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          type?: LocationType;
          visual_description?: string;
          lighting?: string | null;
          mood?: string | null;
          reference_images?: string[];
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      project_status: ProjectStatus;
      pipeline_step: PipelineStep;
      scene_int_ext: SceneIntExt;
      time_of_day: TimeOfDay;
      shot_type: ShotType;
      camera_angle: CameraAngle;
      camera_movement: CameraMovement;
      generation_status: GenerationStatus;
      prop_type: PropType;
      location_type: LocationType;
    };
  };
}

// Helper types for easier usage
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

// Convenience types
export type Project = Tables<'projects'>;
export type Brainstorming = Tables<'brainstorming'>;
export type Scene = Tables<'scenes'>;
export type Shot = Tables<'shots'>;
export type Dialogue = Tables<'dialogues'>;
export type Action = Tables<'actions'>;
export type Character = Tables<'characters'>;
export type Prop = Tables<'props'>;
export type Location = Tables<'locations'>;

// With relations
export type SceneWithShots = Scene & {
  shots: Shot[];
};

export type ShotWithDetails = Shot & {
  dialogues: Dialogue[];
  actions: Action[];
};

export type ProjectWithScenes = Project & {
  scenes: SceneWithShots[];
};
