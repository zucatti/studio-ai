import puppeteer, { Browser } from 'puppeteer';
import { PDFDocument } from 'pdf-lib';

// Page size: 139.7mm x 215.9mm (5.5" x 8.5" US Trade)
const PAGE_WIDTH_MM = 139.7;
const PAGE_HEIGHT_MM = 215.9;

// Margins in mm (as specified)
const MARGIN_TOP = 18;      // haut
const MARGIN_BOTTOM = 20;   // bas
const MARGIN_INNER = 24;    // intérieur (gutter)
const MARGIN_OUTER = 16;    // extérieur

// Header/footer spacing
const HEADER_MARGIN = 12.7;  // en-tête
const FOOTER_MARGIN = 15.2;  // pied de page

export interface BookData {
  title: string;
  author: string;
  year: number;
  isbn?: string | null;
  mentions?: string[] | null;
  chapters: ChapterData[];
}

export interface ChapterData {
  title: string;
  content: string;
  chapterNumber: number;
}

interface TocEntry {
  chapterNumber: number;
  title: string;
  pageNumber: number;
}

export async function generateBookPdf(book: BookData): Promise<Buffer> {
  let browser: Browser | null = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
    });

    // Generate each section separately to know exact page counts
    const sectionPdfs: { name: string; buffer: Uint8Array; pageCount: number }[] = [];

    // 1. Title page
    const titlePdf = await generateSectionPdf(browser, generateTitlePageHtml(book));
    sectionPdfs.push({ name: 'title', buffer: titlePdf.buffer, pageCount: titlePdf.pageCount });

    // 2. Dedication pages (each as separate section)
    if (book.mentions && book.mentions.length > 0) {
      for (let i = 0; i < book.mentions.length; i++) {
        const dedicationPdf = await generateSectionPdf(browser, generateDedicationPageHtml(book.mentions[i]));
        sectionPdfs.push({ name: `dedication-${i}`, buffer: dedicationPdf.buffer, pageCount: dedicationPdf.pageCount });
      }
    }

    // 3. Generate chapters to know their page counts
    const chapterPageCounts: number[] = [];
    for (const chapter of book.chapters) {
      const chapterPdf = await generateSectionPdf(browser, generateSingleChapterHtml(chapter));
      chapterPageCounts.push(chapterPdf.pageCount);
    }

    // Calculate which chapters need blank pages and TOC page numbers
    let currentPage = 1; // After title

    // Add dedication page counts
    for (let i = 0; i < (book.mentions?.length || 0); i++) {
      // Each dedication starts on right (odd) page
      if (currentPage % 2 === 0) currentPage++;
      currentPage++; // Dedication is 1 page
    }

    // TOC starts on right page
    if (currentPage % 2 === 0) currentPage++;
    const tocPages = Math.max(1, Math.ceil(book.chapters.length / 28));
    currentPage += tocPages;

    // Calculate chapter positions
    const toc: TocEntry[] = [];
    const chaptersNeedingBlankPage = new Set<number>();

    for (let i = 0; i < book.chapters.length; i++) {
      const chapter = book.chapters[i];
      // Chapter starts on next page
      currentPage++;

      // If this is an even page, we need a blank page to push to odd
      if (currentPage % 2 === 0) {
        chaptersNeedingBlankPage.add(chapter.chapterNumber);
        currentPage++; // Blank page, now chapter is on odd
      }

      toc.push({
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        pageNumber: currentPage,
      });

      // Add this chapter's pages (minus 1 because we already counted the first page)
      currentPage += chapterPageCounts[i] - 1;
    }

    // Now generate the final PDF with correct structure
    const finalHtml = generateBookHtml(book, toc, false, chaptersNeedingBlankPage);

    const page = await browser.newPage();
    await page.setContent(finalHtml, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      width: `${PAGE_WIDTH_MM}mm`,
      height: `${PAGE_HEIGHT_MM}mm`,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="width: 100%; height: ${HEADER_MARGIN}mm;"></div>`,
      footerTemplate: `
        <div style="width: 100%; height: ${FOOTER_MARGIN}mm; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 9pt; font-family: 'Times New Roman', Times, serif; color: #333;" class="pageNumber"></span>
        </div>
      `,
      margin: {
        top: `${MARGIN_TOP}mm`,
        bottom: `${MARGIN_BOTTOM}mm`,
        left: `${MARGIN_INNER}mm`,
        right: `${MARGIN_OUTER}mm`,
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function generateSectionPdf(browser: Browser, html: string): Promise<{ buffer: Uint8Array; pageCount: number }> {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    width: `${PAGE_WIDTH_MM}mm`,
    height: `${PAGE_HEIGHT_MM}mm`,
    printBackground: true,
    margin: {
      top: `${MARGIN_TOP}mm`,
      bottom: `${MARGIN_BOTTOM}mm`,
      left: `${MARGIN_INNER}mm`,
      right: `${MARGIN_OUTER}mm`,
    },
  });

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pageCount = pdfDoc.getPageCount();
  await page.close();

  return { buffer: pdfBuffer, pageCount };
}

function generateTitlePageHtml(book: BookData): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
${getBaseStyles()}
.title-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
}
.title-page h1 {
  font-size: 18pt;
  font-weight: bold;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1.3;
  margin-bottom: 50mm;
}
.title-page .copyright {
  font-size: 10pt;
  font-style: italic;
  color: #333;
  margin-bottom: 3mm;
}
.title-page .isbn {
  font-size: 10pt;
  color: #333;
}
</style>
</head>
<body>
${generateTitlePage(book)}
</body>
</html>`;
}

function generateDedicationPageHtml(mention: string): string {
  const lines = mention.split('\n').filter(l => l.trim());
  const html = lines.map(l => escapeHtml(l.trim())).join('<br/>');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
${getBaseStyles()}
.dedication-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-end;
  text-align: right;
}
.dedication-page p {
  font-style: italic;
  font-size: 11pt;
  line-height: 1.6;
  color: #333;
}
</style>
</head>
<body>
<div class="dedication-page"><p>${html}</p></div>
</body>
</html>`;
}

function generateSingleChapterHtml(chapter: ChapterData): string {
  const content = processChapterContent(chapter.content);
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
${getBaseStyles()}
${getChapterStyles()}
</style>
</head>
<body>
<div class="chapter">
  <div class="chapter-header">
    <h2>Chapitre ${chapter.chapterNumber}</h2>
  </div>
  <div class="chapter-content">
${content}
  </div>
</div>
</body>
</html>`;
}

function getBaseStyles(): string {
  return `
@page {
  size: ${PAGE_WIDTH_MM}mm ${PAGE_HEIGHT_MM}mm;
}
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
html, body {
  font-family: 'Times New Roman', Times, Georgia, serif;
  font-size: 11pt;
  line-height: 1.5;
  color: #000;
  background: #fff;
}`;
}

function getChapterStyles(): string {
  return `
.chapter-header {
  text-align: center;
  padding-top: 20mm;
  margin-bottom: 10mm;
}
.chapter-header h2 {
  font-size: 14pt;
  font-weight: normal;
  letter-spacing: 0.03em;
}
.chapter-content {
  text-align: justify;
  text-justify: inter-word;
  hyphens: auto;
  -webkit-hyphens: auto;
}
.chapter-content p {
  text-indent: 1.5em;
  margin: 0;
  line-height: 1.5;
  orphans: 2;
  widows: 2;
}
.chapter-content p:first-child {
  text-indent: 0;
}
.chapter-content p.scene-break {
  text-indent: 0;
  margin-top: 1em;
}
.chapter-content p.centered {
  text-indent: 0;
  text-align: center;
  margin: 0.8em 0;
}
.chapter-content em { font-style: italic; }
.chapter-content strong { font-weight: bold; }`;
}

function generateBookHtml(book: BookData, toc: TocEntry[], isFirstPass: boolean, chaptersOnEvenPages: Set<number>): string {
  const titlePage = generateTitlePage(book);
  const dedicationPages = generateDedicationPages(book.mentions);
  const tocHtml = generateTocHtml(book.chapters, toc, isFirstPass);
  const chaptersHtml = generateChaptersHtml(book.chapters, chaptersOnEvenPages);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(book.title)}</title>
<style>
@page {
  size: ${PAGE_WIDTH_MM}mm ${PAGE_HEIGHT_MM}mm;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  font-family: 'Times New Roman', Times, Georgia, serif;
  font-size: 11pt;
  line-height: 1.5;
  color: #000;
  background: #fff;
}

/* ============ TITLE PAGE ============ */
.title-page {
  page-break-after: always;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
}

.title-page h1 {
  font-size: 18pt;
  font-weight: bold;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1.3;
  margin-bottom: 50mm;
}

.title-page .copyright {
  font-size: 10pt;
  font-style: italic;
  color: #333;
  margin-bottom: 3mm;
}

.title-page .isbn {
  font-size: 10pt;
  color: #333;
}

/* ============ DEDICATION ============ */
.dedication-page {
  page-break-before: right;
  page-break-after: always;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-end;
  text-align: right;
}

.dedication-page p {
  font-style: italic;
  font-size: 11pt;
  line-height: 1.6;
  color: #333;
}

/* ============ TOC ============ */
.toc-page {
  page-break-before: right;
  page-break-after: always;
}

.toc-page h2 {
  font-size: 14pt;
  font-weight: normal;
  text-align: center;
  margin-bottom: 10mm;
  letter-spacing: 0.03em;
}

.toc-table {
  width: 100%;
  border-collapse: collapse;
}

.toc-table tr td {
  padding: 1mm 0;
  vertical-align: bottom;
  font-size: 10pt;
  line-height: 1.8;
}

.toc-table .col-name {
  white-space: nowrap;
}

.toc-table .col-dots {
  width: 100%;
  padding: 0 2mm;
}

.toc-table .col-dots span {
  display: block;
  border-bottom: 1px dotted #666;
  height: 0.9em;
}

.toc-table .col-page {
  white-space: nowrap;
  text-align: right;
}

/* ============ BLANK PAGE (to force recto start) ============ */
.blank-page {
  page-break-after: always;
  min-height: 100vh;
}

/* ============ CHAPTERS ============ */
.chapter {
  page-break-before: always;
}

.chapter-header {
  text-align: center;
  padding-top: 20mm;
  margin-bottom: 10mm;
}

.chapter-header h2 {
  font-size: 14pt;
  font-weight: normal;
  letter-spacing: 0.03em;
}

.chapter-content {
  text-align: justify;
  text-justify: inter-word;
  hyphens: auto;
  -webkit-hyphens: auto;
}

.chapter-content p {
  text-indent: 1.5em;
  margin: 0;
  line-height: 1.5;
  orphans: 2;
  widows: 2;
}

.chapter-content p:first-child {
  text-indent: 0;
}

.chapter-content p.scene-break {
  text-indent: 0;
  margin-top: 1em;
}

.chapter-content p.centered {
  text-indent: 0;
  text-align: center;
  margin: 0.8em 0;
}

.chapter-content em { font-style: italic; }
.chapter-content strong { font-weight: bold; }
</style>
</head>
<body>
${titlePage}
${dedicationPages}
${tocHtml}
${chaptersHtml}
</body>
</html>`;
}

function generateTitlePage(book: BookData): string {
  const isbnHtml = book.isbn ? `<p class="isbn">ISBN: ${escapeHtml(book.isbn)}</p>` : '';
  return `
<div class="title-page">
  <h1>${escapeHtml(book.title)}</h1>
  <div>
    <p class="copyright">Copyright (c) ${book.year} ${escapeHtml(book.author)}</p>
    ${isbnHtml}
  </div>
</div>`;
}

function generateDedicationPages(mentions: string[] | null | undefined): string {
  if (!mentions || mentions.length === 0) return '';
  return mentions.map(mention => {
    const lines = mention.split('\n').filter(l => l.trim());
    const html = lines.map(l => escapeHtml(l.trim())).join('<br/>');
    return `<div class="dedication-page"><p>${html}</p></div>`;
  }).join('\n');
}

function generateTocHtml(chapters: ChapterData[], toc: TocEntry[], isFirstPass: boolean): string {
  const rows = chapters.map(chapter => {
    const entry = toc.find(t => t.chapterNumber === chapter.chapterNumber);
    const pageNum = isFirstPass ? '?' : (entry?.pageNumber || '?');
    return `<tr><td class="col-name">Chapitre ${chapter.chapterNumber}</td><td class="col-dots"><span></span></td><td class="col-page">${pageNum}</td></tr>`;
  }).join('\n');

  return `
<div class="toc-page">
  <h2>Table des matières</h2>
  <table class="toc-table">
${rows}
  </table>
</div>`;
}

function generateChaptersHtml(chapters: ChapterData[], chaptersOnEvenPages: Set<number>): string {
  return chapters.map(chapter => {
    const content = processChapterContent(chapter.content);
    // Insert blank page before chapters that would start on even (left) pages
    const blankPage = chaptersOnEvenPages.has(chapter.chapterNumber)
      ? '<div class="blank-page"></div>\n'
      : '';
    return `${blankPage}
<div class="chapter" data-chapter-marker="${chapter.chapterNumber}">
  <div class="chapter-header">
    <h2>Chapitre ${chapter.chapterNumber}</h2>
  </div>
  <div class="chapter-content">
${content}
  </div>
</div>`;
  }).join('\n');
}

function processChapterContent(content: string): string {
  if (!content) return '';

  if (content.trim().startsWith('<')) {
    // HTML content from TipTap
    // Problem: each line is a separate <p>, but we want consecutive <p> to be merged
    // Only create new paragraph (with indent) after empty <p> (scene break)

    // Step 1: Normalize - extract all paragraphs
    const paragraphs: { content: string; isCentered: boolean; isEmpty: boolean }[] = [];
    const pRegex = /<p([^>]*)>([\s\S]*?)<\/p>/gi;
    let match;

    while ((match = pRegex.exec(content)) !== null) {
      const attrs = match[1] || '';
      const innerContent = match[2] || '';
      const isCentered = /text-align:\s*center/i.test(attrs);
      const isEmpty = !innerContent.trim();

      paragraphs.push({ content: innerContent, isCentered, isEmpty });
    }

    if (paragraphs.length === 0) {
      // No <p> tags found, return as-is
      return content;
    }

    // Step 2: Group consecutive non-empty paragraphs
    const groups: { lines: string[]; isCentered: boolean; isAfterBreak: boolean }[] = [];
    let currentGroup: string[] = [];
    let currentCentered = false;
    let afterBreak = true; // First paragraph is always "after break" (no indent for first line)

    for (const p of paragraphs) {
      if (p.isEmpty) {
        // Empty paragraph = scene break
        if (currentGroup.length > 0) {
          groups.push({ lines: currentGroup, isCentered: currentCentered, isAfterBreak: afterBreak });
          currentGroup = [];
        }
        afterBreak = true;
        continue;
      }

      if (p.isCentered) {
        // Centered paragraphs are always separate
        if (currentGroup.length > 0) {
          groups.push({ lines: currentGroup, isCentered: currentCentered, isAfterBreak: afterBreak });
          currentGroup = [];
          afterBreak = false;
        }
        groups.push({ lines: [p.content], isCentered: true, isAfterBreak: afterBreak });
        afterBreak = false;
        continue;
      }

      // Regular paragraph - add to current group
      currentGroup.push(p.content);
      if (currentGroup.length === 1) {
        currentCentered = p.isCentered;
      }
    }

    // Don't forget last group
    if (currentGroup.length > 0) {
      groups.push({ lines: currentGroup, isCentered: currentCentered, isAfterBreak: afterBreak });
    }

    // Step 3: Generate HTML
    return groups.map((group, idx) => {
      const content = group.lines.join('<br/>');
      let className = '';

      if (group.isCentered) {
        className = 'centered';
      } else if (group.isAfterBreak && idx > 0) {
        className = 'scene-break';
      }

      return `<p${className ? ` class="${className}"` : ''}>${content}</p>`;
    }).join('\n');
  }

  // Plain text
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n');
  const blocks = normalized.split(/\n\n/);
  const paragraphs: string[] = [];
  let afterBreak = false;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) { afterBreak = true; continue; }
    const escaped = escapeHtml(block).replace(/\n/g, '<br/>');
    if (afterBreak && i > 0) {
      paragraphs.push(`<p class="scene-break">${escaped}</p>`);
    } else {
      paragraphs.push(`<p>${escaped}</p>`);
    }
    afterBreak = false;
  }
  return paragraphs.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
