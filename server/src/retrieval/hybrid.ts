import { SearchResult, DocChunk } from '../types/index.js';
import { getDatabase } from '../database/db.js';
import { generateEmbedding, batchGenerateEmbeddings } from '../ai/agent.js';
import { DocumentationCrawler } from '../crawler/engine.js';
import { extractContent } from '../extraction/extractor.js';

const RRF_K = 60; // Standard Reciprocal Rank Fusion smoothing parameter
const SUFFICIENCY_THRESHOLD = 0.015; // Minimum RRF score indicating solid evidence coverage

export type QueryRoute =
  | 'conceptual'
  | 'exact_api'
  | 'error_debugging'
  | 'cross_framework'
  | 'version_specific'
  | 'targeted_discovery';

export interface RouteClassification {
  route: QueryRoute;
  reason: string;
  detectedTerms: string[];
  targetDomains?: string[];
}

export interface HybridRetrievalOptions {
  topK?: number;
  version?: string;
  allowLiveCrawl?: boolean;
  rootUrl?: string;
  onLiveProgress?: (msg: string) => void;
}

/**
 * Extracts key technical terms (e.g., camelCase, PascalCase, snake_case, flags `--foo`, HTTP methods, error codes)
 */
export function extractTechnicalTerms(query: string): string[] {
  const terms: string[] = [];

  // Match code-like identifiers like `useState`, `get_user`, `API_KEY`, `req.body`, `POST`
  const codeMatches = query.match(/\b[A-Za-z_][A-Za-z0-9_.-]{2,}\b/g) || [];
  for (const match of codeMatches) {
    if (!['the', 'and', 'for', 'with', 'what', 'how', 'does', 'why', 'can', 'should', 'from', 'this', 'that'].includes(match.toLowerCase())) {
      terms.push(match);
    }
  }

  return Array.from(new Set(terms));
}

/**
 * Feature 3: Intelligent Query Router
 * Classifies incoming technical questions into optimal retrieval strategies
 */
export function classifyQueryRoute(
  query: string,
  sessionSources: Array<{ rootDomain: string; name?: string }> = []
): RouteClassification {
  const lower = query.toLowerCase();
  const techTerms = extractTechnicalTerms(query);

  // 1. Check for Cross-Framework or Multi-Source comparison
  const comparisonKeywords = [' vs ', ' versus ', 'compare', 'difference between', 'how does it compare', 'differ', 'better than'];
  const hasComparisonWord = comparisonKeywords.some(kw => lower.includes(kw));
  const mentionedSources = sessionSources.filter(s => {
    const d = s.rootDomain.toLowerCase().replace(/^docs?\./, '').split('.')[0];
    const n = (s.name || '').toLowerCase();
    return (d && lower.includes(d)) || (n && lower.includes(n));
  });

  if (hasComparisonWord || mentionedSources.length >= 2) {
    return {
      route: 'cross_framework',
      reason: `Detected cross-source comparison between technical ecosystems (${mentionedSources.map(s => s.rootDomain).join(', ') || 'multiple frameworks'}).`,
      detectedTerms: techTerms,
      targetDomains: mentionedSources.map(s => s.rootDomain),
    };
  }

  // 2. Check for Error Debugging / Troubleshooting
  const errorKeywords = ['error', 'exception', 'failed', 'failure', 'typeerror', 'syntaxerror', 'econnrefused', 'enotfound', 'status code', 'exit code', 'traceback', 'crash', 'cannot find module'];
  const hasErrorCode = /\b(4\d{2}|5\d{2}|[A-Z]+_[A-Z_]+)\b/.test(query);
  if (errorKeywords.some(k => lower.includes(k)) || hasErrorCode) {
    return {
      route: 'error_debugging',
      reason: 'Detected error diagnostics, exception resolution, or troubleshooting inquiry.',
      detectedTerms: techTerms,
    };
  }

  // 3. Check for Version Specific inquiry
  const versionPattern = /\b(v?\d+(\.\d+)+|version\s+\d+|in\s+react\s+19|in\s+python\s+3|in\s+node\s+22)\b/i;
  if (versionPattern.test(query)) {
    return {
      route: 'version_specific',
      reason: 'Detected version-specific technical requirements or migration inquiry.',
      detectedTerms: techTerms,
    };
  }

  // 4. Check for Exact API Syntax / Function Signature
  const hasExactApiSymbol = /(\b(use[A-Z]\w*|get[A-Z]\w*|set[A-Z]\w*|create[A-Z]\w*)\b|--[a-z0-9-]+|\b[a-z0-9_]+\.[a-z0-9_]+\(\)|\b[A-Za-z0-9_]+<[A-Za-z0-9_, ]+>)/.test(query);
  const codeWords = ['method', 'function', 'parameter', 'argument', 'signature', 'hook', 'interface', 'syntax', 'prop', 'endpoint', 'api'];
  if (hasExactApiSymbol || (codeWords.some(w => lower.includes(w)) && techTerms.length > 0)) {
    return {
      route: 'exact_api',
      reason: 'Detected exact API symbol, method signature, function interface, or configuration parameter.',
      detectedTerms: techTerms,
    };
  }

  // 5. Default to Conceptual / Architecture
  return {
    route: 'conceptual',
    reason: 'Detected high-level architectural, conceptual, or explanatory documentation research.',
    detectedTerms: techTerms,
  };
}

/**
 * Combines semantic and keyword ranked lists using Reciprocal Rank Fusion
 */
export function reciprocalRankFusion(
  semanticResults: SearchResult[],
  keywordResults: SearchResult[]
): SearchResult[] {
  const scoreMap = new Map<string, {
    chunk: DocChunk;
    rrfScore: number;
    semanticRank?: number;
    keywordRank?: number;
  }>();

  // Add semantic rankings
  semanticResults.forEach((item, index) => {
    const rank = index + 1;
    const rrf = 1 / (RRF_K + rank);
    scoreMap.set(item.chunk.id, {
      chunk: item.chunk,
      rrfScore: rrf,
      semanticRank: rank,
    });
  });

  // Add keyword rankings
  keywordResults.forEach((item, index) => {
    const rank = index + 1;
    const rrf = 1 / (RRF_K + rank);
    const existing = scoreMap.get(item.chunk.id);

    if (existing) {
      existing.rrfScore += rrf;
      existing.keywordRank = rank;
    } else {
      scoreMap.set(item.chunk.id, {
        chunk: item.chunk,
        rrfScore: rrf,
        keywordRank: rank,
      });
    }
  });

  // Sort by combined RRF score descending
  const fusedList = Array.from(scoreMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map(entry => {
      // Truthful retrieval method attribution:
      let method: SearchResult['retrievalMethod'] = 'hybrid';
      if (entry.semanticRank && !entry.keywordRank) method = 'semantic';
      if (!entry.semanticRank && entry.keywordRank) method = 'keyword';

      return {
        chunk: entry.chunk,
        score: entry.rrfScore,
        semanticRank: entry.semanticRank,
        keywordRank: entry.keywordRank,
        retrievalMethod: method,
      };
    });

  return fusedList;
}

/**
 * Feature 2: Re-ranking Step
 * Re-ranks candidates based on query routing, exact term density, heading matches, and code boosts
 */
export function rerankSearchResults(
  candidates: SearchResult[],
  query: string,
  classification: RouteClassification,
  targetVersion?: string
): SearchResult[] {
  if (candidates.length === 0) return [];

  const lowerQuery = query.toLowerCase();
  const techTerms = classification.detectedTerms.map(t => t.toLowerCase());

  const scored = candidates.map((item) => {
    let boost = 1.0;
    const contentLower = item.chunk.content.toLowerCase();
    const headingLower = (item.chunk.heading || '').toLowerCase();
    const titleLower = item.chunk.pageTitle.toLowerCase();

    // 1. Exact technical term match boost in heading and title
    for (const term of techTerms) {
      if (headingLower.includes(term)) {
        boost += 0.4;
      }
      if (titleLower.includes(term)) {
        boost += 0.3;
      }
      if (contentLower.includes(term)) {
        boost += 0.15;
      }
    }

    // 2. Query Route Specific Boosts
    if (classification.route === 'exact_api') {
      if (item.chunk.contentType === 'code' || item.chunk.contentType === 'api_spec') {
        boost += 0.35;
      }
      if (item.keywordRank && item.keywordRank <= 3) {
        boost += 0.25;
      }
    } else if (classification.route === 'error_debugging') {
      if (headingLower.includes('error') || headingLower.includes('troubleshoot') || headingLower.includes('faq')) {
        boost += 0.45;
      }
    } else if (classification.route === 'conceptual') {
      if (item.semanticRank && item.semanticRank <= 3) {
        boost += 0.2;
      }
    }

    // 3. Version Awareness: boost matching version
    if (targetVersion && item.chunk.docVersion) {
      if (item.chunk.docVersion.toLowerCase() === targetVersion.toLowerCase()) {
        boost += 0.3;
      }
    }

    const rerankedScore = item.score * boost;

    return {
      ...item,
      score: rerankedScore,
    };
  });

  // Sort by boosted score
  scored.sort((a, b) => b.score - a.score);

  // If cross_framework, ensure multi-domain balance among top candidates
  if (classification.route === 'cross_framework') {
    const domainsSeen = new Set<string>();
    const balanced: SearchResult[] = [];
    const remaining: SearchResult[] = [];

    for (const item of scored) {
      const dom = item.chunk.sourceDomain || (() => {
        try { return new URL(item.chunk.url).hostname; } catch { return 'docs'; }
      })();

      if (!domainsSeen.has(dom) && balanced.length < 4) {
        domainsSeen.add(dom);
        balanced.push(item);
      } else {
        remaining.push(item);
      }
    }

    return [...balanced, ...remaining];
  }

  return scored;
}

/**
 * Multi-Source Hybrid Retrieval Pipeline with Intelligent Query Routing,
 * Re-ranking, and Targeted Live Retrieval fallback
 */
export async function executeHybridRetrieval(
  sessionId: string,
  query: string,
  options: HybridRetrievalOptions = {}
): Promise<{
  results: SearchResult[];
  semanticCount: number;
  keywordCount: number;
  targetedCrawledPages: number;
  topRrfScore: number;
  queryRoute: QueryRoute;
  queryRouteReason: string;
  rerankedCount: number;
}> {
  const db = await getDatabase();
  const topK = options.topK || 8;
  const session = await db.getSession(sessionId);

  // 1. Intelligent Query Classification
  const classification = classifyQueryRoute(query, session?.sources || []);

  // 2. Generate query embedding for semantic search
  let queryEmbedding: number[] = [];
  try {
    queryEmbedding = await generateEmbedding(query);
  } catch (err: any) {
    console.warn('[Hybrid Retrieval] Semantic embedding failed, falling back to full-text keyword retrieval:', err.message);
  }

  // 3. Perform parallel Semantic and Keyword searches
  const hasEmbedding = queryEmbedding.length > 0;
  const [semanticHits, keywordHits] = await Promise.all([
    hasEmbedding ? db.searchVector(sessionId, queryEmbedding, topK * 2, options.version) : Promise.resolve([]),
    db.searchKeyword(sessionId, query, topK * 2, options.version),
  ]);

  // 4. Combine with Reciprocal Rank Fusion
  let fused = reciprocalRankFusion(semanticHits, keywordHits);

  // If only keyword or only semantic was executed, ensure truthful labeling
  if (semanticHits.length === 0 && keywordHits.length > 0) {
    fused = keywordHits.map(k => ({ ...k, retrievalMethod: 'keyword' as const }));
  } else if (semanticHits.length > 0 && keywordHits.length === 0) {
    fused = semanticHits.map(s => ({ ...s, retrievalMethod: 'semantic' as const }));
  }

  const topScore = fused.length > 0 ? fused[0].score : 0;
  let targetedCrawledPages = 0;

  // 5. Evidence Sufficiency Evaluation & Targeted Live Crawling
  // If top evidence is weak or index is sparse, search crawled links for candidate pages
  if (options.allowLiveCrawl !== false && (fused.length === 0 || topScore < SUFFICIENCY_THRESHOLD)) {
    if (session && session.targetUrl) {
      const allPages = await db.listPages(sessionId);
      const crawledUrls = new Set(allPages.map(p => p.url));

      // Gather candidate uncrawled links from all known pages
      const candidateLinks = new Set<string>();
      for (const page of allPages) {
        for (const link of page.links) {
          if (!crawledUrls.has(link)) {
            candidateLinks.add(link);
          }
        }
      }

      // Find candidates matching the technical terms or query words
      const techTerms = classification.detectedTerms;
      const matchingCandidates: string[] = [];

      for (const link of candidateLinks) {
        const linkLower = link.toLowerCase();
        for (const term of techTerms) {
          if (linkLower.includes(term.toLowerCase())) {
            matchingCandidates.push(link);
            break;
          }
        }
        if (matchingCandidates.length >= 3) break;
      }

      // If we found matching uncrawled pages, crawl them now!
      if (matchingCandidates.length > 0) {
        options.onLiveProgress?.(`Targeted live crawl: Fetching ${matchingCandidates.length} additional documentation pages...`);
        const crawler = new DocumentationCrawler(sessionId, session.targetUrl, {
          maxPages: 3,
          maxDepth: 2,
          targetVersion: options.version || session.docVersion,
        });

        for (const candidateUrl of matchingCandidates) {
          try {
            const page = await crawler.crawlSpecificUrl(candidateUrl);
            if (page) {
              targetedCrawledPages++;
              let host = 'docs';
              try { host = new URL(page.url).hostname; } catch { host = session.rootDomain; }

              // Extract chunks and index them
              const extracted = extractContent(
                page.rawMarkdown,
                page.url,
                host,
                options.version || session.docVersion
              );

              // STEP 1: Persist page first to guarantee valid database ID in doc_pages
              const savedPage = await db.savePage({
                ...page,
                sourceDomain: host,
                category: page.category || extracted.category,
                crawlStatus: 'indexed',
              });

              if (extracted.chunks.length > 0) {
                // Generate embeddings
                const texts = extracted.chunks.map(c => `${c.heading || ''}\n${c.content}`);
                const embeddings = await batchGenerateEmbeddings(texts);

                const chunkRecords = extracted.chunks.map((c, i) => ({
                  id: `${savedPage.id}-${i}`,
                  sessionId,
                  pageId: savedPage.id, // Strictly references existing doc_pages row
                  url: savedPage.url,
                  sourceDomain: host,
                  pageTitle: savedPage.title,
                  heading: c.heading,
                  headingHierarchy: c.headingHierarchy,
                  contentType: c.contentType,
                  content: c.content,
                  tokenCount: c.tokenCount,
                  chunkIndex: c.chunkIndex,
                  docVersion: c.docVersion,
                  embedding: embeddings[i],
                  createdAt: new Date().toISOString(),
                }));

                await db.saveChunks(chunkRecords);
              }
            }
          } catch (err: any) {
            console.warn('[Targeted Live Crawl] Page fetch failed:', err.message);
          }
        }

        // Rerun searches with newly indexed material
        if (targetedCrawledPages > 0) {
          const [newSemantic, newKeyword] = await Promise.all([
            hasEmbedding ? db.searchVector(sessionId, queryEmbedding, topK * 2, options.version) : Promise.resolve([]),
            db.searchKeyword(sessionId, query, topK * 2, options.version),
          ]);

          fused = reciprocalRankFusion(newSemantic, newKeyword).map(item => {
            if (matchingCandidates.includes(item.chunk.url)) {
              return { ...item, retrievalMethod: 'targeted_live' };
            }
            return item;
          });
        }
      }
    }
  }

  // 6. Feature 2 D: Re-ranking Step
  const reranked = rerankSearchResults(fused, query, classification, options.version || session?.docVersion);

  return {
    results: reranked.slice(0, topK),
    semanticCount: semanticHits.length,
    keywordCount: keywordHits.length,
    targetedCrawledPages,
    topRrfScore: reranked.length > 0 ? reranked[0].score : 0,
    queryRoute: classification.route,
    queryRouteReason: classification.reason,
    rerankedCount: reranked.length,
  };
}
