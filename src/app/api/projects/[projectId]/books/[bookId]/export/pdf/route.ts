import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { generateBookPdf, BookData, ChapterData } from '@/lib/pdf/book-generator';

interface RouteParams {
  params: Promise<{ projectId: string; bookId: string }>;
}

// POST /api/projects/[projectId]/books/[bookId]/export/pdf
// Generates a real PDF file using puppeteer
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

    // Get book with chapters
    const { data: book } = await supabase
      .from('books')
      .select('*')
      .eq('id', bookId)
      .eq('project_id', projectId)
      .single();

    if (!book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    const { data: chapters } = await supabase
      .from('chapters')
      .select('*')
      .eq('book_id', bookId)
      .order('sort_order', { ascending: true });

    // Parse mentions as array (each mention = separate dedication page)
    const mentions = parseMentionsArray(book.mentions);

    // Prepare book data for PDF generator
    const bookData: BookData = {
      title: book.title,
      author: session.user.name || 'Unknown',
      year: book.year || new Date().getFullYear(),
      isbn: book.isbn,
      mentions: mentions,
      chapters: (chapters || []).map((ch, index): ChapterData => ({
        title: ch.title,
        content: ch.content || '',
        chapterNumber: index + 1,
      })),
    };

    // Generate PDF
    const pdfBuffer = await generateBookPdf(bookData);

    // Return PDF as downloadable file
    const filename = sanitizeFilename(book.title) + '.pdf';

    // Convert Buffer to Uint8Array for Response
    const uint8Array = new Uint8Array(pdfBuffer);

    return new Response(uint8Array, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('PDF export error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Parse mentions from JSON string - returns array (each = separate page)
function parseMentionsArray(mentionsStr: string | null | undefined): string[] | null {
  if (!mentionsStr) return null;
  try {
    const parsed = JSON.parse(mentionsStr);
    if (Array.isArray(parsed)) {
      const filtered = parsed.filter((m: string) => m && m.trim());
      return filtered.length > 0 ? filtered : null;
    }
    // Single string
    return mentionsStr.trim() ? [mentionsStr.trim()] : null;
  } catch {
    // Legacy: single string mention
    return mentionsStr.trim() ? [mentionsStr.trim()] : null;
  }
}

// Sanitize filename for download
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100);
}
