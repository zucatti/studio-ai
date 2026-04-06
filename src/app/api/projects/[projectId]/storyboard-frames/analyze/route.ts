import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createClaudeWrapper, parseJsonResponse } from '@/lib/ai/claude-wrapper';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

interface ProposedFrame {
  scene_number?: number;
  description: string;
}

// POST /api/projects/[projectId]/storyboard-frames/analyze
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const supabase = createServerSupabaseClient();

    console.log('[StoryboardAnalyze] projectId:', projectId, 'userId:', session.user.sub);

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    console.log('[StoryboardAnalyze] project:', project, 'error:', projectError);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get scenes with script elements
    const { data: scenes, error: scenesError } = await supabase
      .from('scenes')
      .select(`
        id,
        scene_number,
        int_ext,
        location,
        time_of_day,
        script_elements(id, type, content, character_name, sort_order)
      `)
      .eq('project_id', projectId)
      .order('scene_number', { ascending: true });

    if (scenesError) {
      console.error('[StoryboardAnalyze] Error fetching scenes:', scenesError);
      return NextResponse.json({ error: scenesError.message }, { status: 500 });
    }

    if (!scenes || scenes.length === 0) {
      return NextResponse.json({ error: 'No scenes found in project' }, { status: 400 });
    }

    // Get project assets for context
    const { data: projectAssets } = await supabase
      .from('project_assets')
      .select(`
        global_assets(name, asset_type, data)
      `)
      .eq('project_id', projectId);

    // Build script context
    let scriptContext = '';
    for (const scene of scenes) {
      const heading = `SCENE ${scene.scene_number} - ${scene.int_ext}. ${scene.location} - ${scene.time_of_day}`;
      scriptContext += `\n${heading}\n`;

      const elements = (scene.script_elements || []).sort(
        (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
      );

      for (const elem of elements) {
        const el = elem as { type: string; content: string; character_name?: string };
        if (el.type === 'action') {
          scriptContext += `${el.content}\n`;
        } else if (el.type === 'dialogue') {
          scriptContext += `\n${el.character_name?.toUpperCase() || 'CHARACTER'}\n${el.content}\n`;
        } else if (el.type === 'transition') {
          scriptContext += `\n${el.content}\n`;
        }
      }
    }

    // Build character context
    let characterContext = '';
    for (const pa of projectAssets || []) {
      const asset = (pa.global_assets as unknown) as {
        name: string;
        asset_type: string;
        data: Record<string, unknown> | null;
      } | null;
      if (!asset) continue;
      if (asset.asset_type === 'character') {
        characterContext += `- ${asset.name}: ${(asset.data?.visual_description as string) || 'No description'}\n`;
      }
    }

    // Get figurants
    const { data: figurants } = await supabase
      .from('project_generic_assets')
      .select('name_override, local_overrides')
      .eq('project_id', projectId);

    for (const fig of figurants || []) {
      if (fig.name_override) {
        const visualDesc = (fig.local_overrides as Record<string, unknown>)?.visual_description as string;
        characterContext += `- ${fig.name_override}: ${visualDesc || 'No description'}\n`;
      }
    }

    // Call Claude to analyze
    const claude = createClaudeWrapper({
      userId: session.user.sub,
      projectId,
      supabase,
      operation: 'storyboard_analyze',
    });

    const systemPrompt = `You are a professional storyboard artist analyzing a screenplay to identify key visual moments.

Your task is to read the script and propose storyboard frames - one sketch per significant visual moment.

Guidelines:
- Focus on ACTION and VISUAL moments, not dialogue
- Identify key establishing shots, character introductions, important actions
- Each frame should be a single visual moment that can be sketched
- Write descriptions in present tense, visual language
- Include character appearances, camera suggestions, and mood
- Don't over-segment - 3-8 frames per scene is typical
- Reference characters by their names (use @Name format for mentions)

Characters in this project:
${characterContext || 'No characters defined yet.'}

Output format: JSON array of proposed frames:
{
  "frames": [
    {
      "scene_number": 1,
      "description": "Visual description for the storyboard artist"
    }
  ]
}

IMPORTANT: Use scene_number (integer) to reference scenes, NOT UUIDs.`;

    const userMessage = `Analyze this screenplay and propose storyboard frames:

${scriptContext}

Return a JSON object with a "frames" array containing the proposed storyboard frames.`;

    const result = await claude.createMessage({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    // Parse Claude's response
    const parsed = parseJsonResponse<{ frames: ProposedFrame[] }>(result.message);

    // Map scene_number to scene_id
    const validatedFrames = (parsed.frames || []).map((frame, index) => {
      let sceneId: string | null = null;

      if (frame.scene_number) {
        const matchingScene = scenes.find((s) => s.scene_number === frame.scene_number);
        if (matchingScene) {
          sceneId = matchingScene.id;
        }
      }

      return {
        scene_id: sceneId,
        script_element_id: null,
        description: frame.description,
        sort_order: index,
      };
    });

    return NextResponse.json({
      frames: validatedFrames,
      cost: result.cost,
    });
  } catch (error) {
    console.error('[StoryboardAnalyze] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
