-- Phase 33B — House Library v1
-- Reading is not remembering. Retrieval is not Memory.

create table library_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  collection text not null check (collection in (
    'development_documentation',
    'books',
    'articles',
    'transcripts',
    'images',
    'research',
    'archive_references'
  )),
  item_type text not null check (item_type in (
    'design_brief',
    'markdown_file',
    'validation_record',
    'architecture_law',
    'ui_polish_request',
    'technical_note',
    'thread_handoff',
    'superseded_archive',
    'guide',
    'book',
    'article',
    'transcript',
    'image',
    'research_note',
    'reference',
    'other'
  )),
  phase_label text,
  phase_code  text,
  phase_number numeric,
  authority_status text not null default 'library_reference' check (authority_status in (
    'library_reference',
    'technical_reference',
    'validation_record',
    'thread_handoff',
    'ui_request',
    'architecture_law',
    'archive_only',
    'canonical_candidate',
    'canonical_memory',
    'superseded'
  )),
  presence_scope text not null default 'house' check (presence_scope in (
    'ari',
    'eli',
    'shared',
    'house',
    'none'
  )),
  source_url          text,
  file_path           text,
  content_text        text,
  external_doc_id     text,
  tags                text[] default '{}',
  archive_item_id uuid,
  derived_canonical_status text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint library_items_derived_canonical_status_check
    check (
      derived_canonical_status is null
      or derived_canonical_status = 'canonical'
    ),

  constraint library_items_one_crown_check
    check (
      authority_status != 'canonical_memory'
      or (
        archive_item_id is not null
        and derived_canonical_status = 'canonical'
      )
    )
);

create index library_items_collection_idx
  on library_items (collection, created_at desc);

create index library_items_phase_idx
  on library_items (phase_code, phase_number, item_type);

create index library_items_authority_idx
  on library_items (authority_status);

alter table library_items enable row level security;

create policy "Allow all access to library_items"
  on library_items for all
  using (true)
  with check (true);
