/**
 * Rush Creator Media Status API
 * PATCH - Batch update status for selected media
 */

import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import type { RushMediaStatus } from '@/types/database';

export async function PATCH(request: Request) {
  try {
    // Auth check
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ids, status } = body as { ids: string[]; status: RushMediaStatus };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    if (!status || !['pending', 'selected', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // First, verify the user owns all the media via project ownership
    const { data: mediaItems, error: verifyError } = await supabase
      .from('rush_media')
      .select('id, project_id')
      .in('id', ids);

    if (verifyError) {
      console.error('[RushCreator/Media/Status] Error verifying media:', verifyError);
      return NextResponse.json({ error: verifyError.message }, { status: 500 });
    }

    if (!mediaItems || mediaItems.length === 0) {
      return NextResponse.json({ error: 'No media found with provided IDs' }, { status: 404 });
    }

    // Get unique project IDs and verify ownership
    const projectIds = [...new Set(mediaItems.map(m => m.project_id))];
    const { data: ownedProjects, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .in('id', projectIds)
      .eq('user_id', session.user.sub);

    if (projectError) {
      console.error('[RushCreator/Media/Status] Error verifying projects:', projectError);
      return NextResponse.json({ error: projectError.message }, { status: 500 });
    }

    const ownedProjectIds = new Set(ownedProjects?.map(p => p.id) || []);
    const authorizedIds = mediaItems
      .filter(m => ownedProjectIds.has(m.project_id))
      .map(m => m.id);

    if (authorizedIds.length === 0) {
      return NextResponse.json({ error: 'Not authorized to update these media' }, { status: 403 });
    }

    // Update status for authorized IDs only
    const { data, error } = await supabase
      .from('rush_media')
      .update({ status })
      .in('id', authorizedIds)
      .select('id');

    if (error) {
      console.error('[RushCreator/Media/Status] Error updating:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[RushCreator/Media/Status] Updated ${data?.length || 0} items to ${status}`);

    return NextResponse.json({
      success: true,
      updatedCount: data?.length || 0,
    });

  } catch (error) {
    console.error('[RushCreator/Media/Status] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
