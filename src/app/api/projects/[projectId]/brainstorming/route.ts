import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface BrainstormingVersion {
  content: string;
  timestamp: string;
  source: 'user' | 'assistant' | 'import';
}

// GET /api/projects/[projectId]/brainstorming
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
      .select('id')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const { data: brainstorming, error } = await supabase
      .from('brainstorming')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching brainstorming:', error);
      return NextResponse.json(
        { error: 'Failed to fetch brainstorming' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      brainstorming: brainstorming || {
        content: '',
        chat_messages: [],
        versions: [],
        version_index: -1,
      },
    });
  } catch (error) {
    console.error('Error fetching brainstorming:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[projectId]/brainstorming
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { content, chat_messages, createVersion, source } = body as {
      content?: string;
      chat_messages?: ChatMessage[];
      createVersion?: boolean;
      source?: 'user' | 'assistant' | 'import';
    };

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

    // Check if brainstorming exists for this project
    const { data: existing } = await supabase
      .from('brainstorming')
      .select('id, content, versions')
      .eq('project_id', projectId)
      .single();

    // Build update object
    const updateData: Record<string, unknown> = {};

    if (content !== undefined) {
      updateData.content = content;

      // Create version if requested and content changed
      if (createVersion && existing && existing.content !== content) {
        const versions = (existing.versions as BrainstormingVersion[]) || [];
        const newVersion: BrainstormingVersion = {
          content: existing.content || '',
          timestamp: new Date().toISOString(),
          source: source || 'user',
        };
        // Keep last 20 versions
        const updatedVersions = [...versions, newVersion].slice(-20);
        updateData.versions = updatedVersions;
        updateData.version_index = -1; // Reset to latest
      }
    }

    if (chat_messages !== undefined) {
      updateData.chat_messages = chat_messages;
    }

    let brainstorming;
    let error;

    if (existing) {
      // Update existing
      const result = await supabase
        .from('brainstorming')
        .update(updateData)
        .eq('project_id', projectId)
        .select()
        .single();
      brainstorming = result.data;
      error = result.error;
    } else {
      // Insert new
      const result = await supabase
        .from('brainstorming')
        .insert({
          project_id: projectId,
          content: content || '',
          chat_messages: chat_messages || [],
          versions: [],
          version_index: -1,
        })
        .select()
        .single();
      brainstorming = result.data;
      error = result.error;
    }

    if (error) {
      console.error('Error updating brainstorming:', error);
      return NextResponse.json(
        { error: 'Failed to update brainstorming' },
        { status: 500 }
      );
    }

    return NextResponse.json({ brainstorming });
  } catch (error) {
    console.error('Error updating brainstorming:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[projectId]/brainstorming - For version navigation
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    const { action } = body as { action: 'undo' | 'redo' };

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

    // Get current brainstorming
    const { data: brainstorming } = await supabase
      .from('brainstorming')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (!brainstorming) {
      return NextResponse.json({ error: 'Brainstorming not found' }, { status: 404 });
    }

    const versions = (brainstorming.versions as BrainstormingVersion[]) || [];
    let versionIndex = brainstorming.version_index ?? -1;
    let newContent = brainstorming.content;

    if (action === 'undo' && versions.length > 0) {
      // If at latest (-1), save current content first
      if (versionIndex === -1) {
        const currentVersion: BrainstormingVersion = {
          content: brainstorming.content || '',
          timestamp: new Date().toISOString(),
          source: 'user',
        };
        versions.push(currentVersion);
        versionIndex = versions.length - 2; // Go to previous
      } else if (versionIndex > 0) {
        versionIndex--;
      }
      newContent = versions[versionIndex]?.content || '';
    } else if (action === 'redo' && versionIndex >= 0 && versionIndex < versions.length - 1) {
      versionIndex++;
      newContent = versions[versionIndex]?.content || '';
      // If we're back to latest, reset index
      if (versionIndex === versions.length - 1) {
        versionIndex = -1;
      }
    }

    const { data: updated, error } = await supabase
      .from('brainstorming')
      .update({
        content: newContent,
        versions,
        version_index: versionIndex,
      })
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    }

    return NextResponse.json({ brainstorming: updated });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
