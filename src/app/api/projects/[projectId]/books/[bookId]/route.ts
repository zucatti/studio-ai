import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; bookId: string }>;
}

// GET /api/projects/[projectId]/books/[bookId]
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, bookId } = await params;
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

    const { data: book, error } = await supabase
      .from('books')
      .select(`
        *,
        chapters (*)
      `)
      .eq('id', bookId)
      .eq('project_id', projectId)
      .single();

    if (error || !book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    return NextResponse.json({ book });
  } catch (error) {
    console.error('Error fetching book:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[projectId]/books/[bookId]
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, bookId } = await params;
    const body = await request.json();
    const { title, summary, cover_image_url, word_count_goal, status, isbn, year, mentions } = body;

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

    // Verify book exists
    const { data: existingBook } = await supabase
      .from('books')
      .select('id')
      .eq('id', bookId)
      .eq('project_id', projectId)
      .single();

    if (!existingBook) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    // Build update object
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (summary !== undefined) updates.summary = summary;
    if (cover_image_url !== undefined) updates.cover_image_url = cover_image_url;
    if (word_count_goal !== undefined) updates.word_count_goal = word_count_goal;
    if (status !== undefined) updates.status = status;
    if (isbn !== undefined) updates.isbn = isbn;
    if (year !== undefined) updates.year = year;
    if (mentions !== undefined) updates.mentions = mentions;

    const { data: book, error } = await supabase
      .from('books')
      .update(updates)
      .eq('id', bookId)
      .select()
      .single();

    if (error) {
      console.error('Error updating book:', error);
      return NextResponse.json({ error: 'Failed to update book' }, { status: 500 });
    }

    return NextResponse.json({ book });
  } catch (error) {
    console.error('Error updating book:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/books/[bookId]
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, bookId } = await params;
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

    // Delete chapters first (cascade should handle this, but being explicit)
    await supabase.from('chapters').delete().eq('book_id', bookId);

    // Delete book
    const { error } = await supabase
      .from('books')
      .delete()
      .eq('id', bookId)
      .eq('project_id', projectId);

    if (error) {
      console.error('Error deleting book:', error);
      return NextResponse.json({ error: 'Failed to delete book' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting book:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
