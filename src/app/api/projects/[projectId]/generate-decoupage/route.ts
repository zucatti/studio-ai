import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { logClaudeUsage } from '@/lib/ai/log-api-usage';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// POST /api/projects/[projectId]/generate-decoupage - Generate shots for a scene
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { sceneId } = body;

    if (!sceneId) {
      return NextResponse.json({ error: 'sceneId is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const anthropic = new Anthropic({
      apiKey: process.env.AI_CLAUDE_KEY,
    });

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

    // Get scene with script elements
    const { data: scene } = await supabase
      .from('scenes')
      .select('*')
      .eq('id', sceneId)
      .eq('project_id', projectId)
      .single();

    if (!scene) {
      return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
    }

    // Get script elements for this scene
    const { data: scriptElements } = await supabase
      .from('script_elements')
      .select('*')
      .eq('scene_id', sceneId)
      .order('sort_order', { ascending: true });

    // Get characters for reference
    const { data: characters } = await supabase
      .from('characters')
      .select('name, visual_description')
      .eq('project_id', projectId);

    // Build scene context
    const sceneContext = `
SCENE ${scene.scene_number} - ${scene.int_ext}. ${scene.location} - ${scene.time_of_day}
${scene.description || ''}

Contenu du script:
${(scriptElements || []).map(el => {
  if (el.type === 'action') return el.content;
  if (el.type === 'dialogue') return `${el.character_name}: ${el.content}`;
  if (el.type === 'transition') return `[${el.content}]`;
  return '';
}).filter(Boolean).join('\n')}

Personnages connus:
${(characters || []).map(c => `- ${c.name}: ${c.visual_description}`).join('\n')}
`;

    // Use Claude to generate shot breakdown
    const systemPrompt = `Tu es un directeur de la photographie experimente.
Tu dois decomposer une scene de scenario en plans techniques pour un storyboard.

Pour chaque plan, fournis:
- description: Description visuelle du plan (ce qu'on voit)
- shot_type: Type de plan (wide, medium, close_up, extreme_close_up, over_shoulder, pov)
- camera_angle: Angle de camera (eye_level, low_angle, high_angle, dutch_angle, birds_eye, worms_eye)
- camera_movement: Mouvement (static, slow_dolly_in, slow_dolly_out, orbit_180, tracking_side, etc.)

Principes de decoupage:
- Alterner les valeurs de plan pour le rythme
- Utiliser des gros plans pour les emotions fortes
- Les dialogues: champ/contre-champ ou plan a deux
- Les actions: plans larges puis moyens
- Penser a la continuite visuelle

Reponds UNIQUEMENT avec un JSON valide:
{
  "shots": [
    {
      "description": "...",
      "shot_type": "wide|medium|close_up|etc",
      "camera_angle": "eye_level|low_angle|etc",
      "camera_movement": "static|slow_dolly_in|etc"
    }
  ]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Decompose cette scene en plans techniques:\n\n${sceneContext}`,
        },
      ],
    });

    // Log API usage
    logClaudeUsage({
      operation: 'generate-decoupage',
      model: 'claude-sonnet-4-20250514',
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      projectId,
    }).catch(console.error);

    // Extract JSON from response
    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
    }

    let parsedShots;
    try {
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedShots = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    if (!parsedShots.shots || !Array.isArray(parsedShots.shots)) {
      return NextResponse.json({ error: 'Invalid response format' }, { status: 500 });
    }

    // Get max shot number for this scene
    const { data: existingShots } = await supabase
      .from('shots')
      .select('shot_number')
      .eq('scene_id', sceneId)
      .order('shot_number', { ascending: false })
      .limit(1);

    let nextShotNumber = (existingShots?.[0]?.shot_number || 0) + 1;

    // Insert new shots
    const shotsToInsert = parsedShots.shots.map((shot: Record<string, unknown>, index: number) => ({
      scene_id: sceneId,
      shot_number: nextShotNumber + index,
      description: shot.description || '',
      shot_type: shot.shot_type || 'medium',
      camera_angle: shot.camera_angle || 'eye_level',
      camera_movement: shot.camera_movement || 'static',
      sort_order: nextShotNumber + index,
    }));

    const { data: insertedShots, error: insertError } = await supabase
      .from('shots')
      .insert(shotsToInsert)
      .select();

    if (insertError) {
      console.error('Error inserting shots:', insertError);
      return NextResponse.json({ error: 'Failed to save shots' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: insertedShots?.length || 0,
      shots: insertedShots,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
