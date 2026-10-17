-- Migration 004: Page Category Column and Foreign Key Integrity Verification
-- DocuMind AI

-- 1. Ensure doc_pages has category and source_domain columns
ALTER TABLE doc_pages ADD COLUMN IF NOT EXISTS source_domain TEXT;
ALTER TABLE doc_pages ADD COLUMN IF NOT EXISTS category TEXT;
CREATE INDEX IF NOT EXISTS idx_doc_pages_category ON doc_pages(category);

-- 2. Verify foreign key constraint on doc_chunks.page_id referencing doc_pages.id
-- If doc_chunks_page_id_fkey is somehow missing or not CASCADE, ensure it is configured properly
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'doc_chunks_page_id_fkey'
    ) THEN
        ALTER TABLE doc_chunks
        ADD CONSTRAINT doc_chunks_page_id_fkey
        FOREIGN KEY (page_id) REFERENCES doc_pages(id) ON DELETE CASCADE;
    END IF;
END $$;
