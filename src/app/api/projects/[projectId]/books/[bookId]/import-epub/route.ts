import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import JSZip from 'jszip';

interface RouteParams {
  params: Promise<{ projectId: string; bookId: string }>;
}

// Chapter detection patterns for title matching
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

function isChapterTitle(text: string): boolean {
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

interface SpineItem {
  href: string;
  id: string;
}

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
}

// Parse the OPF file to get spine order
function parseOpf(opfContent: string): { spine: SpineItem[], manifest: Map<string, ManifestItem> } {
  const manifest = new Map<string, ManifestItem>();
  const spine: SpineItem[] = [];

  // Parse manifest items
  const manifestRegex = /<item\s+[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*media-type="([^"]+)"[^>]*\/?>/gi;
  let match;
  while ((match = manifestRegex.exec(opfContent)) !== null) {
    manifest.set(match[1], {
      id: match[1],
      href: match[2],
      mediaType: match[3],
    });
  }

  // Also try alternate attribute order
  const manifestRegex2 = /<item\s+[^>]*href="([^"]+)"[^>]*id="([^"]+)"[^>]*media-type="([^"]+)"[^>]*\/?>/gi;
  while ((match = manifestRegex2.exec(opfContent)) !== null) {
    if (!manifest.has(match[2])) {
      manifest.set(match[2], {
        id: match[2],
        href: match[1],
        mediaType: match[3],
      });
    }
  }

  // Parse spine
  const spineRegex = /<itemref\s+[^>]*idref="([^"]+)"[^>]*\/?>/gi;
  while ((match = spineRegex.exec(opfContent)) !== null) {
    const item = manifest.get(match[1]);
    if (item && item.mediaType.includes('xhtml')) {
      spine.push({ href: item.href, id: item.id });
    }
  }

  return { spine, manifest };
}

// Strip HTML tags to get plain text
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract text content from XHTML
function extractTextFromXhtml(xhtml: string): string {
  // Get body content
  const bodyMatch = xhtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return '';

  let body = bodyMatch[1];

  // Remove scripts and styles
  body = body.replace(/<script[\s\S]*?<\/script>/gi, '');
  body = body.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Extract title from h1, h2, or title-like elements (now handles nested tags)
  const titleMatch = body.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
  if (titleMatch) {
    return stripTags(titleMatch[1]);
  }

  // Fallback: try first paragraph or div with class containing "title" or "chapter"
  const titleClassMatch = body.match(/<(?:p|div)[^>]*class="[^"]*(?:title|chapter|heading)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|div)>/i);
  if (titleClassMatch) {
    return stripTags(titleClassMatch[1]);
  }

  return '';
}

// Clean XHTML content for storage - merges consecutive lines into paragraphs
function cleanXhtmlContent(xhtml: string): string {
  // Get body content
  let content = '';

  const bodyStartMatch = xhtml.match(/<body[^>]*>/i);
  if (bodyStartMatch) {
    const bodyStart = xhtml.indexOf(bodyStartMatch[0]) + bodyStartMatch[0].length;
    const bodyEnd = xhtml.lastIndexOf('</body>');
    if (bodyEnd > bodyStart) {
      content = xhtml.substring(bodyStart, bodyEnd);
    } else {
      content = xhtml.substring(bodyStart);
    }
  } else {
    content = xhtml;
  }

  if (!content.trim()) {
    console.log('[EPUB Import] WARNING: No body content found');
    return '';
  }

  // Remove scripts, styles, chapter titles
  content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
  content = content.replace(/<style[\s\S]*?<\/style>/gi, '');
  content = content.replace(/<h[12][^>]*>[\s\S]*?<\/h[12]>/gi, '');

  // Remove wrapping divs
  content = content.replace(/<div[^>]*>/gi, '');
  content = content.replace(/<\/div>/gi, '');

  // Remove attributes from p tags
  content = content.replace(/<p[^>]*>/gi, '<p>');

  // Unwrap spans
  content = content.replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, '$1');

  // Remove section tags
  content = content.replace(/<\/?section[^>]*>/gi, '');

  // Extract all paragraphs
  const paragraphRegex = /<p>([\s\S]*?)<\/p>/gi;
  const paragraphs: string[] = [];
  let match;

  while ((match = paragraphRegex.exec(content)) !== null) {
    const text = match[1]
      .replace(/&nbsp;/g, ' ')
      .replace(/&#160;/g, ' ')
      .trim();
    paragraphs.push(text);
  }

  // Keep each line as a separate <p> for proper indent
  // Empty lines become empty paragraphs (visual spacing)
  const result: string[] = [];

  for (const para of paragraphs) {
    if (para === '' || para === ' ') {
      // Empty paragraph = visual spacer
      result.push('<p></p>');
    } else {
      result.push(`<p>${para}</p>`);
    }
  }

  return result.join('\n');
}

// POST /api/projects/[projectId]/books/[bookId]/import-epub
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

    if (!file.name.endsWith('.epub')) {
      return NextResponse.json({ error: 'File must be an .epub file' }, { status: 400 });
    }

    // Read file as buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse EPUB (it's a zip file)
    const zip = await JSZip.loadAsync(buffer);

    // Find the OPF file (content.opf or similar)
    let opfPath = '';
    let opfContent = '';

    // First check container.xml for the OPF path
    const containerFile = zip.file('META-INF/container.xml');
    if (containerFile) {
      const containerContent = await containerFile.async('string');
      const opfMatch = containerContent.match(/full-path="([^"]+\.opf)"/i);
      if (opfMatch) {
        opfPath = opfMatch[1];
      }
    }

    // If not found, search for it
    if (!opfPath) {
      for (const path of Object.keys(zip.files)) {
        if (path.endsWith('.opf')) {
          opfPath = path;
          break;
        }
      }
    }

    if (!opfPath) {
      return NextResponse.json({ error: 'Invalid EPUB: no OPF file found' }, { status: 400 });
    }

    const opfFile = zip.file(opfPath);
    if (!opfFile) {
      return NextResponse.json({ error: 'Invalid EPUB: cannot read OPF file' }, { status: 400 });
    }

    opfContent = await opfFile.async('string');
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

    // Parse OPF to get spine order
    const { spine } = parseOpf(opfContent);

    if (spine.length === 0) {
      return NextResponse.json({ error: 'Invalid EPUB: no content found' }, { status: 400 });
    }

    // Process each spine item
    const parsedChapters: ParsedChapter[] = [];
    let foundFirstChapter = false;

    console.log(`[EPUB Import] Processing ${spine.length} spine items...`);

    for (const item of spine) {
      const filePath = opfDir + item.href;
      const file = zip.file(filePath);

      if (!file) {
        console.log(`[EPUB Import] File not found: ${filePath}`);
        continue;
      }

      const xhtmlContent = await file.async('string');
      const title = extractTextFromXhtml(xhtmlContent);

      console.log(`[EPUB Import] File: ${item.href}, Title: "${title}", IsChapter: ${isChapterTitle(title)}`);

      // Check if this is a chapter
      if (isChapterTitle(title)) {
        foundFirstChapter = true;
        const content = cleanXhtmlContent(xhtmlContent);

        console.log(`[EPUB Import] -> Adding chapter "${title}", content length: ${content.length}`);

        parsedChapters.push({
          title: normalizeChapterTitle(title),
          content,
        });
      } else if (foundFirstChapter && title) {
        // After first chapter, include sections that have titles
        // This handles cases where chapters don't follow the pattern
        const content = cleanXhtmlContent(xhtmlContent);
        if (content.trim()) {
          console.log(`[EPUB Import] -> Adding section "${title}", content length: ${content.length}`);
          parsedChapters.push({
            title: title,
            content,
          });
        }
      }
    }

    console.log(`[EPUB Import] Found ${parsedChapters.length} chapters`);

    if (parsedChapters.length === 0) {
      return NextResponse.json({
        error: 'Aucun chapitre trouvé. Assurez-vous que les titres (Prologue, Chapitre 1, etc.) sont présents.'
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
        .replace(/<[^>]+>/g, ' ')
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
    });

  } catch (error) {
    console.error('EPUB import error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
