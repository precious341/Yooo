import crypto from 'crypto';
import { performance } from 'perf_hooks';
import { getDatabase } from '../database/db.js';
import { executeHybridRetrieval } from '../retrieval/hybrid.js';
import {
  EvaluationTestCase,
  EvaluationSummary,
  EvaluationType,
  RetrievedPassageItem,
} from '../types/index.js';
import { normalizeUrl } from '../utils/security.js';

export interface CreateGroundTruthInput {
  question: string;
  expectedUrls?: string[];
  expectedKeywords?: string[];
  expectedHeading?: string;
  topK?: number;
}

/**
 * Calculates Precision@K, Recall@K, and Reciprocal Rank for ground-truth evaluated tests
 */
export function calculateRetrievalMetrics(
  retrievedItems: RetrievedPassageItem[],
  expectedUrls: string[] = [],
  expectedKeywords: string[] = [],
  expectedHeading?: string,
  topK: number = 5
): {
  precisionAtK: number;
  recallAtK: number;
  reciprocalRank: number;
  relevantRetrievedCount: number;
  expectedFound: boolean;
  labeledItems: RetrievedPassageItem[];
} {
  const normExpectedUrls = expectedUrls.map(u => normalizeUrl(u)).filter(Boolean);
  const normExpectedKeywords = expectedKeywords.map(k => k.toLowerCase().trim()).filter(Boolean);
  const normExpectedHeading = (expectedHeading || '').toLowerCase().trim();

  let firstRelevantRank = 0;
  let relevantCount = 0;

  const labeledItems: RetrievedPassageItem[] = retrievedItems.slice(0, topK).map((item, idx) => {
    const itemUrlNorm = normalizeUrl(item.url) || item.url;
    const headingLower = (item.heading || '').toLowerCase();
    const contentLower = item.excerpt.toLowerCase();
    const rank = idx + 1;

    let isRelevant = false;

    // 1. URL match
    if (normExpectedUrls.length > 0) {
      if (normExpectedUrls.some(expUrl => {
        if (!expUrl || !itemUrlNorm) return false;
        const cleanItem = itemUrlNorm.replace(/\/+$/, '').toLowerCase();
        const cleanExp = expUrl.replace(/\/+$/, '').toLowerCase();
        return cleanItem === cleanExp || cleanItem.endsWith(cleanExp) || cleanExp.endsWith(cleanItem);
      })) {
        isRelevant = true;
      }
    }

    // 2. Heading match (only when both expected heading and item heading are non-empty)
    if (!isRelevant && normExpectedHeading && headingLower.trim().length > 0) {
      if (headingLower.includes(normExpectedHeading) || normExpectedHeading.includes(headingLower)) {
        isRelevant = true;
      }
    }

    // 3. Keyword conjunction match if no explicit URLs provided
    if (!isRelevant && normExpectedUrls.length === 0 && !normExpectedHeading && normExpectedKeywords.length > 0) {
      const allKeywordsPresent = normExpectedKeywords.every(kw =>
        contentLower.includes(kw) || headingLower.includes(kw)
      );
      if (allKeywordsPresent) {
        isRelevant = true;
      }
    }

    if (isRelevant) {
      relevantCount++;
      if (firstRelevantRank === 0) {
        firstRelevantRank = rank;
      }
    }

    return {
      ...item,
      isRelevant,
    };
  });

  const k = Math.max(labeledItems.length, 1);
  const precisionAtK = Math.round((relevantCount / k) * 1000) / 1000;

  const totalExpected = Math.max(normExpectedUrls.length || (normExpectedKeywords.length > 0 ? 1 : 1), 1);
  const recallAtK = Math.min(Math.round((relevantCount / totalExpected) * 1000) / 1000, 1.0);

  const reciprocalRank = firstRelevantRank > 0 ? Math.round((1 / firstRelevantRank) * 1000) / 1000 : 0;
  const expectedFound = relevantCount > 0;

  return {
    precisionAtK,
    recallAtK,
    reciprocalRank,
    relevantRetrievedCount: relevantCount,
    expectedFound,
    labeledItems,
  };
}

/**
 * Executes a single evaluation test case against the genuine hybrid retrieval pipeline
 */
export async function executeEvaluationTest(
  sessionId: string,
  testCase: EvaluationTestCase
): Promise<EvaluationTestCase> {
  const startTime = performance.now();
  const topK = testCase.topK || 5;

  try {
    const retrievalResult = await executeHybridRetrieval(sessionId, testCase.question, {
      topK,
      allowLiveCrawl: false, // Evaluation tests existing indexed retrieval performance
    });

    const elapsedMs = Math.round(performance.now() - startTime);

    const retrievedItems: RetrievedPassageItem[] = retrievalResult.results.map(r => ({
      chunkId: r.chunk.id,
      url: r.chunk.url,
      pageTitle: r.chunk.pageTitle,
      heading: r.chunk.heading,
      sourceDomain: r.chunk.sourceDomain,
      score: Math.round(r.score * 10000) / 10000,
      retrievalMethod: r.retrievalMethod,
      excerpt: r.chunk.content.slice(0, 320),
    }));

    if (testCase.isGroundTruth) {
      const metrics = calculateRetrievalMetrics(
        retrievedItems,
        testCase.expectedUrls,
        testCase.expectedKeywords,
        testCase.expectedHeading,
        topK
      );

      return {
        ...testCase,
        status: 'success',
        executedAt: new Date().toISOString(),
        latencyMs: elapsedMs,
        retrievalMethod: retrievalResult.queryRoute,
        retrievedItems: metrics.labeledItems,
        precisionAtK: metrics.precisionAtK,
        recallAtK: metrics.recallAtK,
        reciprocalRank: metrics.reciprocalRank,
        relevantRetrievedCount: metrics.relevantRetrievedCount,
        expectedFound: metrics.expectedFound,
      };
    } else {
      // Exploratory evaluation: does not fabricate precision or accuracy without defined ground truth
      return {
        ...testCase,
        status: 'success',
        executedAt: new Date().toISOString(),
        latencyMs: elapsedMs,
        retrievalMethod: retrievalResult.queryRoute,
        retrievedItems,
        // Keep ground-truth metrics undefined for exploratory tests
        precisionAtK: undefined,
        recallAtK: undefined,
        reciprocalRank: undefined,
        relevantRetrievedCount: undefined,
        expectedFound: undefined,
      };
    }
  } catch (err: any) {
    const elapsedMs = Math.round(performance.now() - startTime);
    return {
      ...testCase,
      status: 'failed',
      executedAt: new Date().toISOString(),
      latencyMs: elapsedMs,
      errorMessage: err.message || 'Retrieval pipeline execution failed',
      retrievedItems: [],
    };
  }
}

/**
 * Generates a candidate exploratory test question suite from successfully indexed documentation
 */
export async function generateQuickEvaluationSuite(sessionId: string): Promise<EvaluationTestCase[]> {
  const db = await getDatabase();
  const [pages, chunks] = await Promise.all([
    db.listPages(sessionId),
    db.getChunks(sessionId),
  ]);

  const indexedPages = pages.filter(p => p.crawlStatus === 'indexed' || p.crawlStatus === 'crawled');
  if (indexedPages.length === 0) {
    throw new Error('No indexed documentation pages found. Please crawl and index documentation first.');
  }

  const generatedQuestions: string[] = [];
  const questionMap = new Map<string, { expectedUrl?: string; heading?: string }>();

  // 1. Generate questions from prominent section headings
  for (const page of indexedPages) {
    for (const h of page.headings) {
      const headingClean = h.text.trim();
      if (headingClean.length > 5 && headingClean.length < 60 && !headingClean.toLowerCase().includes('overview')) {
        const q = `How do I implement or configure ${headingClean} in ${page.title}?`;
        if (!questionMap.has(q) && generatedQuestions.length < 4) {
          generatedQuestions.push(q);
          questionMap.set(q, { expectedUrl: page.url, heading: headingClean });
        }
      }
    }
    if (generatedQuestions.length >= 4) break;
  }

  // 2. Generate questions from code or API chunks
  const codeChunks = chunks.filter(c => c.contentType === 'code' || c.contentType === 'api_spec');
  for (const chunk of codeChunks) {
    if (chunk.heading && generatedQuestions.length < 6) {
      const q = `What is the syntax and usage for ${chunk.heading}?`;
      if (!questionMap.has(q)) {
        generatedQuestions.push(q);
        questionMap.set(q, { expectedUrl: chunk.url, heading: chunk.heading });
      }
    }
  }

  // 3. Fallback to general conceptual questions from page titles
  if (generatedQuestions.length < 3) {
    for (const page of indexedPages.slice(0, 3)) {
      const q = `What are the core concepts and guide for ${page.title}?`;
      if (!questionMap.has(q)) {
        generatedQuestions.push(q);
        questionMap.set(q, { expectedUrl: page.url });
      }
    }
  }

  const testCases: EvaluationTestCase[] = generatedQuestions.slice(0, 5).map(q => {
    return {
      id: crypto.randomUUID(),
      sessionId,
      type: 'exploratory' as EvaluationType,
      isGroundTruth: false,
      question: q,
      topK: 5,
      status: 'idle',
      retrievedItems: [],
    };
  });

  return testCases;
}

/**
 * Aggregates results of an evaluation suite, calculating ground truth metrics only when available
 */
export function summarizeEvaluationSuite(tests: EvaluationTestCase[]): EvaluationSummary {
  const totalTests = tests.length;
  const executedTests = tests.filter(t => t.status === 'success');
  const failedCount = tests.filter(t => t.status === 'failed').length;

  const groundTruthExecuted = executedTests.filter(t => t.isGroundTruth && t.precisionAtK !== undefined);
  const exploratoryCount = tests.filter(t => !t.isGroundTruth).length;
  const groundTruthCount = tests.filter(t => t.isGroundTruth).length;

  const totalLatency = executedTests.reduce((acc, t) => acc + (t.latencyMs || 0), 0);
  const averageLatencyMs = executedTests.length > 0 ? Math.round(totalLatency / executedTests.length) : 0;

  if (groundTruthExecuted.length > 0) {
    const sumPrecision = groundTruthExecuted.reduce((acc, t) => acc + (t.precisionAtK || 0), 0);
    const sumRecall = groundTruthExecuted.reduce((acc, t) => acc + (t.recallAtK || 0), 0);
    const sumMRR = groundTruthExecuted.reduce((acc, t) => acc + (t.reciprocalRank || 0), 0);

    return {
      totalTests,
      executedCount: executedTests.length,
      failedCount,
      groundTruthCount,
      exploratoryCount,
      averageLatencyMs,
      meanPrecisionAtK: Math.round((sumPrecision / groundTruthExecuted.length) * 1000) / 1000,
      meanRecallAtK: Math.round((sumRecall / groundTruthExecuted.length) * 1000) / 1000,
      meanReciprocalRank: Math.round((sumMRR / groundTruthExecuted.length) * 1000) / 1000,
      hasGroundTruthMetrics: true,
    };
  }

  return {
    totalTests,
    executedCount: executedTests.length,
    failedCount,
    groundTruthCount,
    exploratoryCount,
    averageLatencyMs,
    meanPrecisionAtK: undefined,
    meanRecallAtK: undefined,
    meanReciprocalRank: undefined,
    hasGroundTruthMetrics: false,
  };
}
