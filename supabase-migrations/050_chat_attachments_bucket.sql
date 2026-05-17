-- Phase 34A: Create private chat-attachments bucket for temporary staging.
-- Chat attachments are NOT Library, NOT Memory, NOT Archive.
-- Files are staged temporarily for text extraction, then deleted server-side.
-- No public access. No persistent storage expected.
--
-- Security model:
--   • Client (anon/authenticated) may only INSERT into tmp/ prefix.
--   • Client may NOT read or delete — the extraction API route handles
--     download + delete using SUPABASE_SERVICE_ROLE_KEY.
--   • Bucket-level file_size_limit (30 MB) and allowed_mime_types enforced.

-- ── 1. Create bucket with size + MIME constraints ─────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  31457280,  -- 30 MB
  ARRAY[
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public            = false,
  file_size_limit   = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. Drop any over-broad legacy policies (idempotent) ──────────────
DROP POLICY IF EXISTS "chat_attachments_upload" ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_read"   ON storage.objects;
DROP POLICY IF EXISTS "chat_attachments_delete"  ON storage.objects;

-- ── 3. Upload-only policy, constrained to tmp/ prefix ────────────────
CREATE POLICY "chat_attachments_upload"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND name LIKE 'tmp/%'
);

-- No SELECT or DELETE policies for anon/authenticated.
-- The extraction route uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
