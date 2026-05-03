-- Phase 29A — Provider switch: gte-small (Supabase Edge Function)
--
-- Corrects migration 030 from OpenAI text-embedding-3-small (vector(1536))
-- to Supabase/gte-small (vector(384)).
--
-- Safe to run: archive_item_embeddings is empty — no embedding rows exist.
-- Confirms:
--   archive_item_embeddings.embedding → vector(384)
--   dimensions default                → 384
--   model default                     → 'gte-small'
--   match_archive_embeddings RPC      → accepts vector(384)
--   IVFFlat index                     → rebuilt over vector(384)
--
-- Phase 29A laws unchanged:
--   No canonical_status changes during embedding/backfill.
--   No archive_memory_events writes during embedding/backfill.
--   RAG retrieves. RAG does not decide.

-- ── 1. Drop index (tied to vector(1536)) ─────────────────────────────────────

drop index if exists archive_item_embeddings_embedding_idx;

-- ── 2. Alter column type + defaults ─────────────────────────────────────────
-- archive_item_embeddings is empty — no cast required.

alter table archive_item_embeddings
  alter column embedding  type vector(384),
  alter column dimensions set default 384,
  alter column model      set default 'gte-small';

-- ── 3. Drop old RPC (vector(1536) signature) ─────────────────────────────────

drop function if exists match_archive_embeddings(vector, float, int, text[]);

-- ── 4. Recreate RPC with vector(384) ─────────────────────────────────────────
-- Joins archive_items for LIVE canonical_status (not snapshot in embeddings table).
-- Eligibility: canonical_status IN ('canonical','canonical_candidate') AND deleted_at IS NULL
-- Optional filter_presences: owner_presence must be in the array (null = no filter).

create or replace function match_archive_embeddings(
  query_embedding    vector(384),
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

-- ── 5. Recreate IVFFlat index over vector(384) ────────────────────────────────

create index if not exists archive_item_embeddings_embedding_idx
  on archive_item_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 10);
