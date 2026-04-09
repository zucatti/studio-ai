import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { enqueueVideoGen } from '@/lib/bullmq/queues';

// Camera movement mappings for Kling
const MOVEMENT_PROMPTS: Record<string, string> = {
  orbit_left: 'camera orbits slowly to the left around the subject',
  orbit_right: 'camera orbits slowly to the right around the subject',
  arc_up: 'camera arcs upward while maintaining focus on the subject',
  arc_down: 'camera arcs downward while maintaining focus on the subject',
  zoom_in: 'camera slowly zooms in on the subject',
  zoom_out: 'camera slowly zooms out revealing more of the scene',
  pan_left: 'camera pans smoothly to the left',
  pan_right: 'camera pans smoothly to the right',
};

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const userId = session.user.sub;

    // Verify project ownership
    const supabase = createServerSupabaseClient();
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      imageUrl,
      movement,
      duration = 5,
      extractFrames = true,
      frameCount = 4,
      prompt = '',
    } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
    }

    if (!movement || !MOVEMENT_PROMPTS[movement]) {
      return NextResponse.json(
        { error: 'Invalid movement type', validMovements: Object.keys(MOVEMENT_PROMPTS) },
        { status: 400 }
      );
    }

    // Build the full prompt with camera movement
    const movementPrompt = MOVEMENT_PROMPTS[movement];
    const fullPrompt = prompt
      ? `${prompt}. ${movementPrompt}`
      : `The scene with ${movementPrompt}`;

    // Create a temporary shot record to track this generation
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .insert({
        project_id: projectId,
        description: `Multi-angle: ${movement}`,
        shot_number: 9999, // Will be cleaned up or assigned properly
        status: 'generating',
        storyboard_image_url: imageUrl,
        video_provider: 'kling-omni',
        video_duration: duration,
      })
      .select()
      .single();

    if (shotError || !shot) {
      console.error('Failed to create shot:', shotError);
      return NextResponse.json({ error: 'Failed to create shot record' }, { status: 500 });
    }

    // Generate a job ID
    const jobId = `ma-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Queue video generation with Kling
    await enqueueVideoGen({
      jobId,
      userId,
      createdAt: new Date().toISOString(),
      shotId: shot.id,
      projectId,
      shotNumber: 9999,
      model: 'kling-omni',
      provider: 'fal',
      prompt: fullPrompt,
      firstFrameUrl: imageUrl, // Reference image for the orbit
      duration,
      aspectRatio: '16:9',
      hasDialogue: false,
    });

    return NextResponse.json({
      success: true,
      jobId,
      shotId: shot.id,
      movement,
      extractFrames,
      frameCount,
    });
  } catch (error) {
    console.error('Queue multi-angle error:', error);
    return NextResponse.json(
      { error: 'Failed to queue multi-angle generation' },
      { status: 500 }
    );
  }
}
