import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createClaudeWrapper, extractTextContent, isCreditError, formatCreditError } from '@/lib/ai';
import Anthropic from '@anthropic-ai/sdk';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface SceneInfo {
  number: number;
  heading: string;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

const TOOLS: Anthropic.Tool[] = [
  // Bible: Characters
  {
    name: 'add_character',
    description: 'Ajouter un personnage à la Bible du projet. Utilise cet outil quand l\'utilisateur mentionne un nouveau personnage à ajouter.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Nom du personnage (ex: "MARIE", "NOAH")' },
        description: { type: 'string', description: 'Description du personnage (rôle, personnalité, contexte)' },
        visual_description: { type: 'string', description: 'Description visuelle pour génération d\'image (en anglais)' },
      },
      required: ['name'],
    },
  },
  // Bible: Locations
  {
    name: 'add_location',
    description: 'Ajouter un lieu à la Bible du projet',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Nom du lieu (ex: "APPARTEMENT DE MARIE")' },
        type: { type: 'string', enum: ['interior', 'exterior'], description: 'Intérieur ou extérieur' },
        visual_description: { type: 'string', description: 'Description visuelle' },
      },
      required: ['name'],
    },
  },
  // Bible: Props
  {
    name: 'add_prop',
    description: 'Ajouter un accessoire/prop à la Bible du projet',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Nom de l\'accessoire' },
        description: { type: 'string', description: 'Description' },
      },
      required: ['name'],
    },
  },
  // Script: Scenes
  {
    name: 'add_scene',
    description: 'Ajouter une nouvelle scène au script',
    input_schema: {
      type: 'object' as const,
      properties: {
        int_ext: { type: 'string', enum: ['INT', 'EXT', 'INT/EXT'], description: 'Intérieur/Extérieur' },
        location: { type: 'string', description: 'Nom du lieu' },
        time_of_day: { type: 'string', enum: ['JOUR', 'NUIT', 'AUBE', 'CREPUSCULE'], description: 'Moment de la journée' },
        description: { type: 'string', description: 'Description de la scène' },
      },
      required: ['location'],
    },
  },
  {
    name: 'update_scene',
    description: 'Modifier une scène existante',
    input_schema: {
      type: 'object' as const,
      properties: {
        scene_number: { type: 'number', description: 'Numéro de la scène à modifier' },
        int_ext: { type: 'string', enum: ['INT', 'EXT', 'INT/EXT'] },
        location: { type: 'string' },
        time_of_day: { type: 'string', enum: ['JOUR', 'NUIT', 'AUBE', 'CREPUSCULE'] },
        description: { type: 'string' },
      },
      required: ['scene_number'],
    },
  },
  {
    name: 'delete_scene',
    description: 'Supprimer une scène',
    input_schema: {
      type: 'object' as const,
      properties: {
        scene_number: { type: 'number', description: 'Numéro de la scène à supprimer' },
      },
      required: ['scene_number'],
    },
  },
  // Script: Elements
  {
    name: 'add_dialogue',
    description: 'Ajouter un dialogue à une scène',
    input_schema: {
      type: 'object' as const,
      properties: {
        scene_number: { type: 'number', description: 'Numéro de la scène' },
        character_name: { type: 'string', description: 'Nom du personnage (MAJUSCULES)' },
        content: { type: 'string', description: 'Texte du dialogue' },
        parenthetical: { type: 'string', description: 'Indication de jeu (ex: "en colère", "murmurant")' },
        extension: { type: 'string', enum: ['V.O.', 'O.S.', 'CONT\'D'], description: 'Extension vocale' },
      },
      required: ['scene_number', 'character_name', 'content'],
    },
  },
  {
    name: 'add_action',
    description: 'Ajouter une action/description à une scène',
    input_schema: {
      type: 'object' as const,
      properties: {
        scene_number: { type: 'number', description: 'Numéro de la scène' },
        content: { type: 'string', description: 'Description de l\'action (temps présent, visuel)' },
      },
      required: ['scene_number', 'content'],
    },
  },
  {
    name: 'add_transition',
    description: 'Ajouter une transition à une scène',
    input_schema: {
      type: 'object' as const,
      properties: {
        scene_number: { type: 'number', description: 'Numéro de la scène' },
        content: { type: 'string', description: 'Transition (ex: "CUT TO", "FADE OUT", "DISSOLVE TO")' },
      },
      required: ['scene_number', 'content'],
    },
  },
  {
    name: 'delete_element',
    description: 'Supprimer un élément du script (dialogue, action, transition)',
    input_schema: {
      type: 'object' as const,
      properties: {
        scene_number: { type: 'number', description: 'Numéro de la scène' },
        element_description: { type: 'string', description: 'Description de l\'élément à supprimer (ex: "le dialogue où Marie dit bonjour")' },
      },
      required: ['scene_number', 'element_description'],
    },
  },
];

const SYSTEM_PROMPT = `Tu es un scénariste professionnel et coach d'écriture qui aide à construire des scripts de films/courts-métrages en format Fountain.

## Ton approche
- Tu es créatif, enthousiaste et professionnel
- Tu guides l'utilisateur étape par étape dans la construction de son script
- Tu proposes du contenu concret et utilisable
- Tu t'adaptes au ton et au style souhaité

## Format Fountain - Rappel
- Scene Heading: INT./EXT. LIEU - MOMENT (en majuscules)
- Action: Descriptions au présent, visuelles
- Dialogue: NOM DU PERSONNAGE puis texte
- Parenthétiques: (indication de jeu)
- Transitions: CUT TO:, FADE OUT., etc.

## Utilisation des outils
Tu disposes d'outils pour modifier directement le script et la Bible du projet:
- add_character, add_location, add_prop: Pour ajouter à la Bible
- add_scene, update_scene, delete_scene: Pour gérer les scènes
- add_dialogue, add_action, add_transition: Pour ajouter du contenu
- delete_element: Pour supprimer du contenu

IMPORTANT: Quand l'utilisateur te demande d'ajouter/modifier/supprimer quelque chose, utilise TOUJOURS l'outil approprié. Ne dis jamais "j'ajoute" sans utiliser l'outil.

## Bonnes pratiques
- Actions: temps présent, phrases courtes, visuelles
- Dialogues: naturels, sous-texte, éviter l'exposition lourde
- Show don't tell: montrer par les actions plutôt qu'expliquer
- Entrer tard, sortir tôt (commencer au coeur de l'action)`;

// ============================================================================
// TOOL EXECUTION
// ============================================================================

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  projectId: string,
  userId: string,
  supabase: ReturnType<typeof createServerSupabaseClient>
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  console.log(`[ScriptWorkshop] Executing tool: ${toolName}`, toolInput);

  try {
    switch (toolName) {
      // -----------------------------------------------------------------------
      // BIBLE
      // -----------------------------------------------------------------------
      case 'add_character': {
        const { name, description, visual_description } = toolInput as {
          name: string;
          description?: string;
          visual_description?: string;
        };

        // Check for duplicate (case-insensitive) in user's global_assets
        const { data: existingAssets } = await supabase
          .from('global_assets')
          .select('id, name')
          .eq('user_id', userId)
          .eq('asset_type', 'character')
          .ilike('name', name);

        if (existingAssets && existingAssets.length > 0) {
          const existing = existingAssets[0];
          // Check if already in project
          const { data: inProject } = await supabase
            .from('project_assets')
            .select('id')
            .eq('project_id', projectId)
            .eq('global_asset_id', existing.id)
            .single();

          if (inProject) {
            return {
              success: false,
              error: `Le personnage "${existing.name}" existe déjà dans ce projet. Utilisez-le directement avec @${existing.name.replace(/\s+/g, '')}.`,
            };
          } else {
            // Import existing character to project instead of creating duplicate
            const { data: projectAsset, error: importError } = await supabase
              .from('project_assets')
              .insert({
                project_id: projectId,
                global_asset_id: existing.id,
              })
              .select()
              .single();

            if (importError) {
              return { success: false, error: `Erreur lors de l'import: ${importError.message}` };
            }

            return {
              success: true,
              result: {
                type: 'character',
                globalAsset: existing,
                projectAsset,
                message: `Le personnage "${existing.name}" existait déjà dans la Bible. Il a été importé dans le projet.`,
              },
            };
          }
        }

        // No duplicate found - create new character
        const { data: globalAsset, error: globalError } = await supabase
          .from('global_assets')
          .insert({
            user_id: userId,
            asset_type: 'character',
            name: name.toUpperCase(),
            data: {
              description: description || '',
              visual_description: visual_description || '',
            },
            reference_images: [],
            tags: [],
          })
          .select()
          .single();

        if (globalError) throw new Error(`Failed to create character: ${globalError.message}`);

        // Step 2: Import into project (create link in project_assets)
        const { data: projectAsset, error: importError } = await supabase
          .from('project_assets')
          .insert({
            project_id: projectId,
            global_asset_id: globalAsset.id,
          })
          .select()
          .single();

        if (importError) {
          // If import fails, still return success for creation
          console.error('[ScriptWorkshop] Failed to import character to project:', importError);
        }

        return {
          success: true,
          result: {
            type: 'character',
            globalAsset,
            projectAsset,
            message: `Personnage "${name.toUpperCase()}" créé et ajouté au projet`,
          },
        };
      }

      case 'add_location': {
        const { name, type, visual_description } = toolInput as {
          name: string;
          type?: string;
          visual_description?: string;
        };

        // Check for duplicate (case-insensitive) in user's global_assets
        const { data: existingAssets } = await supabase
          .from('global_assets')
          .select('id, name')
          .eq('user_id', userId)
          .eq('asset_type', 'location')
          .ilike('name', name);

        if (existingAssets && existingAssets.length > 0) {
          const existing = existingAssets[0];
          // Check if already in project
          const { data: inProject } = await supabase
            .from('project_assets')
            .select('id')
            .eq('project_id', projectId)
            .eq('global_asset_id', existing.id)
            .single();

          if (inProject) {
            return {
              success: false,
              error: `Le lieu "${existing.name}" existe déjà dans ce projet. Utilisez-le directement avec #${existing.name.replace(/\s+/g, '')}.`,
            };
          } else {
            // Import existing location to project instead of creating duplicate
            const { data: projectAsset, error: importError } = await supabase
              .from('project_assets')
              .insert({
                project_id: projectId,
                global_asset_id: existing.id,
              })
              .select()
              .single();

            if (importError) {
              return { success: false, error: `Erreur lors de l'import: ${importError.message}` };
            }

            return {
              success: true,
              result: {
                type: 'location',
                globalAsset: existing,
                projectAsset,
                message: `Le lieu "${existing.name}" existait déjà dans la Bible. Il a été importé dans le projet.`,
              },
            };
          }
        }

        // No duplicate found - create new location
        const { data: globalAsset, error: globalError } = await supabase
          .from('global_assets')
          .insert({
            user_id: userId,
            asset_type: 'location',
            name: name.toUpperCase(),
            data: {
              type: type || 'interior',
              visual_description: visual_description || '',
            },
            reference_images: [],
            tags: [],
          })
          .select()
          .single();

        if (globalError) throw new Error(`Failed to create location: ${globalError.message}`);

        // Step 2: Import into project
        const { data: projectAsset, error: importError } = await supabase
          .from('project_assets')
          .insert({
            project_id: projectId,
            global_asset_id: globalAsset.id,
          })
          .select()
          .single();

        if (importError) {
          console.error('[ScriptWorkshop] Failed to import location to project:', importError);
        }

        return {
          success: true,
          result: {
            type: 'location',
            globalAsset,
            projectAsset,
            message: `Lieu "${name.toUpperCase()}" créé et ajouté au projet`,
          },
        };
      }

      case 'add_prop': {
        const { name, description } = toolInput as {
          name: string;
          description?: string;
        };

        // Step 1: Create in global_assets (user's library)
        const { data: globalAsset, error: globalError } = await supabase
          .from('global_assets')
          .insert({
            user_id: userId,
            asset_type: 'prop',
            name: name.toUpperCase(),
            data: {
              description: description || '',
            },
            reference_images: [],
            tags: [],
          })
          .select()
          .single();

        if (globalError) throw new Error(`Failed to create prop: ${globalError.message}`);

        // Step 2: Import into project
        const { data: projectAsset, error: importError } = await supabase
          .from('project_assets')
          .insert({
            project_id: projectId,
            global_asset_id: globalAsset.id,
          })
          .select()
          .single();

        if (importError) {
          console.error('[ScriptWorkshop] Failed to import prop to project:', importError);
        }

        return {
          success: true,
          result: {
            type: 'prop',
            globalAsset,
            projectAsset,
            message: `Accessoire "${name.toUpperCase()}" créé et ajouté au projet`,
          },
        };
      }

      // -----------------------------------------------------------------------
      // SCENES
      // -----------------------------------------------------------------------
      case 'add_scene': {
        const { int_ext, location, time_of_day, description } = toolInput as {
          int_ext?: string;
          location: string;
          time_of_day?: string;
          description?: string;
        };

        // Get next scene number
        const { data: existing } = await supabase
          .from('scenes')
          .select('scene_number')
          .eq('project_id', projectId)
          .order('scene_number', { ascending: false })
          .limit(1);
        const nextNumber = (existing?.[0]?.scene_number || 0) + 1;

        const { data, error } = await supabase
          .from('scenes')
          .insert({
            project_id: projectId,
            scene_number: nextNumber,
            int_ext: int_ext || 'INT',
            location: location.toUpperCase(),
            time_of_day: time_of_day || 'JOUR',
            description: description || null,
          })
          .select()
          .single();
        if (error) throw new Error(error.message);
        return { success: true, result: { scene: data } };
      }

      case 'update_scene': {
        const { scene_number, ...updates } = toolInput as {
          scene_number: number;
          int_ext?: string;
          location?: string;
          time_of_day?: string;
          description?: string;
        };

        const { data: scene } = await supabase
          .from('scenes')
          .select('id')
          .eq('project_id', projectId)
          .eq('scene_number', scene_number)
          .single();

        if (!scene) throw new Error(`Scene ${scene_number} not found`);

        const { data, error } = await supabase
          .from('scenes')
          .update(updates)
          .eq('id', scene.id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return { success: true, result: { scene: data } };
      }

      case 'delete_scene': {
        const { scene_number } = toolInput as { scene_number: number };

        const { data: scene } = await supabase
          .from('scenes')
          .select('id')
          .eq('project_id', projectId)
          .eq('scene_number', scene_number)
          .single();

        if (!scene) throw new Error(`Scene ${scene_number} not found`);

        // Delete elements first
        await supabase.from('script_elements').delete().eq('scene_id', scene.id);
        await supabase.from('shots').delete().eq('scene_id', scene.id);

        const { error } = await supabase.from('scenes').delete().eq('id', scene.id);
        if (error) throw new Error(error.message);
        return { success: true, result: { deleted_scene: scene_number } };
      }

      // -----------------------------------------------------------------------
      // SCRIPT ELEMENTS
      // -----------------------------------------------------------------------
      case 'add_dialogue': {
        const { scene_number, character_name, content, parenthetical, extension } = toolInput as {
          scene_number: number;
          character_name: string;
          content: string;
          parenthetical?: string;
          extension?: string;
        };

        const { data: scene } = await supabase
          .from('scenes')
          .select('id')
          .eq('project_id', projectId)
          .eq('scene_number', scene_number)
          .single();

        if (!scene) throw new Error(`Scene ${scene_number} not found`);

        // Get next sort order
        const { data: existing } = await supabase
          .from('script_elements')
          .select('sort_order')
          .eq('scene_id', scene.id)
          .order('sort_order', { ascending: false })
          .limit(1);
        const nextOrder = (existing?.[0]?.sort_order || 0) + 1;

        const { data, error } = await supabase
          .from('script_elements')
          .insert({
            scene_id: scene.id,
            type: 'dialogue',
            character_name: character_name.toUpperCase(),
            content,
            parenthetical: parenthetical || null,
            extension: extension || null,
            sort_order: nextOrder,
          })
          .select()
          .single();
        if (error) throw new Error(error.message);
        return { success: true, result: { element: data } };
      }

      case 'add_action': {
        const { scene_number, content } = toolInput as {
          scene_number: number;
          content: string;
        };

        const { data: scene } = await supabase
          .from('scenes')
          .select('id')
          .eq('project_id', projectId)
          .eq('scene_number', scene_number)
          .single();

        if (!scene) throw new Error(`Scene ${scene_number} not found`);

        const { data: existing } = await supabase
          .from('script_elements')
          .select('sort_order')
          .eq('scene_id', scene.id)
          .order('sort_order', { ascending: false })
          .limit(1);
        const nextOrder = (existing?.[0]?.sort_order || 0) + 1;

        const { data, error } = await supabase
          .from('script_elements')
          .insert({
            scene_id: scene.id,
            type: 'action',
            content,
            sort_order: nextOrder,
          })
          .select()
          .single();
        if (error) throw new Error(error.message);
        return { success: true, result: { element: data } };
      }

      case 'add_transition': {
        const { scene_number, content } = toolInput as {
          scene_number: number;
          content: string;
        };

        const { data: scene } = await supabase
          .from('scenes')
          .select('id')
          .eq('project_id', projectId)
          .eq('scene_number', scene_number)
          .single();

        if (!scene) throw new Error(`Scene ${scene_number} not found`);

        const { data: existing } = await supabase
          .from('script_elements')
          .select('sort_order')
          .eq('scene_id', scene.id)
          .order('sort_order', { ascending: false })
          .limit(1);
        const nextOrder = (existing?.[0]?.sort_order || 0) + 1;

        const { data, error } = await supabase
          .from('script_elements')
          .insert({
            scene_id: scene.id,
            type: 'transition',
            content: content.toUpperCase(),
            sort_order: nextOrder,
          })
          .select()
          .single();
        if (error) throw new Error(error.message);
        return { success: true, result: { element: data } };
      }

      case 'delete_element': {
        const { scene_number, element_description } = toolInput as {
          scene_number: number;
          element_description: string;
        };

        const { data: scene } = await supabase
          .from('scenes')
          .select('id')
          .eq('project_id', projectId)
          .eq('scene_number', scene_number)
          .single();

        if (!scene) throw new Error(`Scene ${scene_number} not found`);

        // Find matching element
        const { data: elements } = await supabase
          .from('script_elements')
          .select('*')
          .eq('scene_id', scene.id);

        const targetElement = elements?.find(el =>
          el.content?.toLowerCase().includes(element_description.toLowerCase()) ||
          el.character_name?.toLowerCase().includes(element_description.toLowerCase())
        );

        if (!targetElement) throw new Error(`Element not found: ${element_description}`);

        const { error } = await supabase.from('script_elements').delete().eq('id', targetElement.id);
        if (error) throw new Error(error.message);
        return { success: true, result: { deleted_element: targetElement.id } };
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    console.error(`[ScriptWorkshop] Tool error:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(request: Request, { params }: RouteParams) {
  console.log('[ScriptWorkshop API] POST request received');
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { messages, currentScript, scenes } = body as {
      messages: ChatMessage[];
      currentScript?: string;
      scenes?: SceneInfo[];
    };

    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get existing Bible entities from project_assets (the actual Bible system)
    const { data: projectAssets } = await supabase
      .from('project_assets')
      .select('global_assets(name, asset_type)')
      .eq('project_id', projectId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedAssets = (projectAssets || []) as Array<{ global_assets: any }>;
    const existingCharacters = typedAssets
      .filter((pa) => pa.global_assets?.asset_type === 'character')
      .map((pa) => pa.global_assets?.name || '');
    const existingLocations = typedAssets
      .filter((pa) => pa.global_assets?.asset_type === 'location')
      .map((pa) => pa.global_assets?.name || '');

    // Build contextual system prompt
    let contextualSystem = SYSTEM_PROMPT;
    contextualSystem += `\n\n## Contexte du projet\nNom: ${project.name}`;

    if (currentScript?.trim()) {
      contextualSystem += `\n\n## Script actuel\n${currentScript}`;
    }

    if (scenes && scenes.length > 0) {
      contextualSystem += `\n\n## Scènes existantes\n${scenes.map(s => `- Scene ${s.number}: ${s.heading}`).join('\n')}`;
    }

    if (existingCharacters.length > 0) {
      contextualSystem += `\n\n## Personnages dans la Bible\n${existingCharacters.join(', ')}`;
    }

    if (existingLocations.length > 0) {
      contextualSystem += `\n\n## Lieux dans la Bible\n${existingLocations.join(', ')}`;
    }

    // Create Claude wrapper
    const claudeWrapper = createClaudeWrapper({
      userId: session.user.sub,
      supabase,
      operation: 'script-workshop-chat',
    });

    // Prepare messages
    const apiMessages: Anthropic.MessageParam[] = messages.length === 0
      ? [{ role: 'user', content: 'Salut ! Je veux écrire le script de mon projet. Par où on commence ?' }]
      : messages.map(m => ({ role: m.role, content: m.content }));

    // Call Claude with tools
    console.log('[ScriptWorkshop API] Calling Claude with tools...');
    let result = await claudeWrapper.createMessage({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: contextualSystem,
      messages: apiMessages,
      tools: TOOLS,
    });

    // Process tool calls in a loop
    const toolResults: Array<{ tool: string; success: boolean; result?: unknown; error?: string }> = [];
    let currentMessages = [...apiMessages];

    while (result.message.stop_reason === 'tool_use') {
      // Extract tool use blocks
      const toolUseBlocks = result.message.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      console.log('[ScriptWorkshop API] Tool calls:', toolUseBlocks.map(t => t.name));

      // Execute each tool
      const toolResultContents: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const execResult = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          projectId,
          session.user.sub,
          supabase
        );
        toolResults.push({
          tool: toolUse.name,
          success: execResult.success,
          result: execResult.result,
          error: execResult.error,
        });
        toolResultContents.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(execResult),
        });
      }

      // Continue conversation with tool results
      currentMessages = [
        ...currentMessages,
        { role: 'assistant' as const, content: result.message.content },
        { role: 'user' as const, content: toolResultContents },
      ];

      result = await claudeWrapper.createMessage({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: contextualSystem,
        messages: currentMessages,
        tools: TOOLS,
      });
    }

    // Extract final text response
    const responseText = extractTextContent(result.message);
    console.log('[ScriptWorkshop API] Final response:', responseText.substring(0, 200));

    // Save chat to database
    const timestampedMessages: ChatMessage[] = messages.length === 0
      ? [{
          role: 'user',
          content: 'Salut ! Je veux écrire le script de mon projet. Par où on commence ?',
          timestamp: new Date().toISOString(),
        }]
      : messages.map(m => ({ ...m, timestamp: m.timestamp || new Date().toISOString() }));

    timestampedMessages.push({
      role: 'assistant',
      content: responseText,
      timestamp: new Date().toISOString(),
    });

    await supabase
      .from('projects')
      .update({ script_workshop_messages: timestampedMessages })
      .eq('id', projectId);

    return NextResponse.json({
      success: true,
      message: responseText,
      toolResults, // What tools were executed
    });
  } catch (error) {
    console.error('[ScriptWorkshop API] Error:', error);

    if (isCreditError(error)) {
      return NextResponse.json(
        { error: formatCreditError(error), code: error.code },
        { status: 402 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
