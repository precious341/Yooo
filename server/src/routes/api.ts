import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDatabase } from '../database/db.js';
import { validateTargetUrl } from '../utils/security.js';
import { DocumentationCrawler } from '../crawler/engine.js';
import { extractContent } from '../extraction/extractor.js';
import { batchGenerateEmbeddings } from '../ai/agent.js';
import { executeHybridRetrieval } from '../retrieval/hybrid.js';
import { generateGroundedAnswer } from '../ai/agent.js';
import { CrawlProgressEvent, EvaluationTestCase } from '../types/index.js';
import {
  executeEvaluationTest,
  generateQuickEvaluationSuite,
  summarizeEvaluationSuite,
} from '../evaluation/evaluator.js';

export const apiRouter = Router();

// In-memory SSE client registry: sessionId -> Set<Response>
const sseClients = new Map<string, Set<Response>>();

function broadcastProgress(sessionId: string, event: CrawlProgressEvent) {
  const clients = sseClients.get(sessionId);
  if (clients) {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of clients) {
      try {
        res.write(data);
      } catch {
        clients.delete(res);
      }
    }
  }
}

// -----------------------------------------------------------------
// 1. POST /api/research/sessions - Create a new research session
// -----------------------------------------------------------------
const CreateSessionSchema = z.object({
  targetUrl: z.string().min(1, 'Target URL is required'),
  researchObjective: z.string().optional(),
  docVersion: z.string().optional(),
  autoStartCrawl: z.boolean().optional(),
  maxPages: z.number().min(1).max(100).optional(),
  sources: z.array(z.object({
    targetUrl: z.string().min(1),
    name: z.string().optional(),
    docVersion: z.string().optional(),
  })).optional(),
});

apiRouter.post('/research/sessions', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = CreateSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
      return;
    }

    const { targetUrl, researchObjective, docVersion, autoStartCrawl, maxPages, sources } = parsed.data;

    // Validate primary URL & SSRF
    const validation = validateTargetUrl(targetUrl);
    if (!validation.isValid || !validation.url) {
      res.status(400).json({ error: validation.error || 'Invalid or forbidden URL' });
      return;
    }

    // Build initial sources list
    const initialSources: any[] = [
      {
        id: crypto.randomUUID(),
        targetUrl: validation.url.toString(),
        rootDomain: validation.url.hostname,
        name: validation.url.hostname,
        docVersion,
        pagesCount: 0,
        indexedCount: 0,
        status: autoStartCrawl ? 'crawling' : 'idle',
      }
    ];

    // Add additional sources if passed
    if (sources && Array.isArray(sources)) {
      for (const s of sources) {
        if (!s.targetUrl || s.targetUrl === targetUrl) continue;
        const sVal = validateTargetUrl(s.targetUrl);
        if (sVal.isValid && sVal.url) {
          if (!initialSources.some(x => x.rootDomain === sVal.url!.hostname)) {
            initialSources.push({
              id: crypto.randomUUID(),
              targetUrl: sVal.url.toString(),
              rootDomain: sVal.url.hostname,
              name: s.name || sVal.url.hostname,
              docVersion: s.docVersion || docVersion,
              pagesCount: 0,
              indexedCount: 0,
              status: autoStartCrawl ? 'crawling' : 'idle',
            });
          }
        }
      }
    }

    const db = await getDatabase();
    const session = await db.createSession({
      targetUrl: validation.url.toString(),
      rootDomain: validation.url.hostname,
      researchObjective,
      docVersion,
      crawlStatus: autoStartCrawl ? 'crawling' : 'idle',
      sources: initialSources,
    });

    if (autoStartCrawl) {
      // Trigger crawl for all initial sources in background
      for (const src of initialSources) {
        startCrawlPipeline(session.id, src.targetUrl, {
          docVersion: src.docVersion || docVersion,
          maxPages: maxPages || 15,
        }).catch(err => console.error(`[Crawl Pipeline Error for ${src.targetUrl}]`, err));
      }
    }

    res.status(201).json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create session' });
  }
});

// -----------------------------------------------------------------
// 2. GET /api/research/sessions - List recent sessions
// -----------------------------------------------------------------
apiRouter.get('/research/sessions', async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabase();
    await db.cleanupExpired();
    const sessions = await db.listSessions();
    res.json(sessions);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list sessions' });
  }
});

// -----------------------------------------------------------------
// 3. GET /api/research/sessions/:sessionId - Get session details
// -----------------------------------------------------------------
apiRouter.get('/research/sessions/:sessionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabase();
    const session = await db.getSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get session' });
  }
});

// -----------------------------------------------------------------
// 4. POST /api/research/sessions/:sessionId/crawl - Start or resume crawl
// -----------------------------------------------------------------
const CrawlRequestSchema = z.object({
  maxPages: z.number().min(1).max(50).optional(),
  maxDepth: z.number().min(1).max(5).optional(),
  docVersion: z.string().optional(),
});

apiRouter.post('/research/sessions/:sessionId/crawl', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabase();
    const session = await db.getSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const parsed = CrawlRequestSchema.safeParse(req.body);
    const options = parsed.success ? parsed.data : {};

    // Start background crawler & indexing pipeline
    startCrawlPipeline(session.id, session.targetUrl, {
      maxPages: options.maxPages || 15,
      maxDepth: options.maxDepth || 3,
      docVersion: options.docVersion || session.docVersion,
    }).catch(err => console.error('[Background Crawl Error]', err));

    res.json({ message: 'Crawl pipeline initiated', sessionId: session.id, status: 'crawling' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to start crawl' });
  }
});

// -----------------------------------------------------------------
// 5. GET /api/research/sessions/:sessionId/pages - List discovered pages
// -----------------------------------------------------------------
apiRouter.get('/research/sessions/:sessionId/pages', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabase();
    const pages = await db.listPages(req.params.sessionId);
    res.json(pages);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch pages' });
  }
});

// -----------------------------------------------------------------
// 6. GET /api/research/sessions/:sessionId/progress - Get crawl status
// -----------------------------------------------------------------
apiRouter.get('/research/sessions/:sessionId/progress', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabase();
    const session = await db.getSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({
      sessionId: session.id,
      crawlStatus: session.crawlStatus,
      pagesDiscovered: session.pagesDiscovered,
      pagesIndexed: session.pagesIndexed,
      updatedAt: session.updatedAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get progress' });
  }
});

// -----------------------------------------------------------------
// 7. GET /api/research/sessions/:sessionId/stream - SSE Progress stream
// -----------------------------------------------------------------
apiRouter.get('/research/sessions/:sessionId/stream', async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let set = sseClients.get(sessionId);
  if (!set) {
    set = new Set();
    sseClients.set(sessionId, set);
  }
  set.add(res);

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId, timestamp: new Date().toISOString() })}\n\n`);

  req.on('close', () => {
    const current = sseClients.get(sessionId);
    if (current) {
      current.delete(res);
      if (current.size === 0) sseClients.delete(sessionId);
    }
  });
});

// -----------------------------------------------------------------
// 8. POST /api/research/sessions/:sessionId/chat - Submit question
// -----------------------------------------------------------------
const ChatSchema = z.object({
  question: z.string().min(1, 'Question cannot be empty'),
  docVersion: z.string().optional(),
});

apiRouter.post('/research/sessions/:sessionId/chat', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  try {
    const { sessionId } = req.params;
    const db = await getDatabase();
    const session = await db.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const parsed = ChatSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
      return;
    }

    const { question, docVersion } = parsed.data;

    // Save user message
    await db.saveMessage({
      sessionId,
      role: 'user',
      content: question,
      citations: [],
      sourcesUsed: [],
    });

    // Run hybrid retrieval pipeline
    const retrieval = await executeHybridRetrieval(sessionId, question, {
      topK: 8,
      version: docVersion || session.docVersion,
      allowLiveCrawl: true,
      onLiveProgress: (msg) => {
        broadcastProgress(sessionId, {
          type: 'targeted_crawl',
          sessionId,
          message: msg,
          discoveredCount: session.pagesDiscovered,
          indexedCount: session.pagesIndexed,
          timestamp: new Date().toISOString(),
        });
      },
    });

    // Generate grounded answer
    const answerResult = await generateGroundedAnswer(
      question,
      retrieval.results,
      session.researchObjective,
      docVersion || session.docVersion
    );

    const processingTimeMs = Date.now() - startTime;

    // Save assistant message with citations & sources
    const assistantMsg = await db.saveMessage({
      sessionId,
      role: 'assistant',
      content: answerResult.answer,
      citations: answerResult.citations,
      sourcesUsed: answerResult.sourcesUsed,
      followUpQuestions: answerResult.followUpQuestions,
      retrievalMeta: {
        semanticHits: retrieval.semanticCount,
        keywordHits: retrieval.keywordCount,
        queryRoute: retrieval.queryRoute,
        queryRouteReason: retrieval.queryRouteReason,
        rerankedCount: retrieval.rerankedCount,
        targetedCrawledPages: retrieval.targetedCrawledPages,
        rrfTopScore: retrieval.topRrfScore,
        processingTimeMs,
      },
    });

    res.json(assistantMsg);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to process question' });
  }
});

// -----------------------------------------------------------------
// 9. GET /api/research/sessions/:sessionId/chat - Get chat history
// -----------------------------------------------------------------
apiRouter.get('/research/sessions/:sessionId/chat', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabase();
    const messages = await db.getMessages(req.params.sessionId);
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get messages' });
  }
});

// -----------------------------------------------------------------
// 10. GET /api/research/sessions/:sessionId/sources - Retrieve sources
// -----------------------------------------------------------------
apiRouter.get('/research/sessions/:sessionId/sources', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabase();
    const session = await db.getSession(req.params.sessionId);
    const pages = await db.listPages(req.params.sessionId);
    const chunks = await db.getChunks(req.params.sessionId);

    res.json({
      sources: session?.sources || [],
      totalPages: pages.length,
      totalChunks: chunks.length,
      pages: pages.map(p => ({
        url: p.url,
        canonicalUrl: p.canonicalUrl,
        title: p.title,
        sourceDomain: p.sourceDomain || (() => {
          try { return new URL(p.url).hostname; } catch { return 'docs'; }
        })(),
        docVersion: p.docVersion,
        wordCount: p.wordCount,
        crawlStatus: p.crawlStatus,
        headingsCount: p.headings.length,
        linksCount: p.links.length,
        crawledAt: p.crawledAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch sources' });
  }
});

// -----------------------------------------------------------------
// 10b. POST /api/research/sessions/:sessionId/sources - Add documentation source
// -----------------------------------------------------------------
const AddSourceSchema = z.object({
  targetUrl: z.string().min(1, 'Target URL is required'),
  name: z.string().optional(),
  docVersion: z.string().optional(),
  maxPages: z.number().min(1).max(50).optional(),
});

apiRouter.post('/research/sessions/:sessionId/sources', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const db = await getDatabase();
    const session = await db.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const parsed = AddSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
      return;
    }

    const { targetUrl, name, docVersion, maxPages } = parsed.data;
    const validation = validateTargetUrl(targetUrl);
    if (!validation.isValid || !validation.url) {
      res.status(400).json({ error: validation.error || 'Invalid or forbidden documentation URL' });
      return;
    }

    const newSourceDomain = validation.url.hostname;
    const sourceRecord = {
      id: crypto.randomUUID(),
      targetUrl: validation.url.toString(),
      rootDomain: newSourceDomain,
      name: name || newSourceDomain,
      docVersion,
      pagesCount: 0,
      indexedCount: 0,
      status: 'crawling' as const,
    };

    const currentSources = session.sources || [
      {
        id: crypto.randomUUID(),
        targetUrl: session.targetUrl,
        rootDomain: session.rootDomain,
        name: session.rootDomain,
        docVersion: session.docVersion,
        pagesCount: session.pagesDiscovered,
        indexedCount: session.pagesIndexed,
        status: session.crawlStatus,
      }
    ];

    // Check if domain already added
    if (!currentSources.some(s => s.rootDomain === newSourceDomain)) {
      currentSources.push(sourceRecord);
    }

    await db.updateSession(sessionId, { sources: currentSources, crawlStatus: 'crawling' });

    // Start background crawl pipeline for new source
    startCrawlPipeline(sessionId, validation.url.toString(), {
      maxPages: maxPages || 15,
      docVersion,
    }).catch(err => console.error('[Multi-Source Crawl Pipeline Error]', err));

    res.status(201).json({
      message: 'Documentation source added and crawl queued',
      source: sourceRecord,
      sources: currentSources,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to add source' });
  }
});

// -----------------------------------------------------------------
// 11. POST /api/research/sessions/:sessionId/refresh - Refresh a page
// -----------------------------------------------------------------
apiRouter.post('/research/sessions/:sessionId/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: 'URL is required to refresh' });
      return;
    }

    const db = await getDatabase();
    const session = await db.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const crawler = new DocumentationCrawler(sessionId, session.targetUrl);
    const page = await crawler.crawlSpecificUrl(url);

    if (page) {
      // Re-extract and re-index
      const extracted = extractContent(page.rawMarkdown, page.url, session.rootDomain, page.docVersion);
      // STEP 1: Save page first to guarantee valid database ID in doc_pages
      const savedPage = await db.savePage({
        ...page,
        crawlStatus: 'indexed',
        category: page.category || extracted.category,
      });

      if (extracted.chunks.length > 0) {
        const texts = extracted.chunks.map(c => `${c.heading || ''}\n${c.content}`);
        const embeddings = await batchGenerateEmbeddings(texts);

        const chunkRecords = extracted.chunks.map((c, i) => ({
          id: `${savedPage.id}-${i}`,
          sessionId,
          pageId: savedPage.id, // Validated foreign key referencing doc_pages.id
          url: savedPage.url,
          sourceDomain: session.rootDomain,
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
      res.json({ message: 'Page refreshed and re-indexed', page: savedPage });
    } else {
      res.status(400).json({ error: 'Failed to refresh page' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to refresh page' });
  }
});

// -----------------------------------------------------------------
// 12. DELETE /api/research/sessions/:sessionId - Delete session & data
// -----------------------------------------------------------------
apiRouter.delete('/research/sessions/:sessionId', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDatabase();
    const deleted = await db.deleteSession(req.params.sessionId);
    if (!deleted) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    // Clean up SSE clients
    sseClients.delete(req.params.sessionId);
    res.json({ message: 'Session and temporary research index deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete session' });
  }
});

// -----------------------------------------------------------------
// 13. GET /api/research/sessions/:sessionId/evaluations
// -----------------------------------------------------------------
apiRouter.get('/research/sessions/:sessionId/evaluations', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const db = await getDatabase();
    const tests = await db.getEvaluations(sessionId);
    const summary = summarizeEvaluationSuite(tests);
    res.json({ tests, summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch evaluations' });
  }
});

// -----------------------------------------------------------------
// 14. POST /api/research/sessions/:sessionId/evaluations/quick
// -----------------------------------------------------------------
apiRouter.post('/research/sessions/:sessionId/evaluations/quick', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const db = await getDatabase();
    const session = await db.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const testCandidates = await generateQuickEvaluationSuite(sessionId);
    const executedTests: EvaluationTestCase[] = [];

    for (const testCase of testCandidates) {
      const executed = await executeEvaluationTest(sessionId, testCase);
      await db.saveEvaluation(executed);
      executedTests.push(executed);
    }

    const allTests = await db.getEvaluations(sessionId);
    const summary = summarizeEvaluationSuite(allTests);

    res.json({
      message: `Executed ${executedTests.length} exploratory evaluation tests against hybrid index`,
      tests: allTests,
      summary,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to execute quick evaluation' });
  }
});

// -----------------------------------------------------------------
// 15. POST /api/research/sessions/:sessionId/evaluations/ground-truth
// -----------------------------------------------------------------
apiRouter.post('/research/sessions/:sessionId/evaluations/ground-truth', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const { question, expectedUrls, expectedKeywords, expectedHeading, topK } = req.body;

    if (!question || typeof question !== 'string' || !question.trim()) {
      res.status(400).json({ error: 'Question is required for ground-truth evaluation' });
      return;
    }

    const db = await getDatabase();
    const session = await db.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const newTest: EvaluationTestCase = {
      id: crypto.randomUUID(),
      sessionId,
      type: 'ground_truth',
      isGroundTruth: true,
      question: question.trim(),
      expectedUrls: Array.isArray(expectedUrls) ? expectedUrls.filter(Boolean) : [],
      expectedKeywords: Array.isArray(expectedKeywords) ? expectedKeywords.filter(Boolean) : [],
      expectedHeading: typeof expectedHeading === 'string' ? expectedHeading.trim() : undefined,
      topK: typeof topK === 'number' && topK > 0 ? topK : 5,
      status: 'running',
      retrievedItems: [],
    };

    const executed = await executeEvaluationTest(sessionId, newTest);
    await db.saveEvaluation(executed);

    const allTests = await db.getEvaluations(sessionId);
    const summary = summarizeEvaluationSuite(allTests);

    res.status(201).json({
      test: executed,
      summary,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to execute ground-truth evaluation' });
  }
});

// -----------------------------------------------------------------
// 16. POST /api/research/sessions/:sessionId/evaluations/:testId/rerun
// -----------------------------------------------------------------
apiRouter.post('/research/sessions/:sessionId/evaluations/:testId/rerun', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId, testId } = req.params;
    const db = await getDatabase();
    const existing = await db.getEvaluation(testId);
    if (!existing) {
      res.status(404).json({ error: 'Evaluation test case not found' });
      return;
    }

    const rerunResult = await executeEvaluationTest(sessionId, existing);
    await db.saveEvaluation(rerunResult);

    const allTests = await db.getEvaluations(sessionId);
    const summary = summarizeEvaluationSuite(allTests);

    res.json({ test: rerunResult, summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to rerun evaluation' });
  }
});

// -----------------------------------------------------------------
// 17. POST /api/research/sessions/:sessionId/evaluations/run-all
// -----------------------------------------------------------------
apiRouter.post('/research/sessions/:sessionId/evaluations/run-all', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const db = await getDatabase();
    const existing = await db.getEvaluations(sessionId);

    const updatedTests: EvaluationTestCase[] = [];
    for (const test of existing) {
      const executed = await executeEvaluationTest(sessionId, test);
      await db.saveEvaluation(executed);
      updatedTests.push(executed);
    }

    const summary = summarizeEvaluationSuite(updatedTests);
    res.json({ tests: updatedTests, summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to rerun all evaluation tests' });
  }
});

// -----------------------------------------------------------------
// 18. DELETE /api/research/sessions/:sessionId/evaluations/:testId
// -----------------------------------------------------------------
apiRouter.delete('/research/sessions/:sessionId/evaluations/:testId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId, testId } = req.params;
    const db = await getDatabase();
    const deleted = await db.deleteEvaluation(testId);
    if (!deleted) {
      res.status(404).json({ error: 'Evaluation test not found' });
      return;
    }
    const allTests = await db.getEvaluations(sessionId);
    const summary = summarizeEvaluationSuite(allTests);
    res.json({ message: 'Evaluation test removed', summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete evaluation test' });
  }
});

// -----------------------------------------------------------------
// 19. DELETE /api/research/sessions/:sessionId/evaluations
// -----------------------------------------------------------------
apiRouter.delete('/research/sessions/:sessionId/evaluations', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const db = await getDatabase();
    const cleared = await db.clearEvaluations(sessionId);
    res.json({ message: `Cleared ${cleared} evaluation tests`, summary: summarizeEvaluationSuite([]) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to clear evaluations' });
  }
});

// -----------------------------------------------------------------
// 20. POST /api/research/sessions/:sessionId/pages/:pageId/retry
// -----------------------------------------------------------------
apiRouter.post('/research/sessions/:sessionId/pages/:pageId/retry', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId, pageId } = req.params;
    const db = await getDatabase();
    const session = await db.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const pages = await db.listPages(sessionId);
    const targetPage = pages.find(p => p.id === pageId || p.url === pageId);
    if (!targetPage) {
      res.status(404).json({ error: 'Page not found' });
      return;
    }

    let host = targetPage.sourceDomain;
    if (!host) {
      try { host = new URL(targetPage.url).hostname; } catch { host = session.rootDomain; }
    }

    const crawler = new DocumentationCrawler(sessionId, targetPage.url, {
      targetVersion: targetPage.docVersion || session.docVersion,
      sourceDomain: host,
      researchObjective: session.researchObjective,
    });

    const retried = await crawler.crawlSpecificUrl(targetPage.url, true);
    if (!retried || retried.crawlStatus === 'failed') {
      res.status(400).json({ error: 'Retry crawl failed', page: retried });
      return;
    }

    // Extract content
    const extracted = extractContent(retried.rawMarkdown, retried.url, host, retried.docVersion);

    // STEP 1: Save page first to guarantee valid database ID in doc_pages
    const savedPage = await db.savePage({
      ...retried,
      sourceDomain: host,
      category: extracted.category,
      crawlStatus: 'indexed',
      errorMessage: undefined,
    });

    // STEP 2: Index chunks using verified savedPage.id
    if (extracted.chunks.length > 0) {
      const texts = extracted.chunks.map(c => `${c.heading || ''}\n${c.content}`);
      const embeddings = await batchGenerateEmbeddings(texts);

      const chunkRecords = extracted.chunks.map((c, i) => ({
        id: `${savedPage.id}-${i}`,
        sessionId,
        pageId: savedPage.id, // Validated foreign key referencing doc_pages.id
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

    res.json({ message: 'Page successfully retried and indexed', page: savedPage });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retry page crawl' });
  }
});

// -----------------------------------------------------------------
// Background Worker: Crawl & Vector Indexing Pipeline
// -----------------------------------------------------------------
async function startCrawlPipeline(
  sessionId: string,
  targetUrl: string,
  options: { maxPages?: number; maxDepth?: number; docVersion?: string }
): Promise<void> {
  const db = await getDatabase();
  const session = await db.getSession(sessionId);
  const objective = session?.researchObjective;

  let host = 'docs';
  try {
    host = new URL(targetUrl).hostname;
  } catch {
    host = session?.rootDomain || 'docs';
  }

  const crawler = new DocumentationCrawler(sessionId, targetUrl, {
    maxPages: options.maxPages || 15,
    maxDepth: options.maxDepth || 3,
    targetVersion: options.docVersion,
    researchObjective: objective,
    sourceDomain: host,
    onProgress: (event) => {
      broadcastProgress(sessionId, {
        ...event,
        objective,
      });
    },
  });

  try {
    // 1. Crawl Pages
    await db.updateSession(sessionId, {
      crawlStatus: 'crawling',
      currentStage: 'crawling',
      progressPercent: 15,
    });

    const crawlResult = await crawler.start();

    // 2. Extract & Index Pages
    await db.updateSession(sessionId, {
      crawlStatus: 'indexing',
      currentStage: 'extracting',
      pagesDiscovered: crawlResult.pagesDiscovered,
      pagesCrawled: crawlResult.pages.length,
      pagesExtracted: crawlResult.pages.length,
      progressPercent: 60,
    });

    broadcastProgress(sessionId, {
      type: 'page_indexed',
      sessionId,
      status: 'indexing',
      currentStage: 'extracting',
      discoveredCount: crawlResult.pagesDiscovered,
      crawledCount: crawlResult.pages.length,
      extractedCount: crawlResult.pages.length,
      indexedCount: 0,
      failedCount: 0,
      progressPercent: 65,
      objective,
      message: 'Extracting technical AST sections, code blocks, and parameter tables...',
      timestamp: new Date().toISOString(),
    });

    let totalIndexedChunks = 0;

    for (let pIdx = 0; pIdx < crawlResult.pages.length; pIdx++) {
      const page = crawlResult.pages[pIdx];

      // Re-extract chunks for the crawled page
      const currentSession = await db.getSession(sessionId);
      let host = 'docs';
      try {
        host = new URL(page.url).hostname;
      } catch {
        host = currentSession?.rootDomain || 'docs';
      }

      const extracted = extractContent(
        page.rawMarkdown,
        page.url,
        host,
        page.docVersion
      );

      // STEP 1: Persist the page first to guarantee its authoritative database ID
      const savedPage = await db.savePage({
        ...page,
        sourceDomain: host,
        category: page.category || extracted.category,
        crawlStatus: 'indexed',
      });

      // STEP 2: Index chunks using the verified savedPage.id
      if (extracted.chunks.length > 0) {
        // Embed chunk contents
        const texts = extracted.chunks.map(c => `${c.heading || ''}\n${c.content}`);
        const embeddings = await batchGenerateEmbeddings(texts);

        const chunkRecords = extracted.chunks.map((c, i) => ({
          id: `${savedPage.id}-${i}`,
          sessionId,
          pageId: savedPage.id, // References guaranteed existing row in doc_pages
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
        totalIndexedChunks += chunkRecords.length;
      }

      const pct = Math.round(65 + ((pIdx + 1) / crawlResult.pages.length) * 30);
      await db.updateSession(sessionId, {
        pagesIndexed: pIdx + 1,
        progressPercent: pct,
        currentStage: 'indexing',
      });

      broadcastProgress(sessionId, {
        type: 'page_indexed',
        sessionId,
        url: page.url,
        title: page.title,
        currentStage: 'indexing',
        discoveredCount: crawlResult.pagesDiscovered,
        crawledCount: crawlResult.pages.length,
        extractedCount: crawlResult.pages.length,
        indexedCount: pIdx + 1,
        failedCount: 0,
        progressPercent: pct,
        objective,
        message: `Indexed (${pIdx + 1}/${crawlResult.pages.length}): ${page.title}`,
        timestamp: new Date().toISOString(),
      });
    }

    const currentSession = await db.getSession(sessionId);
    let updatedSources = currentSession?.sources || [];
    let crawlHost = 'docs';
    try { crawlHost = new URL(targetUrl).hostname; } catch {}

    updatedSources = updatedSources.map(s => {
      if (s.targetUrl === targetUrl || s.rootDomain === crawlHost) {
        return {
          ...s,
          status: 'completed' as const,
          pagesCount: crawlResult.pagesDiscovered,
          indexedCount: crawlResult.pages.length,
        };
      }
      return s;
    });

    await db.updateSession(sessionId, {
      crawlStatus: 'completed',
      currentStage: 'completed',
      pagesIndexed: Math.max(currentSession?.pagesIndexed || 0, crawlResult.pages.length),
      pagesDiscovered: Math.max(currentSession?.pagesDiscovered || 0, crawlResult.pagesDiscovered),
      progressPercent: 100,
      sources: updatedSources,
    });

    broadcastProgress(sessionId, {
      type: 'crawl_completed',
      sessionId,
      status: 'completed',
      currentStage: 'completed',
      discoveredCount: crawlResult.pagesDiscovered,
      crawledCount: crawlResult.pages.length,
      extractedCount: crawlResult.pages.length,
      indexedCount: crawlResult.pages.length,
      failedCount: 0,
      progressPercent: 100,
      objective,
      message: `Research index ready! ${crawlResult.pages.length} pages indexed (${totalIndexedChunks} searchable chunks).`,
      timestamp: new Date().toISOString(),
    });

  } catch (err: any) {
    console.error(`[Crawl Pipeline Failed for ${sessionId}]:`, err);
    await db.updateSession(sessionId, {
      crawlStatus: 'failed',
      currentStage: 'failed',
    });
    broadcastProgress(sessionId, {
      type: 'crawl_failed',
      sessionId,
      status: 'failed',
      currentStage: 'failed',
      discoveredCount: 0,
      crawledCount: 0,
      extractedCount: 0,
      indexedCount: 0,
      failedCount: 1,
      progressPercent: 0,
      objective,
      message: `Crawling failed: ${err.message}`,
      timestamp: new Date().toISOString(),
    });
  }
}
