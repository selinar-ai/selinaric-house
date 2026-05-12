-- Phase 33I fix — Add title to match_library_chunks RPC
-- Join library_items for title and coalesce phase_code/phase_label from parent item.

create or replace function match_library_chunks(
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
returns table (
  chunk_id uuid,
  library_item_id uuid,
  title text,
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
    li.title,
    lc.chunk_text,
    1 - (lc.embedding <=> query_embedding) as similarity,
    lc.source_field,
    lc.collection,
    lc.item_type,
    lc.authority_status,
    lc.effective_authority,
    lc.presence_scope,
    coalesce(lc.phase_code, li.phase_code) as phase_code,
    coalesce(lc.phase_label, li.phase_label) as phase_label
  from library_chunks lc
  join library_items li on li.id = lc.library_item_id
  where lc.embedding is not null
    and 1 - (lc.embedding <=> query_embedding) >= match_threshold
  order by lc.embedding <=> query_embedding
  limit match_count;
$$;
