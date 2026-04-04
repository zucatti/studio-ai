import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

interface ScriptSuggestion {
  type: 'scene' | 'dialogue' | 'action' | 'transition' | 'full';
  content: string;
  targetScene?: number | null;
  position?: 'start' | 'end' | 'replace';
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
      // Next line might be scene description (if it's action-like and short)
      if (i < lines.length && !lines[i].match(/^[A-Z\s]{2,}$/) && lines[i].length < 200) {
        sceneHeading.description = lines[i];
        i++;
      }
      continue;
    }

    // Transition: ends with : or is a known transition
    if (line.match(/^(CUT TO|FADE TO|FADE OUT|FADE IN|DISSOLVE TO|SMASH CUT|MATCH CUT|JUMP CUT)[:.]?$/i) ||
        line.match(/^[A-Z\s]+:$/)) {
      elements.push({
        type: 'transition',
        content: line.replace(/:$/, ''),
      });
      i++;
      continue;
    }

    // Character name (all caps, possibly with extension)
    const charMatch = line.match(/^([A-Z][A-Z\s]+)(?:\s*\(([^)]+)\))?$/);
    if (charMatch && i + 1 < lines.length) {
      const characterName = charMatch[1].trim();
      const extension = charMatch[2]?.trim();
      i++;

      // Check for parenthetical
      let parenthetical: string | undefined;
      if (lines[i] && lines[i].match(/^\([^)]+\)$/)) {
        parenthetical = lines[i].replace(/^\(|\)$/g, '');
        i++;
      }

      // Dialogue content
      const dialogueLines: string[] = [];
      while (i < lines.length && !lines[i].match(/^[A-Z][A-Z\s]+$/) && !lines[i].match(/^(INT\.|EXT\.)/i)) {
        if (lines[i].match(/^\([^)]+\)$/)) {
          // Inline parenthetical - add to dialogue
          dialogueLines.push(lines[i]);
        } else if (lines[i].match(/^[A-Z\s]+:$/)) {
          // Transition - stop
          break;
        } else {
          dialogueLines.push(lines[i]);
        }
        i++;
        // Only take a reasonable amount of dialogue
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

    // Note: [[text]]
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
    // Collect consecutive action lines
    while (i < lines.length) {
      const nextLine = lines[i];
      // Stop if it looks like a new element type
      if (nextLine.match(/^(INT\.|EXT\.)/i) ||
          nextLine.match(/^[A-Z][A-Z\s]+$/) ||
          nextLine.match(/^\[\[/) ||
          nextLine.match(/^[A-Z\s]+:$/)) {
        break;
      }
      actionLines.push(nextLine);
      i++;
      if (actionLines.length > 5) break; // Limit action paragraphs
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
    const { suggestion } = await request.json() as { suggestion: ScriptSuggestion };

    if (!suggestion || !suggestion.content) {
      return NextResponse.json({ error: 'No suggestion provided' }, { status: 400 });
    }

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

    // Parse the suggestion content
    const parsed = parseFountainContent(suggestion.content);

    let targetSceneId: string | null = null;
    let newScene: object | null = null;
    const newElements: object[] = [];

    // If we have a scene heading or type is 'scene' or 'full', create a new scene
    if (parsed.sceneHeading || suggestion.type === 'scene' || suggestion.type === 'full') {
      // Get next scene number
      const { data: existingScenes } = await supabase
        .from('scenes')
        .select('scene_number')
        .eq('project_id', projectId)
        .order('scene_number', { ascending: false })
        .limit(1);

      const nextNumber = (existingScenes?.[0]?.scene_number || 0) + 1;

      const sceneData = parsed.sceneHeading || {
        int_ext: 'INT',
        location: 'LIEU',
        time_of_day: 'JOUR',
      };

      const { data: createdScene, error: sceneError } = await supabase
        .from('scenes')
        .insert({
          project_id: projectId,
          scene_number: suggestion.targetScene || nextNumber,
          int_ext: sceneData.int_ext,
          location: sceneData.location,
          time_of_day: sceneData.time_of_day,
          description: sceneData.description || null,
        })
        .select()
        .single();

      if (sceneError) {
        throw sceneError;
      }

      targetSceneId = createdScene.id;
      newScene = createdScene;
    } else if (suggestion.targetScene) {
      // Find the target scene
      const { data: scene } = await supabase
        .from('scenes')
        .select('id')
        .eq('project_id', projectId)
        .eq('scene_number', suggestion.targetScene)
        .single();

      if (scene) {
        targetSceneId = scene.id;
      }
    }

    // If we still don't have a target scene, use the first/last scene or create one
    if (!targetSceneId) {
      const { data: scenes } = await supabase
        .from('scenes')
        .select('id, scene_number')
        .eq('project_id', projectId)
        .order('scene_number', { ascending: suggestion.position === 'start' });

      if (scenes && scenes.length > 0) {
        targetSceneId = scenes[0].id;
      } else {
        // Create a default scene
        const { data: createdScene } = await supabase
          .from('scenes')
          .insert({
            project_id: projectId,
            scene_number: 1,
            int_ext: 'INT',
            location: 'LIEU',
            time_of_day: 'JOUR',
          })
          .select()
          .single();

        if (createdScene) {
          targetSceneId = createdScene.id;
          newScene = createdScene;
        }
      }
    }

    // Insert elements
    if (targetSceneId && parsed.elements.length > 0) {
      // Get current max sort order
      const { data: existingElements } = await supabase
        .from('script_elements')
        .select('sort_order')
        .eq('scene_id', targetSceneId)
        .order('sort_order', { ascending: false })
        .limit(1);

      let sortOrder = (existingElements?.[0]?.sort_order || 0) + 1;

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

    return NextResponse.json({
      success: true,
      newScene,
      newElements,
      targetSceneId,
    });
  } catch (error) {
    console.error('Error applying suggestion:', error);
    return NextResponse.json(
      { error: 'Failed to apply suggestion' },
      { status: 500 }
    );
  }
}
