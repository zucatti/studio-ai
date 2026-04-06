import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { enqueueQuickShotGen } from '@/lib/bullmq';

interface RouteParams {
  params: Promise<{ projectId: string; frameId: string }>;
}

// Storyboard style prefix - black and white pencil sketch
const STORYBOARD_STYLE = `black and white graphite pencil sketch storyboard frame, hand-drawn on white paper, monochrome grayscale drawing, rough pencil strokes with hatching shading, professional film production concept art, single cinematic panel, no color, no text, no labels, no annotations, no scene numbers, no panel numbers, no writing, clean image only`;

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, frameId } = await params;
    const body = await request.json().catch(() => ({}));
    const customPrompt = body.customPrompt as string | undefined;

    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get frame
    const { data: frame, error: frameError } = await supabase
      .from('storyboard_frames')
      .select('*')
      .eq('id', frameId)
      .eq('project_id', projectId)
      .single();

    if (frameError || !frame) {
      return Response.json({ error: 'Frame not found' }, { status: 404 });
    }

    // Build prompt
    const basePrompt = customPrompt || frame.description;
    if (!basePrompt) {
      return Response.json({ error: 'No description to generate from' }, { status: 400 });
    }

    // Expand mentions in the prompt
    const expandedPrompt = await expandMentions(supabase, projectId, basePrompt);

    // Update frame status to generating
    await supabase
      .from('storyboard_frames')
      .update({
        generation_status: 'generating',
        sketch_prompt: expandedPrompt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', frameId);

    // Create job record in Supabase (let DB generate ID)
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: session.user.sub,
        asset_type: 'storyboard-frame',
        asset_name: `Frame ${frame.sort_order + 1}`,
        job_type: 'image',
        job_subtype: 'storyboard-sketch',
        status: 'queued',
        progress: 0,
        message: 'En file d\'attente...',
        input_data: {
          projectId,
          frameId,
          storyboardFrameId: frameId,
          prompt: expandedPrompt,
        },
        queued_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[StoryboardGenerate] Failed to create job:', jobError);
      return Response.json({ error: 'Failed to create job' }, { status: 500 });
    }

    console.log(`[StoryboardGenerate] Job ${job.id} created`);

    // Enqueue the job
    try {
      await enqueueQuickShotGen({
        userId: session.user.sub,
        jobId: job.id,
        createdAt: new Date().toISOString(),
        projectId,
        storyboardFrameId: frameId,
        prompt: expandedPrompt,
        aspectRatio: '16:9',
        resolution: '1K',
        model: 'fal-ai/nano-banana-2',
        referenceImages: [],
        stylePrefix: STORYBOARD_STYLE,
      });
      console.log(`[StoryboardGenerate] Job ${job.id} enqueued`);
    } catch (queueError) {
      console.error('[StoryboardGenerate] Failed to enqueue:', queueError);

      await supabase
        .from('generation_jobs')
        .update({
          status: 'failed',
          error_message: queueError instanceof Error ? queueError.message : 'Failed to enqueue',
        })
        .eq('id', job.id);

      await supabase
        .from('storyboard_frames')
        .update({ generation_status: 'failed', generation_error: 'Failed to enqueue' })
        .eq('id', frameId);

      return Response.json({ error: 'Failed to enqueue job' }, { status: 500 });
    }

    return Response.json({
      jobId: job.id,
      status: 'queued',
    });
  } catch (error) {
    console.error('[StoryboardGenerate] Error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function expandMentions(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  projectId: string,
  text: string
): Promise<string> {
  let expanded = text;

  const mentionRegex = /[@#!]([A-Za-zÀ-ÿ0-9_-]+)/g;
  const mentions = [...text.matchAll(mentionRegex)];

  if (mentions.length === 0) return text;

  const { data: projectAssets } = await supabase
    .from('project_assets')
    .select(`global_assets(id, name, asset_type, data)`)
    .eq('project_id', projectId);

  const { data: genericAssets } = await supabase
    .from('project_generic_assets')
    .select('*')
    .eq('project_id', projectId);

  const assetMap = new Map<string, string>();

  for (const pa of projectAssets || []) {
    const asset = pa.global_assets as unknown as { name: string; data: Record<string, unknown> | null } | null;
    if (!asset) continue;
    const refName = asset.name.replace(/\s+/g, '').toUpperCase();
    const visualDesc = (asset.data?.visual_description as string) || asset.name;
    assetMap.set(refName, visualDesc);
  }

  for (const ga of genericAssets || []) {
    if (!ga.name_override) continue;
    const refName = ga.name_override.replace(/\s+/g, '').toUpperCase();
    const visualDesc = (ga.local_overrides as Record<string, unknown>)?.visual_description as string || ga.name_override;
    assetMap.set(refName, visualDesc);
  }

  for (const match of mentions) {
    const fullMatch = match[0];
    const name = match[1].toUpperCase();
    const desc = assetMap.get(name);
    if (desc) {
      expanded = expanded.replace(fullMatch, desc);
    }
  }

  return expanded;
}
