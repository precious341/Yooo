import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { DocHeading, DocBreadcrumb, DocChunk, ChunkContentType, DocCategory } from '../types/index.js';
import { sanitizeDocContent, normalizeUrl, isUrlInScope } from '../utils/security.js';

export interface ExtractedPageContent {
  title: string;
  canonicalUrl?: string;
  category: DocCategory;
  headings: DocHeading[];
  breadcrumbs: DocBreadcrumb[];
  discoveredLinks: string[];
  docVersion?: string;
  rawMarkdown: string;
  wordCount: number;
  contentHash: string;
  chunks: Omit<DocChunk, 'id' | 'pageId' | 'sessionId' | 'createdAt'>[];
}

/**
 * Categorizes a documentation page based on URL structure, title, breadcrumbs, and headings.
 */
export function detectDocCategory(
  url: string,
  title: string,
  headings: DocHeading[] = [],
  breadcrumbs: DocBreadcrumb[] = []
): DocCategory {
  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();
  const breadcrumbText = breadcrumbs.map(b => b.label.toLowerCase()).join(' ');

  // 1. Getting Started
  if (
    urlLower.includes('/get-started') ||
    urlLower.includes('/getting-started') ||
    urlLower.includes('/quickstart') ||
    urlLower.includes('/quick-start') ||
    urlLower.includes('/start') ||
    urlLower.includes('/installation') ||
    urlLower.includes('/install') ||
    urlLower.includes('/introduction') ||
    urlLower.includes('/intro') ||
    urlLower.includes('/overview') ||
    titleLower.includes('getting started') ||
    titleLower.includes('get started') ||
    titleLower.includes('quick start') ||
    titleLower.includes('quickstart') ||
    titleLower.includes('installation') ||
    titleLower.includes('introduction') ||
    breadcrumbText.includes('getting started') ||
    breadcrumbText.includes('get started') ||
    breadcrumbText.includes('quick start')
  ) {
    return 'Getting Started';
  }

  // 2. Examples (Checked before generic tutorials so recipe/sample pages under tutorial trees get classified as Examples)
  if (
    urlLower.includes('/example') ||
    urlLower.includes('/examples') ||
    urlLower.includes('/recipes') ||
    urlLower.includes('/samples') ||
    urlLower.includes('/demos') ||
    titleLower.includes('example') ||
    titleLower.includes('sample') ||
    titleLower.includes('recipe') ||
    titleLower.includes('demo')
  ) {
    return 'Examples';
  }

  // 3. Troubleshooting
  if (
    urlLower.includes('/troubleshoot') ||
    urlLower.includes('/troubleshooting') ||
    urlLower.includes('/error') ||
    urlLower.includes('/errors') ||
    urlLower.includes('/faq') ||
    urlLower.includes('/debugging') ||
    urlLower.includes('/issues') ||
    urlLower.includes('/messages/') ||
    titleLower.includes('troubleshooting') ||
    titleLower.includes('troubleshoot') ||
    titleLower.includes('error') ||
    titleLower.includes('faq') ||
    titleLower.includes('debugging')
  ) {
    return 'Troubleshooting';
  }

  // 4. Configuration
  if (
    urlLower.includes('/config') ||
    urlLower.includes('/configuration') ||
    urlLower.includes('/options') ||
    urlLower.includes('/settings') ||
    urlLower.includes('/env') ||
    titleLower.includes('configuration') ||
    titleLower.includes('settings') ||
    titleLower.includes('options') ||
    titleLower.includes('config')
  ) {
    return 'Configuration';
  }

  // 5. API References
  if (
    urlLower.includes('/api/') ||
    urlLower.includes('/reference/') ||
    urlLower.includes('/api-reference/') ||
    urlLower.includes('/client/') ||
    urlLower.includes('/sdk/') ||
    urlLower.includes('/methods/') ||
    urlLower.includes('/endpoints/') ||
    urlLower.includes('/specs/') ||
    urlLower.includes('/rest/') ||
    titleLower.includes('api reference') ||
    titleLower.includes('reference') ||
    titleLower.endsWith('api') ||
    breadcrumbText.includes('api') ||
    breadcrumbText.includes('reference')
  ) {
    return 'API References';
  }

  // 6. Tutorials
  if (
    urlLower.includes('/tutorial') ||
    urlLower.includes('/tutorials') ||
    urlLower.includes('/walkthrough') ||
    urlLower.includes('/learn/') ||
    titleLower.includes('tutorial') ||
    titleLower.includes('walkthrough') ||
    breadcrumbText.includes('tutorial')
  ) {
    return 'Tutorials';
  }

  // 7. Guides
  if (
    urlLower.includes('/guide') ||
    urlLower.includes('/guides') ||
    urlLower.includes('/concepts') ||
    urlLower.includes('/fundamentals') ||
    urlLower.includes('/how-to') ||
    urlLower.includes('/manual') ||
    titleLower.includes('guide') ||
    titleLower.includes('concepts') ||
    breadcrumbText.includes('guide')
  ) {
    return 'Guides';
  }

  return 'General';
}

/**
 * Extracts structured technical content from HTML using Cheerio.
 * Preserves code snippets, API tables, and headings while stripping navigation, ads, and footers.
 */
export function extractContent(
  html: string,
  currentUrl: string,
  rootDomain: string,
  targetVersion?: string
): ExtractedPageContent {
  const $ = cheerio.load(html);

  // 1. Remove non-content elements
  $(
    'script, style, noscript, svg, iframe, canvas, ' +
    'nav, header, footer, aside, ' +
    '.navigation, .nav, .sidebar, .menu, .navbar, .header, .footer, ' +
    '.cookie-banner, .cookie-notice, .modal, .popup, .ad, .ads, .advertisement, ' +
    '.social-share, .comments, #cookie-consent, [role="banner"], [role="navigation"]'
  ).remove();

  // 2. Extract Title
  let title = $('title').text().trim() ||
              $('meta[property="og:title"]').attr('content')?.trim() ||
              $('h1').first().text().trim() ||
              'Documentation Page';

  // Clean title suffix if exists (e.g., " | React Documentation")
  title = title.replace(/\s*[|\-–—]\s*[^|\-–—]+$/, '').trim() || title;

  // 3. Extract Canonical URL
  const rawCanonical = $('link[rel="canonical"]').attr('href') || $('meta[property="og:url"]').attr('content');
  const canonicalUrl = rawCanonical ? normalizeUrl(rawCanonical, currentUrl) || undefined : undefined;

  // 4. Detect Documentation Version if not supplied
  let docVersion = targetVersion;
  if (!docVersion) {
    // Check version selector or meta tags
    const metaVer = $('meta[name="docsearch:version"]').attr('content') ||
                    $('meta[name="version"]').attr('content') ||
                    $('.version-selector, .version-badge, [data-version]').first().text().trim();
    if (metaVer && metaVer.length < 30) {
      docVersion = metaVer;
    } else {
      // Check URL path pattern like /v2/, /v1.4/, /3.x/, /18.0.0/
      const match = currentUrl.match(/\/(?:v|version-)?(\d+(?:\.\d+)*(?:-[a-z0-9]+)?(?:\.x)?)\b/i);
      if (match) {
        docVersion = match[1];
      }
    }
  }

  // 5. Extract Breadcrumbs
  const breadcrumbs: DocBreadcrumb[] = [];
  $('nav[aria-label="breadcrumb"], .breadcrumb, .breadcrumbs, [itemtype*="BreadcrumbList"]').first().find('li, a, span').each((_, el) => {
    const text = $(el).text().trim().replace(/^[>/»\s]+|[>/»\s]+$/g, '');
    if (text && text.length > 1 && !breadcrumbs.some(b => b.label === text)) {
      const href = $(el).attr('href') || $(el).find('a').attr('href');
      breadcrumbs.push({
        label: text,
        url: href ? normalizeUrl(href, currentUrl) || undefined : undefined
      });
    }
  });

  // 6. Extract Internal Documentation Links
  const discoveredLinksSet = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const normalized = normalizeUrl(href, currentUrl);
    if (normalized && isUrlInScope(normalized, rootDomain)) {
      discoveredLinksSet.add(normalized);
    }
  });
  const discoveredLinks = Array.from(discoveredLinksSet);

  // 7. Find Primary Content Container
  let contentRoot = $('main, article, [role="main"], .docs-content, .documentation, .markdown-body, #content, .content').first();
  if (!contentRoot.length) {
    contentRoot = $('body');
  }

  // 8. Extract Headings and build section hierarchy
  const headings: DocHeading[] = [];
  contentRoot.find('h1, h2, h3, h4').each((_, el) => {
    const tagName = el.tagName.toLowerCase();
    const level = parseInt(tagName.replace('h', ''), 10);
    const text = $(el).text().trim();
    const id = $(el).attr('id') || undefined;
    if (text) {
      headings.push({ level, text, id });
    }
  });

  // 9. Structure-Aware Chunking:
  // Iterate through elements in order, preserving code blocks, parameter tables, and accompanying explanations.
  const chunks: Omit<DocChunk, 'id' | 'pageId' | 'sessionId' | 'createdAt'>[] = [];
  let currentHeading = title;
  let currentHierarchy: string[] = [title];
  let currentBuffer: string[] = [];
  let currentType: ChunkContentType = 'section';
  let chunkIndex = 0;

  function flushChunk() {
    if (currentBuffer.length === 0) return;
    const rawText = currentBuffer.join('\n\n').trim();
    if (!rawText || rawText.length < 30) {
      currentBuffer = [];
      return;
    }

    const cleanText = sanitizeDocContent(rawText);
    const estTokens = Math.ceil(cleanText.length / 4);

    chunks.push({
      url: currentUrl,
      pageTitle: title,
      heading: currentHeading,
      headingHierarchy: [...currentHierarchy],
      contentType: currentType,
      content: cleanText,
      tokenCount: estTokens,
      chunkIndex: chunkIndex++,
      docVersion: docVersion || undefined,
    });

    currentBuffer = [];
    currentType = 'section';
  }

  // Traverse children of content root
  contentRoot.find('h1, h2, h3, h4, p, pre, table, ul, ol, blockquote').each((_, el) => {
    const tag = el.tagName.toLowerCase();

    if (['h1', 'h2', 'h3', 'h4'].includes(tag)) {
      // Flush previous section
      flushChunk();

      const headingText = $(el).text().trim();
      currentHeading = headingText;
      const level = parseInt(tag.replace('h', ''), 10);

      // Adjust hierarchy
      if (level <= 2) {
        currentHierarchy = [title, headingText];
      } else {
        currentHierarchy = [...currentHierarchy.slice(0, 2), headingText];
      }

      currentBuffer.push(`### ${headingText}`);
      currentType = 'heading';
    } else if (tag === 'pre') {
      // Code block
      const codeText = $(el).find('code').text() || $(el).text();
      const lang = $(el).attr('class') || $(el).find('code').attr('class') || '';
      const langMatch = lang.match(/language-([a-z0-9_-]+)/i);
      const codeLang = langMatch ? langMatch[1] : '';

      if (codeText.trim()) {
        currentBuffer.push(`\`\`\`${codeLang}\n${codeText.trim()}\n\`\`\``);
        currentType = 'code';

        // If chunk is large (> 1500 chars), flush
        const currentLength = currentBuffer.join('\n').length;
        if (currentLength > 1500) {
          flushChunk();
        }
      }
    } else if (tag === 'table') {
      // Format table as Markdown table
      const rows: string[] = [];
      $(el).find('tr').each((_, tr) => {
        const cells: string[] = [];
        $(tr).find('th, td').each((_, cell) => {
          cells.push($(cell).text().trim().replace(/\|/g, '\\|'));
        });
        if (cells.length > 0) {
          rows.push(`| ${cells.join(' | ')} |`);
        }
      });

      if (rows.length > 1) {
        const colCount = rows[0].split('|').length - 2;
        const separator = `| ${Array(colCount).fill('---').join(' | ')} |`;
        const tableMd = [rows[0], separator, ...rows.slice(1)].join('\n');
        currentBuffer.push(tableMd);
        currentType = 'table';
      }
    } else if (tag === 'ul' || tag === 'ol') {
      const listItems: string[] = [];
      $(el).find('> li').each((idx, li) => {
        const itemText = $(li).text().trim();
        if (itemText) {
          const prefix = tag === 'ol' ? `${idx + 1}. ` : '- ';
          listItems.push(`${prefix}${itemText}`);
        }
      });
      if (listItems.length > 0) {
        currentBuffer.push(listItems.join('\n'));
      }
    } else {
      // Paragraph or blockquote
      const pText = $(el).text().trim();
      if (pText) {
        currentBuffer.push(pText);
      }
    }

    // Flush if chunk has grown to ~500-800 tokens (~2400 chars)
    if (currentBuffer.join('\n\n').length > 2400) {
      flushChunk();
    }
  });

  // Final flush
  flushChunk();

  // If no structured chunks were created (e.g. dynamic single block), fallback to paragraph chunking
  if (chunks.length === 0) {
    const rawText = contentRoot.text().replace(/\s+/g, ' ').trim();
    if (rawText) {
      const estTokens = Math.ceil(rawText.length / 4);
      chunks.push({
        url: currentUrl,
        pageTitle: title,
        heading: title,
        headingHierarchy: [title],
        contentType: 'section',
        content: sanitizeDocContent(rawText.slice(0, 3000)),
        tokenCount: Math.min(estTokens, 750),
        chunkIndex: 0,
        docVersion: docVersion || undefined,
      });
    }
  }

  // Generate full text markdown representation & content hash
  const rawMarkdown = chunks.map(c => `## ${c.heading}\n${c.content}`).join('\n\n');
  const wordCount = rawMarkdown.split(/\s+/).filter(Boolean).length;
  const contentHash = crypto.createHash('sha256').update(rawMarkdown).digest('hex');
  const category = detectDocCategory(currentUrl, title, headings, breadcrumbs);

  return {
    title,
    canonicalUrl,
    category,
    headings,
    breadcrumbs,
    discoveredLinks,
    docVersion,
    rawMarkdown,
    wordCount,
    contentHash,
    chunks,
  };
}
