export interface DocSource {
  id: string;
  targetUrl: string;
  rootDomain: string;
  name?: string;
  docVersion?: string;
  pagesCount: number;
  indexedCount: number;
  status: 'idle' | 'crawling' | 'indexing' | 'completed' | 'failed';
}

export interface ResearchSession {
  id: string;
  targetUrl: string;
  rootDomain: string;
  researchObjective?: string;
  docVersion?: string;
  crawlStatus: 'idle' | 'crawling' | 'indexing' | 'completed' | 'failed';
  currentStage?: 'idle' | 'sitemap_robots' | 'crawling' | 'extracting' | 'indexing' | 'completed' | 'failed';
  pagesDiscovered: number;
  pagesCrawled: number;
  pagesExtracted: number;
  pagesIndexed: number;
  pagesFailed: number;
  progressPercent: number;
  sources?: DocSource[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface DocHeading {
  level: number;
  text: string;
  id?: string;
}

export interface DocBreadcrumb {
  label: string;
  url?: string;
}

export type DocCategory =
  | 'Getting Started'
  | 'Guides'
  | 'API References'
  | 'Tutorials'
  | 'Configuration'
  | 'Troubleshooting'
  | 'Examples'
  | 'General';

export interface DocPage {
  id: string;
  sessionId: string;
  url: string;
  canonicalUrl?: string;
  title: string;
  sourceDomain?: string;
  category?: DocCategory;
  parentUrl?: string;
  depth: number;
  docVersion?: string;
  contentHash: string;
  headings: DocHeading[];
  breadcrumbs: DocBreadcrumb[];
  links: string[];
  rawMarkdown: string;
  wordCount: number;
  crawlStatus: 'discovered' | 'crawling' | 'crawled' | 'indexed' | 'failed';
  errorMessage?: string;
  crawledAt: string;
}

export interface Citation {
  url: string;
  sourceDomain?: string;
  pageTitle: string;
  heading?: string;
  excerpt: string;
  relevanceScore?: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  sourcesUsed: Array<{
    url: string;
    sourceDomain?: string;
    pageTitle: string;
    heading?: string;
    method: string;
  }>;
  followUpQuestions?: string[];
  retrievalMeta?: {
    semanticHits: number;
    keywordHits: number;
    queryRoute?: string;
    queryRouteReason?: string;
    rerankedCount?: number;
    targetedCrawledPages?: number;
    rrfTopScore?: number;
    processingTimeMs?: number;
  };
  createdAt: string;
}

export interface CrawlProgressEvent {
  type: 'crawl_started' | 'page_discovered' | 'page_crawled' | 'page_indexed' | 'crawl_completed' | 'crawl_failed' | 'targeted_crawl' | 'connected';
  sessionId: string;
  sourceDomain?: string;
  url?: string;
  title?: string;
  status?: string;
  currentStage?: 'idle' | 'sitemap_robots' | 'crawling' | 'extracting' | 'indexing' | 'completed' | 'failed';
  discoveredCount: number;
  crawledCount?: number;
  extractedCount?: number;
  indexedCount: number;
  failedCount?: number;
  progressPercent?: number;
  objective?: string;
  message?: string;
  timestamp: string;
}

export type EvaluationType = 'ground_truth' | 'exploratory';

export interface RetrievedPassageItem {
  chunkId: string;
  url: string;
  pageTitle: string;
  heading?: string;
  sourceDomain?: string;
  score: number;
  retrievalMethod: string;
  excerpt: string;
  isRelevant?: boolean;
}

export interface EvaluationTestCase {
  id: string;
  sessionId: string;
  type: EvaluationType;
  question: string;
  expectedUrls?: string[];
  expectedKeywords?: string[];
  expectedHeading?: string;
  topK?: number;

  // Execution state
  status: 'idle' | 'running' | 'success' | 'failed';
  executedAt?: string;
  latencyMs?: number;
  retrievalMethod?: string;
  errorMessage?: string;

  // Retrieved passages
  retrievedItems: RetrievedPassageItem[];

  // Real ground truth metrics (computed ONLY when type === 'ground_truth')
  isGroundTruth: boolean;
  precisionAtK?: number;
  recallAtK?: number;
  reciprocalRank?: number;
  relevantRetrievedCount?: number;
  expectedFound?: boolean;
}

export interface EvaluationSummary {
  totalTests: number;
  executedCount: number;
  failedCount: number;
  groundTruthCount: number;
  exploratoryCount: number;
  averageLatencyMs: number;
  meanPrecisionAtK?: number;
  meanRecallAtK?: number;
  meanReciprocalRank?: number;
  hasGroundTruthMetrics: boolean;
}
