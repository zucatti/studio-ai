import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

interface RouteParams {
  params: Promise<{ projectId: string; bookId: string }>;
}

// POST /api/projects/[projectId]/books/[bookId]/export/pdf
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

    // Generate simple HTML that can be printed to PDF
    const html = generateBookHtml(book, chapters || [], session.user.name || 'Unknown');

    // Return HTML for client-side PDF generation
    // The client can use window.print() or a library like html2pdf
    return NextResponse.json({
      html,
      title: book.title,
      author: session.user.name || 'Unknown',
    });
  } catch (error) {
    console.error('PDF export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface Book {
  title: string;
  summary: string | null;
  isbn: string | null;
  year: number | null;
  mentions: string | null;
}

interface Chapter {
  title: string;
  content: string;
}

// Parse mentions from JSON string or return as single-item array
function parseMentions(mentionsStr: string | null | undefined): string[] {
  if (!mentionsStr) return [];
  try {
    const parsed = JSON.parse(mentionsStr);
    return Array.isArray(parsed) ? parsed.filter((m: string) => m.trim()) : [mentionsStr];
  } catch {
    // Legacy: single string mention
    return mentionsStr.trim() ? [mentionsStr] : [];
  }
}

// Convert plain text to HTML if needed
// - \n\n = new paragraph
// - \n = <br> within paragraph
function contentToHtml(content: string): string {
  if (!content) return '';
  // If already HTML, return as-is
  if (content.trim().startsWith('<')) {
    return content;
  }

  // Normalize and split by paragraphs
  const normalized = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  const paragraphs = normalized.split(/\n\n/);
  return paragraphs
    .map(p => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      const escaped = escapeHtml(trimmed);
      const withBreaks = escaped.replace(/\n/g, '<br>');
      return `<p>${withBreaks}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

function generateBookHtml(book: Book, chapters: Chapter[], author: string): string {
  const displayYear = book.year || new Date().getFullYear();

  const chaptersHtml = chapters
    .map(
      (ch) => `
      <div class="chapter" style="page-break-before: always;">
        <h2 style="font-size: 24px; margin-bottom: 20px; text-align: center;">
          ${escapeHtml(ch.title)}
        </h2>
        <div class="chapter-content" style="text-align: justify; line-height: 1.8;">
          ${contentToHtml(ch.content)}
        </div>
      </div>
    `
    )
    .join('\n');

  // Parse and generate mentions pages (one per mention)
  const mentionsList = parseMentions(book.mentions);
  const mentionsHtml = mentionsList.map((mention) => `
  <div class="mentions-page" style="page-break-after: always;">
    <div style="padding-top: 30%; text-align: right; font-style: italic; color: #000080; line-height: 1.8;">
      ${escapeHtml(mention).replace(/\n/g, '<br/>')}
    </div>
  </div>
  `).join('\n');

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(book.title)}</title>
  <style>
    @page {
      margin: 2.5cm;
      size: A4;
    }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
    }
    .title-page {
      text-align: center;
      padding: 80px 0 40px 0;
      page-break-after: always;
      min-height: 80vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .title-page .title-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .title-page h1 {
      font-size: 36px;
      margin-bottom: 20px;
    }
    .title-page .author {
      font-size: 18px;
      font-style: italic;
      color: #666;
      margin-bottom: 30px;
    }
    .title-page .summary {
      font-style: italic;
      color: #666;
      max-width: 400px;
      margin: 0 auto;
    }
    .title-page .legal {
      margin-top: auto;
      font-size: 10pt;
      color: #808080;
    }
    .chapter h2 {
      font-size: 24px;
      margin-top: 60px;
      margin-bottom: 30px;
      text-align: center;
    }
    .chapter-content p {
      text-indent: 2em;
      margin-bottom: 0.5em;
    }
    .chapter-content p:first-of-type {
      text-indent: 0;
    }
    .chapter-content strong {
      font-weight: bold;
    }
    .chapter-content em {
      font-style: italic;
    }
    .chapter-content h1, .chapter-content h2, .chapter-content h3 {
      text-indent: 0;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    .chapter-content ul, .chapter-content ol {
      margin-left: 2em;
      margin-bottom: 1em;
    }
    .chapter-content blockquote {
      margin-left: 2em;
      font-style: italic;
      border-left: 3px solid #ccc;
      padding-left: 1em;
    }
    @media print {
      body {
        padding: 0;
      }
      .chapter {
        page-break-before: always;
      }
    }
  </style>
</head>
<body>
  <div class="title-page">
    <div class="title-content">
      <h1>${escapeHtml(book.title)}</h1>
      <p class="author">${escapeHtml(author)}</p>
      ${book.summary ? `<p class="summary">${escapeHtml(book.summary)}</p>` : ''}
    </div>
    <div class="legal">
      <p>© ${displayYear} ${escapeHtml(author)}</p>
      ${book.isbn ? `<p>ISBN: ${escapeHtml(book.isbn)}</p>` : ''}
    </div>
  </div>
  ${mentionsHtml}
  ${chaptersHtml}
</body>
</html>
  `.trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
