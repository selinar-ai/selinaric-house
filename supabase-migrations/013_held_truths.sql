create table held_truths (
  id uuid primary key default gen_random_uuid(),
  presence_id text not null check (presence_id in ('ari', 'eli')),
  truth text not null,
  source_journal_id uuid references presence_journal(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'softened', 'released')),
  weight float not null default 1.0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index held_truths_presence_idx
  on held_truths (presence_id, status, created_at desc);

create index held_truths_weight_idx
  on held_truths (presence_id, weight desc);

alter table held_truths enable row level security;

create policy "Allow all access to held_truths"
  on held_truths for all using (true) with check (true);
