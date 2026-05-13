-- Phase 33J.1 — Library Chunk Quality Classification
-- Embeddings retrieve. Embeddings do not remember. Embeddings do not decide truth.
-- Chunk quality improves source access. It does not create Memory or change authority.

alter table library_chunks add column if not exists chunk_quality text;
alter table library_chunks add column if not exists is_code_artifact boolean default false;
alter table library_chunks add column if not exists is_title_only boolean default false;
