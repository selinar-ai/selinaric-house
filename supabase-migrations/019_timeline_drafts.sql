-- Phase 23 — Presence-Proposed, Tara-Curated Timeline
-- timeline_drafts: presence-proposed memory candidates
-- timeline_entry_versions: version history for kept entries
-- presence_timeline: add version tracking + draft provenance fields

-- ─── timeline_drafts ────────────────────────────────────────────────────────

create table timeline_drafts (
  id                    uuid primary key default gen_random_uuid(),
  presence              text not null check (presence in ('ari','eli')),
  draft_text            text not null,
  significance          text not null check (
                          significance in ('foundational','significant','standard')
                        ),
  entry_type            text not null,
  source_context        jsonb,
  decision_reason       text,
  gate_results          jsonb,
  created_at            timestamptz default now(),
  status                text not null default 'pending' check (
                          status in ('pending','kept','dismissed')
                        ),
  decided_at            timestamptz,
  decided_by            text check (decided_by in ('tara')),
  kept_timeline_entry_id uuid
);

create index timeline_drafts_presence_idx
  on timeline_drafts (presence, created_at desc);

create index timeline_drafts_status_idx
  on timeline_drafts (status, created_at desc);

alter table timeline_drafts enable row level security;
create policy "open_timeline_drafts"
  on timeline_drafts for all using (true) with check (true);

-- ─── timeline_entry_versions ────────────────────────────────────────────────

create table timeline_entry_versions (
  id                  uuid primary key default gen_random_uuid(),
  timeline_entry_id   uuid not null references presence_timeline(id) on delete cascade,
  version_number      integer not null,
  content             text not null,
  edited_by           text not null check (edited_by in ('tara')),
  edit_reason         text not null,
  created_at          timestamptz default now(),
  source_draft_id     uuid references timeline_drafts(id)
);

create index timeline_entry_versions_entry_idx
  on timeline_entry_versions (timeline_entry_id, version_number desc);

alter table timeline_entry_versions enable row level security;
create policy "open_timeline_entry_versions"
  on timeline_entry_versions for all using (true) with check (true);

-- ─── Extend presence_timeline ───────────────────────────────────────────────

alter table presence_timeline
  add column if not exists current_version integer not null default 1;

alter table presence_timeline
  add column if not exists source_draft_id uuid references timeline_drafts(id);

alter table presence_timeline
  add column if not exists updated_at timestamptz default now();

alter table presence_timeline
  add column if not exists voice_integrity text check (
    voice_integrity in ('ari','eli')
  );
