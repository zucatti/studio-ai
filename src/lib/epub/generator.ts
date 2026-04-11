import JSZip from 'jszip';
import type { Book, Chapter } from '@/types/database';

interface EpubOptions {
  book: Book;
  chapters: Chapter[];
  author?: string;
  language?: string;
  coverImageUrl?: string;
  isbn?: string;
  year?: number;
  mentions?: string;
}

// Escape HTML entities
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Convert TipTap HTML to EPUB-compatible XHTML
// Adds proper classes for styling
function htmlToEpubXhtml(content: string): string {
  if (!content) return '';

  // Check if content looks like HTML (starts with a tag)
  const isHtml = content.trim().startsWith('<');

  if (!isHtml) {
    // Legacy plain text:
    // - \n\n = new paragraph
    // - \n = <br/> within paragraph
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
        const withBreaks = escaped.replace(/\n/g, '<br/>');
        return `<p class="p-body">${withBreaks}</p>`;
      })
      .filter(Boolean)
      .join('\n');
  }

  // TipTap HTML: add classes for consistent EPUB styling
  return content
    // Convert HTML entities to XHTML-safe numeric entities
    .replace(/&nbsp;/g, '&#160;')
    .replace(/&mdash;/g, '&#8212;')
    .replace(/&ndash;/g, '&#8211;')
    .replace(/&lsquo;/g, '&#8216;')
    .replace(/&rsquo;/g, '&#8217;')
    .replace(/&ldquo;/g, '&#8220;')
    .replace(/&rdquo;/g, '&#8221;')
    .replace(/&hellip;/g, '&#8230;')
    // Add p-body class to paragraphs
    .replace(/<p>/g, '<p class="p-body">')
    // Make sure br tags are self-closing for XHTML
    .replace(/<br>/g, '<br/>')
    // Ensure hr tags are self-closing
    .replace(/<hr>/g, '<hr/>')
    // Convert h1/h2/h3 to styled headings
    .replace(/<h1>/g, '<h1 class="chapter-heading">')
    .replace(/<h2>/g, '<h2 class="section-heading">')
    .replace(/<h3>/g, '<h3 class="subsection-heading">');
}

// Generate UUID
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
}

// CSS styles for the EPUB
const BOOK_CSS = `
/* Base styles */
body {
  font-family: "Georgia", "Times New Roman", serif;
  font-size: 1em;
  line-height: 1.6;
  color: #1a1a1a;
  margin: 0;
  padding: 0;
}

/* Chapter title */
h1.chapter-title {
  font-family: "Georgia", serif;
  font-size: 1.5em;
  font-weight: 700;
  color: #3E3940;
  text-align: center;
  margin: 0 0 2em 0;
  padding: 0;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

/* Body paragraphs */
p.p-body {
  font-family: "Georgia", "Times New Roman", serif;
  font-size: 1em;
  font-weight: 400;
  color: #000000;
  text-align: justify;
  text-indent: 1.5em;
  margin: 0 0 0.8em 0;
  padding: 0;
  line-height: 1.5;
  hyphens: auto;
  -webkit-hyphens: auto;
}

/* Text formatting */
strong {
  font-weight: bold;
}

em {
  font-style: italic;
}

/* Section headings */
h1.chapter-heading {
  font-family: "Georgia", serif;
  font-size: 1.3em;
  font-weight: 700;
  text-align: center;
  margin: 1.5em 0 1em 0;
}

h2.section-heading {
  font-family: "Georgia", serif;
  font-size: 1.1em;
  font-weight: 600;
  margin: 1.2em 0 0.8em 0;
}

h3.subsection-heading {
  font-family: "Georgia", serif;
  font-size: 1em;
  font-weight: 600;
  font-style: italic;
  margin: 1em 0 0.5em 0;
}

/* Lists */
ul, ol {
  margin: 0.8em 0 0.8em 2em;
  padding: 0;
}

li {
  margin-bottom: 0.3em;
}

/* Blockquote */
blockquote {
  font-style: italic;
  margin: 1em 2em;
  padding-left: 1em;
  border-left: 2px solid #808080;
}


/* Cover image */
.cover-image {
  width: 100%;
  height: 100%;
  text-align: center;
}

.cover-image img {
  max-width: 100%;
  max-height: 100%;
}

/* Title page */
.title-page {
  text-align: center;
  padding-top: 30%;
}

.title-page .title-content {
  margin-bottom: 40%;
}

.title-page .book-title {
  font-family: "Georgia", serif;
  font-size: 2em;
  font-weight: 700;
  color: #3E3940;
  margin-bottom: 1em;
}

.title-page .book-author {
  font-family: "Georgia", serif;
  font-size: 1.2em;
  color: #606060;
  font-style: italic;
  text-align: center;
  text-indent: 0;
}

.title-page .book-summary {
  font-family: "Georgia", serif;
  font-size: 0.9em;
  color: #606060;
  font-style: italic;
  margin-top: 2em;
  padding: 0 2em;
}

.title-page .book-legal {
  text-align: center;
}

.title-page .book-copyright {
  font-family: "Georgia", serif;
  font-size: 0.8em;
  color: #808080;
  margin: 0;
  padding: 0;
  text-align: center;
  text-indent: 0;
}

.title-page .book-isbn {
  font-family: "Georgia", serif;
  font-size: 0.8em;
  color: #808080;
  margin: 0.5em 0 0 0;
  padding: 0;
  text-align: center;
  text-indent: 0;
}

/* Table of contents */
nav#toc ol {
  list-style: none;
  padding-left: 0;
  margin: 1em 0;
}

nav#toc li {
  margin: 0.5em 0;
}

nav#toc a {
  font-family: "Georgia", serif;
  font-size: 1em;
  color: #3E3940;
  text-decoration: none;
}

nav#toc a:hover {
  text-decoration: underline;
}

/* Mentions page */
.mentions-page {
  padding-top: 30%;
  text-align: right;
}

.mentions-page p {
  font-family: "Georgia", serif;
  font-size: 1em;
  font-style: italic;
  color: inherit;
  text-align: right;
  text-indent: 0;
  margin: 0 0 1em 0;
  line-height: 1.6;
  opacity: 0.7;
}
`;

// Generate container.xml
function generateContainerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

// Generate content.opf (package file)
function generateContentOpf(options: EpubOptions, uuid: string, hasCover: boolean, mentionsCount: number): string {
  const { book, chapters, author = 'Unknown Author', language = 'fr' } = options;
  const sortedChapters = [...chapters].sort((a, b) => a.sort_order - b.sort_order);
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const manifestItems = sortedChapters
    .map(
      (ch, i) =>
        `    <item id="chapter-${i + 1}" href="chapter-${i + 1}.xhtml" media-type="application/xhtml+xml"/>`
    )
    .join('\n');

  const spineItems = sortedChapters
    .map((_, i) => `    <itemref idref="chapter-${i + 1}" linear="yes"/>`)
    .join('\n');

  // Cover items for manifest
  const coverManifest = hasCover
    ? `    <item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>
    <item id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"/>`
    : '';

  // Cover spine item
  const coverSpine = hasCover ? `    <itemref idref="cover-page" linear="yes"/>` : '';

  // Cover metadata
  const coverMeta = hasCover ? `    <meta name="cover" content="cover-image"/>` : '';

  // Mentions items (one per mention)
  const mentionsManifest = Array.from({ length: mentionsCount }, (_, i) =>
    `    <item id="mentions-${i + 1}" href="mentions-${i + 1}.xhtml" media-type="application/xhtml+xml"/>`
  ).join('\n');
  const mentionsSpine = Array.from({ length: mentionsCount }, (_, i) =>
    `    <itemref idref="mentions-${i + 1}" linear="yes"/>`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${escapeHtml(book.title)}</dc:title>
    <dc:creator id="creator">${escapeHtml(author)}</dc:creator>
    <meta refines="#creator" property="role" scheme="marc:relators">aut</meta>
    <dc:date>${now.split('T')[0]}</dc:date>
    <dc:identifier id="BookId">${uuid}</dc:identifier>
    <dc:language>${language}</dc:language>
    <meta property="dcterms:modified">${now}</meta>
${coverMeta}
  </metadata>
  <manifest>
${coverManifest}
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="title-page" href="title-page.xhtml" media-type="application/xhtml+xml"/>
${mentionsManifest}
${manifestItems}
    <item id="stylesheet" href="css/book.css" media-type="text/css"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
${coverSpine}
    <itemref idref="title-page" linear="yes"/>
${mentionsSpine}
    <itemref idref="toc" linear="yes"/>
${spineItems}
  </spine>
  <guide>
${hasCover ? '    <reference type="cover" title="Couverture" href="cover.xhtml"/>' : ''}
    <reference type="toc" title="Table des matières" href="toc.xhtml"/>
    <reference type="text" title="Début" href="chapter-1.xhtml"/>
  </guide>
</package>`;
}

// Generate NCX (for EPUB2 compatibility)
function generateNcx(options: EpubOptions, uuid: string): string {
  const { book, chapters } = options;
  const sortedChapters = [...chapters].sort((a, b) => a.sort_order - b.sort_order);

  const navPoints = sortedChapters
    .map(
      (ch, i) => `
    <navPoint id="chapter-${i + 1}" playOrder="${i + 2}">
      <navLabel><text>${escapeHtml(ch.title)}</text></navLabel>
      <content src="chapter-${i + 1}.xhtml"/>
    </navPoint>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeHtml(book.title)}</text></docTitle>
  <navMap>
    <navPoint id="title-page" playOrder="1">
      <navLabel><text>Page de titre</text></navLabel>
      <content src="title-page.xhtml"/>
    </navPoint>${navPoints}
  </navMap>
</ncx>`;
}

// Generate toc.xhtml (EPUB3 navigation)
function generateTocXhtml(options: EpubOptions): string {
  const { book, chapters } = options;
  const sortedChapters = [...chapters].sort((a, b) => a.sort_order - b.sort_order);

  const tocItems = sortedChapters
    .map(
      (ch, i) =>
        `        <li><a href="chapter-${i + 1}.xhtml">${escapeHtml(ch.title)}</a></li>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="fr">
<head>
  <title>Table des matières</title>
  <link rel="stylesheet" href="css/book.css" type="text/css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table des matières</h1>
    <ol>
${tocItems}
    </ol>
  </nav>
</body>
</html>`;
}

// Generate cover page
function generateCoverPage(book: Book): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="fr">
<head>
  <title>Couverture</title>
  <link rel="stylesheet" href="css/book.css" type="text/css"/>
  <style>
    body { margin: 0; padding: 0; }
    .cover-container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .cover-container img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <div class="cover-container">
    <img src="images/cover.jpg" alt="${escapeHtml(book.title)}"/>
  </div>
</body>
</html>`;
}

// Generate title page
function generateTitlePage(options: EpubOptions): string {
  const { book, author = 'Unknown Author', year, isbn } = options;
  const displayYear = year || new Date().getFullYear();

  const summaryHtml = book.summary
    ? `<p class="book-summary">${escapeHtml(book.summary)}</p>`
    : '';

  const copyrightHtml = `<p class="book-copyright">© ${displayYear} ${escapeHtml(author)}</p>`;
  const isbnHtml = isbn ? `<p class="book-isbn">ISBN: ${escapeHtml(isbn)}</p>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="fr">
<head>
  <title>${escapeHtml(book.title)}</title>
  <link rel="stylesheet" href="css/book.css" type="text/css"/>
</head>
<body>
  <div class="title-page">
    <div class="title-content">
      <p class="book-title">${escapeHtml(book.title)}</p>
      <p class="book-author">${escapeHtml(author)}</p>
      ${summaryHtml}
    </div>
    <div class="book-legal">
      ${copyrightHtml}
      ${isbnHtml}
    </div>
  </div>
</body>
</html>`;
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

// Generate a single mentions page
function generateMentionsPage(mention: string, index: number, language = 'fr'): string {
  // Convert mentions text to paragraphs
  const paragraphs = mention
    .split(/\n\n+/)
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br/>')}</p>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${language}">
<head>
  <title>Mention ${index + 1}</title>
  <link rel="stylesheet" href="css/book.css" type="text/css"/>
</head>
<body>
  <div class="mentions-page">
${paragraphs}
  </div>
</body>
</html>`;
}

// Generate chapter XHTML
function generateChapterXhtml(chapter: Chapter, language = 'fr'): string {
  const contentHtml = htmlToEpubXhtml(chapter.content || '');

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${language}">
<head>
  <title>${escapeHtml(chapter.title)}</title>
  <link rel="stylesheet" href="css/book.css" type="text/css"/>
</head>
<body>
  <div class="chapter">
    <h1 class="chapter-title">${escapeHtml(chapter.title)}</h1>
${contentHtml}
  </div>
</body>
</html>`;
}

// Fetch cover image and return as buffer
async function fetchCoverImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Failed to fetch cover image:', error);
    return null;
  }
}

// Main EPUB generator function
export async function generateEpub(options: EpubOptions): Promise<Buffer> {
  const { book, chapters, coverImageUrl, mentions } = options;
  const sortedChapters = [...chapters].sort((a, b) => a.sort_order - b.sort_order);
  const uuid = generateUUID();

  // Try to fetch cover image
  let coverImageBuffer: Buffer | null = null;
  if (coverImageUrl) {
    coverImageBuffer = await fetchCoverImage(coverImageUrl);
  }
  const hasCover = coverImageBuffer !== null;

  // Parse mentions as array
  const mentionsList = parseMentions(mentions);

  const zip = new JSZip();

  // Add mimetype (must be first, uncompressed)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // Add META-INF/container.xml
  zip.file('META-INF/container.xml', generateContainerXml());

  // Add OPS/content.opf
  zip.file('OPS/content.opf', generateContentOpf(options, uuid, hasCover, mentionsList.length));

  // Add OPS/toc.ncx
  zip.file('OPS/toc.ncx', generateNcx(options, uuid));

  // Add OPS/toc.xhtml
  zip.file('OPS/toc.xhtml', generateTocXhtml(options));

  // Add cover if available
  if (hasCover && coverImageBuffer) {
    zip.file('OPS/cover.xhtml', generateCoverPage(book));
    zip.file('OPS/images/cover.jpg', coverImageBuffer);
  }

  // Add OPS/title-page.xhtml
  zip.file('OPS/title-page.xhtml', generateTitlePage(options));

  // Add mentions pages (one per mention)
  mentionsList.forEach((mention, index) => {
    zip.file(`OPS/mentions-${index + 1}.xhtml`, generateMentionsPage(mention, index, options.language || 'fr'));
  });

  // Add OPS/css/book.css
  zip.file('OPS/css/book.css', BOOK_CSS);

  // Add chapters
  sortedChapters.forEach((chapter, index) => {
    zip.file(
      `OPS/chapter-${index + 1}.xhtml`,
      generateChapterXhtml(chapter, options.language || 'fr')
    );
  });

  // Generate the ZIP buffer
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    // Ensure mimetype is first and uncompressed
    streamFiles: false,
  });

  return buffer;
}
