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
export type PipelineStep = 'brainstorming' | 'script' | 'decoupage' | 'storyboard' | 'preprod' | 'production';
export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5' | '21:9' | '2:3';
export type ProjectType = 'movie' | 'short' | 'music_video' | 'portfolio' | 'photo_series' | 'shorts_project';
export type ShotStatus = 'draft' | 'selected' | 'rush' | 'archived';
export type ScriptElementType = 'action' | 'dialogue' | 'transition' | 'note';
export type DialogueExtension = 'V.O.' | 'O.S.' | "CONT'D" | 'FILTERED' | 'PRE-LAP';
export type GlobalAssetType = 'character' | 'location' | 'prop' | 'audio';
// Note: ReferenceType kept for database compatibility (tables still exist)
export type ReferenceType = 'pose' | 'composition' | 'style';
export type SceneIntExt = 'INT' | 'EXT' | 'INT/EXT';
export type TimeOfDay = 'JOUR' | 'NUIT' | 'AUBE' | 'CREPUSCULE';
export type ShotType = 'wide' | 'medium' | 'close_up' | 'extreme_close_up' | 'over_shoulder' | 'pov';
export type CameraAngle = 'eye_level' | 'low_angle' | 'high_angle' | 'dutch_angle' | 'birds_eye' | 'worms_eye';
// Extended camera movements (38 total)
export type CameraMovement =
  | 'static'
  // Dolly movements
  | 'slow_dolly_in'
  | 'slow_dolly_out'
  | 'fast_dolly_in'
  | 'dolly_zoom'
  // Zoom movements
  | 'macro_zoom'
  | 'hyper_zoom'
  | 'smooth_zoom_in'
  | 'smooth_zoom_out'
  | 'snap_zoom'
  // Special shots
  | 'over_the_shoulder'
  | 'fisheye'
  | 'reveal_wipe'
  | 'fly_through'
  | 'reveal_blur'
  | 'rack_focus'
  // Tilt movements
  | 'tilt_up'
  | 'tilt_down'
  // Truck movements
  | 'truck_left'
  | 'truck_right'
  // Orbit movements
  | 'orbit_180'
  | 'orbit_360_fast'
  | 'slow_arc'
  // Pedestal movements
  | 'pedestal_down'
  | 'pedestal_up'
  // Crane movements
  | 'crane_up'
  | 'crane_down'
  // Drone movements
  | 'drone_flyover'
  | 'drone_reveal'
  | 'drone_orbit'
  | 'drone_topdown'
  | 'fpv_dive'
  // Tracking movements
  | 'tracking_backward'
  | 'tracking_forward'
  | 'tracking_side'
  | 'pov_walk'
  // Other movements
  | 'handheld'
  | 'whip_pan'
  | 'dutch_roll'
  // Legacy values
  | 'pan_left'
  | 'pan_right'
  | 'dolly_in'
  | 'dolly_out'
  | 'tracking'
  | 'crane';
export type GenerationStatus = 'not_started' | 'pending' | 'generating' | 'completed' | 'failed';

// Metadata stored with generated images
export interface GenerationMetadata {
  model: string;
  original_prompt: string;
  optimized_prompt: string;
  resolution?: string;
  aspect_ratio?: string;
  references?: {
    characters?: string[];
    locations?: string[];
    poses?: string[];
    styles?: string[];
  };
  generated_at: string;
}
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
          thumbnail_focal_point: { x: number; y: number } | null;
          aspect_ratio: AspectRatio;
          project_type: ProjectType;
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
          thumbnail_focal_point?: { x: number; y: number } | null;
          aspect_ratio?: AspectRatio;
          project_type?: ProjectType;
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
          thumbnail_focal_point?: { x: number; y: number } | null;
          aspect_ratio?: AspectRatio;
          project_type?: ProjectType;
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
          title: string | null;
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
          title?: string | null;
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
          title?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      shots: {
        Row: {
          id: string;
          scene_id: string | null;
          project_id: string | null;
          shot_number: number;
          description: string;
          shot_type: ShotType | null;
          camera_angle: CameraAngle | null;
          camera_movement: CameraMovement | null;
          camera_notes: string | null;
          storyboard_image_url: string | null;
          storyboard_prompt: string | null;
          generation_metadata: GenerationMetadata | null;
          first_frame_url: string | null;
          last_frame_url: string | null;
          first_frame_prompt: string | null;
          last_frame_prompt: string | null;
          generated_video_url: string | null;
          generation_status: GenerationStatus;
          generation_error: string | null;
          status: ShotStatus;
          duration: number | null;
          frame_in: number | null;
          frame_out: number | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scene_id?: string | null;
          project_id?: string | null;
          shot_number: number;
          description?: string;
          shot_type?: ShotType | null;
          camera_angle?: CameraAngle | null;
          camera_movement?: CameraMovement | null;
          camera_notes?: string | null;
          storyboard_image_url?: string | null;
          storyboard_prompt?: string | null;
          generation_metadata?: GenerationMetadata | null;
          first_frame_url?: string | null;
          last_frame_url?: string | null;
          first_frame_prompt?: string | null;
          last_frame_prompt?: string | null;
          generated_video_url?: string | null;
          generation_status?: GenerationStatus;
          generation_error?: string | null;
          status?: ShotStatus;
          duration?: number | null;
          frame_in?: number | null;
          frame_out?: number | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          scene_id?: string | null;
          project_id?: string | null;
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
          status?: ShotStatus;
          duration?: number | null;
          frame_in?: number | null;
          frame_out?: number | null;
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
      script_elements: {
        Row: {
          id: string;
          scene_id: string;
          type: ScriptElementType;
          content: string;
          character_id: string | null;
          character_name: string | null;
          parenthetical: string | null;
          extension: DialogueExtension | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          scene_id: string;
          type: ScriptElementType;
          content?: string;
          character_id?: string | null;
          character_name?: string | null;
          parenthetical?: string | null;
          extension?: DialogueExtension | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          scene_id?: string;
          type?: ScriptElementType;
          content?: string;
          character_id?: string | null;
          character_name?: string | null;
          parenthetical?: string | null;
          extension?: DialogueExtension | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      global_assets: {
        Row: {
          id: string;
          user_id: string;
          asset_type: GlobalAssetType;
          name: string;
          data: Json;
          reference_images: string[];
          tags: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          asset_type: GlobalAssetType;
          name: string;
          data?: Json;
          reference_images?: string[];
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          asset_type?: GlobalAssetType;
          name?: string;
          data?: Json;
          reference_images?: string[];
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
      };
      project_assets: {
        Row: {
          id: string;
          project_id: string;
          global_asset_id: string;
          local_overrides: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          global_asset_id: string;
          local_overrides?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          global_asset_id?: string;
          local_overrides?: Json | null;
          created_at?: string;
        };
      };
      global_references: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type: ReferenceType;
          image_url: string | null;
          description: string | null;
          tags: string[];
          pose_library_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          type: ReferenceType;
          image_url?: string | null;
          description?: string | null;
          tags?: string[];
          pose_library_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          type?: ReferenceType;
          image_url?: string | null;
          description?: string | null;
          tags?: string[];
          pose_library_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      project_reference_links: {
        Row: {
          id: string;
          project_id: string;
          global_reference_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          global_reference_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          global_reference_id?: string;
          created_at?: string;
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
      script_element_type: ScriptElementType;
      dialogue_extension: DialogueExtension;
      global_asset_type: GlobalAssetType;
      project_type: ProjectType;
      shot_status: ShotStatus;
      reference_type: ReferenceType;
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
export type ScriptElement = Tables<'script_elements'>;
export type GlobalAsset = Tables<'global_assets'>;
export type ProjectAsset = Tables<'project_assets'>;
export type ProjectReferenceLink = Tables<'project_reference_links'>;

// Flattened project asset (from API join)
export type ProjectAssetFlat = {
  id: string;
  project_asset_id: string;
  name: string;
  asset_type: GlobalAssetType;
  data: Record<string, unknown>;
  reference_images: string[];
  tags: string[];
  created_at: string;
};

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

// ============================================================================
// Credit Management Types
// ============================================================================

// Enums for credit management
export type BudgetPeriod = 'daily' | 'weekly' | 'monthly';
// Note: 'claude' is used internally but not shown in dashboard
export type ApiProvider = 'claude' | 'replicate' | 'fal' | 'piapi' | 'elevenlabs' | 'creatomate' | 'global';
export type ApiCallStatus = 'success' | 'failed' | 'blocked';

// Credit allocation types
export type CreditAllocation = {
  id: string;
  user_id: string;
  provider: ApiProvider;
  budget_amount: number;
  budget_period: BudgetPeriod;
  alert_threshold_50: boolean;
  alert_threshold_80: boolean;
  alert_threshold_100: boolean;
  block_on_limit: boolean;
  current_period_spent: number;
  period_start_date: string;
  created_at: string;
  updated_at: string;
};

export type CreditAllocationInsert = {
  id?: string;
  user_id: string;
  provider: ApiProvider;
  budget_amount?: number;
  budget_period?: BudgetPeriod;
  alert_threshold_50?: boolean;
  alert_threshold_80?: boolean;
  alert_threshold_100?: boolean;
  block_on_limit?: boolean;
  current_period_spent?: number;
  period_start_date?: string;
  created_at?: string;
  updated_at?: string;
};

export type CreditAllocationUpdate = Partial<CreditAllocationInsert>;

// API usage log types
export type ApiUsageLog = {
  id: string;
  user_id: string;
  project_id: string | null;
  provider: ApiProvider;
  model: string | null;
  endpoint: string | null;
  input_tokens: number;
  output_tokens: number;
  characters: number;
  images_count: number;
  video_duration: number;
  estimated_cost: number;
  operation: string;
  status: ApiCallStatus;
  error_message: string | null;
  metadata: Json;
  created_at: string;
};

export type ApiUsageLogInsert = {
  id?: string;
  user_id: string;
  project_id?: string | null;
  provider: ApiProvider;
  model?: string | null;
  endpoint?: string | null;
  input_tokens?: number;
  output_tokens?: number;
  characters?: number;
  images_count?: number;
  video_duration?: number;
  estimated_cost: number;
  operation: string;
  status?: ApiCallStatus;
  error_message?: string | null;
  metadata?: Json;
  created_at?: string;
};

// Credit alert types
export type CreditAlert = {
  id: string;
  user_id: string;
  provider: ApiProvider;
  threshold_percent: number;
  budget_amount: number;
  spent_amount: number;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
};

export type CreditAlertUpdate = {
  acknowledged?: boolean;
  acknowledged_at?: string | null;
};

// Warning level for credit checks
export type CreditWarningLevel = 'none' | 'warning_50' | 'warning_80' | 'critical_100';

// Credit check result
export type CreditCheckResult = {
  allowed: boolean;
  remainingBudget: number;
  warningLevel: CreditWarningLevel;
  spentPercent: number;
  budgetAmount: number;
  currentSpent: number;
  message?: string;
};

// Provider spending summary
export type ProviderSpending = {
  provider: ApiProvider;
  spent: number;
  budget: number;
  period: BudgetPeriod;
  spentPercent: number;
  periodStartDate: string;
};

// ============================================================================
// Users
// ============================================================================

export interface User {
  id: string;
  auth0_id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type UserInsert = Omit<User, 'id' | 'created_at' | 'updated_at'>;
export type UserUpdate = Partial<Omit<User, 'id' | 'auth0_id' | 'created_at' | 'updated_at'>>;
