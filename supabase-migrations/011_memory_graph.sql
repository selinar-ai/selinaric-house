-- Enable pgvector extension (must already be enabled in Supabase project settings,
-- but this is a no-op if already active)
create extension if not exists vector;

-- Memory nodes
create table memory_nodes (
  id uuid primary key default gen_random_uuid(),
  presence_id text not null check (presence_id in ('ari', 'eli')),
  room_slug text not null,
  source_type text not null,
  source_id uuid,
  title text not null,
  summary text not null,
  embedding vector(1536),
  salience float default 1.0,
  status text not null default 'active' check (status in ('active', 'dormant', 'resolved')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index memory_nodes_presence_idx
  on memory_nodes (presence_id, created_at desc);

create index memory_nodes_embedding_idx
  on memory_nodes using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Memory edges
create table memory_edges (
  id uuid primary key default gen_random_uuid(),
  from_node_id uuid not null references memory_nodes(id) on delete cascade,
  to_node_id uuid not null references memory_nodes(id) on delete cascade,
  edge_type text not null check (edge_type in ('recurs', 'continues', 'relates_to', 'contrasts_with', 'drifts_from')),
  strength float not null default 0.5,
  created_at timestamptz default now()
);

create index memory_edges_from_idx on memory_edges (from_node_id);
create index memory_edges_to_idx on memory_edges (to_node_id);

-- RLS
alter table memory_nodes enable row level security;
alter table memory_edges enable row level security;

create policy "Allow all access to memory_nodes"
  on memory_nodes for all using (true) with check (true);

create policy "Allow all access to memory_edges"
  on memory_edges for all using (true) with check (true);

-- Vector similarity search function
create or replace function match_memory_nodes(
  query_embedding vector(1536),
  presence_filter text default null,
  match_threshold float default 0.70,
  match_count int default 10
)
returns table(
  id uuid,
  presence_id text,
  room_slug text,
  source_type text,
  source_id uuid,
  title text,
  summary text,
  salience float,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    id, presence_id, room_slug, source_type, source_id,
    title, summary, salience, status, created_at, updated_at,
    1 - (embedding <=> query_embedding) as similarity
  from memory_nodes
  where status = 'active'
    and embedding is not null
    and (presence_filter is null or presence_id = presence_filter)
    and (1 - (embedding <=> query_embedding)) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
