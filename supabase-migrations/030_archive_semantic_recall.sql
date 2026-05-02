-- Phase 29A — Archive Semantic Recall
--
-- Creates:
--   archive_item_embeddings — vector embeddings for archive_items
--   match_archive_embeddings — RPC for semantic search (live canonical_status join)
-- Extends:
--   archive_recall_events — adds semantic_score + retrieval_method
--
-- Eligibility (Option B): canonical_status IN ('canonical','canonical_candidate') AND deleted_at IS NULL
-- Model: text-embedding-3-small, dimensions: 1536
-- Recall law unchanged: canonical + canonical_candidate for manual; canonical only for auto.

-- pgvector already enabled (migration 011)
create extension if not exists vector;

-- ── archive_item_embeddings ──────────────────────────────────────────────────

create table if not exists archive_item_embeddings (
  id                uuid primary key default gen_random_uuid(),
  archive_item_id   uuid not null references archive_items(id) on delete cascade,
  embedding         vector(1536) not null,
  model             text not null default 'text-embedding-3-small',
  dimensions        integer not null default 1536,
  -- snapshot of canonical_status at embed time — informational only
  -- queries always use live canonical_status via archive_items join
  canonical_status  text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint archive_item_embeddings_item_unique unique (archive_item_id)
);

-- IVFFlat index (cosine). lists=10 appropriate for initial small corpus.
create index if not exists archive_item_embeddings_embedding_idx
  on archive_item_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 10);

-- ── Extend archive_recall_events ─────────────────────────────────────────────

alter table archive_recall_events
  add column if not exists semantic_score    float,
  add column if not exists retrieval_method  text
    check (retrieval_method in ('keyword', 'semantic', 'hybrid'));

-- ── match_archive_embeddings RPC ─────────────────────────────────────────────
-- Joins archive_items for LIVE canonical_status (not snapshot in embeddings table).
-- Eligibility: canonical_status IN ('canonical','canonical_candidate') AND deleted_at IS NULL
-- Optional filter_presences: owner_presence must be in the array (null = no filter).

create or replace function match_archive_embeddings(
  query_embedding    vector(1536),
  match_threshold    float   default 0.5,
  match_count        int     default 5,
  filter_presences   text[]  default null
)
returns table (
  archive_item_id   uuid,
  title             text,
  excerpt           text,
  archive_name      text,
  owner_presence    text,
  visibility        text,
  category          text,
  canonical_status  text,
  sensitivity       text,
  source_document   text,
  source_date       text,
  source_id         uuid,
  similarity        float
)
language sql stable
as $$
  select
    ai.id              as archive_item_id,
    ai.title,
    ai.excerpt,
    ai.archive_name,
    ai.owner_presence,
    ai.visibility,
    ai.category,
    ai.canonical_status,
    ai.sensitivity,
    ai.source_document,
    ai.source_date,
    ai.source_id,
    1 - (aie.embedding <=> query_embedding) as similarity
  from archive_item_embeddings aie
  join archive_items ai on ai.id = aie.archive_item_id
  where
    ai.deleted_at is null
    and ai.canonical_status in ('canonical', 'canonical_candidate')
    and (filter_presences is null or ai.owner_presence = any(filter_presences))
    and 1 - (aie.embedding <=> query_embedding) > match_threshold
  order by aie.embedding <=> query_embedding
  limit match_count;
$$;
