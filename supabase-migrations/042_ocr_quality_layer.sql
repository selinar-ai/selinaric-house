-- Phase 33E.1 — OCR Quality Layer
-- Cleaned OCR is not Memory. OCR quality classification is Library material only.
-- No RAG. No embeddings. No vector search.

-- A. Add OCR quality classification + cleaned text columns
alter table library_item_files
  add column if not exists ocr_quality text
    check (ocr_quality in ('clean', 'partial', 'noisy', 'failed')),
  add column if not exists needs_review boolean not null default false,
  add column if not exists cleaned_extracted_text text;

-- B. Index for searching cleaned text
create index if not exists library_item_files_cleaned_text_search_idx
  on library_item_files using gin (cleaned_extracted_text gin_trgm_ops);
