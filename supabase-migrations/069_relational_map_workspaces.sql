-- Phase 37E — Relational Map Workspaces
--
-- Layout is not ontology.
-- Position is not relationship.
-- Distance is not strength.
-- Cluster is not truth.
-- Dragging does not mutate graph semantics.
--
-- This table stores visual layout metadata only.
-- It is not graph authority, Memory, Archive, or prompt truth.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. relational_map_workspaces table
-- ═══════════════════════════════════════════════════════════════════════════

create table relational_map_workspaces (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  description text,

  workspace_scope text not null check (
    workspace_scope in (
      'house_default',
      'ari_workspace',
      'eli_workspace',
      'tara_workspace',
      'shared_workspace'
    )
  ),

  is_default boolean not null default false,

  layout_version integer not null default 1,

  layout_data jsonb not null default '{"version":1,"nodes":{},"clusters":[]}'::jsonb,
  filter_preset jsonb not null default '{}'::jsonb,
  viewport jsonb default null,

  status text not null default 'active' check (
    status in ('active', 'archived')
  ),

  created_by text not null default 'tara',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Indexes
-- ═══════════════════════════════════════════════════════════════════════════

-- Primary lookup: workspaces by scope and status
create index relational_map_workspaces_scope_idx
  on relational_map_workspaces (workspace_scope, status, updated_at desc);

-- Enforce one default per workspace_scope (active only)
create unique index relational_map_workspaces_one_default_per_scope_idx
  on relational_map_workspaces (workspace_scope)
  where status = 'active' and is_default = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RPC: Atomic default-workspace switch
-- ═══════════════════════════════════════════════════════════════════════════

-- Ensures exactly one active default per workspace_scope in a single transaction.
-- Unsets any existing default before setting the new one.
create or replace function set_default_workspace(target_id uuid)
returns void
language plpgsql
as $$
declare
  target_scope text;
begin
  -- Look up the workspace's scope
  select workspace_scope into target_scope
  from relational_map_workspaces
  where id = target_id and status = 'active';

  if target_scope is null then
    raise exception 'Workspace not found or not active: %', target_id;
  end if;

  -- Unset any existing active default for this scope
  update relational_map_workspaces
  set is_default = false, updated_at = now()
  where workspace_scope = target_scope
    and status = 'active'
    and is_default = true
    and id != target_id;

  -- Set the target as default
  update relational_map_workspaces
  set is_default = true, updated_at = now()
  where id = target_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS (open in v1, matching House convention)
-- ═══════════════════════════════════════════════════════════════════════════

alter table relational_map_workspaces enable row level security;

create policy "relational_map_workspaces_select"
  on relational_map_workspaces for select
  using (true);

create policy "relational_map_workspaces_insert"
  on relational_map_workspaces for insert
  with check (true);

create policy "relational_map_workspaces_update"
  on relational_map_workspaces for update
  using (true)
  with check (true);

-- No DELETE policy — use status = 'archived' soft-delete pattern
