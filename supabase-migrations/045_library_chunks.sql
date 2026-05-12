-- Phase 33I — Library Embeddings / Semantic Index v1
-- Embeddings retrieve. Embeddings do not remember. Embeddings do not decide truth.
-- Library chunks are semantic retrieval substrate only.
-- No Memory writes. No Archive writes. No canonical_status changes.

create extension if not exists vector;

create table if not exists library_chunks (
  id uuid primary key default gen_random_uuid(),

  library_item_id uuid not null references library_items(id) on delete cascade,

  chunk_index integer not null,
  chunk_text text not null,
  chunk_hash text not null,

  source_field text not null,
  source_label text,
  collection text,
  item_type text,
  authority_status text,
  effective_authority text,
  presence_scope text,
  phase_code text,
  phase_label text,

  embedding vector(384),
  embedding_model text not null default 'gte-small',
  embedding_provider text not null default 'supabase_gte_small',
  embedding_dim integer not null default 384,

  char_count integer,
  token_estimate integer,

  indexed_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (library_item_id, chunk_hash)
);

create index if not exists library_chunks_item_idx
  on library_chunks (library_item_id);

create index if not exists library_chunks_collection_idx
  on library_chunks (collection);

create index if not exists library_chunks_authority_idx
  on library_chunks (effective_authority);

create index if not exists library_chunks_presence_scope_idx
  on library_chunks (presence_scope);

create index if not exists library_chunks_embedding_idx
  on library_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 10);

alter table library_chunks enable row level security;

create policy "Allow all access to library_chunks"
  on library_chunks for all using (true) with check (true);

-- Semantic search RPC
create or replace function match_library_chunks(
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
returns table (
  chunk_id uuid,
  library_item_id uuid,
  chunk_text text,
  similarity float,
  source_field text,
  collection text,
  item_type text,
  authority_status text,
  effective_authority text,
  presence_scope text,
  phase_code text,
  phase_label text
)
language sql stable
as $$
  select
    lc.id as chunk_id,
    lc.library_item_id,
    lc.chunk_text,
    1 - (lc.embedding <=> query_embedding) as similarity,
    lc.source_field,
    lc.collection,
    lc.item_type,
    lc.authority_status,
    lc.effective_authority,
    lc.presence_scope,
    lc.phase_code,
    lc.phase_label
  from library_chunks lc
  where lc.embedding is not null
    and 1 - (lc.embedding <=> query_embedding) >= match_threshold
  order by lc.embedding <=> query_embedding
  limit match_count;
$$;
