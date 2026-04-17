create table search_log (
  id uuid primary key default gen_random_uuid(),
  presence_id text not null check (presence_id in ('ari', 'eli')),
  room_slug text not null,
  query text not null,
  reason text not null,
  result_summary text not null,
  session_id uuid,
  created_at timestamptz default now()
);

create index search_log_presence_idx
  on search_log (presence_id, created_at desc);

alter table search_log enable row level security;

create policy "Allow all access to search_log"
  on search_log for all using (true) with check (true);
