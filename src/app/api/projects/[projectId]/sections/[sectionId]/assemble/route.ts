import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { assembleSectionWithTransitions, type ShotWithTransition } from '@/lib/ffmpeg';

interface RouteParams {
  params: Promise<{ projectId: string; sectionId: string }>;
}

// POST /api/projects/[projectId]/sections/[sectionId]/assemble - Assemble section video
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, sectionId } = await params;
    const supabase = createServerSupabaseClient();

    // Verify project ownership and get audio URL
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get section with timing info
    const { data: section, error: sectionError } = await supabase
      .from('music_sections')
      .select('*')
      .eq('id', sectionId)
      .eq('project_id', projectId)
      .single();

    if (sectionError || !section) {
      return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    }

    // Fetch shots ordered by relative_start
    const { data: shots, error: shotsError } = await supabase
      .from('shots')
      .select('id, relative_start, duration, generated_video_url, transition_type, transition_duration')
      .eq('section_id', sectionId)
      .order('relative_start', { ascending: true });

    if (shotsError) {
      console.error('Error fetching shots:', shotsError);
      return NextResponse.json({ error: 'Failed to fetch shots' }, { status: 500 });
    }

    if (!shots || shots.length === 0) {
      return NextResponse.json({ error: 'No shots in section' }, { status: 400 });
    }

    // Check all shots have generated videos
    const missingVideos = shots.filter((s) => !s.generated_video_url);
    if (missingVideos.length > 0) {
      return NextResponse.json(
        {
          error: 'Some shots are missing generated videos',
          missingShotIds: missingVideos.map((s) => s.id),
        },
        { status: 400 }
      );
    }

    // Prepare shots with transitions
    const validTransitionTypes = ['cut', 'fadeblack', 'fadewhite', 'dissolve'] as const;
    type ValidTransitionType = typeof validTransitionTypes[number];

    const shotsWithTransitions: ShotWithTransition[] = shots.map((shot, index) => {
      const rawTransitionType = shot.transition_type || 'cut';
      const transitionType: ValidTransitionType = validTransitionTypes.includes(rawTransitionType as ValidTransitionType)
        ? (rawTransitionType as ValidTransitionType)
        : 'cut';

      return {
        id: shot.id,
        videoUrl: shot.generated_video_url!,
        duration: shot.duration || 5,
        // Last shot has no transition (it's the transition TO the next shot)
        transitionType: index < shots.length - 1 ? transitionType : 'cut',
        transitionDuration: index < shots.length - 1 ? (shot.transition_duration || 0.5) : 0,
      };
    });

    console.log(`[Assemble] Starting assembly for section ${sectionId} with ${shotsWithTransitions.length} shots`);

    // Get audio URL from request body (passed from ClipTimeline)
    const body = await request.json().catch(() => ({}));
    const audioUrl: string | undefined = body.audioUrl;
    const audioStart = section.start_time;
    const audioEnd = section.end_time;

    if (audioUrl) {
      console.log(`[Assemble] Using audio from ${audioStart}s to ${audioEnd}s, URL: ${audioUrl.substring(0, 50)}...`);
    } else {
      console.log(`[Assemble] No audio URL provided, assembling without music`);
    }

    // Run assembly
    const result = await assembleSectionWithTransitions({
      shots: shotsWithTransitions,
      audioUrl,
      audioStart,
      audioEnd,
      userId: session.user.sub,
      projectId,
      sectionId,
    });

    // Update section with assembled video URL
    const { error: updateError } = await supabase
      .from('music_sections')
      .update({
        assembled_video_url: result.outputUrl,
        assembled_video_duration: result.duration,
      })
      .eq('id', sectionId);

    if (updateError) {
      console.error('Error updating section:', updateError);
      // Don't fail - the video was created successfully
    }

    return NextResponse.json({
      success: true,
      assembledVideoUrl: result.outputUrl,
      signedUrl: result.signedUrl,
      duration: result.duration,
    });
  } catch (error) {
    console.error('[Assemble] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Assembly failed' },
      { status: 500 }
    );
  }
}
