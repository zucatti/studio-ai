import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { generateEpub } from '@/lib/epub/generator';
import { getSignedFileUrl, parseStorageUrl, isB2Url } from '@/lib/storage';

interface RouteParams {
  params: Promise<{ projectId: string; bookId: string }>;
}

// POST /api/projects/[projectId]/books/[bookId]/export/epub
// Returns the EPUB file as a downloadable binary
export async function POST(request: Request, { params }: RouteParams) {
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
      .select('id, name')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get book
    const { data: book } = await supabase
      .from('books')
      .select('*')
      .eq('id', bookId)
      .eq('project_id', projectId)
      .single();

    if (!book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    // Get chapters
    const { data: chapters } = await supabase
      .from('chapters')
      .select('*')
      .eq('book_id', bookId)
      .order('sort_order', { ascending: true });

    if (!chapters || chapters.length === 0) {
      return NextResponse.json(
        { error: 'No chapters found. Add at least one chapter before exporting.' },
        { status: 400 }
      );
    }

    // Get cover image URL (sign if B2)
    let coverImageUrl: string | undefined;
    if (book.cover_image_url) {
      if (isB2Url(book.cover_image_url)) {
        const parsed = parseStorageUrl(book.cover_image_url);
        if (parsed) {
          coverImageUrl = await getSignedFileUrl(parsed.key, 3600);
        }
      } else {
        // Direct URL (already public)
        coverImageUrl = book.cover_image_url;
      }
    }

    // Generate EPUB
    const epubBuffer = await generateEpub({
      book,
      chapters,
      author: session.user.name || 'Unknown Author',
      language: 'fr',
      coverImageUrl,
      isbn: book.isbn || undefined,
      year: book.year || undefined,
      mentions: book.mentions || undefined,
    });

    // Create filename
    const safeTitle = book.title.replace(/[^a-zA-Z0-9\u00C0-\u017F\s-]/g, '').trim();
    const filename = `${safeTitle}.epub`;

    // Return the EPUB file (convert Buffer to Uint8Array for NextResponse)
    return new NextResponse(new Uint8Array(epubBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/epub+zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': epubBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('EPUB export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET - same as POST for easier browser download
export async function GET(request: Request, { params }: RouteParams) {
  return POST(request, { params });
}
