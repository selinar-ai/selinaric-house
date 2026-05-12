-- Phase 33G — Add source_type to search_log for Library vs Web search distinction
--
-- Library = open-book exam.
-- Archives = lived continuity.
-- RAG = Ari/Eli using the open book during conversation.
-- Memory = still only Archives.

-- Add source_type column — defaults to 'web' for existing entries
alter table search_log
  add column if not exists source_type text not null default 'web'
  check (source_type in ('web', 'library'));

-- Add library-specific metadata column for structured Library search results
alter table search_log
  add column if not exists library_results jsonb;

-- Add used_in_response flag — tracks whether retrieved context was injected into chat
alter table search_log
  add column if not exists used_in_response boolean not null default false;

-- Index for source_type filtering
create index if not exists search_log_source_type_idx
  on search_log (source_type, presence_id, created_at desc);
