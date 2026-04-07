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

    // Update status for all provided IDs
    // RLS will ensure user can only update their own media
    const { data, error } = await supabase
      .from('rush_media')
      .update({ status })
      .in('id', ids)
      .eq('user_id', session.user.sub)
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
