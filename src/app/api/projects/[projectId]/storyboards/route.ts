import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { deleteFile, parseStorageUrl } from '@/lib/storage';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams) {
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

    // Get all shots with storyboard images
    const { data: scenes } = await supabase
      .from('scenes')
      .select(`
        id,
        shots (
          id,
          storyboard_image_url
        )
      `)
      .eq('project_id', projectId);

    if (!scenes) {
      return NextResponse.json({ error: 'No scenes found' }, { status: 404 });
    }

    // Collect all shots with storyboards
    const shotsWithStoryboards: { id: string; url: string }[] = [];
    for (const scene of scenes) {
      for (const shot of scene.shots || []) {
        if (shot.storyboard_image_url) {
          shotsWithStoryboards.push({
            id: shot.id,
            url: shot.storyboard_image_url,
          });
        }
      }
    }

    if (shotsWithStoryboards.length === 0) {
      return NextResponse.json({ message: 'No storyboards to delete' });
    }

    // Delete files from storage (handle both B2 and legacy Supabase URLs)
    const b2Keys: string[] = [];
    const supabasePaths: string[] = [];

    for (const shot of shotsWithStoryboards) {
      // Check if it's a B2 URL
      if (shot.url.startsWith('b2://')) {
        const parsed = parseStorageUrl(shot.url);
        if (parsed) {
          b2Keys.push(parsed.key);
        }
      } else {
        // Legacy Supabase URL format: .../storage/v1/object/public/project-assets/path/to/file.png
        const match = shot.url.match(/project-assets\/(.+)$/);
        if (match) {
          supabasePaths.push(match[1]);
        }
      }
    }

    // Delete B2 files
    for (const key of b2Keys) {
      try {
        await deleteFile(key);
        console.log(`Deleted B2 file: ${key}`);
      } catch (error) {
        console.error(`Error deleting B2 file ${key}:`, error);
        // Continue anyway
      }
    }

    // Delete legacy Supabase files
    if (supabasePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('project-assets')
        .remove(supabasePaths);

      if (storageError) {
        console.error('Error deleting files from Supabase storage:', storageError);
        // Continue anyway to clear database references
      }
    }

    // Update all shots to remove storyboard URLs
    const shotIds = shotsWithStoryboards.map((s) => s.id);
    const { error: updateError } = await supabase
      .from('shots')
      .update({
        storyboard_image_url: null,
        generation_status: 'pending',
        generation_error: null,
      })
      .in('id', shotIds);

    if (updateError) {
      console.error('Error updating shots:', updateError);
      return NextResponse.json(
        { error: 'Failed to update shots' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${shotsWithStoryboards.length} storyboard(s) deleted`,
      deletedCount: shotsWithStoryboards.length,
    });
  } catch (error) {
    console.error('Error deleting storyboards:', error);
    return NextResponse.json(
      { error: 'Failed to delete storyboards' },
      { status: 500 }
    );
  }
}
