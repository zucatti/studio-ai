#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Create server
const server = new Server(
  {
    name: 'studio-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const TOOLS = [
  // -------------------------------------------------------------------------
  // BIBLE: Characters
  // -------------------------------------------------------------------------
  {
    name: 'add_character',
    description: 'Add a character to the project Bible. Use this when the user mentions a new character that should be tracked.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'Project UUID' },
        name: { type: 'string', description: 'Character name (e.g., "MARIE", "NOAH")' },
        description: { type: 'string', description: 'Character description (role, personality, background)' },
        visual_description: { type: 'string', description: 'Visual description for image generation (in English)' },
        age: { type: 'string', description: 'Character age or age range' },
        gender: { type: 'string', description: 'Character gender' },
      },
      required: ['project_id', 'name'],
    },
  },
  {
    name: 'update_character',
    description: 'Update an existing character in the Bible',
    inputSchema: {
      type: 'object' as const,
      properties: {
        character_id: { type: 'string', description: 'Character UUID' },
        name: { type: 'string' },
        description: { type: 'string' },
        visual_description: { type: 'string' },
        age: { type: 'string' },
        gender: { type: 'string' },
      },
      required: ['character_id'],
    },
  },
  {
    name: 'delete_character',
    description: 'Delete a character from the Bible',
    inputSchema: {
      type: 'object' as const,
      properties: {
        character_id: { type: 'string', description: 'Character UUID' },
      },
      required: ['character_id'],
    },
  },
  {
    name: 'list_characters',
    description: 'List all characters in the project Bible',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'Project UUID' },
      },
      required: ['project_id'],
    },
  },

  // -------------------------------------------------------------------------
  // BIBLE: Locations
  // -------------------------------------------------------------------------
  {
    name: 'add_location',
    description: 'Add a location to the project Bible',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'Project UUID' },
        name: { type: 'string', description: 'Location name (e.g., "APPARTEMENT DE MARIE")' },
        type: { type: 'string', enum: ['interior', 'exterior'], description: 'Interior or exterior' },
        visual_description: { type: 'string', description: 'Visual description for image generation' },
        lighting: { type: 'string', description: 'Lighting description' },
        mood: { type: 'string', description: 'Mood/atmosphere' },
      },
      required: ['project_id', 'name'],
    },
  },
  {
    name: 'update_location',
    description: 'Update an existing location',
    inputSchema: {
      type: 'object' as const,
      properties: {
        location_id: { type: 'string', description: 'Location UUID' },
        name: { type: 'string' },
        type: { type: 'string', enum: ['interior', 'exterior'] },
        visual_description: { type: 'string' },
        lighting: { type: 'string' },
        mood: { type: 'string' },
      },
      required: ['location_id'],
    },
  },
  {
    name: 'delete_location',
    description: 'Delete a location from the Bible',
    inputSchema: {
      type: 'object' as const,
      properties: {
        location_id: { type: 'string', description: 'Location UUID' },
      },
      required: ['location_id'],
    },
  },
  {
    name: 'list_locations',
    description: 'List all locations in the project Bible',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'Project UUID' },
      },
      required: ['project_id'],
    },
  },

  // -------------------------------------------------------------------------
  // BIBLE: Props
  // -------------------------------------------------------------------------
  {
    name: 'add_prop',
    description: 'Add a prop/accessory to the project Bible',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'Project UUID' },
        name: { type: 'string', description: 'Prop name' },
        type: { type: 'string', enum: ['object', 'vehicle', 'furniture', 'weapon', 'food', 'other'] },
        visual_description: { type: 'string', description: 'Visual description' },
      },
      required: ['project_id', 'name'],
    },
  },
  {
    name: 'delete_prop',
    description: 'Delete a prop from the Bible',
    inputSchema: {
      type: 'object' as const,
      properties: {
        prop_id: { type: 'string', description: 'Prop UUID' },
      },
      required: ['prop_id'],
    },
  },

  // -------------------------------------------------------------------------
  // SCENES
  // -------------------------------------------------------------------------
  {
    name: 'add_scene',
    description: 'Add a new scene to the script',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'Project UUID' },
        scene_number: { type: 'number', description: 'Scene number (auto-assigned if not provided)' },
        int_ext: { type: 'string', enum: ['INT', 'EXT', 'INT/EXT'], description: 'Interior/Exterior' },
        location: { type: 'string', description: 'Location name' },
        time_of_day: { type: 'string', enum: ['JOUR', 'NUIT', 'AUBE', 'CREPUSCULE'], description: 'Time of day' },
        description: { type: 'string', description: 'Scene description' },
      },
      required: ['project_id', 'location'],
    },
  },
  {
    name: 'update_scene',
    description: 'Update an existing scene',
    inputSchema: {
      type: 'object' as const,
      properties: {
        scene_id: { type: 'string', description: 'Scene UUID' },
        int_ext: { type: 'string', enum: ['INT', 'EXT', 'INT/EXT'] },
        location: { type: 'string' },
        time_of_day: { type: 'string', enum: ['JOUR', 'NUIT', 'AUBE', 'CREPUSCULE'] },
        description: { type: 'string' },
      },
      required: ['scene_id'],
    },
  },
  {
    name: 'delete_scene',
    description: 'Delete a scene and all its contents',
    inputSchema: {
      type: 'object' as const,
      properties: {
        scene_id: { type: 'string', description: 'Scene UUID' },
      },
      required: ['scene_id'],
    },
  },
  {
    name: 'list_scenes',
    description: 'List all scenes in the project',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'Project UUID' },
      },
      required: ['project_id'],
    },
  },

  // -------------------------------------------------------------------------
  // SCRIPT ELEMENTS (Dialogues, Actions, Transitions)
  // -------------------------------------------------------------------------
  {
    name: 'add_dialogue',
    description: 'Add a dialogue line to a scene',
    inputSchema: {
      type: 'object' as const,
      properties: {
        scene_id: { type: 'string', description: 'Scene UUID' },
        character_name: { type: 'string', description: 'Character name (uppercase)' },
        content: { type: 'string', description: 'Dialogue text' },
        parenthetical: { type: 'string', description: 'Parenthetical direction (e.g., "en colère", "murmurant")' },
        extension: { type: 'string', enum: ['V.O.', 'O.S.', 'CONT\'D', 'FILTERED', 'PRE-LAP'], description: 'Voice extension' },
      },
      required: ['scene_id', 'character_name', 'content'],
    },
  },
  {
    name: 'add_action',
    description: 'Add an action/description to a scene',
    inputSchema: {
      type: 'object' as const,
      properties: {
        scene_id: { type: 'string', description: 'Scene UUID' },
        content: { type: 'string', description: 'Action description (present tense, visual)' },
      },
      required: ['scene_id', 'content'],
    },
  },
  {
    name: 'add_transition',
    description: 'Add a transition to a scene',
    inputSchema: {
      type: 'object' as const,
      properties: {
        scene_id: { type: 'string', description: 'Scene UUID' },
        content: { type: 'string', description: 'Transition (e.g., "CUT TO", "FADE OUT", "DISSOLVE TO")' },
      },
      required: ['scene_id', 'content'],
    },
  },
  {
    name: 'update_script_element',
    description: 'Update an existing script element (dialogue, action, transition, note)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        element_id: { type: 'string', description: 'Script element UUID' },
        content: { type: 'string' },
        character_name: { type: 'string' },
        parenthetical: { type: 'string' },
        extension: { type: 'string' },
      },
      required: ['element_id'],
    },
  },
  {
    name: 'delete_script_element',
    description: 'Delete a script element',
    inputSchema: {
      type: 'object' as const,
      properties: {
        element_id: { type: 'string', description: 'Script element UUID' },
      },
      required: ['element_id'],
    },
  },
  {
    name: 'list_script_elements',
    description: 'List all script elements in a scene',
    inputSchema: {
      type: 'object' as const,
      properties: {
        scene_id: { type: 'string', description: 'Scene UUID' },
      },
      required: ['scene_id'],
    },
  },

  // -------------------------------------------------------------------------
  // SHOTS
  // -------------------------------------------------------------------------
  {
    name: 'add_shot',
    description: 'Add a shot/plan to a scene',
    inputSchema: {
      type: 'object' as const,
      properties: {
        scene_id: { type: 'string', description: 'Scene UUID' },
        description: { type: 'string', description: 'Shot description' },
        shot_type: { type: 'string', enum: ['wide', 'medium', 'close_up', 'extreme_close_up', 'over_shoulder', 'pov'] },
        camera_angle: { type: 'string', enum: ['eye_level', 'low_angle', 'high_angle', 'dutch_angle', 'birds_eye', 'worms_eye'] },
        camera_movement: { type: 'string', description: 'Camera movement (static, dolly_in, pan, etc.)' },
        duration: { type: 'number', description: 'Duration in seconds' },
      },
      required: ['scene_id', 'description'],
    },
  },
  {
    name: 'update_shot',
    description: 'Update an existing shot',
    inputSchema: {
      type: 'object' as const,
      properties: {
        shot_id: { type: 'string', description: 'Shot UUID' },
        description: { type: 'string' },
        shot_type: { type: 'string' },
        camera_angle: { type: 'string' },
        camera_movement: { type: 'string' },
        duration: { type: 'number' },
        status: { type: 'string', enum: ['draft', 'selected', 'rush', 'archived'] },
      },
      required: ['shot_id'],
    },
  },
  {
    name: 'delete_shot',
    description: 'Delete a shot',
    inputSchema: {
      type: 'object' as const,
      properties: {
        shot_id: { type: 'string', description: 'Shot UUID' },
      },
      required: ['shot_id'],
    },
  },

  // -------------------------------------------------------------------------
  // PROJECT INFO
  // -------------------------------------------------------------------------
  {
    name: 'get_project',
    description: 'Get project details and current state',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'Project UUID' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'get_full_script',
    description: 'Get the complete script in Fountain format',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'string', description: 'Project UUID' },
      },
      required: ['project_id'],
    },
  },
];

// ============================================================================
// TOOL HANDLERS
// ============================================================================

async function handleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    // -----------------------------------------------------------------------
    // CHARACTERS
    // -----------------------------------------------------------------------
    case 'add_character': {
      const { project_id, name: charName, description, visual_description, age, gender } = args as {
        project_id: string;
        name: string;
        description?: string;
        visual_description?: string;
        age?: string;
        gender?: string;
      };
      const { data, error } = await supabase
        .from('characters')
        .insert({
          project_id,
          name: charName,
          description: description || '',
          visual_description: visual_description || '',
          age: age || null,
          gender: gender || null,
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to add character: ${error.message}`);
      return { success: true, character: data };
    }

    case 'update_character': {
      const { character_id, ...updates } = args as { character_id: string; [key: string]: unknown };
      const { data, error } = await supabase
        .from('characters')
        .update(updates)
        .eq('id', character_id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update character: ${error.message}`);
      return { success: true, character: data };
    }

    case 'delete_character': {
      const { character_id } = args as { character_id: string };
      const { error } = await supabase.from('characters').delete().eq('id', character_id);
      if (error) throw new Error(`Failed to delete character: ${error.message}`);
      return { success: true };
    }

    case 'list_characters': {
      const { project_id } = args as { project_id: string };
      const { data, error } = await supabase
        .from('characters')
        .select('*')
        .eq('project_id', project_id)
        .order('created_at');
      if (error) throw new Error(`Failed to list characters: ${error.message}`);
      return { characters: data };
    }

    // -----------------------------------------------------------------------
    // LOCATIONS
    // -----------------------------------------------------------------------
    case 'add_location': {
      const { project_id, name: locName, type, visual_description, lighting, mood } = args as {
        project_id: string;
        name: string;
        type?: string;
        visual_description?: string;
        lighting?: string;
        mood?: string;
      };
      const { data, error } = await supabase
        .from('locations')
        .insert({
          project_id,
          name: locName,
          type: type || 'interior',
          visual_description: visual_description || '',
          lighting: lighting || '',
          mood: mood || '',
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to add location: ${error.message}`);
      return { success: true, location: data };
    }

    case 'update_location': {
      const { location_id, ...updates } = args as { location_id: string; [key: string]: unknown };
      const { data, error } = await supabase
        .from('locations')
        .update(updates)
        .eq('id', location_id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update location: ${error.message}`);
      return { success: true, location: data };
    }

    case 'delete_location': {
      const { location_id } = args as { location_id: string };
      const { error } = await supabase.from('locations').delete().eq('id', location_id);
      if (error) throw new Error(`Failed to delete location: ${error.message}`);
      return { success: true };
    }

    case 'list_locations': {
      const { project_id } = args as { project_id: string };
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .eq('project_id', project_id)
        .order('created_at');
      if (error) throw new Error(`Failed to list locations: ${error.message}`);
      return { locations: data };
    }

    // -----------------------------------------------------------------------
    // PROPS
    // -----------------------------------------------------------------------
    case 'add_prop': {
      const { project_id, name: propName, type, visual_description } = args as {
        project_id: string;
        name: string;
        type?: string;
        visual_description?: string;
      };
      const { data, error } = await supabase
        .from('props')
        .insert({
          project_id,
          name: propName,
          type: type || 'object',
          visual_description: visual_description || '',
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to add prop: ${error.message}`);
      return { success: true, prop: data };
    }

    case 'delete_prop': {
      const { prop_id } = args as { prop_id: string };
      const { error } = await supabase.from('props').delete().eq('id', prop_id);
      if (error) throw new Error(`Failed to delete prop: ${error.message}`);
      return { success: true };
    }

    // -----------------------------------------------------------------------
    // SCENES
    // -----------------------------------------------------------------------
    case 'add_scene': {
      const { project_id, scene_number, int_ext, location, time_of_day, description } = args as {
        project_id: string;
        scene_number?: number;
        int_ext?: string;
        location: string;
        time_of_day?: string;
        description?: string;
      };

      // Get next scene number if not provided
      let nextNumber = scene_number;
      if (!nextNumber) {
        const { data: existing } = await supabase
          .from('scenes')
          .select('scene_number')
          .eq('project_id', project_id)
          .order('scene_number', { ascending: false })
          .limit(1);
        nextNumber = (existing?.[0]?.scene_number || 0) + 1;
      }

      const { data, error } = await supabase
        .from('scenes')
        .insert({
          project_id,
          scene_number: nextNumber,
          int_ext: int_ext || 'INT',
          location,
          time_of_day: time_of_day || 'JOUR',
          description: description || null,
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to add scene: ${error.message}`);
      return { success: true, scene: data };
    }

    case 'update_scene': {
      const { scene_id, ...updates } = args as { scene_id: string; [key: string]: unknown };
      const { data, error } = await supabase
        .from('scenes')
        .update(updates)
        .eq('id', scene_id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update scene: ${error.message}`);
      return { success: true, scene: data };
    }

    case 'delete_scene': {
      const { scene_id } = args as { scene_id: string };
      // Delete elements first
      await supabase.from('script_elements').delete().eq('scene_id', scene_id);
      await supabase.from('shots').delete().eq('scene_id', scene_id);
      const { error } = await supabase.from('scenes').delete().eq('id', scene_id);
      if (error) throw new Error(`Failed to delete scene: ${error.message}`);
      return { success: true };
    }

    case 'list_scenes': {
      const { project_id } = args as { project_id: string };
      const { data, error } = await supabase
        .from('scenes')
        .select('*')
        .eq('project_id', project_id)
        .order('scene_number');
      if (error) throw new Error(`Failed to list scenes: ${error.message}`);
      return { scenes: data };
    }

    // -----------------------------------------------------------------------
    // SCRIPT ELEMENTS
    // -----------------------------------------------------------------------
    case 'add_dialogue': {
      const { scene_id, character_name, content, parenthetical, extension } = args as {
        scene_id: string;
        character_name: string;
        content: string;
        parenthetical?: string;
        extension?: string;
      };

      // Get next sort order
      const { data: existing } = await supabase
        .from('script_elements')
        .select('sort_order')
        .eq('scene_id', scene_id)
        .order('sort_order', { ascending: false })
        .limit(1);
      const nextOrder = (existing?.[0]?.sort_order || 0) + 1;

      const { data, error } = await supabase
        .from('script_elements')
        .insert({
          scene_id,
          type: 'dialogue',
          character_name: character_name.toUpperCase(),
          content,
          parenthetical: parenthetical || null,
          extension: extension || null,
          sort_order: nextOrder,
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to add dialogue: ${error.message}`);
      return { success: true, element: data };
    }

    case 'add_action': {
      const { scene_id, content } = args as { scene_id: string; content: string };

      const { data: existing } = await supabase
        .from('script_elements')
        .select('sort_order')
        .eq('scene_id', scene_id)
        .order('sort_order', { ascending: false })
        .limit(1);
      const nextOrder = (existing?.[0]?.sort_order || 0) + 1;

      const { data, error } = await supabase
        .from('script_elements')
        .insert({
          scene_id,
          type: 'action',
          content,
          sort_order: nextOrder,
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to add action: ${error.message}`);
      return { success: true, element: data };
    }

    case 'add_transition': {
      const { scene_id, content } = args as { scene_id: string; content: string };

      const { data: existing } = await supabase
        .from('script_elements')
        .select('sort_order')
        .eq('scene_id', scene_id)
        .order('sort_order', { ascending: false })
        .limit(1);
      const nextOrder = (existing?.[0]?.sort_order || 0) + 1;

      const { data, error } = await supabase
        .from('script_elements')
        .insert({
          scene_id,
          type: 'transition',
          content: content.toUpperCase(),
          sort_order: nextOrder,
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to add transition: ${error.message}`);
      return { success: true, element: data };
    }

    case 'update_script_element': {
      const { element_id, ...updates } = args as { element_id: string; [key: string]: unknown };
      const { data, error } = await supabase
        .from('script_elements')
        .update(updates)
        .eq('id', element_id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update element: ${error.message}`);
      return { success: true, element: data };
    }

    case 'delete_script_element': {
      const { element_id } = args as { element_id: string };
      const { error } = await supabase.from('script_elements').delete().eq('id', element_id);
      if (error) throw new Error(`Failed to delete element: ${error.message}`);
      return { success: true };
    }

    case 'list_script_elements': {
      const { scene_id } = args as { scene_id: string };
      const { data, error } = await supabase
        .from('script_elements')
        .select('*')
        .eq('scene_id', scene_id)
        .order('sort_order');
      if (error) throw new Error(`Failed to list elements: ${error.message}`);
      return { elements: data };
    }

    // -----------------------------------------------------------------------
    // SHOTS
    // -----------------------------------------------------------------------
    case 'add_shot': {
      const { scene_id, description, shot_type, camera_angle, camera_movement, duration } = args as {
        scene_id: string;
        description: string;
        shot_type?: string;
        camera_angle?: string;
        camera_movement?: string;
        duration?: number;
      };

      const { data: existing } = await supabase
        .from('shots')
        .select('shot_number')
        .eq('scene_id', scene_id)
        .order('shot_number', { ascending: false })
        .limit(1);
      const nextNumber = (existing?.[0]?.shot_number || 0) + 1;

      const { data, error } = await supabase
        .from('shots')
        .insert({
          scene_id,
          shot_number: nextNumber,
          description,
          shot_type: shot_type || 'medium',
          camera_angle: camera_angle || 'eye_level',
          camera_movement: camera_movement || 'static',
          duration: duration || 3,
        })
        .select()
        .single();
      if (error) throw new Error(`Failed to add shot: ${error.message}`);
      return { success: true, shot: data };
    }

    case 'update_shot': {
      const { shot_id, ...updates } = args as { shot_id: string; [key: string]: unknown };
      const { data, error } = await supabase
        .from('shots')
        .update(updates)
        .eq('id', shot_id)
        .select()
        .single();
      if (error) throw new Error(`Failed to update shot: ${error.message}`);
      return { success: true, shot: data };
    }

    case 'delete_shot': {
      const { shot_id } = args as { shot_id: string };
      const { error } = await supabase.from('shots').delete().eq('id', shot_id);
      if (error) throw new Error(`Failed to delete shot: ${error.message}`);
      return { success: true };
    }

    // -----------------------------------------------------------------------
    // PROJECT INFO
    // -----------------------------------------------------------------------
    case 'get_project': {
      const { project_id } = args as { project_id: string };
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', project_id)
        .single();
      if (error) throw new Error(`Failed to get project: ${error.message}`);
      return { project: data };
    }

    case 'get_full_script': {
      const { project_id } = args as { project_id: string };

      // Get scenes with elements
      const { data: scenes, error: scenesError } = await supabase
        .from('scenes')
        .select('*')
        .eq('project_id', project_id)
        .order('scene_number');
      if (scenesError) throw new Error(`Failed to get scenes: ${scenesError.message}`);

      const { data: elements, error: elementsError } = await supabase
        .from('script_elements')
        .select('*')
        .in('scene_id', scenes?.map(s => s.id) || [])
        .order('sort_order');
      if (elementsError) throw new Error(`Failed to get elements: ${elementsError.message}`);

      // Build Fountain format
      const lines: string[] = [];
      for (const scene of scenes || []) {
        lines.push(`${scene.int_ext}. ${scene.location} - ${scene.time_of_day}`.toUpperCase());
        lines.push('');
        if (scene.description) {
          lines.push(scene.description);
          lines.push('');
        }

        const sceneElements = (elements || []).filter(e => e.scene_id === scene.id);
        for (const el of sceneElements) {
          switch (el.type) {
            case 'action':
              lines.push(el.content);
              lines.push('');
              break;
            case 'dialogue':
              let charLine = (el.character_name || 'PERSONNAGE').toUpperCase();
              if (el.extension) charLine += ` (${el.extension})`;
              lines.push(charLine);
              if (el.parenthetical) lines.push(`(${el.parenthetical})`);
              lines.push(el.content);
              lines.push('');
              break;
            case 'transition':
              lines.push(el.content.toUpperCase() + ':');
              lines.push('');
              break;
            case 'note':
              lines.push(`[[${el.content}]]`);
              lines.push('');
              break;
          }
        }
        lines.push('');
      }

      return {
        script: lines.join('\n').trim(),
        scene_count: scenes?.length || 0,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ============================================================================
// SERVER SETUP
// ============================================================================

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, args || {});
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: message }),
        },
      ],
      isError: true,
    };
  }
});

// List resources handler (for context)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: [] };
});

// Read resource handler
server.setRequestHandler(ReadResourceRequestSchema, async () => {
  return { contents: [] };
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Studio MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
