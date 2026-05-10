-- Phase 33D — Document Text Extraction fields
-- Extraction is not Memory. Searchable text is not RAG.
-- Extracted attachment text is Library material only.

alter table library_item_files
  add column if not exists extraction_status text not null default 'not_started'
    check (extraction_status in (
      'not_started',
      'processing',
      'extracted',
      'empty',
      'failed',
      'unsupported'
    )),
  add column if not exists extracted_text text,
  add column if not exists extracted_at timestamptz,
  add column if not exists extraction_error text,
  add column if not exists extraction_char_count integer,
  add column if not exists extraction_truncated boolean not null default false;

create index if not exists library_item_files_extraction_status_idx
  on library_item_files (extraction_status);

create index if not exists library_item_files_library_item_extraction_idx
  on library_item_files (library_item_id, extraction_status);
