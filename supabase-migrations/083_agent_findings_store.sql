-- Phase 42.3.3a — Governance Kernel: durable findings store (agent_runs + agent_findings)
--
-- A durable operational record of the read-only packs' findings, plus a governed
-- ingest RPC and a test-only cleanup RPC. NOT Memory, NOT evidence, NOT authority,
-- NOT a graph proposal, NOT a helper output, NOT queued work. The kernel may inspect
-- and report; it may not act. There is NO apply/remedy/approval path here.
--
-- Posture mirrors 080_helper_apply_events: deny-by-default (RLS on, 0 policies,
-- revoke all, execute-only grants to service_role on SECURITY DEFINER functions).
-- Writes happen ONLY through the ingest/cleanup RPCs — no direct table DML grant.
--
-- Run via: Supabase Dashboard -> SQL Editor -> paste -> Run. Success = "No rows returned".
--
-- Rollback notes (manual, if ever needed):
--   drop function if exists public.agent_findings_cleanup_test_run(uuid);
--   drop function if exists public.agent_record_findings(jsonb, jsonb, boolean);
--   drop table if exists public.agent_findings;
--   drop table if exists public.agent_runs;

-- ─── agent_runs ──────────────────────────────────────────────────────────────
create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  run_type text not null,
  scope_type text not null,
  scope_ref text,
  scope_fingerprint text not null,
  capped boolean not null default false,
  cap_reason text,
  resolved_count integer not null default 0,
  finding_count integer not null default 0,
  requested_by text not null,
  test_owned boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  not_memory boolean not null default true,
  not_evidence boolean not null default true,
  not_authority boolean not null default true,
  authority_changed boolean not null default false,
  prompt_eligible boolean not null default false,
  constraint ar_domain_vocab check (domain in ('library', 'archive_graph')),
  constraint ar_run_type_vocab check (run_type in ('health_report')),
  constraint ar_requested_by_vocab check (requested_by in ('tara', 'system')),
  constraint ar_not_memory_locked check (not_memory = true),
  constraint ar_not_evidence_locked check (not_evidence = true),
  constraint ar_not_authority_locked check (not_authority = true),
  constraint ar_authority_changed_locked check (authority_changed = false),
  constraint ar_prompt_eligible_locked check (prompt_eligible = false),
  constraint ar_id_domain_unique unique (id, domain)
);

create index agent_runs_scope_idx
  on agent_runs (domain, scope_type, scope_fingerprint, created_at desc)
  where deleted_at is null;

-- ─── agent_findings ──────────────────────────────────────────────────────────
create table agent_findings (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  capability_id text not null,
  issue_code text not null,
  target_table text not null,
  target_id text not null,
  target_label text,
  severity text not null,
  review_burden text not null,
  summary text not null,
  payload jsonb not null default '{}',
  dedupe_key text not null,
  first_seen_run_id uuid not null,
  last_seen_run_id uuid not null,
  detection_status text not null default 'active',
  review_state text not null default 'open',
  reviewed_by text,
  reviewed_at timestamptz,
  test_owned boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  not_memory boolean not null default true,
  not_evidence boolean not null default true,
  not_authority boolean not null default true,
  authority_changed boolean not null default false,
  prompt_eligible boolean not null default false,
  is_queued_work boolean not null default false,
  is_proposal boolean not null default false,
  is_helper_output boolean not null default false,
  constraint af_domain_vocab check (domain in ('library', 'archive_graph')),
  constraint af_target_table_vocab check (target_table in (
    'library_items', 'library_item_files', 'archive_graph_nodes', 'archive_graph_edges'
  )),
  -- A finding's target surface must belong to its own domain — no cross-domain leakage.
  constraint af_domain_target_table_pair check (
    (domain = 'library' and target_table in ('library_items', 'library_item_files'))
    or
    (domain = 'archive_graph' and target_table in ('archive_graph_nodes', 'archive_graph_edges'))
  ),
  constraint af_detection_vocab check (detection_status in ('active', 'not_redetected')),
  constraint af_review_vocab check (review_state in ('open', 'acknowledged', 'dismissed')),
  constraint af_severity_vocab check (severity in ('info', 'low', 'medium', 'high')),
  constraint af_burden_vocab check (review_burden in ('low', 'medium', 'high')),
  constraint af_not_memory_locked check (not_memory = true),
  constraint af_not_evidence_locked check (not_evidence = true),
  constraint af_not_authority_locked check (not_authority = true),
  constraint af_authority_changed_locked check (authority_changed = false),
  constraint af_prompt_eligible_locked check (prompt_eligible = false),
  constraint af_not_queued_locked check (is_queued_work = false),
  constraint af_not_proposal_locked check (is_proposal = false),
  constraint af_not_helper_output_locked check (is_helper_output = false),
  constraint af_first_run_domain_fk foreign key (first_seen_run_id, domain)
    references agent_runs (id, domain),
  constraint af_last_run_domain_fk foreign key (last_seen_run_id, domain)
    references agent_runs (id, domain)
);

-- Active-only uniqueness, isolated by test_owned: soft-deleted rows never block a
-- future row, and active smoke rows never block/absorb future real rows.
create unique index agent_findings_active_dedupe_idx
  on agent_findings (domain, dedupe_key, test_owned)
  where deleted_at is null;

create index agent_findings_review_idx
  on agent_findings (domain, review_state, detection_status)
  where deleted_at is null;

create index agent_findings_last_seen_idx
  on agent_findings (last_seen_run_id);

-- updated_at trigger
create or replace function public.agent_findings_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger agent_findings_updated_at
  before update on agent_findings
  for each row execute function public.agent_findings_set_updated_at();

-- Trigger helper is internal only — no caller should execute it directly.
revoke all on function public.agent_findings_set_updated_at() from public, anon, authenticated, service_role;

-- ─── deny-by-default: RLS on, no policies, revoke all, writes only via RPC ─────
alter table agent_runs enable row level security;
revoke all on table agent_runs from public, anon, authenticated, service_role;

alter table agent_findings enable row level security;
revoke all on table agent_findings from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Ingest RPC — insert one run, upsert findings (partial-index aware), reconcile.
-- The ONLY write path. DO UPDATE refreshes observation fields only; it never
-- touches review_state, reviewed_by/at, identity columns, dedupe_key,
-- first_seen_run_id, or any governance flag.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function public.agent_record_findings(
  p_run jsonb,
  p_findings jsonb,
  p_reconcile boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_run_id uuid;
  v_domain text := p_run->>'domain';
  v_run_type text := p_run->>'run_type';
  v_scope_type text := p_run->>'scope_type';
  v_scope_fp text := p_run->>'scope_fingerprint';
  v_test_owned boolean := coalesce((p_run->>'test_owned')::boolean, false);
  v_capped boolean := coalesce((p_run->>'capped')::boolean, false);
  f jsonb;
  v_keys text[] := '{}';
  v_reconciled integer := 0;
begin
  insert into public.agent_runs (
    domain, run_type, scope_type, scope_ref, scope_fingerprint, capped, cap_reason,
    resolved_count, finding_count, requested_by, test_owned
  ) values (
    v_domain, v_run_type, v_scope_type, p_run->>'scope_ref', v_scope_fp, v_capped, p_run->>'cap_reason',
    coalesce((p_run->>'resolved_count')::integer, 0), coalesce((p_run->>'finding_count')::integer, 0),
    p_run->>'requested_by', v_test_owned
  ) returning id into v_run_id;

  for f in select jsonb_array_elements(p_findings)
  loop
    insert into public.agent_findings (
      domain, capability_id, issue_code, target_table, target_id, target_label,
      severity, review_burden, summary, payload, dedupe_key,
      first_seen_run_id, last_seen_run_id, test_owned
    ) values (
      v_domain, f->>'capability_id', f->>'issue_code', f->>'target_table', f->>'target_id', f->>'target_label',
      f->>'severity', f->>'review_burden', f->>'summary', coalesce(f->'payload', '{}'::jsonb), f->>'dedupe_key',
      v_run_id, v_run_id, v_test_owned
    )
    on conflict (domain, dedupe_key, test_owned) where deleted_at is null
    do update set
      last_seen_run_id = v_run_id,
      detection_status = 'active',
      payload = excluded.payload,
      summary = excluded.summary,
      severity = excluded.severity,
      review_burden = excluded.review_burden,
      target_label = excluded.target_label;
    v_keys := array_append(v_keys, f->>'dedupe_key');
  end loop;

  if p_reconcile and not v_capped then
    update public.agent_findings af
       set detection_status = 'not_redetected'
     where af.domain = v_domain
       and af.test_owned = v_test_owned
       and af.deleted_at is null
       and af.detection_status = 'active'
       and not (af.dedupe_key = any (v_keys))
       and af.last_seen_run_id in (
         select r.id from public.agent_runs r
          where r.domain = v_domain
            and r.run_type = v_run_type
            and r.scope_type = v_scope_type
            and r.scope_fingerprint = v_scope_fp
            and r.test_owned = v_test_owned
            and r.capped = false
            and r.deleted_at is null
            and r.id <> v_run_id
       );
    get diagnostics v_reconciled = row_count;
  end if;

  return jsonb_build_object(
    'run_id', v_run_id,
    'finding_count', coalesce(jsonb_array_length(p_findings), 0),
    'reconciled', v_reconciled
  );
end;
$$;

revoke all on function public.agent_record_findings(jsonb, jsonb, boolean) from public, anon, authenticated, service_role;
grant execute on function public.agent_record_findings(jsonb, jsonb, boolean) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Cleanup RPC — soft-delete a TEST-OWNED run and its test-owned findings only.
-- Never hard-deletes. Never touches non-test-owned rows.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function public.agent_findings_cleanup_test_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_test boolean;
  v_findings integer := 0;
  v_runs integer := 0;
begin
  select test_owned into v_test from public.agent_runs where id = p_run_id;
  if v_test is null then
    raise exception 'RUN_NOT_FOUND';
  end if;
  if v_test is distinct from true then
    raise exception 'RUN_NOT_TEST_OWNED';
  end if;

  update public.agent_findings
     set deleted_at = now()
   where (first_seen_run_id = p_run_id or last_seen_run_id = p_run_id)
     and test_owned = true
     and deleted_at is null;
  get diagnostics v_findings = row_count;

  update public.agent_runs
     set deleted_at = now()
   where id = p_run_id and test_owned = true and deleted_at is null;
  get diagnostics v_runs = row_count;

  return jsonb_build_object('findings_cleaned', v_findings, 'run_cleaned', v_runs);
end;
$$;

revoke all on function public.agent_findings_cleanup_test_run(uuid) from public, anon, authenticated, service_role;
grant execute on function public.agent_findings_cleanup_test_run(uuid) to service_role;
