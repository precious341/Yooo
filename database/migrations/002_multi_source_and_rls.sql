-- Migration 002: Multi-Source Support, Source Domain Tracking, and Supabase Row Level Security (RLS)
-- DocuMind AI

-- 1. Extend research_sessions table with sources JSONB array and user ownership
ALTER TABLE research_sessions ADD COLUMN IF NOT EXISTS sources JSONB DEFAULT '[]'::jsonb;
ALTER TABLE research_sessions ADD COLUMN IF NOT EXISTS user_id UUID;

-- 2. Extend doc_pages table with source_domain column
ALTER TABLE doc_pages ADD COLUMN IF NOT EXISTS source_domain TEXT;
CREATE INDEX IF NOT EXISTS idx_doc_pages_domain ON doc_pages(source_domain);

-- 3. Extend doc_chunks table with source_domain column
ALTER TABLE doc_chunks ADD COLUMN IF NOT EXISTS source_domain TEXT;
CREATE INDEX IF NOT EXISTS idx_doc_chunks_domain ON doc_chunks(source_domain);

-- 4. Enable Supabase Row Level Security (RLS)
ALTER TABLE research_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_messages ENABLE ROW LEVEL SECURITY;

-- 5. Define RLS Policies
-- Allow access for public/anon sessions or user-owned sessions
DROP POLICY IF EXISTS "Public access to active research sessions" ON research_sessions;
CREATE POLICY "Public access to active research sessions"
ON research_sessions
FOR ALL
USING (
    user_id IS NULL OR user_id = auth.uid()
)
WITH CHECK (
    user_id IS NULL OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "Public access to session doc pages" ON doc_pages;
CREATE POLICY "Public access to session doc pages"
ON doc_pages
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM research_sessions s
        WHERE s.id = doc_pages.session_id
        AND (s.user_id IS NULL OR s.user_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Public access to session doc chunks" ON doc_chunks;
CREATE POLICY "Public access to session doc chunks"
ON doc_chunks
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM research_sessions s
        WHERE s.id = doc_chunks.session_id
        AND (s.user_id IS NULL OR s.user_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "Public access to session messages" ON research_messages;
CREATE POLICY "Public access to session messages"
ON research_messages
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM research_sessions s
        WHERE s.id = research_messages.session_id
        AND (s.user_id IS NULL OR s.user_id = auth.uid())
    )
);

-- 6. Helper function for automated temporary index cleanup (idempotent)
CREATE OR REPLACE FUNCTION cleanup_expired_research_sessions()
RETURNS INT AS $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM research_sessions
    WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
