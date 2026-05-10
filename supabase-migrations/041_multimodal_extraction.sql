-- Phase 33E — Multimodal Library Extraction v1
-- Extraction is not Memory. OCR is not Memory. Transcript is not Memory.
-- Searchable media text is not RAG. Library media content is Library material only.

-- A. Expand file_type to include audio/video
alter table library_item_files
  drop constraint library_item_files_file_type_check;

alter table library_item_files
  add constraint library_item_files_file_type_check
  check (file_type in ('docx', 'pdf', 'image', 'markdown', 'audio', 'video', 'other'));

-- B. Expand extraction_status to include 'queued'
alter table library_item_files
  drop constraint library_item_files_extraction_status_check;

alter table library_item_files
  add constraint library_item_files_extraction_status_check
  check (extraction_status in (
    'not_started', 'queued', 'processing', 'extracted', 'empty', 'failed', 'unsupported'
  ));

-- C. Add extraction metadata columns
alter table library_item_files
  add column if not exists extraction_method text,
  add column if not exists extraction_confidence numeric,
  add column if not exists extraction_language text,
  add column if not exists media_duration_seconds numeric,
  add column if not exists extraction_metadata jsonb not null default '{}';

-- D. Extraction jobs table
create table if not exists library_extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references library_item_files(id) on delete cascade,
  library_item_id uuid not null references library_items(id) on delete cascade,
  job_type text not null check (job_type in (
    'image_ocr',
    'audio_transcript',
    'video_audio_transcript'
  )),
  status text not null default 'queued' check (status in (
    'queued',
    'processing',
    'completed',
    'failed',
    'cancelled'
  )),
  requested_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  result_char_count integer,
  result_truncated boolean not null default false,
  worker_id text,
  metadata jsonb not null default '{}'
);

create index if not exists library_extraction_jobs_file_idx
  on library_extraction_jobs (file_id, requested_at desc);

create index if not exists library_extraction_jobs_status_idx
  on library_extraction_jobs (status, requested_at);

alter table library_extraction_jobs enable row level security;

create policy "Allow all access to library_extraction_jobs"
  on library_extraction_jobs for all using (true) with check (true);
