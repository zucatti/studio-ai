import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

// GET /api/global-assets - List all global assets for the current user
// Query params: ?search=... &type=character|location|prop
export async function GET(request: NextRequest) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    const assetType = searchParams.get('type');

    const supabase = createServerSupabaseClient();

    let query = supabase
      .from('global_assets')
      .select('*')
      .eq('user_id', session.user.sub);

    // Filter by type if specified
    if (assetType) {
      query = query.eq('asset_type', assetType);
    }

    // Filter by search term (case-insensitive)
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    const { data: assets, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching global assets:', error);
      return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
    }

    return NextResponse.json({ assets });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/global-assets - Create a new global asset
export async function POST(request: Request) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { asset_type, name, data, reference_images, tags } = body;

    if (!asset_type || !name) {
      return NextResponse.json(
        { error: 'asset_type and name are required' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data: asset, error } = await supabase
      .from('global_assets')
      .insert({
        user_id: session.user.sub,
        asset_type,
        name,
        data: data || {},
        reference_images: reference_images || [],
        tags: tags || [],
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating global asset:', error);
      return NextResponse.json({ error: 'Failed to create asset' }, { status: 500 });
    }

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
