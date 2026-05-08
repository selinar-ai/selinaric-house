-- Phase 33C — Library File Attachments v1
-- Uploading a file is not remembering.
-- Attachments are Library material only.
-- File attachment must not alter canonical Memory authority.

create table library_item_files (
  id uuid primary key default gen_random_uuid(),
  library_item_id uuid not null references library_items(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text not null check (file_type in (
    'docx',
    'pdf',
    'image',
    'other'
  )),
  mime_type text,
  file_size_bytes bigint,
  storage_bucket text not null default 'library-files',
  created_at timestamptz default now()
);

create index library_item_files_item_idx
  on library_item_files (library_item_id, created_at desc);

alter table library_item_files enable row level security;

create policy "Allow all access to library_item_files"
  on library_item_files for all
  using (true)
  with check (true);
