/**
 * Rush Creator Media Item API
 * DELETE - Delete a single media item
 */

import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth check
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Media ID is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Delete media (RLS will ensure user can only delete their own)
    const { error } = await supabase
      .from('rush_media')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.sub);

    if (error) {
      console.error('[RushCreator/Media/Delete] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[RushCreator/Media/Delete] Deleted media ${id}`);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[RushCreator/Media/Delete] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
