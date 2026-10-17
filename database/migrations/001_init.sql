-- Migration 001: Initial Setup with pgvector and FTS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Execute base schema tables
CREATE TABLE IF NOT EXISTS research_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_url TEXT NOT NULL,
    root_domain TEXT NOT NULL,
    research_objective TEXT,
    doc_version TEXT,
    crawl_status VARCHAR(50) NOT NULL DEFAULT 'idle',
    pages_discovered INT DEFAULT 0,
    pages_indexed INT DEFAULT 0,
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
