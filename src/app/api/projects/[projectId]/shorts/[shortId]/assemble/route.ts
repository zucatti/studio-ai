import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { concatenateVideos, STANDARD_RESOLUTIONS } from '@/lib/ffmpeg';

interface RouteParams {
  params: Promise<{ projectId: string; shortId: string }>;
}

// POST /api/projects/[projectId]/shorts/[shortId]/assemble - Assemble all plan videos into one
// Body (optional): { colorMatch?: boolean } - Enable color normalization between clips
export async function POST(request: Request, { params }: RouteParams) {
  const encoder = new TextEncoder();

  // Parse optional body for settings
  let colorMatch = true;  // Default to true for consistent look
  try {
    const body = await request.json();
    if (typeof body.colorMatch === 'boolean') {
      colorMatch = body.colorMatch;
    }
  } catch {
    // No body or invalid JSON, use defaults
  }

  // Create readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const session = await auth0.getSession();
        if (!session?.user) {
          sendEvent('error', { error: 'Unauthorized' });
          controller.close();
          return;
        }

        const { projectId, shortId } = await params;
        const supabase = createServerSupabaseClient();

        sendEvent('progress', { progress: 5, message: 'Vérification du projet...' });

        // Get project with aspect ratio
        const { data: project } = await supabase
          .from('projects')
          .select('id, user_id, aspect_ratio')
          .eq('id', projectId)
          .eq('user_id', session.user.sub)
          .single();

        if (!project) {
          sendEvent('error', { error: 'Project not found' });
          controller.close();
          return;
        }

        sendEvent('progress', { progress: 10, message: 'Récupération des plans...' });

        // Get the short (scene) with its shots
        const { data: scene, error: sceneError } = await supabase
          .from('scenes')
          .select(`
            id,
            title,
            shots (
              id,
              shot_number,
              generated_video_url,
              sort_order
            )
          `)
          .eq('id', shortId)
          .eq('project_id', projectId)
          .single();

        if (sceneError || !scene) {
          sendEvent('error', { error: 'Short not found' });
          controller.close();
          return;
        }

        // Get videos in order
        const sortedShots = (scene.shots || [])
          .filter((s: { generated_video_url?: string }) => s.generated_video_url)
          .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order);

        if (sortedShots.length === 0) {
          sendEvent('error', { error: 'Aucune vidéo à assembler' });
          controller.close();
          return;
        }

        // Collect video URLs (FFmpeg utility handles b2:// URLs)
        const videoUrls: string[] = sortedShots.map(
          (shot: { generated_video_url: string }) => shot.generated_video_url
        );

        // Get target resolution from project aspect ratio
        const targetResolution = STANDARD_RESOLUTIONS[project.aspect_ratio] || STANDARD_RESOLUTIONS['16:9'];

        console.log('[Assemble] Video URLs to concatenate:', videoUrls);
        console.log('[Assemble] Color matching:', colorMatch);
        console.log('[Assemble] Target resolution:', targetResolution.width, 'x', targetResolution.height, '(from aspect ratio:', project.aspect_ratio, ')');

        sendEvent('progress', {
          progress: 20,
          message: colorMatch
            ? `Normalisation ${targetResolution.width}x${targetResolution.height} + color matching...`
            : `Assemblage de ${videoUrls.length} vidéo${videoUrls.length > 1 ? 's' : ''}...`
        });

        // Concatenate with FFmpeg - normalize ALL clips to project's standard resolution
        const result = await concatenateVideos({
          videoUrls,
          userId: session.user.sub,
          projectId,
          colorMatch,
          targetResolution,  // Force all clips to this exact resolution
        });

        console.log('[Assemble] FFmpeg concatenation complete:', result.outputUrl);
        console.log('[Assemble] Signed URL for playback:', result.signedUrl);

        // Save assembled video URL and duration to database for persistence
        sendEvent('progress', { progress: 95, message: 'Sauvegarde...' });

        const { error: updateError } = await supabase
          .from('scenes')
          .update({
            assembled_video_url: result.outputUrl,
            assembled_video_duration: result.duration || null,
          })
          .eq('id', shortId);

        if (updateError) {
          console.error('[Assemble] Failed to save assembled video URL:', updateError);
          // Continue anyway - video is still accessible via signed URL
        } else {
          console.log('[Assemble] Saved assembled video URL to database');
        }

        sendEvent('progress', { progress: 100, message: 'Terminé!' });
        sendEvent('complete', {
          videoUrl: result.signedUrl,      // Use signed URL for immediate playback
          storageUrl: result.outputUrl,    // b2:// URL for storage reference
          duration: result.duration,       // FFmpeg-calculated duration
        });
        controller.close();

      } catch (error) {
        console.error('Assembly error:', error);
        sendEvent('error', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
