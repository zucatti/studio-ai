import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { uploadFile, deleteFile, parseStorageUrl, getSignedFileUrl, STORAGE_BUCKET } from '@/lib/storage';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// GET - List audio assets for a project
export async function GET(request: Request, { params }: RouteParams) {
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
      .select('id, audio_url, audio_duration, audio_waveform_data')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get all audio assets
    const { data: audioAssets, error } = await supabase
      .from('audio_assets')
      .select(`
        *,
        vocal_segments (*)
      `)
      .eq('project_id', projectId)
      .order('sort_order');

    if (error) {
      console.error('Error fetching audio assets:', error);
      return NextResponse.json({ error: 'Failed to fetch audio assets' }, { status: 500 });
    }

    return NextResponse.json({
      project: {
        audio_url: project.audio_url,
        audio_duration: project.audio_duration,
        audio_waveform_data: project.audio_waveform_data,
      },
      audioAssets: audioAssets || [],
    });
  } catch (error) {
    console.error('Error in audio GET:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST - Upload new audio asset
export async function POST(request: Request, { params }: RouteParams) {
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

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const name = formData.get('name') as string || 'Audio';
    const type = formData.get('type') as string || 'music';
    const isMaster = formData.get('is_master') === 'true';
    const duration = parseFloat(formData.get('duration') as string) || 0;
    const waveformData = formData.get('waveform_data') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/aac'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid audio file type' }, { status: 400 });
    }

    // Upload to B2
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileExt = file.name.split('.').pop() || 'mp3';
    const sanitizedUserId = session.user.sub.replace(/[|]/g, '_');
    const storageKey = `audio/${sanitizedUserId}/${projectId}/audio_${Date.now()}.${fileExt}`;

    try {
      await uploadFile(storageKey, fileBuffer, file.type);
    } catch (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload audio' }, { status: 500 });
    }

    // Store B2 URL format
    const b2Url = `b2://${STORAGE_BUCKET}/${storageKey}`;

    // If this is master, unset previous master
    if (isMaster) {
      await supabase
        .from('audio_assets')
        .update({ is_master: false })
        .eq('project_id', projectId)
        .eq('is_master', true);

      // Also update project level audio
      await supabase
        .from('projects')
        .update({
          audio_url: b2Url,
          audio_duration: duration,
          audio_waveform_data: waveformData ? JSON.parse(waveformData) : null,
        })
        .eq('id', projectId);
    }

    // Create audio asset record
    const { data: audioAsset, error: insertError } = await supabase
      .from('audio_assets')
      .insert({
        project_id: projectId,
        name,
        type,
        file_url: b2Url,
        duration,
        waveform_data: waveformData ? JSON.parse(waveformData) : null,
        is_master: isMaster,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create audio asset' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      audioAsset,
    });
  } catch (error) {
    console.error('Error in audio POST:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE - Remove audio asset (individual asset via query param)
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const url = new URL(request.url);
    const audioId = url.searchParams.get('audioId');

    if (!audioId) {
      return NextResponse.json({ error: 'audioId required' }, { status: 400 });
    }

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

    // Get the audio asset to check if it's master
    const { data: audioAsset } = await supabase
      .from('audio_assets')
      .select('id, file_url, is_master')
      .eq('id', audioId)
      .eq('project_id', projectId)
      .single();

    if (!audioAsset) {
      return NextResponse.json({ error: 'Audio asset not found' }, { status: 404 });
    }

    // Delete from B2 storage
    const parsed = parseStorageUrl(audioAsset.file_url);
    if (parsed) {
      try {
        await deleteFile(parsed.key);
      } catch (e) {
        console.warn('Failed to delete audio from storage:', e);
      }
    }

    // Delete record
    await supabase
      .from('audio_assets')
      .delete()
      .eq('id', audioId);

    // If it was master, clear project level audio
    if (audioAsset.is_master) {
      await supabase
        .from('projects')
        .update({
          audio_url: null,
          audio_duration: null,
          audio_waveform_data: null,
        })
        .eq('id', projectId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in audio DELETE:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
