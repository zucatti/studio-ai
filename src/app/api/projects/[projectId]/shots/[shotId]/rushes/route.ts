/**
 * Video Rushes API
 * GET - List all video rushes for a shot
 * POST - Select a rush as the active video
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface VideoRush {
  id: string;
  url: string;
  model: string;
  provider: string;
  duration: number;
  prompt?: string;
  createdAt: string;
  isSelected: boolean;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; shotId: string }> }
) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { shotId } = await params;

  const { data: shot, error } = await supabase
    .from('shots')
    .select('video_rushes, generated_video_url')
    .eq('id', shotId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    rushes: shot.video_rushes || [],
    selectedUrl: shot.generated_video_url,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; shotId: string }> }
) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { shotId } = await params;
  const { rushId } = await request.json();

  if (!rushId) {
    return NextResponse.json({ error: 'rushId is required' }, { status: 400 });
  }

  // Get current rushes
  const { data: shot, error: fetchError } = await supabase
    .from('shots')
    .select('video_rushes')
    .eq('id', shotId)
    .single();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const rushes = (shot.video_rushes || []) as VideoRush[];
  const selectedRush = rushes.find(r => r.id === rushId);

  if (!selectedRush) {
    return NextResponse.json({ error: 'Rush not found' }, { status: 404 });
  }

  // Update selection
  const updatedRushes = rushes.map(r => ({
    ...r,
    isSelected: r.id === rushId,
  }));

  const { error: updateError } = await supabase
    .from('shots')
    .update({
      video_rushes: updatedRushes,
      generated_video_url: selectedRush.url,
      video_provider: selectedRush.model,
      video_duration: selectedRush.duration,
    })
    .eq('id', shotId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    selectedUrl: selectedRush.url,
  });
}
