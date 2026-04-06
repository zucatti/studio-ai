/**
 * Single Video Rush API
 * DELETE - Delete a rush and its B2 file
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createClient } from '@supabase/supabase-js';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// B2 client for file deletion
const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT!,
  region: 'eu-central-003',
  credentials: {
    accessKeyId: process.env.S3_KEY!,
    secretAccessKey: process.env.S3_SECRET!,
  },
});

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; shotId: string; rushId: string }> }
) {
  const session = await auth0.getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { shotId, rushId } = await params;

  // Get current rushes
  const { data: shot, error: fetchError } = await supabase
    .from('shots')
    .select('video_rushes, generated_video_url')
    .eq('id', shotId)
    .single();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const rushes = (shot.video_rushes || []) as VideoRush[];
  const rushToDelete = rushes.find(r => r.id === rushId);

  if (!rushToDelete) {
    return NextResponse.json({ error: 'Rush not found' }, { status: 404 });
  }

  // Don't allow deleting the last rush
  if (rushes.length === 1) {
    return NextResponse.json({ error: 'Cannot delete the last rush' }, { status: 400 });
  }

  // Delete from B2 storage
  if (rushToDelete.url.startsWith('b2://')) {
    const bucket = process.env.S3_BUCKET!;
    const key = rushToDelete.url.replace(`b2://${bucket}/`, '');

    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      }));
      console.log(`[Rushes] Deleted B2 file: ${key}`);
    } catch (err) {
      console.error(`[Rushes] Failed to delete B2 file: ${key}`, err);
      // Continue anyway - file might already be deleted
    }
  }

  // Remove from rushes array
  const updatedRushes = rushes.filter(r => r.id !== rushId);

  // If deleted rush was selected, select another one
  let newSelectedUrl = shot.generated_video_url;
  let newProvider = null;
  let newDuration = null;

  if (rushToDelete.isSelected && updatedRushes.length > 0) {
    // Select the most recent rush
    const sortedRushes = [...updatedRushes].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const newSelected = sortedRushes[0];
    newSelected.isSelected = true;
    newSelectedUrl = newSelected.url;
    newProvider = newSelected.model;
    newDuration = newSelected.duration;
  }

  // Update database
  const updateData: Record<string, unknown> = {
    video_rushes: updatedRushes,
  };

  if (rushToDelete.isSelected) {
    updateData.generated_video_url = newSelectedUrl;
    if (newProvider) updateData.video_provider = newProvider;
    if (newDuration) updateData.video_duration = newDuration;
  }

  const { error: updateError } = await supabase
    .from('shots')
    .update(updateData)
    .eq('id', shotId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    remainingCount: updatedRushes.length,
    newSelectedUrl: rushToDelete.isSelected ? newSelectedUrl : null,
  });
}
