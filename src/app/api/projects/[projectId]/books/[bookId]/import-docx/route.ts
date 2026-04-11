import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import mammoth from 'mammoth';

interface RouteParams {
  params: Promise<{ projectId: string; bookId: string }>;
}

// Chapter detection patterns
const CHAPTER_PATTERNS = [
  /^prologue$/i,
  /^épilogue$/i,
  /^epilogue$/i,
  /^introduction$/i,
  /^conclusion$/i,
  /^avant[- ]propos$/i,
  /^préface$/i,
  /^chapitre\s+(\d+|[ivxlcdm]+)/i,
  /^chapter\s+(\d+|[ivxlcdm]+)/i,
];

function isChapterHeading(text: string): boolean {
  const trimmed = text.trim();
  return CHAPTER_PATTERNS.some(pattern => pattern.test(trimmed));
}

function normalizeChapterTitle(title: string): string {
  return title.trim()
    .replace(/\s+/g, ' ')
    .replace(/^(chapitre|chapter)\s+/i, 'Chapitre ');
}

interface ParsedChapter {
  title: string;
  content: string;
}

function parseDocxHtml(html: string): ParsedChapter[] {
  const chapters: ParsedChapter[] = [];

  // Create a temporary element to parse HTML
  // We'll do this server-side by parsing the HTML string directly

  // Split by paragraph tags and headers
  const lines = html
    .replace(/<\/p>/gi, '</p>\n')
    .replace(/<\/h[1-6]>/gi, m => m + '\n')
    .split('\n')
    .filter(line => line.trim());

  let currentChapter: ParsedChapter | null = null;
  let foundFirstChapter = false;

  for (const line of lines) {
    // Extract text content from HTML line
    const textContent = line
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();

    if (!textContent) continue;

    // Check if this is a chapter heading
    if (isChapterHeading(textContent)) {
      foundFirstChapter = true;

      // Save previous chapter if exists
      if (currentChapter && currentChapter.content.trim()) {
        chapters.push(currentChapter);
      }

      // Start new chapter
      currentChapter = {
        title: normalizeChapterTitle(textContent),
        content: '',
      };
    } else if (foundFirstChapter && currentChapter) {
      // Add content to current chapter
      // Keep the original HTML line for formatting
      currentChapter.content += line + '\n';
    }
    // Ignore content before first chapter
  }

  // Don't forget the last chapter
  if (currentChapter && currentChapter.content.trim()) {
    chapters.push(currentChapter);
  }

  // Clean up chapter content
  return chapters.map(ch => ({
    ...ch,
    content: cleanHtmlContent(ch.content),
  }));
}

function cleanHtmlContent(html: string): string {
  return html
    // Remove empty paragraphs
    .replace(/<p[^>]*>\s*<\/p>/gi, '')
    // Normalize whitespace
    .replace(/\n{3,}/g, '\n\n')
    // Convert mammoth's <br /> to <br>
    .replace(/<br\s*\/?>/gi, '<br>')
    // Remove style attributes
    .replace(/\s*style="[^"]*"/gi, '')
    // Remove class attributes
    .replace(/\s*class="[^"]*"/gi, '')
    .trim();
}

// POST /api/projects/[projectId]/books/[bookId]/import-docx
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
      .select('id')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify book exists
    const { data: book } = await supabase
      .from('books')
      .select('id')
      .eq('id', bookId)
      .eq('project_id', projectId)
      .single();

    if (!book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    // Get the uploaded file
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!file.name.endsWith('.docx')) {
      return NextResponse.json({ error: 'File must be a .docx file' }, { status: 400 });
    }

    // Read file as buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse DOCX with mammoth
    const result = await mammoth.convertToHtml({ buffer });
    const html = result.value;

    // Parse chapters from HTML
    const parsedChapters = parseDocxHtml(html);

    if (parsedChapters.length === 0) {
      return NextResponse.json({
        error: 'No chapters found in document. Make sure chapter titles like "Prologue", "Chapitre 1", etc. are present.'
      }, { status: 400 });
    }

    // Get existing chapters
    const { data: existingChapters } = await supabase
      .from('chapters')
      .select('id, title, sort_order')
      .eq('book_id', bookId)
      .order('sort_order', { ascending: true });

    const existingMap = new Map(
      (existingChapters || []).map(ch => [ch.title.toLowerCase(), ch])
    );

    // Find max sort order
    let maxSortOrder = Math.max(0, ...(existingChapters || []).map(ch => ch.sort_order));

    const results = {
      created: [] as string[],
      updated: [] as string[],
    };

    // Process each parsed chapter
    for (const parsed of parsedChapters) {
      const existing = existingMap.get(parsed.title.toLowerCase());

      // Count words
      const plainText = parsed.content
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const wordCount = plainText ? plainText.split(/\s+/).filter(Boolean).length : 0;

      if (existing) {
        // Update existing chapter
        await supabase
          .from('chapters')
          .update({
            content: parsed.content,
            word_count: wordCount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        results.updated.push(parsed.title);
      } else {
        // Create new chapter
        maxSortOrder += 1;
        await supabase
          .from('chapters')
          .insert({
            book_id: bookId,
            title: parsed.title,
            content: parsed.content,
            word_count: wordCount,
            sort_order: maxSortOrder,
          });

        results.created.push(parsed.title);
      }
    }

    return NextResponse.json({
      success: true,
      chapters: parsedChapters.length,
      created: results.created,
      updated: results.updated,
      warnings: result.messages.map(m => m.message),
    });

  } catch (error) {
    console.error('DOCX import error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
