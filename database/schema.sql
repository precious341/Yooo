-- DocuMind AI Database Schema
-- Supports PostgreSQL 15+ / Supabase with pgvector extension and Full-Text Search

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Sessions Table: Stores temporary research sessions
CREATE TABLE IF NOT EXISTS research_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    target_url TEXT NOT NULL,
    root_domain TEXT NOT NULL,
    research_objective TEXT,
    doc_version TEXT,
    crawl_status VARCHAR(50) NOT NULL DEFAULT 'idle', -- 'idle', 'crawling', 'indexing', 'completed', 'failed'
    pages_discovered INT DEFAULT 0,
    pages_indexed INT DEFAULT 0,
    sources JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Documentation Pages Table: Discovered and crawled pages
CREATE TABLE IF NOT EXISTS doc_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    canonical_url TEXT,
    title TEXT NOT NULL,
    source_domain TEXT,
    category TEXT,
    parent_url TEXT,
    depth INT DEFAULT 0,
    doc_version TEXT,
    content_hash VARCHAR(64) NOT NULL,
    headings JSONB DEFAULT '[]'::jsonb,
    breadcrumbs JSONB DEFAULT '[]'::jsonb,
    links JSONB DEFAULT '[]'::jsonb,
    raw_markdown TEXT,
    word_count INT DEFAULT 0,
    crawl_status VARCHAR(50) NOT NULL DEFAULT 'discovered', -- 'discovered', 'crawled', 'indexed', 'failed'
    error_message TEXT,
    crawled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_session_page_url UNIQUE (session_id, url)
);

-- Document Chunks Table: Text chunks with pgvector embeddings and full-text search
CREATE TABLE IF NOT EXISTS doc_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
    page_id UUID NOT NULL REFERENCES doc_pages(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    source_domain TEXT,
    page_title TEXT NOT NULL,
    heading TEXT,
    heading_hierarchy JSONB DEFAULT '[]'::jsonb,
    content_type VARCHAR(50) DEFAULT 'section', -- 'heading', 'text', 'code', 'table', 'api_spec'
    content TEXT NOT NULL,
    token_count INT DEFAULT 0,
    chunk_index INT NOT NULL,
    doc_version TEXT,
    -- 768-dimensional vector for gemini-embedding-2-preview / text-embedding-004
    embedding vector(768),
    -- tsvector for PostgreSQL full-text keyword retrieval
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(page_title, '') || ' ' || coalesce(heading, '') || ' ' || coalesce(content, ''))
    ) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for ultra-fast hybrid retrieval
CREATE INDEX IF NOT EXISTS idx_research_sessions_expires ON research_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_doc_pages_session_url ON doc_pages(session_id, url);
CREATE INDEX IF NOT EXISTS idx_doc_pages_domain ON doc_pages(source_domain);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_session ON doc_chunks(session_id);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_domain ON doc_chunks(source_domain);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_search_vector ON doc_chunks USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_embedding ON doc_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Chat Messages Table: Research queries and evidence-grounded answers
CREATE TABLE IF NOT EXISTS research_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL, -- 'user', 'assistant'
    content TEXT NOT NULL,
    citations JSONB DEFAULT '[]'::jsonb,
    sources_used JSONB DEFAULT '[]'::jsonb,
    retrieval_meta JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security (RLS) for Supabase
ALTER TABLE research_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public/authenticated access to research sessions"
ON research_sessions FOR ALL
USING (user_id IS NULL OR user_id = auth.uid())
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Allow access to session pages"
ON doc_pages FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM research_sessions s
        WHERE s.id = doc_pages.session_id
        AND (s.user_id IS NULL OR s.user_id = auth.uid())
    )
);

CREATE POLICY "Allow access to session chunks"
ON doc_chunks FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM research_sessions s
        WHERE s.id = doc_chunks.session_id
        AND (s.user_id IS NULL OR s.user_id = auth.uid())
    )
);

CREATE POLICY "Allow access to session messages"
ON research_messages FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM research_sessions s
        WHERE s.id = research_messages.session_id
        AND (s.user_id IS NULL OR s.user_id = auth.uid())
    )
);
