import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { overlayMusicOnVideo } from '@/lib/ffmpeg';
import { getSignedFileUrl, parseStorageUrl } from '@/lib/storage';

interface RouteParams {
  params: Promise<{ projectId: string; shotId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shotId } = await params;
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

    // Get shot with audio info
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select('*, generated_video_url, audio_mode, audio_asset_id, audio_start, audio_end')
      .eq('id', shotId)
      .single();

    if (shotError || !shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 });
    }

    // Validate requirements
    if (!shot.generated_video_url) {
      return NextResponse.json({ error: 'No video to add music to. Generate video first.' }, { status: 400 });
    }

    if (!shot.audio_asset_id) {
      return NextResponse.json({ error: 'No music track selected for this shot.' }, { status: 400 });
    }

    if (shot.audio_mode !== 'instrumental' && shot.audio_mode !== 'vocal') {
      return NextResponse.json({ error: 'Audio mode must be instrumental or vocal to add music.' }, { status: 400 });
    }

    // Get the audio asset
    const { data: audioAsset } = await supabase
      .from('global_assets')
      .select('id, name, data')
      .eq('id', shot.audio_asset_id)
      .single();

    if (!audioAsset) {
      return NextResponse.json({ error: 'Audio asset not found' }, { status: 404 });
    }

    const assetData = audioAsset.data as Record<string, unknown>;
    const fileUrl = assetData?.fileUrl as string;

    if (!fileUrl) {
      return NextResponse.json({ error: 'Audio asset has no file URL' }, { status: 400 });
    }

    console.log(`[AddMusic] Starting music overlay for shot ${shotId}`);
    console.log(`[AddMusic] Music: ${audioAsset.name}`);
    console.log(`[AddMusic] Segment: ${shot.audio_start}s - ${shot.audio_end}s`);

    // Get signed URL for the audio file
    let audioUrl = fileUrl;
    if (fileUrl.startsWith('b2://')) {
      const parsed = parseStorageUrl(fileUrl);
      if (parsed) {
        audioUrl = await getSignedFileUrl(parsed.key, 3600);
      }
    }

    // Overlay music on video
    const result = await overlayMusicOnVideo({
      videoUrl: shot.generated_video_url,
      audioUrl,
      audioStart: shot.audio_start || 0,
      audioEnd: shot.audio_end || (shot.audio_start || 0) + 5, // Default 5s if not set
      userId: session.user.sub,
      projectId,
      shotId,
      volume: 1.0, // Could be configurable later
    });

    console.log(`[AddMusic] Music overlay complete: ${result.outputUrl}`);

    // Update shot with new video URL
    await supabase
      .from('shots')
      .update({ generated_video_url: result.outputUrl })
      .eq('id', shotId);

    return NextResponse.json({
      success: true,
      videoUrl: result.signedUrl,     // Signed URL for immediate playback
      storageUrl: result.outputUrl,   // b2:// URL for storage
      message: 'Music added successfully',
    });

  } catch (error) {
    console.error('[AddMusic] Error:', error);
    return NextResponse.json(
      { error: 'Failed to add music: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
