-- Migration 003: Evaluation Benchmarks and Safe Cascading Deletion
-- DocuMind AI

-- 1. Ensure evaluation_tests table exists
CREATE TABLE IF NOT EXISTS evaluation_tests (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    test_type TEXT NOT NULL,
    question TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index for session-scoped evaluation queries
CREATE INDEX IF NOT EXISTS idx_evaluation_tests_session ON evaluation_tests(session_id);

-- 3. Enable RLS on evaluation_tests
ALTER TABLE evaluation_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow access to session evaluations" ON evaluation_tests;
CREATE POLICY "Allow access to session evaluations"
ON evaluation_tests FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM research_sessions s
        WHERE s.id::text = evaluation_tests.session_id
        AND (s.user_id IS NULL OR s.user_id = auth.uid())
    )
);

-- 4. Stored Procedure for atomic, verified session deletion with cascading cleanup
CREATE OR REPLACE FUNCTION delete_research_session_cascade(target_session_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    deleted_count INT;
BEGIN
    -- Delete all session-scoped records in relationship order
    DELETE FROM evaluation_tests WHERE session_id = target_session_id::text;
    DELETE FROM research_messages WHERE session_id = target_session_id;
    DELETE FROM doc_chunks WHERE session_id = target_session_id;
    DELETE FROM doc_pages WHERE session_id = target_session_id;
    DELETE FROM research_sessions WHERE id = target_session_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
