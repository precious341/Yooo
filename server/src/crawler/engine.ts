import crypto from 'crypto';
import { DocPage, CrawlProgressEvent } from '../types/index.js';
import { validateTargetUrl, normalizeUrl, isUrlInScope } from '../utils/security.js';
import { extractContent, ExtractedPageContent } from '../extraction/extractor.js';
import { getDatabase } from '../database/db.js';

interface CrawlQueueItem {
  url: string;
  depth: number;
  priority: number;
  parentUrl?: string;
  retryCount: number;
}

export interface CrawlerOptions {
  maxPages?: number;
  maxDepth?: number;
  maxConcurrency?: number;
  timeoutMs?: number;
  targetVersion?: string;
  researchObjective?: string;
  sourceDomain?: string;
  onProgress?: (event: CrawlProgressEvent) => void;
}

/**
 * Calculates priority score based on documentation URL patterns and research objective.
 * Higher priority = crawled first.
 */
export function calculateUrlPriority(url: string, depth: number, objective?: string): number {
  let score = 100 - (depth * 15);
  const lower = url.toLowerCase();

  // Research objective keyword match boost
  if (objective) {
    const objectiveKeywords = objective
      .toLowerCase()
      .split(/[^a-z0-9_.-]+/)
      .filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'about', 'how', 'what', 'does', 'why', 'can', 'should', 'from', 'this', 'that'].includes(w));

    for (const kw of objectiveKeywords) {
      if (lower.includes(kw)) {
        score += 35;
      }
    }
  }

  // High value documentation patterns across languages, runtimes, and frameworks
  if (lower.includes('/api/') || lower.includes('/reference/') || lower.includes('/api-reference/')) score += 50;
  if (lower.includes('/guide/') || lower.includes('/guides/') || lower.includes('/docs/')) score += 40;
  if (lower.includes('/tutorial') || lower.includes('/getting-started') || lower.includes('/quickstart')) score += 35;
  if (lower.includes('/install') || lower.includes('/setup') || lower.includes('/configuration')) score += 30;
  if (lower.includes('/library/') || lower.includes('/manual/') || lower.includes('/modules/') || lower.includes('/specs/')) score += 30;
  if (lower.includes('/example') || lower.includes('/examples') || lower.includes('/sdk') || lower.includes('/client/')) score += 25;
  if (lower.includes('/troubleshooting') || lower.includes('/faq') || lower.includes('/errors')) score += 20;
  if (lower.includes('/concepts/') || lower.includes('/architecture/') || lower.includes('/core/') || lower.includes('/sql/')) score += 20;

  // Lower priority patterns
  if (lower.includes('/blog/') || lower.includes('/news/')) score -= 40;
  if (lower.includes('/changelog') || lower.includes('/release-notes')) score -= 20;
  if (lower.includes('/community') || lower.includes('/pricing') || lower.includes('/about') || lower.includes('/jobs/')) score -= 50;

  return score;
}

export class DocumentationCrawler {
  private sessionId: string;
  private rootUrl: string;
  private rootDomain: string;
  private options: Required<Omit<CrawlerOptions, 'targetVersion' | 'researchObjective' | 'sourceDomain' | 'onProgress'>> & {
    targetVersion?: string;
    researchObjective?: string;
    sourceDomain?: string;
    onProgress?: (event: CrawlProgressEvent) => void;
  };

  private queue: CrawlQueueItem[] = [];
  private visitedUrls = new Set<string>();
  private discoveredUrls = new Set<string>();
  private contentHashes = new Set<string>();
  private failedUrls = new Set<string>();
  private activeWorkers = 0;
  private isAborted = false;
  private disallowedRobotsPaths: string[] = [];

  constructor(sessionId: string, rootUrl: string, options: CrawlerOptions = {}) {
    this.sessionId = sessionId;
    this.rootUrl = rootUrl;

    const validated = validateTargetUrl(rootUrl);
    if (!validated.isValid || !validated.url) {
      throw new Error(validated.error || 'Invalid root URL');
    }

    this.rootDomain = options.sourceDomain || validated.url.hostname;
    this.options = {
      maxPages: options.maxPages || parseInt(process.env.CRAWL_DEFAULT_MAX_PAGES || '20', 10),
      maxDepth: options.maxDepth || 3,
      maxConcurrency: options.maxConcurrency || parseInt(process.env.CRAWL_MAX_CONCURRENCY || '4', 10),
      timeoutMs: options.timeoutMs || parseInt(process.env.CRAWL_REQUEST_TIMEOUT_MS || '12000', 10),
      targetVersion: options.targetVersion,
      researchObjective: options.researchObjective,
      sourceDomain: options.sourceDomain,
      onProgress: options.onProgress,
    };
  }

  abort(): void {
    this.isAborted = true;
  }

  private emitProgress(type: CrawlProgressEvent['type'], details: Partial<CrawlProgressEvent> = {}) {
    if (this.options.onProgress) {
      const pct = Math.min(Math.round((this.visitedUrls.size / Math.max(this.options.maxPages, 1)) * 50), 50);
      this.options.onProgress({
        type,
        sessionId: this.sessionId,
        discoveredCount: this.discoveredUrls.size,
        crawledCount: this.visitedUrls.size,
        extractedCount: this.visitedUrls.size,
        indexedCount: this.visitedUrls.size,
        failedCount: this.failedUrls.size,
        progressPercent: pct,
        currentStage: 'crawling',
        timestamp: new Date().toISOString(),
        ...details,
      });
    }
  }

  /**
   * Check and parse robots.txt for disallowed paths
   */
  private async fetchRobotsTxt(): Promise<void> {
    try {
      const robotsUrl = `https://${this.rootDomain}/robots.txt`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(robotsUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'DocuMind-AI-Crawler/1.0 (+https://github.com/documind-ai)' }
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const text = await res.text();
        const lines = text.split('\n');
        let appliesToUs = true;

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('#') || !trimmed) continue;
          if (/^User-agent:\s*(.*)/i.test(trimmed)) {
            const agent = trimmed.split(':')[1]?.trim();
            appliesToUs = agent === '*' || /documind/i.test(agent);
          } else if (appliesToUs && /^Disallow:\s*(.*)/i.test(trimmed)) {
            const path = trimmed.split(':')[1]?.trim();
            if (path) this.disallowedRobotsPaths.push(path);
          }
        }
      }
    } catch {
      // Ignore robots.txt errors and proceed cautiously
    }
  }

  /**
   * Sitemap.xml discovery to quickly seed priority documentation pages
   */
  private async discoverSitemap(): Promise<void> {
    try {
      const sitemapUrl = `https://${this.rootDomain}/sitemap.xml`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(sitemapUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'DocuMind-AI-Crawler/1.0' }
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const xml = await res.text();
        const locMatches = xml.match(/<loc>(.*?)<\/loc>/g) || [];
        for (const locTag of locMatches) {
          const rawUrl = locTag.replace(/<\/?loc>/g, '').trim();
          const normalized = normalizeUrl(rawUrl, this.rootUrl);
          if (normalized && isUrlInScope(normalized, this.rootDomain)) {
            this.enqueueUrl(normalized, 1, undefined);
          }
        }
      }
    } catch {
      // Sitemap not found or inaccessible; crawl via standard link discovery
    }
  }

  private isAllowedByRobots(urlStr: string): boolean {
    try {
      const parsed = new URL(urlStr);
      for (const disallowed of this.disallowedRobotsPaths) {
        if (parsed.pathname.startsWith(disallowed)) return false;
      }
      return true;
    } catch {
      return true;
    }
  }

  private deriveTitleFromUrl(urlStr: string): string {
    try {
      const parsed = new URL(urlStr);
      const segments = parsed.pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1] || parsed.hostname;
      return last
        .replace(/\.(html|htm|php|md)$/i, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    } catch {
      return urlStr;
    }
  }

  private enqueueUrl(url: string, depth: number, parentUrl?: string): boolean {
    if (this.discoveredUrls.has(url) || this.visitedUrls.has(url)) return false;
    if (depth > this.options.maxDepth) return false;
    if (!this.isAllowedByRobots(url)) return false;

    this.discoveredUrls.add(url);
    const priority = calculateUrlPriority(url, depth, this.options.researchObjective);

    // Insert sorted by priority descending
    const item: CrawlQueueItem = { url, depth, priority, parentUrl, retryCount: 0 };
    const insertIdx = this.queue.findIndex(q => q.priority < priority);
    if (insertIdx === -1) {
      this.queue.push(item);
    } else {
      this.queue.splice(insertIdx, 0, item);
    }

    this.emitProgress('page_discovered', { url });
    return true;
  }

  /**
   * Crawls a single page with request timeout and exponential backoff retry
   */
  private async fetchPage(item: CrawlQueueItem): Promise<{ html: string; status: number; finalUrl: string } | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(item.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) DocuMind/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });
      clearTimeout(timeout);

      // Verify content-type is html
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        return null;
      }

      const html = await response.text();
      return { html, status: response.status, finalUrl: response.url };
    } catch (err: any) {
      clearTimeout(timeout);

      // Exponential backoff retry for network errors
      if (item.retryCount < 2 && !this.isAborted) {
        item.retryCount++;
        const backoffMs = Math.pow(2, item.retryCount) * 800;
        await new Promise(res => setTimeout(res, backoffMs));
        return this.fetchPage(item);
      }
      return null;
    }
  }

  /**
   * Main crawl coordinator
   */
  async start(): Promise<{ pagesDiscovered: number; pagesIndexed: number; pages: DocPage[] }> {
    const db = await getDatabase();

    await db.updateSession(this.sessionId, { crawlStatus: 'crawling' });
    this.emitProgress('crawl_started', { message: 'Beginning intelligent multi-page crawl...' });

    // Seed robots.txt & sitemap
    await this.fetchRobotsTxt();
    await this.discoverSitemap();

    // Seed root URL
    const normalizedRoot = normalizeUrl(this.rootUrl);
    if (normalizedRoot) {
      this.enqueueUrl(normalizedRoot, 0, undefined);
    }

    const crawledPages: DocPage[] = [];

    // Worker loop
    const runWorker = async () => {
      while (this.queue.length > 0 && !this.isAborted && this.visitedUrls.size < this.options.maxPages) {
        const item = this.queue.shift();
        if (!item || this.visitedUrls.has(item.url)) continue;

        this.visitedUrls.add(item.url);
        this.emitProgress('page_crawled', { url: item.url, status: 'crawling' });

        try {
          const fetchResult = await this.fetchPage(item);
          if (!fetchResult || !fetchResult.html) {
            this.failedUrls.add(item.url);
            const existing = await db.getPage(this.sessionId, item.url);
            await db.savePage({
              id: existing?.id || crypto.randomUUID(),
              sessionId: this.sessionId,
              url: item.url,
              title: existing?.title || this.deriveTitleFromUrl(item.url),
              sourceDomain: this.rootDomain,
              depth: item.depth,
              contentHash: '',
              headings: [],
              breadcrumbs: [],
              links: [],
              rawMarkdown: '',
              wordCount: 0,
              crawlStatus: 'failed',
              errorMessage: fetchResult?.status ? `HTTP ${fetchResult.status} error response` : `Request failed or timed out (${this.options.timeoutMs}ms)`,
              crawledAt: new Date().toISOString(),
            });

            this.emitProgress('page_crawled', {
              url: item.url,
              status: 'failed',
              failedCount: this.failedUrls.size,
            });
            continue;
          }

          // Canonical URL resolution
          const finalNorm = normalizeUrl(fetchResult.finalUrl) || item.url;

          // Extract content
          const extracted: ExtractedPageContent = extractContent(
            fetchResult.html,
            finalNorm,
            this.rootDomain,
            this.options.targetVersion
          );

          // Content deduplication check
          if (this.contentHashes.has(extracted.contentHash)) {
            continue;
          }
          this.contentHashes.add(extracted.contentHash);

          // Save page to database with detected category & source domain
          const existing = await db.getPage(this.sessionId, item.url);
          const pageRecord: DocPage = {
            id: existing?.id || crypto.randomUUID(),
            sessionId: this.sessionId,
            url: item.url,
            canonicalUrl: extracted.canonicalUrl,
            title: extracted.title,
            sourceDomain: this.rootDomain,
            category: extracted.category,
            parentUrl: item.parentUrl,
            depth: item.depth,
            docVersion: extracted.docVersion || this.options.targetVersion,
            contentHash: extracted.contentHash,
            headings: extracted.headings,
            breadcrumbs: extracted.breadcrumbs,
            links: extracted.discoveredLinks,
            rawMarkdown: extracted.rawMarkdown,
            wordCount: extracted.wordCount,
            crawlStatus: 'crawled',
            crawledAt: new Date().toISOString(),
          };

          const savedPage = await db.savePage(pageRecord);
          crawledPages.push(savedPage);

          // Enqueue newly discovered internal links if within max depth and page budget
          if (item.depth < this.options.maxDepth && this.visitedUrls.size < this.options.maxPages) {
            for (const link of extracted.discoveredLinks) {
              if (this.visitedUrls.size + this.queue.length >= this.options.maxPages * 2) break;
              this.enqueueUrl(link, item.depth + 1, item.url);
            }
          }

          this.emitProgress('page_crawled', {
            url: item.url,
            title: extracted.title,
            status: 'crawled'
          });

        } catch (err: any) {
          console.error(`[Crawler] Error crawling ${item.url}:`, err.message);
          this.failedUrls.add(item.url);
          try {
            const existing = await db.getPage(this.sessionId, item.url);
            await db.savePage({
              id: existing?.id || crypto.randomUUID(),
              sessionId: this.sessionId,
              url: item.url,
              title: existing?.title || this.deriveTitleFromUrl(item.url),
              sourceDomain: this.rootDomain,
              depth: item.depth,
              contentHash: '',
              headings: [],
              breadcrumbs: [],
              links: [],
              rawMarkdown: '',
              wordCount: 0,
              crawlStatus: 'failed',
              errorMessage: err.message || 'Crawl processing error',
              crawledAt: new Date().toISOString(),
            });
          } catch {}
        }
      }
    };

    // Run parallel workers with concurrency limit
    const workerPromises: Promise<void>[] = [];
    for (let i = 0; i < this.options.maxConcurrency; i++) {
      workerPromises.push(runWorker());
    }

    await Promise.all(workerPromises);

    await db.updateSession(this.sessionId, {
      crawlStatus: 'indexing',
      pagesDiscovered: this.discoveredUrls.size,
      pagesIndexed: crawledPages.length,
      pagesFailed: this.failedUrls.size,
    });

    this.emitProgress('crawl_completed', {
      message: `Crawl complete. Discovered ${this.discoveredUrls.size} pages, ready for indexing.`,
    });

    return {
      pagesDiscovered: this.discoveredUrls.size,
      pagesIndexed: crawledPages.length,
      pages: crawledPages,
    };
  }

  /**
   * Targeted live crawl or retry for a specific URL
   */
  async crawlSpecificUrl(targetUrl: string, forceRetry = false): Promise<DocPage | null> {
    const normalized = normalizeUrl(targetUrl);
    if (!normalized || !isUrlInScope(normalized, this.rootDomain)) return null;

    const db = await getDatabase();
    const existing = await db.getPage(this.sessionId, normalized);
    if (existing && existing.crawlStatus === 'indexed' && !forceRetry) {
      return existing;
    }

    const item: CrawlQueueItem = {
      url: normalized,
      depth: 1,
      priority: 200,
      retryCount: 0
    };

    const fetchResult = await this.fetchPage(item);
    if (!fetchResult || !fetchResult.html) {
      if (existing) {
        await db.savePage({
          ...existing,
          crawlStatus: 'failed',
          errorMessage: fetchResult?.status ? `HTTP ${fetchResult.status} error response` : `Request failed or timed out (${this.options.timeoutMs}ms)`,
          crawledAt: new Date().toISOString(),
        });
      }
      return null;
    }

    const extracted = extractContent(fetchResult.html, normalized, this.rootDomain, this.options.targetVersion);
    const pageRecord: DocPage = {
      id: existing?.id || crypto.randomUUID(),
      sessionId: this.sessionId,
      url: normalized,
      canonicalUrl: extracted.canonicalUrl,
      title: extracted.title,
      sourceDomain: this.rootDomain,
      category: extracted.category,
      depth: existing?.depth || 1,
      docVersion: extracted.docVersion || this.options.targetVersion,
      contentHash: extracted.contentHash,
      headings: extracted.headings,
      breadcrumbs: extracted.breadcrumbs,
      links: extracted.discoveredLinks,
      rawMarkdown: extracted.rawMarkdown,
      wordCount: extracted.wordCount,
      crawlStatus: 'crawled',
      crawledAt: new Date().toISOString(),
    };

    const savedPage = await db.savePage(pageRecord);
    this.emitProgress('targeted_crawl', { url: normalized, title: extracted.title });
    return savedPage;
  }
}
