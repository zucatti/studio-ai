import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ assetId: string }>;
}

// GET /api/global-assets/[assetId] - Get a single global asset
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { assetId } = await params;
    const supabase = createServerSupabaseClient();

    const { data: asset, error } = await supabase
      .from('global_assets')
      .select('*')
      .eq('id', assetId)
      .eq('user_id', session.user.sub)
      .single();

    if (error || !asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    return NextResponse.json({ asset });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/global-assets/[assetId] - Update a global asset
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { assetId } = await params;
    const body = await request.json();
    const supabase = createServerSupabaseClient();

    // Verify ownership
    const { data: existing } = await supabase
      .from('global_assets')
      .select('id')
      .eq('id', assetId)
      .eq('user_id', session.user.sub)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.data !== undefined) updateData.data = body.data;
    if (body.reference_images !== undefined) updateData.reference_images = body.reference_images;
    if (body.tags !== undefined) updateData.tags = body.tags;

    const { data: asset, error } = await supabase
      .from('global_assets')
      .update(updateData)
      .eq('id', assetId)
      .select()
      .single();

    if (error) {
      console.error('Error updating global asset:', error);
      return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 });
    }

    return NextResponse.json({ asset });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/global-assets/[assetId] - Delete a global asset
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { assetId } = await params;
    const supabase = createServerSupabaseClient();

    // Verify ownership
    const { data: existing } = await supabase
      .from('global_assets')
      .select('id')
      .eq('id', assetId)
      .eq('user_id', session.user.sub)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('global_assets')
      .delete()
      .eq('id', assetId);

    if (error) {
      console.error('Error deleting global asset:', error);
      return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
