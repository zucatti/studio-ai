import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createCreatomateWrapper } from '@/lib/ai/creatomate-wrapper';
import { getSignedFileUrl } from '@/lib/storage';

interface RouteParams {
  params: Promise<{ projectId: string; shortId: string }>;
}

// Helper to get dimensions from aspect ratio
function getAspectRatioDimensions(aspectRatio: string): { width: number; height: number } {
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920 };
    case '16:9':
      return { width: 1920, height: 1080 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '4:5':
      return { width: 1080, height: 1350 };
    case '2:3':
      return { width: 1080, height: 1620 };
    case '21:9':
      return { width: 2560, height: 1080 };
    default:
      return { width: 1080, height: 1920 };
  }
}

// POST /api/projects/[projectId]/shorts/[shortId]/assemble - Assemble all plan videos into one
export async function POST(request: Request, { params }: RouteParams) {
  const encoder = new TextEncoder();

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

        // Get signed URLs for B2 videos (Creatomate needs public URLs)
        const videoUrls: string[] = [];
        for (const shot of sortedShots) {
          let url = shot.generated_video_url;
          if (url.startsWith('b2://')) {
            // Extract key from b2://bucket/key format
            const match = url.match(/^b2:\/\/[^/]+\/(.+)$/);
            if (match) {
              url = await getSignedFileUrl(match[1]);
            }
          }
          videoUrls.push(url);
        }

        console.log('[Assemble] Video URLs to concatenate:', videoUrls);

        sendEvent('progress', {
          progress: 15,
          message: `Assemblage de ${videoUrls.length} vidéo${videoUrls.length > 1 ? 's' : ''}...`
        });

        // Get dimensions
        const { width, height } = getAspectRatioDimensions(project.aspect_ratio || '9:16');

        // Create Creatomate wrapper
        const creatomate = createCreatomateWrapper({
          userId: session.user.sub,
          projectId,
          supabase,
          operation: 'short-assembly',
        });

        sendEvent('progress', { progress: 20, message: 'Envoi à Creatomate...' });

        console.log('[Assemble] Starting concatenation with:', {
          videoCount: videoUrls.length,
          videoUrls,
          width,
          height,
        });

        // Start concatenation
        const { result, renderId } = await creatomate.concatenateVideos({
          videoUrls,
          width,
          height,
        });

        console.log('[Assemble] Creatomate response:', result);

        if (!renderId) {
          sendEvent('error', { error: 'Failed to start render' });
          controller.close();
          return;
        }

        sendEvent('progress', { progress: 30, message: 'Rendu en cours...', renderId });

        // Poll for completion
        const maxAttempts = 120; // 4 minutes max
        const pollInterval = 2000;

        for (let i = 0; i < maxAttempts; i++) {
          const renderStatus = await creatomate.getRender(renderId);

          if (renderStatus.status === 'succeeded' && renderStatus.url) {
            sendEvent('progress', { progress: 100, message: 'Terminé!' });
            sendEvent('complete', {
              videoUrl: renderStatus.url,
              renderId,
            });
            controller.close();
            return;
          }

          if (renderStatus.status === 'failed') {
            console.error('[Assemble] Render failed:', renderStatus);
            sendEvent('error', { error: renderStatus.error || 'Render failed' });
            controller.close();
            return;
          }

          // Calculate progress (30-95%)
          const progress = Math.min(30 + Math.floor((i / maxAttempts) * 65), 95);
          sendEvent('progress', {
            progress,
            message: `Rendu en cours... ${renderStatus.status}`,
            renderId,
          });

          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        sendEvent('error', { error: 'Render timeout' });
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
