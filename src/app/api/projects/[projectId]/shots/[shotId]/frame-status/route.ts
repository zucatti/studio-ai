import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; shotId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { shotId } = await params;
    const supabase = createServerSupabaseClient();

    const { data: shot } = await supabase
      .from('shots')
      .select('frame_generation_status')
      .eq('id', shotId)
      .single();

    if (!shot) {
      return NextResponse.json({ error: 'Shot not found' }, { status: 404 });
    }

    // Parse the status - it's stored as a JSON string or object
    let status = 'idle';
    if (shot.frame_generation_status) {
      if (typeof shot.frame_generation_status === 'string') {
        try {
          const parsed = JSON.parse(shot.frame_generation_status);
          status = parsed.status || 'idle';
        } catch {
          status = shot.frame_generation_status;
        }
      } else if (typeof shot.frame_generation_status === 'object') {
        status = shot.frame_generation_status.status || 'idle';
      }
    }

    return NextResponse.json({ status });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
