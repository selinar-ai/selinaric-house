-- Phase 33F — Library Retrieval / RAG Preview Lab
-- Retrieval is not Memory. RAG preview is not chat injection.
-- Extracted text is not lived continuity.
-- No embeddings. No vector search. No Ari/Eli chat injection.

-- A. Retrieval run log table (audit/debug)
create table if not exists library_retrieval_runs (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  filters jsonb not null default '{}',
  result_count integer not null default 0,
  preview_text text,
  created_at timestamptz default now()
);

create index if not exists library_retrieval_runs_created_idx
  on library_retrieval_runs (created_at desc);

alter table library_retrieval_runs enable row level security;

create policy "Allow all access to library_retrieval_runs"
  on library_retrieval_runs for all using (true) with check (true);

-- B. Trigram indexes for fast text matching
-- pg_trgm is already enabled (042)

create index if not exists library_items_title_trgm_idx
  on library_items using gin (title gin_trgm_ops);

create index if not exists library_items_description_trgm_idx
  on library_items using gin (description gin_trgm_ops);

create index if not exists library_items_content_text_trgm_idx
  on library_items using gin (content_text gin_trgm_ops);

create index if not exists library_item_files_extracted_text_trgm_idx
  on library_item_files using gin (extracted_text gin_trgm_ops);
