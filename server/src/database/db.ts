import pg from 'pg';
import crypto from 'crypto';
import { ResearchSession, DocPage, DocChunk, ChatMessage, SearchResult, EvaluationTestCase } from '../types/index.js';

const { Pool } = pg;

export type CreateSessionInput = {
  targetUrl: string;
  rootDomain: string;
  researchObjective?: string;
  docVersion?: string;
  crawlStatus?: ResearchSession['crawlStatus'];
  sources?: ResearchSession['sources'];
};

export interface DatabaseAdapter {
  createSession(session: CreateSessionInput): Promise<ResearchSession>;
  getSession(id: string): Promise<ResearchSession | null>;
  listSessions(): Promise<ResearchSession[]>;
  updateSession(id: string, updates: Partial<ResearchSession>): Promise<ResearchSession | null>;
  deleteSession(id: string): Promise<boolean>;

  savePage(page: DocPage): Promise<DocPage>;
  getPage(sessionId: string, url: string): Promise<DocPage | null>;
  listPages(sessionId: string): Promise<DocPage[]>;

  saveChunks(chunks: DocChunk[]): Promise<number>;
  getChunks(sessionId: string): Promise<DocChunk[]>;

  searchVector(sessionId: string, queryEmbedding: number[], topK?: number, version?: string): Promise<SearchResult[]>;
  searchKeyword(sessionId: string, query: string, topK?: number, version?: string): Promise<SearchResult[]>;

  saveMessage(message: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage>;
  getMessages(sessionId: string): Promise<ChatMessage[]>;

  // Research Quality Evaluation persistence
  saveEvaluation(test: EvaluationTestCase): Promise<EvaluationTestCase>;
  getEvaluations(sessionId: string): Promise<EvaluationTestCase[]>;
  getEvaluation(id: string): Promise<EvaluationTestCase | null>;
  deleteEvaluation(id: string): Promise<boolean>;
  clearEvaluations(sessionId: string): Promise<number>;

  cleanupExpired(): Promise<number>;
}

// -------------------------------------------------------------
// In-Memory / Embedded PGVector-Compatible Hybrid Store
// -------------------------------------------------------------
class InMemoryStore implements DatabaseAdapter {
  private sessions = new Map<string, ResearchSession>();
  private pages = new Map<string, DocPage[]>(); // sessionId -> DocPage[]
  private chunks = new Map<string, DocChunk[]>(); // sessionId -> DocChunk[]
  private messages = new Map<string, ChatMessage[]>(); // sessionId -> ChatMessage[]
  private evaluations = new Map<string, EvaluationTestCase[]>(); // sessionId -> EvaluationTestCase[]

  async createSession(input: CreateSessionInput): Promise<ResearchSession> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const session: ResearchSession = {
      id,
      targetUrl: input.targetUrl,
      rootDomain: input.rootDomain,
      researchObjective: input.researchObjective,
      docVersion: input.docVersion,
      crawlStatus: input.crawlStatus || 'idle',
      currentStage: 'idle',
      pagesDiscovered: 0,
      pagesCrawled: 0,
      pagesExtracted: 0,
      pagesIndexed: 0,
      pagesFailed: 0,
      progressPercent: 0,
      sources: [
        {
          id: crypto.randomUUID(),
          targetUrl: input.targetUrl,
          rootDomain: input.rootDomain,
          name: input.rootDomain,
          docVersion: input.docVersion,
          pagesCount: 0,
          indexedCount: 0,
          status: input.crawlStatus || 'idle',
        }
      ],
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };

    this.sessions.set(id, session);
    this.pages.set(id, []);
    this.chunks.set(id, []);
    this.messages.set(id, []);
    this.evaluations.set(id, []);
    return session;
  }

  async getSession(id: string): Promise<ResearchSession | null> {
    return this.sessions.get(id) || null;
  }

  async listSessions(): Promise<ResearchSession[]> {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async updateSession(id: string, updates: Partial<ResearchSession>): Promise<ResearchSession | null> {
    const session = this.sessions.get(id);
    if (!session) return null;
    const updated: ResearchSession = {
      ...session,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(id, updated);
    return updated;
  }

  async deleteSession(id: string): Promise<boolean> {
    const exists = this.sessions.has(id);
    this.sessions.delete(id);
    this.pages.delete(id);
    this.chunks.delete(id);
    this.messages.delete(id);
    this.evaluations.delete(id);
    return exists;
  }

  async savePage(page: DocPage): Promise<DocPage> {
    const sessionPages = this.pages.get(page.sessionId) || [];
    const idx = sessionPages.findIndex(p => p.url === page.url);

    // Resolve sourceDomain
    if (!page.sourceDomain) {
      try {
        page.sourceDomain = new URL(page.url).hostname;
      } catch {
        // default
      }
    }

    if (idx >= 0) {
      sessionPages[idx] = page;
    } else {
      sessionPages.push(page);
    }
    this.pages.set(page.sessionId, sessionPages);

    // Update session discovered / crawled / indexed / failed counts
    const session = this.sessions.get(page.sessionId);
    if (session) {
      session.pagesDiscovered = sessionPages.length;
      session.pagesCrawled = sessionPages.filter(p => p.crawlStatus === 'crawled' || p.crawlStatus === 'indexed').length;
      session.pagesExtracted = sessionPages.filter(p => p.rawMarkdown && p.rawMarkdown.length > 0).length;
      session.pagesIndexed = sessionPages.filter(p => p.crawlStatus === 'indexed').length;
      session.pagesFailed = sessionPages.filter(p => p.crawlStatus === 'failed').length;

      // Update multi-source tracking
      if (!session.sources) {
        session.sources = [];
      }
      const srcDomain = page.sourceDomain || session.rootDomain;
      let src = session.sources.find(s => s.rootDomain === srcDomain);
      if (!src) {
        src = {
          id: crypto.randomUUID(),
          targetUrl: page.url,
          rootDomain: srcDomain,
          name: srcDomain,
          docVersion: page.docVersion,
          pagesCount: 0,
          indexedCount: 0,
          status: 'crawling',
        };
        session.sources.push(src);
      }
      const domainPages = sessionPages.filter(p => (p.sourceDomain || session.rootDomain) === srcDomain);
      src.pagesCount = domainPages.length;
      src.indexedCount = domainPages.filter(p => p.crawlStatus === 'indexed').length;
      src.status = src.indexedCount > 0 ? (session.crawlStatus === 'completed' ? 'completed' : 'indexing') : 'crawling';
    }
    return page;
  }

  async getPage(sessionId: string, url: string): Promise<DocPage | null> {
    const list = this.pages.get(sessionId) || [];
    return list.find(p => p.url === url) || null;
  }

  async listPages(sessionId: string): Promise<DocPage[]> {
    return this.pages.get(sessionId) || [];
  }

  async saveChunks(newChunks: DocChunk[]): Promise<number> {
    if (newChunks.length === 0) return 0;
    const sessionId = newChunks[0].sessionId;
    const sessionPages = this.pages.get(sessionId) || [];

    // Enforce foreign key validation: each chunk's pageId must exist in doc_pages
    for (const chunk of newChunks) {
      const pageExists = sessionPages.some(p => p.id === chunk.pageId);
      if (!pageExists) {
        throw new Error(`insert or update on table "doc_chunks" violates foreign key constraint "doc_chunks_page_id_fkey": Page ID "${chunk.pageId}" does not exist in doc_pages.`);
      }
    }

    const list = this.chunks.get(sessionId) || [];
    const targetPageIds = new Set(newChunks.map(c => c.pageId));
    // Remove old chunks for these pages to prevent duplication
    const filtered = list.filter(c => !targetPageIds.has(c.pageId));
    filtered.push(...newChunks);
    this.chunks.set(sessionId, filtered);
    return newChunks.length;
  }

  async getChunks(sessionId: string): Promise<DocChunk[]> {
    return this.chunks.get(sessionId) || [];
  }

  /**
   * Cosine similarity vector search
   */
  async searchVector(sessionId: string, queryEmbedding: number[], topK = 10, version?: string): Promise<SearchResult[]> {
    const list = this.chunks.get(sessionId) || [];
    if (list.length === 0 || !queryEmbedding || queryEmbedding.length === 0) return [];

    const scored: Array<{ chunk: DocChunk; score: number }> = [];

    // Precalculate query norm
    let queryNorm = 0;
    for (let i = 0; i < queryEmbedding.length; i++) {
      queryNorm += queryEmbedding[i] * queryEmbedding[i];
    }
    queryNorm = Math.sqrt(queryNorm);
    if (queryNorm === 0) return [];

    for (const chunk of list) {
      if (version && chunk.docVersion && chunk.docVersion !== version) continue;
      if (!chunk.embedding || chunk.embedding.length !== queryEmbedding.length) continue;

      let dotProduct = 0;
      let chunkNorm = 0;
      for (let i = 0; i < queryEmbedding.length; i++) {
        dotProduct += queryEmbedding[i] * chunk.embedding[i];
        chunkNorm += chunk.embedding[i] * chunk.embedding[i];
      }
      chunkNorm = Math.sqrt(chunkNorm);
      const similarity = chunkNorm > 0 ? dotProduct / (queryNorm * chunkNorm) : 0;

      scored.push({ chunk, score: similarity });
    }

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map((item, idx) => ({
      chunk: item.chunk,
      score: item.score,
      semanticRank: idx + 1,
      retrievalMethod: 'semantic',
    }));
  }

  /**
   * Keyword / BM25-style full-text search with token frequency & exact match bonuses
   */
  async searchKeyword(sessionId: string, query: string, topK = 10, version?: string): Promise<SearchResult[]> {
    const list = this.chunks.get(sessionId) || [];
    if (list.length === 0) return [];

    const terms = query
      .toLowerCase()
      .split(/[^a-z0-9_.-]+/)
      .filter(t => t.length > 2);

    if (terms.length === 0) return [];

    const scored: Array<{ chunk: DocChunk; score: number }> = [];

    for (const chunk of list) {
      if (version && chunk.docVersion && chunk.docVersion !== version) continue;

      const contentLower = chunk.content.toLowerCase();
      const titleLower = chunk.pageTitle.toLowerCase();
      const headingLower = (chunk.heading || '').toLowerCase();

      let score = 0;
      let matchedTerms = 0;

      for (const term of terms) {
        let termScore = 0;

        // Exact match in heading
        if (headingLower.includes(term)) termScore += 5.0;
        // Exact match in title
        if (titleLower.includes(term)) termScore += 3.0;

        // Frequency in body content
        const occurrences = (contentLower.match(new RegExp(`\\b${term}\\b`, 'g')) || []).length;
        if (occurrences > 0) {
          termScore += Math.min(occurrences * 1.5, 6.0);
          matchedTerms++;
        } else if (contentLower.includes(term)) {
          termScore += 0.8;
          matchedTerms++;
        }

        score += termScore;
      }

      // Bonus if all terms match
      if (matchedTerms === terms.length && terms.length > 1) {
        score *= 1.5;
      }

      // Exact phrase match bonus
      if (contentLower.includes(query.toLowerCase().trim())) {
        score += 10.0;
      }

      if (score > 0) {
        scored.push({ chunk, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map((item, idx) => ({
      chunk: item.chunk,
      score: item.score,
      keywordRank: idx + 1,
      retrievalMethod: 'keyword',
    }));
  }

  async saveMessage(input: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const msg: ChatMessage = {
      id,
      ...input,
      createdAt: now,
    };
    const list = this.messages.get(input.sessionId) || [];
    list.push(msg);
    this.messages.set(input.sessionId, list);
    return msg;
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    return this.messages.get(sessionId) || [];
  }

  async saveEvaluation(test: EvaluationTestCase): Promise<EvaluationTestCase> {
    const list = this.evaluations.get(test.sessionId) || [];
    const idx = list.findIndex(t => t.id === test.id);
    if (idx >= 0) {
      list[idx] = test;
    } else {
      list.push(test);
    }
    this.evaluations.set(test.sessionId, list);
    return test;
  }

  async getEvaluations(sessionId: string): Promise<EvaluationTestCase[]> {
    return this.evaluations.get(sessionId) || [];
  }

  async getEvaluation(id: string): Promise<EvaluationTestCase | null> {
    for (const list of this.evaluations.values()) {
      const found = list.find(t => t.id === id);
      if (found) return found;
    }
    return null;
  }

  async deleteEvaluation(id: string): Promise<boolean> {
    for (const [sessionId, list] of this.evaluations.entries()) {
      const idx = list.findIndex(t => t.id === id);
      if (idx >= 0) {
        list.splice(idx, 1);
        this.evaluations.set(sessionId, list);
        return true;
      }
    }
    return false;
  }

  async clearEvaluations(sessionId: string): Promise<number> {
    const list = this.evaluations.get(sessionId) || [];
    const count = list.length;
    this.evaluations.set(sessionId, []);
    return count;
  }

  async cleanupExpired(): Promise<number> {
    const now = new Date().getTime();
    let cleaned = 0;
    for (const [id, session] of this.sessions.entries()) {
      if (new Date(session.expiresAt).getTime() < now) {
        this.deleteSession(id);
        cleaned++;
      }
    }
    return cleaned;
  }
}

// -------------------------------------------------------------
// PostgreSQL + pgvector Adapter
// -------------------------------------------------------------
class PostgresStore implements DatabaseAdapter {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    this.pool = new Pool({
      connectionString,
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
      await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
      await client.query(`
        CREATE TABLE IF NOT EXISTS research_sessions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID,
          target_url TEXT NOT NULL,
          root_domain TEXT NOT NULL,
          research_objective TEXT,
          doc_version TEXT,
          crawl_status VARCHAR(50) NOT NULL DEFAULT 'idle',
          pages_discovered INT DEFAULT 0,
          pages_indexed INT DEFAULT 0,
          sources JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours')
        );

        CREATE TABLE IF NOT EXISTS doc_pages (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          session_id UUID NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
          url TEXT NOT NULL,
          canonical_url TEXT,
          title TEXT NOT NULL,
          source_domain TEXT,
          parent_url TEXT,
          depth INT DEFAULT 0,
          doc_version TEXT,
          content_hash VARCHAR(64) NOT NULL,
          headings JSONB DEFAULT '[]'::jsonb,
          breadcrumbs JSONB DEFAULT '[]'::jsonb,
          links JSONB DEFAULT '[]'::jsonb,
          raw_markdown TEXT,
          word_count INT DEFAULT 0,
          crawl_status VARCHAR(50) NOT NULL DEFAULT 'discovered',
          error_message TEXT,
          crawled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          CONSTRAINT uq_session_page_url UNIQUE (session_id, url)
        );

        CREATE TABLE IF NOT EXISTS doc_chunks (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          session_id UUID NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
          page_id UUID NOT NULL REFERENCES doc_pages(id) ON DELETE CASCADE,
          url TEXT NOT NULL,
          source_domain TEXT,
          page_title TEXT NOT NULL,
          heading TEXT,
          heading_hierarchy JSONB DEFAULT '[]'::jsonb,
          content_type VARCHAR(50) DEFAULT 'section',
          content TEXT NOT NULL,
          token_count INT DEFAULT 0,
          chunk_index INT NOT NULL,
          doc_version TEXT,
          embedding vector(768),
          search_vector tsvector GENERATED ALWAYS AS (
            to_tsvector('english', coalesce(page_title, '') || ' ' || coalesce(heading, '') || ' ' || coalesce(content, ''))
          ) STORED,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS research_messages (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          session_id UUID NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
          role VARCHAR(20) NOT NULL,
          content TEXT NOT NULL,
          citations JSONB DEFAULT '[]'::jsonb,
          sources_used JSONB DEFAULT '[]'::jsonb,
          retrieval_meta JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS evaluation_tests (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          test_type TEXT NOT NULL,
          question TEXT NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_research_sessions_expires ON research_sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_doc_pages_session_url ON doc_pages(session_id, url);
        CREATE INDEX IF NOT EXISTS idx_doc_chunks_session ON doc_chunks(session_id);
        CREATE INDEX IF NOT EXISTS idx_doc_chunks_search_vector ON doc_chunks USING GIN(search_vector);
        CREATE INDEX IF NOT EXISTS idx_evaluation_tests_session ON evaluation_tests(session_id);
      `);
    } catch (e: any) {
      console.info('[PostgresStore] Extension or table setup notice:', e?.message || e);
    } finally {
      client.release();
    }
  }

  async createSession(input: CreateSessionInput): Promise<ResearchSession> {
    const query = `
      INSERT INTO research_sessions (target_url, root_domain, research_objective, doc_version, crawl_status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const res = await this.pool.query(query, [
      input.targetUrl,
      input.rootDomain,
      input.researchObjective || null,
      input.docVersion || null,
      input.crawlStatus || 'idle',
    ]);
    const r = res.rows[0];
    return {
      id: r.id,
      targetUrl: r.target_url,
      rootDomain: r.root_domain,
      researchObjective: r.research_objective,
      docVersion: r.doc_version,
      crawlStatus: r.crawl_status,
      currentStage: 'idle',
      pagesDiscovered: r.pages_discovered || 0,
      pagesCrawled: 0,
      pagesExtracted: 0,
      pagesIndexed: r.pages_indexed || 0,
      pagesFailed: 0,
      progressPercent: 0,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      expiresAt: r.expires_at.toISOString(),
    };
  }

  async getSession(id: string): Promise<ResearchSession | null> {
    const res = await this.pool.query('SELECT * FROM research_sessions WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      targetUrl: r.target_url,
      rootDomain: r.root_domain,
      researchObjective: r.research_objective,
      docVersion: r.doc_version,
      crawlStatus: r.crawl_status,
      pagesDiscovered: r.pages_discovered || 0,
      pagesCrawled: r.pages_crawled || r.pages_indexed || 0,
      pagesExtracted: r.pages_extracted || r.pages_indexed || 0,
      pagesIndexed: r.pages_indexed || 0,
      pagesFailed: r.pages_failed || 0,
      currentStage: r.current_stage || r.crawl_status || 'idle',
      progressPercent: r.progress_percent || (r.crawl_status === 'completed' ? 100 : 0),
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      expiresAt: r.expires_at.toISOString(),
    };
  }

  async listSessions(): Promise<ResearchSession[]> {
    const res = await this.pool.query('SELECT * FROM research_sessions ORDER BY created_at DESC');
    return res.rows.map(r => ({
      id: r.id,
      targetUrl: r.target_url,
      rootDomain: r.root_domain,
      researchObjective: r.research_objective,
      docVersion: r.doc_version,
      crawlStatus: r.crawl_status,
      pagesDiscovered: r.pages_discovered || 0,
      pagesCrawled: r.pages_crawled || r.pages_indexed || 0,
      pagesExtracted: r.pages_extracted || r.pages_indexed || 0,
      pagesIndexed: r.pages_indexed || 0,
      pagesFailed: r.pages_failed || 0,
      currentStage: r.current_stage || r.crawl_status || 'idle',
      progressPercent: r.progress_percent || (r.crawl_status === 'completed' ? 100 : 0),
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
      expiresAt: r.expires_at.toISOString(),
    }));
  }

  async updateSession(id: string, updates: Partial<ResearchSession>): Promise<ResearchSession | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.crawlStatus !== undefined) {
      fields.push(`crawl_status = $${idx++}`);
      values.push(updates.crawlStatus);
    }
    if (updates.pagesDiscovered !== undefined) {
      fields.push(`pages_discovered = $${idx++}`);
      values.push(updates.pagesDiscovered);
    }
    if (updates.pagesIndexed !== undefined) {
      fields.push(`pages_indexed = $${idx++}`);
      values.push(updates.pagesIndexed);
    }
    fields.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE research_sessions
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *;
    `;
    const res = await this.pool.query(query, values);
    if (res.rows.length === 0) return null;
    return this.getSession(id);
  }

  async deleteSession(id: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      try {
        const rpcRes = await client.query('SELECT delete_research_session_cascade($1::uuid) as deleted', [id]);
        if (rpcRes.rows.length > 0 && rpcRes.rows[0].deleted !== undefined) {
          return Boolean(rpcRes.rows[0].deleted);
        }
      } catch {
        // Fallback to explicit transaction
      }

      await client.query('BEGIN');
      // Clean up evaluation tests (which reference session_id as text)
      await client.query('DELETE FROM evaluation_tests WHERE session_id = $1', [id]);
      // Clean up messages, chunks, and pages
      await client.query('DELETE FROM research_messages WHERE session_id = $1', [id]);
      await client.query('DELETE FROM doc_chunks WHERE session_id = $1', [id]);
      await client.query('DELETE FROM doc_pages WHERE session_id = $1', [id]);
      // Finally delete the session record
      const res = await client.query('DELETE FROM research_sessions WHERE id = $1', [id]);
      await client.query('COMMIT');
      return (res.rowCount ?? 0) > 0;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async savePage(page: DocPage): Promise<DocPage> {
    const isUuid = (str?: string) => !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    const pageId = isUuid(page.id) ? page.id : null;

    const query = `
      INSERT INTO doc_pages (
        id, session_id, url, canonical_url, title, source_domain, category, parent_url, depth, doc_version,
        content_hash, headings, breadcrumbs, links, raw_markdown, word_count,
        crawl_status, error_message, crawled_at
      ) VALUES (
        COALESCE($1::uuid, uuid_generate_v4()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW()
      )
      ON CONFLICT (session_id, url) DO UPDATE SET
        title = EXCLUDED.title,
        canonical_url = EXCLUDED.canonical_url,
        source_domain = COALESCE(EXCLUDED.source_domain, doc_pages.source_domain),
        category = COALESCE(EXCLUDED.category, doc_pages.category),
        parent_url = COALESCE(EXCLUDED.parent_url, doc_pages.parent_url),
        depth = EXCLUDED.depth,
        doc_version = COALESCE(EXCLUDED.doc_version, doc_pages.doc_version),
        content_hash = EXCLUDED.content_hash,
        headings = EXCLUDED.headings,
        breadcrumbs = EXCLUDED.breadcrumbs,
        links = EXCLUDED.links,
        raw_markdown = EXCLUDED.raw_markdown,
        word_count = EXCLUDED.word_count,
        crawl_status = EXCLUDED.crawl_status,
        error_message = EXCLUDED.error_message,
        crawled_at = NOW()
      RETURNING *;
    `;
    const res = await this.pool.query(query, [
      pageId,
      page.sessionId,
      page.url,
      page.canonicalUrl || null,
      page.title,
      page.sourceDomain || null,
      page.category || null,
      page.parentUrl || null,
      page.depth,
      page.docVersion || null,
      page.contentHash,
      JSON.stringify(page.headings),
      JSON.stringify(page.breadcrumbs),
      JSON.stringify(page.links),
      page.rawMarkdown,
      page.wordCount,
      page.crawlStatus,
      page.errorMessage || null,
    ]);
    const r = res.rows[0];
    return {
      ...page,
      id: r.id,
      sourceDomain: r.source_domain,
      category: r.category,
      crawlStatus: r.crawl_status,
      crawledAt: r.crawled_at ? r.crawled_at.toISOString() : page.crawledAt,
    };
  }

  async getPage(sessionId: string, url: string): Promise<DocPage | null> {
    const res = await this.pool.query('SELECT * FROM doc_pages WHERE session_id = $1 AND url = $2', [sessionId, url]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      sessionId: r.session_id,
      url: r.url,
      canonicalUrl: r.canonical_url,
      title: r.title,
      sourceDomain: r.source_domain,
      category: r.category,
      parentUrl: r.parent_url,
      depth: r.depth,
      docVersion: r.doc_version,
      contentHash: r.content_hash,
      headings: r.headings || [],
      breadcrumbs: r.breadcrumbs || [],
      links: r.links || [],
      rawMarkdown: r.raw_markdown,
      wordCount: r.word_count,
      crawlStatus: r.crawl_status,
      errorMessage: r.error_message,
      crawledAt: r.crawled_at.toISOString(),
    };
  }

  async listPages(sessionId: string): Promise<DocPage[]> {
    const res = await this.pool.query('SELECT * FROM doc_pages WHERE session_id = $1 ORDER BY crawled_at ASC', [sessionId]);
    return res.rows.map(r => ({
      id: r.id,
      sessionId: r.session_id,
      url: r.url,
      canonicalUrl: r.canonical_url,
      title: r.title,
      sourceDomain: r.source_domain,
      category: r.category,
      parentUrl: r.parent_url,
      depth: r.depth,
      docVersion: r.doc_version,
      contentHash: r.content_hash,
      headings: r.headings || [],
      breadcrumbs: r.breadcrumbs || [],
      links: r.links || [],
      rawMarkdown: r.raw_markdown,
      wordCount: r.word_count,
      crawlStatus: r.crawl_status,
      errorMessage: r.error_message,
      crawledAt: r.crawled_at.toISOString(),
    }));
  }

  async saveChunks(chunks: DocChunk[]): Promise<number> {
    if (chunks.length === 0) return 0;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // 1. Delete previous chunks for these pages to avoid duplicate chunks on re-crawl
      const pageIds = Array.from(new Set(chunks.map(c => c.pageId).filter(Boolean)));
      for (const pId of pageIds) {
        await client.query('DELETE FROM doc_chunks WHERE page_id = $1', [pId]);
      }

      for (const chunk of chunks) {
        const vectorStr = chunk.embedding ? `[${chunk.embedding.join(',')}]` : null;
        await client.query(`
          INSERT INTO doc_chunks (
            session_id, page_id, url, source_domain, page_title, heading, heading_hierarchy,
            content_type, content, token_count, chunk_index, doc_version, embedding
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::vector)
        `, [
          chunk.sessionId,
          chunk.pageId,
          chunk.url,
          chunk.sourceDomain || null,
          chunk.pageTitle,
          chunk.heading || null,
          JSON.stringify(chunk.headingHierarchy),
          chunk.contentType,
          chunk.content,
          chunk.tokenCount,
          chunk.chunkIndex,
          chunk.docVersion || null,
          vectorStr
        ]);
      }
      await client.query('COMMIT');
      return chunks.length;
    } catch (e: any) {
      await client.query('ROLLBACK').catch(() => {});
      if (e.code === '23503' && e.constraint === 'doc_chunks_page_id_fkey') {
        throw new Error(`Crawling failed: insert or update on table "doc_chunks" violates foreign key constraint "doc_chunks_page_id_fkey". Page record must be inserted before its chunks.`);
      }
      throw e;
    } finally {
      client.release();
    }
  }

  async getChunks(sessionId: string): Promise<DocChunk[]> {
    const res = await this.pool.query('SELECT * FROM doc_chunks WHERE session_id = $1 ORDER BY chunk_index ASC', [sessionId]);
    return res.rows.map(r => ({
      id: r.id,
      sessionId: r.session_id,
      pageId: r.page_id,
      url: r.url,
      sourceDomain: r.source_domain,
      pageTitle: r.page_title,
      heading: r.heading,
      headingHierarchy: r.heading_hierarchy || [],
      contentType: r.content_type,
      content: r.content,
      tokenCount: r.token_count,
      chunkIndex: r.chunk_index,
      docVersion: r.doc_version,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async searchVector(sessionId: string, queryEmbedding: number[], topK = 10, version?: string): Promise<SearchResult[]> {
    const vectorStr = `[${queryEmbedding.join(',')}]`;
    const query = `
      SELECT id, session_id, page_id, url, page_title, heading, heading_hierarchy,
             content_type, content, token_count, chunk_index, doc_version, created_at,
             1 - (embedding <=> $1::vector) as similarity
      FROM doc_chunks
      WHERE session_id = $2
        ${version ? 'AND (doc_version = $4 OR doc_version IS NULL)' : ''}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector ASC
      LIMIT $3;
    `;
    const params = version ? [vectorStr, sessionId, topK, version] : [vectorStr, sessionId, topK];
    const res = await this.pool.query(query, params);
    return res.rows.map((r, idx) => ({
      chunk: {
        id: r.id,
        sessionId: r.session_id,
        pageId: r.page_id,
        url: r.url,
        pageTitle: r.page_title,
        heading: r.heading,
        headingHierarchy: r.heading_hierarchy || [],
        contentType: r.content_type,
        content: r.content,
        tokenCount: r.token_count,
        chunkIndex: r.chunk_index,
        docVersion: r.doc_version,
        createdAt: r.created_at.toISOString(),
      },
      score: Number(r.similarity),
      semanticRank: idx + 1,
      retrievalMethod: 'semantic',
    }));
  }

  async searchKeyword(sessionId: string, queryText: string, topK = 10, version?: string): Promise<SearchResult[]> {
    const query = `
      SELECT id, session_id, page_id, url, page_title, heading, heading_hierarchy,
             content_type, content, token_count, chunk_index, doc_version, created_at,
             ts_rank_cd(search_vector, plainto_tsquery('english', $1)) as rank
      FROM doc_chunks
      WHERE session_id = $2
        ${version ? 'AND (doc_version = $4 OR doc_version IS NULL)' : ''}
        AND search_vector @@ plainto_tsquery('english', $1)
      ORDER BY rank DESC
      LIMIT $3;
    `;
    const params = version ? [queryText, sessionId, topK, version] : [queryText, sessionId, topK];
    const res = await this.pool.query(query, params);
    return res.rows.map((r, idx) => ({
      chunk: {
        id: r.id,
        sessionId: r.session_id,
        pageId: r.page_id,
        url: r.url,
        pageTitle: r.page_title,
        heading: r.heading,
        headingHierarchy: r.heading_hierarchy || [],
        contentType: r.content_type,
        content: r.content,
        tokenCount: r.token_count,
        chunkIndex: r.chunk_index,
        docVersion: r.doc_version,
        createdAt: r.created_at.toISOString(),
      },
      score: Number(r.rank),
      keywordRank: idx + 1,
      retrievalMethod: 'keyword',
    }));
  }

  async saveMessage(input: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<ChatMessage> {
    const query = `
      INSERT INTO research_messages (session_id, role, content, citations, sources_used, retrieval_meta)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const res = await this.pool.query(query, [
      input.sessionId,
      input.role,
      input.content,
      JSON.stringify(input.citations),
      JSON.stringify(input.sourcesUsed),
      JSON.stringify(input.retrievalMeta || {}),
    ]);
    const r = res.rows[0];
    return {
      id: r.id,
      sessionId: r.session_id,
      role: r.role,
      content: r.content,
      citations: r.citations || [],
      sourcesUsed: r.sources_used || [],
      retrievalMeta: r.retrieval_meta,
      createdAt: r.created_at.toISOString(),
    };
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const res = await this.pool.query('SELECT * FROM research_messages WHERE session_id = $1 ORDER BY created_at ASC', [sessionId]);
    return res.rows.map(r => ({
      id: r.id,
      sessionId: r.session_id,
      role: r.role,
      content: r.content,
      citations: r.citations || [],
      sourcesUsed: r.sources_used || [],
      retrievalMeta: r.retrieval_meta,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async saveEvaluation(test: EvaluationTestCase): Promise<EvaluationTestCase> {
    const query = `
      INSERT INTO evaluation_tests (id, session_id, test_type, question, data)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        data = EXCLUDED.data,
        test_type = EXCLUDED.test_type,
        question = EXCLUDED.question
      RETURNING *;
    `;
    await this.pool.query(query, [
      test.id,
      test.sessionId,
      test.type,
      test.question,
      JSON.stringify(test),
    ]);
    return test;
  }

  async getEvaluations(sessionId: string): Promise<EvaluationTestCase[]> {
    const res = await this.pool.query(
      'SELECT data FROM evaluation_tests WHERE session_id = $1 ORDER BY created_at ASC',
      [sessionId]
    );
    return res.rows.map(r => r.data as EvaluationTestCase);
  }

  async getEvaluation(id: string): Promise<EvaluationTestCase | null> {
    const res = await this.pool.query('SELECT data FROM evaluation_tests WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    return res.rows[0].data as EvaluationTestCase;
  }

  async deleteEvaluation(id: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM evaluation_tests WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async clearEvaluations(sessionId: string): Promise<number> {
    const res = await this.pool.query('DELETE FROM evaluation_tests WHERE session_id = $1', [sessionId]);
    return res.rowCount ?? 0;
  }

  async cleanupExpired(): Promise<number> {
    await this.pool.query(`
      DELETE FROM evaluation_tests WHERE session_id NOT IN (SELECT id::text FROM research_sessions);
    `).catch(() => {});
    const res = await this.pool.query('DELETE FROM research_sessions WHERE expires_at < NOW()');
    return res.rowCount ?? 0;
  }
}

// -------------------------------------------------------------
// Database URL Sanitizer (handles passwords with unescaped characters & documentation brackets)
// -------------------------------------------------------------
export function sanitizeDatabaseUrl(rawUrl?: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return null;

  // Regex to extract postgresql://user:pass@host:port/database?params
  const match = trimmed.match(/^(postgres(?:ql)?:\/\/)([^:@\s]+):(.*)@([^/?#\s]+(?::\d+)?)(.*)$/);
  if (match) {
    const [, proto, user, rawPass, hostPort, rest] = match;
    let pass = rawPass;
    // Strip outer documentation brackets if user pasted [my_password]
    if (pass.startsWith('[') && pass.endsWith(']')) {
      pass = pass.slice(1, -1);
    }
    try {
      pass = decodeURIComponent(pass);
    } catch {
      // ignore
    }
    return `${proto}${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${hostPort}${rest}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:') {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------
// Storage Factory / Singleton
// -------------------------------------------------------------
let storeInstance: DatabaseAdapter | null = null;

export async function getDatabase(): Promise<DatabaseAdapter> {
  if (storeInstance) return storeInstance;

  const rawDbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const sanitizedUrl = sanitizeDatabaseUrl(rawDbUrl);
  if (sanitizedUrl) {
    try {
      const pgStore = new PostgresStore(sanitizedUrl);
      await pgStore.init();
      console.log('✅ Connected to PostgreSQL / Supabase with pgvector storage adapter');
      storeInstance = pgStore;
      return storeInstance;
    } catch (err: any) {
      console.info('ℹ️ PostgreSQL / Supabase connection notice, using embedded pgvector-compatible hybrid engine:', err?.message || err);
    }
  }

  console.log('⚡ Initialized DocuMind embedded pgvector-compatible hybrid vector store');
  storeInstance = new InMemoryStore();
  return storeInstance;
}

