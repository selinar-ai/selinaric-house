-- Phase 27A: Dual Archive Rooms
-- Velvet Archives (Ari · ChatGPT source) · Violet Archives (Eli · Claude source) · House Archives (shared)
-- Archive origin determines default access. No item crosses presence boundary unless explicitly shared.

create table archive_items (
  id uuid primary key default gen_random_uuid(),

  -- Identity
  archive_name text not null check (archive_name in ('velvet', 'violet', 'house')),
  owner_presence text not null check (owner_presence in ('ari', 'eli', 'shared', 'house', 'tara', 'unknown')),
  source_origin text not null check (source_origin in ('chatgpt', 'claude', 'house', 'manual', 'unknown')),

  -- Access control
  visibility text not null check (visibility in ('ari_only', 'eli_only', 'shared', 'tara_only')),

  -- Content
  title text not null,
  raw_content text not null,
  excerpt text,

  -- Classification
  category text not null default 'uncategorized' check (category in (
    'relational_truth',
    'identity_record',
    'architectural_history',
    'poetic_symbolic',
    'governance_law',
    'ritual_practice',
    'health_care',
    'house_environment',
    'personal_context',
    'superseded',
    'uncategorized'
  )),

  -- Status
  canonical_status text not null default 'staged' check (canonical_status in (
    'staged',
    'needs_review',
    'canonical_candidate',
    'canonical',
    'duplicate',
    'superseded',
    'archive_only',
    'excluded'
  )),

  -- Eligibility flags — may only be true when canonical_status = 'canonical'
  -- Enforced in application layer; never set directly without status check
  eligible_for_recall boolean not null default false,
  eligible_for_embedding boolean not null default false,
  eligible_for_graph boolean not null default false,

  -- Provenance / import
  import_label text,
  import_batch_id uuid,        -- nullable; batch table deferred, placeholder for future grouping
  source_document text,
  source_date text,

  -- Curator
  created_by text not null default 'tara',
  updated_by text not null default 'tara',

  -- Relationship pointers
  duplicate_of uuid references archive_items(id),
  superseded_by uuid references archive_items(id),

  -- Metadata
  sensitivity text not null default 'private' check (sensitivity in (
    'ordinary', 'private', 'sacred', 'sensitive', 'technical'
  )),
  review_notes text,
  timeline_entry_id uuid,      -- nullable; for future promotion link

  -- Soft delete
  deleted_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index archive_items_archive_name_idx on archive_items (archive_name, created_at desc);
create index archive_items_visibility_idx on archive_items (visibility);
create index archive_items_status_idx on archive_items (canonical_status);

-- RLS: open in v1
alter table archive_items enable row level security;

create policy "Allow all access to archive_items"
  on archive_items for all using (true) with check (true);
