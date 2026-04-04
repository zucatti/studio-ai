import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

interface ScriptAction {
  action: 'add' | 'modify' | 'delete';
  type: 'scene' | 'dialogue' | 'action' | 'transition' | 'full' | 'element';
  content?: string;
  targetScene?: number | null;
  targetDescription?: string;
  position?: 'start' | 'end';
}

interface BibleAction {
  action: 'add';
  type: 'character' | 'location' | 'prop';
  name: string;
  description?: string;
  imagePrompt?: string;
}

// Parse Fountain content into structured elements
function parseFountainContent(content: string): {
  sceneHeading?: { int_ext: string; location: string; time_of_day: string; description?: string };
  elements: Array<{
    type: 'action' | 'dialogue' | 'transition' | 'note';
    content: string;
    character_name?: string;
    parenthetical?: string;
    extension?: string;
  }>;
} {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l);
  const elements: Array<{
    type: 'action' | 'dialogue' | 'transition' | 'note';
    content: string;
    character_name?: string;
    parenthetical?: string;
    extension?: string;
  }> = [];
  let sceneHeading: { int_ext: string; location: string; time_of_day: string; description?: string } | undefined;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Scene heading: INT./EXT. LOCATION - TIME
    const sceneMatch = line.match(/^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)\s*(.+?)\s*-\s*(.+)$/i);
    if (sceneMatch) {
      sceneHeading = {
        int_ext: sceneMatch[1].toUpperCase().replace('.', ''),
        location: sceneMatch[2].trim(),
        time_of_day: sceneMatch[3].trim().toUpperCase(),
      };
      i++;
      if (i < lines.length && !lines[i].match(/^[A-Z\s]{2,}$/) && lines[i].length < 200) {
        sceneHeading.description = lines[i];
        i++;
      }
      continue;
    }

    // Transition
    if (line.match(/^(CUT TO|FADE TO|FADE OUT|FADE IN|DISSOLVE TO|SMASH CUT|MATCH CUT|JUMP CUT)[:.]?$/i) ||
        line.match(/^[A-Z\s]+:$/)) {
      elements.push({
        type: 'transition',
        content: line.replace(/:$/, ''),
      });
      i++;
      continue;
    }

    // Character name for dialogue
    const charMatch = line.match(/^([A-Z][A-Z\s']+)(?:\s*\(([^)]+)\))?$/);
    if (charMatch && i + 1 < lines.length) {
      const characterName = charMatch[1].trim();
      const extension = charMatch[2]?.trim();
      i++;

      let parenthetical: string | undefined;
      if (lines[i] && lines[i].match(/^\([^)]+\)$/)) {
        parenthetical = lines[i].replace(/^\(|\)$/g, '');
        i++;
      }

      const dialogueLines: string[] = [];
      while (i < lines.length && !lines[i].match(/^[A-Z][A-Z\s']+$/) && !lines[i].match(/^(INT\.|EXT\.)/i)) {
        if (lines[i].match(/^\([^)]+\)$/)) {
          dialogueLines.push(lines[i]);
        } else if (lines[i].match(/^[A-Z\s]+:$/)) {
          break;
        } else {
          dialogueLines.push(lines[i]);
        }
        i++;
        if (dialogueLines.length > 10) break;
      }

      if (dialogueLines.length > 0) {
        elements.push({
          type: 'dialogue',
          content: dialogueLines.join('\n'),
          character_name: characterName,
          extension,
          parenthetical,
        });
        continue;
      }
    }

    // Note
    const noteMatch = line.match(/^\[\[(.+)\]\]$/);
    if (noteMatch) {
      elements.push({
        type: 'note',
        content: noteMatch[1],
      });
      i++;
      continue;
    }

    // Default: action
    const actionLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const nextLine = lines[i];
      if (nextLine.match(/^(INT\.|EXT\.)/i) ||
          nextLine.match(/^[A-Z][A-Z\s']+$/) ||
          nextLine.match(/^\[\[/) ||
          nextLine.match(/^[A-Z\s]+:$/)) {
        break;
      }
      actionLines.push(nextLine);
      i++;
      if (actionLines.length > 5) break;
    }

    elements.push({
      type: 'action',
      content: actionLines.join(' '),
    });
  }

  return { sceneHeading, elements };
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { scriptAction, bibleAction } = body as {
      scriptAction?: ScriptAction;
      bibleAction?: BibleAction;
    };

    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const results: {
      scriptResult?: object;
      bibleResult?: object;
    } = {};

    // Handle Bible action
    if (bibleAction) {
      const { type, name, description, imagePrompt } = bibleAction;
      console.log('[Apply] Bible action:', { type, name, description, projectId });

      if (type === 'character') {
        const { data, error } = await supabase
          .from('characters')
          .insert({
            project_id: projectId,
            name,
            description: description || '',
            visual_description: imagePrompt || '', // imagePrompt goes to visual_description
          })
          .select()
          .single();

        if (error) {
          console.error('[Apply] Error adding character:', error);
          return NextResponse.json(
            { error: `Erreur ajout personnage: ${error.message}` },
            { status: 500 }
          );
        }
        console.log('[Apply] Character added:', data);
        results.bibleResult = { type: 'character', data };
      } else if (type === 'location') {
        const { data, error } = await supabase
          .from('locations')
          .insert({
            project_id: projectId,
            name,
            description: description || '',
          })
          .select()
          .single();

        if (error) {
          console.error('[Apply] Error adding location:', error);
          return NextResponse.json(
            { error: `Erreur ajout lieu: ${error.message}` },
            { status: 500 }
          );
        }
        console.log('[Apply] Location added:', data);
        results.bibleResult = { type: 'location', data };
      } else if (type === 'prop') {
        const { data, error } = await supabase
          .from('props')
          .insert({
            project_id: projectId,
            name,
            description: description || '',
          })
          .select()
          .single();

        if (error) {
          console.error('[Apply] Error adding prop:', error);
          return NextResponse.json(
            { error: `Erreur ajout accessoire: ${error.message}` },
            { status: 500 }
          );
        }
        console.log('[Apply] Prop added:', data);
        results.bibleResult = { type: 'prop', data };
      }
    }

    // Handle Script action
    if (scriptAction) {
      const { action, type, content, targetScene, targetDescription, position } = scriptAction;

      if (action === 'add') {
        // ADD: Create new content
        let targetSceneId: string | null = null;
        let newScene: object | null = null;
        const newElements: object[] = [];

        const parsed = content ? parseFountainContent(content) : { elements: [] };

        // Create new scene if needed
        if (parsed.sceneHeading || type === 'scene' || type === 'full' || !targetScene) {
          const { data: existingScenes } = await supabase
            .from('scenes')
            .select('scene_number')
            .eq('project_id', projectId)
            .order('scene_number', { ascending: false })
            .limit(1);

          const nextNumber = targetScene || (existingScenes?.[0]?.scene_number || 0) + 1;

          const sceneData = parsed.sceneHeading || {
            int_ext: 'INT',
            location: 'LIEU',
            time_of_day: 'JOUR',
          };

          const { data: createdScene, error: sceneError } = await supabase
            .from('scenes')
            .insert({
              project_id: projectId,
              scene_number: nextNumber,
              int_ext: sceneData.int_ext,
              location: sceneData.location,
              time_of_day: sceneData.time_of_day,
              description: sceneData.description || null,
            })
            .select()
            .single();

          if (!sceneError && createdScene) {
            targetSceneId = createdScene.id;
            newScene = createdScene;
          }
        } else if (targetScene) {
          const { data: scene } = await supabase
            .from('scenes')
            .select('id')
            .eq('project_id', projectId)
            .eq('scene_number', targetScene)
            .single();

          if (scene) {
            targetSceneId = scene.id;
          }
        }

        // Insert elements
        if (targetSceneId && parsed.elements.length > 0) {
          const { data: existingElements } = await supabase
            .from('script_elements')
            .select('sort_order')
            .eq('scene_id', targetSceneId)
            .order('sort_order', { ascending: position === 'start' })
            .limit(1);

          let sortOrder = position === 'start'
            ? 0
            : (existingElements?.[0]?.sort_order || 0) + 1;

          for (const element of parsed.elements) {
            const { data: createdElement, error: elementError } = await supabase
              .from('script_elements')
              .insert({
                scene_id: targetSceneId,
                type: element.type,
                content: element.content,
                character_name: element.character_name || null,
                parenthetical: element.parenthetical || null,
                extension: element.extension || null,
                sort_order: sortOrder++,
              })
              .select()
              .single();

            if (!elementError && createdElement) {
              newElements.push(createdElement);
            }
          }
        }

        results.scriptResult = { action: 'add', newScene, newElements, targetSceneId };

      } else if (action === 'modify') {
        // MODIFY: Update existing content
        if (!targetScene || !targetDescription) {
          return NextResponse.json({
            error: 'targetScene and targetDescription required for modify'
          }, { status: 400 });
        }

        // Find the scene
        const { data: scene } = await supabase
          .from('scenes')
          .select('id')
          .eq('project_id', projectId)
          .eq('scene_number', targetScene)
          .single();

        if (!scene) {
          return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
        }

        // Get all elements in the scene
        const { data: elements } = await supabase
          .from('script_elements')
          .select('*')
          .eq('scene_id', scene.id)
          .order('sort_order');

        // Find the element that matches the description (simple text match)
        const targetElement = elements?.find(el =>
          el.content?.toLowerCase().includes(targetDescription.toLowerCase()) ||
          el.character_name?.toLowerCase().includes(targetDescription.toLowerCase())
        );

        if (targetElement && content) {
          const parsed = parseFountainContent(content);
          const newContent = parsed.elements[0];

          if (newContent) {
            const { data: updated } = await supabase
              .from('script_elements')
              .update({
                type: newContent.type,
                content: newContent.content,
                character_name: newContent.character_name || null,
                parenthetical: newContent.parenthetical || null,
                extension: newContent.extension || null,
              })
              .eq('id', targetElement.id)
              .select()
              .single();

            results.scriptResult = { action: 'modify', updated };
          }
        } else {
          results.scriptResult = { action: 'modify', error: 'Element not found' };
        }

      } else if (action === 'delete') {
        // DELETE: Remove content
        if (!targetScene) {
          return NextResponse.json({
            error: 'targetScene required for delete'
          }, { status: 400 });
        }

        // Find the scene
        const { data: scene } = await supabase
          .from('scenes')
          .select('id')
          .eq('project_id', projectId)
          .eq('scene_number', targetScene)
          .single();

        if (!scene) {
          return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
        }

        if (!targetDescription) {
          // Delete entire scene
          await supabase
            .from('script_elements')
            .delete()
            .eq('scene_id', scene.id);

          await supabase
            .from('scenes')
            .delete()
            .eq('id', scene.id);

          results.scriptResult = { action: 'delete', deletedScene: targetScene };
        } else {
          // Delete specific element
          const { data: elements } = await supabase
            .from('script_elements')
            .select('*')
            .eq('scene_id', scene.id);

          const targetElement = elements?.find(el =>
            el.content?.toLowerCase().includes(targetDescription.toLowerCase()) ||
            el.character_name?.toLowerCase().includes(targetDescription.toLowerCase())
          );

          if (targetElement) {
            await supabase
              .from('script_elements')
              .delete()
              .eq('id', targetElement.id);

            results.scriptResult = { action: 'delete', deletedElement: targetElement.id };
          } else {
            results.scriptResult = { action: 'delete', error: 'Element not found' };
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error('Error applying action:', error);
    return NextResponse.json(
      { error: 'Failed to apply action' },
      { status: 500 }
    );
  }
}
