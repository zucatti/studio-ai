import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { logClaudeUsage } from '@/lib/ai/log-api-usage';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// Suggest durations for all shots in a project
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
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

    // Get all shots with their dialogues and actions
    const { data: shots } = await supabase
      .from('shots')
      .select(`
        id,
        shot_number,
        description,
        shot_type,
        camera_movement,
        scene_id,
        dialogues(character_name, content),
        actions(content)
      `)
      .eq('scene_id', supabase.from('scenes').select('id').eq('project_id', projectId))
      .order('sort_order');

    // Actually get shots through scenes
    const { data: scenes } = await supabase
      .from('scenes')
      .select('id')
      .eq('project_id', projectId);

    if (!scenes || scenes.length === 0) {
      return NextResponse.json({ error: 'No scenes found' }, { status: 404 });
    }

    const sceneIds = scenes.map(s => s.id);

    const { data: allShots } = await supabase
      .from('shots')
      .select(`
        id,
        shot_number,
        description,
        shot_type,
        camera_movement,
        scene_id
      `)
      .in('scene_id', sceneIds)
      .order('sort_order');

    if (!allShots || allShots.length === 0) {
      return NextResponse.json({ error: 'No shots found' }, { status: 404 });
    }

    // Get dialogues and actions for all shots
    const shotIds = allShots.map(s => s.id);

    const [dialoguesRes, actionsRes] = await Promise.all([
      supabase.from('dialogues').select('*').in('shot_id', shotIds),
      supabase.from('actions').select('*').in('shot_id', shotIds),
    ]);

    // Build shot data with dialogues and actions
    const shotsWithData = allShots.map(shot => ({
      ...shot,
      dialogues: (dialoguesRes.data || []).filter(d => d.shot_id === shot.id),
      actions: (actionsRes.data || []).filter(a => a.shot_id === shot.id),
    }));

    // Use Claude to suggest durations
    const suggestions = await suggestDurationsWithClaude(shotsWithData);

    // Update shots with suggested durations
    for (const suggestion of suggestions) {
      await supabase
        .from('shots')
        .update({ suggested_duration: suggestion.duration })
        .eq('id', suggestion.shotId);
    }

    return NextResponse.json({
      success: true,
      suggestions,
    });
  } catch (error) {
    console.error('Error suggesting durations:', error);
    return NextResponse.json(
      { error: 'Failed to suggest durations: ' + String(error) },
      { status: 500 }
    );
  }
}

async function suggestDurationsWithClaude(
  shots: any[]
): Promise<{ shotId: string; duration: number; reasoning: string }[]> {
  if (!process.env.AI_CLAUDE_KEY) {
    // Fallback: basic calculation
    return shots.map(shot => ({
      shotId: shot.id,
      duration: calculateBasicDuration(shot),
      reasoning: 'Basic calculation based on content',
    }));
  }

  const anthropic = new Anthropic({
    apiKey: process.env.AI_CLAUDE_KEY,
  });

  const shotsDescription = shots.map((shot, idx) => `
SHOT ${idx + 1} (ID: ${shot.id}):
- Description: ${shot.description}
- Type: ${shot.shot_type}
- Camera movement: ${shot.camera_movement}
- Dialogues: ${shot.dialogues.map((d: any) => `${d.character_name}: "${d.content}"`).join('; ') || 'None'}
- Actions: ${shot.actions.map((a: any) => a.content).join('; ') || 'None'}
`).join('\n');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `Analyze these shots and suggest optimal durations in seconds for video generation.

Consider:
- Dialogue length (average speaking pace: 150 words/minute)
- Action complexity
- Camera movement (tracking/crane need more time)
- Emotional beats (dramatic moments need breathing room)
- Pacing (variety between shots)

Constraints:
- Minimum: 2 seconds
- Maximum: 10 seconds (API limit)
- Prefer 3-6 seconds for most shots

${shotsDescription}

Return ONLY a JSON array:
[
  {"shotId": "uuid", "duration": 4.5, "reasoning": "brief explanation"},
  ...
]`,
      },
    ],
  });

  // Log API usage
  logClaudeUsage({
    operation: 'suggest-durations',
    model: 'claude-sonnet-4-20250514',
    inputTokens: message.usage?.input_tokens || 0,
    outputTokens: message.usage?.output_tokens || 0,
  }).catch(console.error);

  const content = message.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type');
  }

  try {
    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array found');
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    // Fallback
    return shots.map(shot => ({
      shotId: shot.id,
      duration: calculateBasicDuration(shot),
      reasoning: 'Fallback calculation',
    }));
  }
}

function calculateBasicDuration(shot: any): number {
  let duration = 3; // Base duration

  // Add time for dialogues (rough estimate: 1 second per 10 characters)
  const dialogueLength = shot.dialogues.reduce(
    (acc: number, d: any) => acc + (d.content?.length || 0),
    0
  );
  duration += dialogueLength / 30; // ~30 chars per second speech

  // Add time for actions
  duration += shot.actions.length * 0.5;

  // Camera movement adjustments
  if (['tracking', 'crane', 'dolly_in', 'dolly_out'].includes(shot.camera_movement)) {
    duration += 1;
  }

  // Clamp between 2 and 10 seconds
  return Math.min(10, Math.max(2, Math.round(duration * 10) / 10));
}
