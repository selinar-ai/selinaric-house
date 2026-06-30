-- Phase 42.3.3b — Maintenance Room read + review-state RPCs (additive functions only)
--
-- Exposes the durable findings store (083) to a Tara-only, auth-protected Maintenance
-- Room for review/triage. NO table changes, NO new tables, NO direct table grants —
-- the deny-by-default posture of 083 stands. Writes still flow only through RPCs.
--
-- Three SECURITY DEFINER functions, all: fixed search_path, schema-qualified tables
-- (public.agent_findings / public.agent_runs), no dynamic SQL, no select *, whitelisted
-- columns, deleted_at IS NULL, default test_owned = false; execute granted to
-- service_role only, revoked from public/anon/authenticated.
--
-- The ONLY mutation is review_state / reviewed_by / reviewed_at on agent_findings.
-- It is triage of the durable record — never a House source-surface write, never authority.
--
-- Run via: Supabase Dashboard -> SQL Editor -> paste -> Run. Success = "No rows returned".
--
-- Rollback notes (manual):
--   drop function if exists public.agent_finding_set_review_state(uuid, text, text);
--   drop function if exists public.agent_runs_list(text, boolean);
--   drop function if exists public.agent_findings_list(text, text, text, boolean);

-- ─── READ: findings ──────────────────────────────────────────────────────────
create or replace function public.agent_findings_list(
  p_domain text,
  p_review_state text,
  p_detection_status text,
  p_include_test boolean
)
returns table (
  id uuid,
  domain text,
  capability_id text,
  issue_code text,
  target_table text,
  target_id text,
  target_label text,
  severity text,
  review_burden text,
  summary text,
  payload jsonb,
  detection_status text,
  review_state text,
  reviewed_by text,
  reviewed_at timestamptz,
  first_seen_run_id uuid,
  last_seen_run_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, pg_temp
stable
as $$
  select
    f.id, f.domain, f.capability_id, f.issue_code, f.target_table, f.target_id, f.target_label,
    f.severity, f.review_burden, f.summary, f.payload, f.detection_status, f.review_state,
    f.reviewed_by, f.reviewed_at, f.first_seen_run_id, f.last_seen_run_id, f.created_at, f.updated_at
  from public.agent_findings f
  where f.deleted_at is null
    and (coalesce(p_include_test, false) = true or f.test_owned = false)
    and (p_domain is null or f.domain = p_domain)
    and (p_review_state is null or f.review_state = p_review_state)
    and (p_detection_status is null or f.detection_status = p_detection_status)
  order by f.domain asc,
           case f.severity when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end asc,
           f.issue_code asc,
           f.created_at asc;
$$;

revoke all on function public.agent_findings_list(text, text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.agent_findings_list(text, text, text, boolean) to service_role;

-- ─── READ: runs ──────────────────────────────────────────────────────────────
create or replace function public.agent_runs_list(
  p_domain text,
  p_include_test boolean
)
returns table (
  id uuid,
  domain text,
  run_type text,
  scope_type text,
  scope_ref text,
  scope_fingerprint text,
  capped boolean,
  cap_reason text,
  resolved_count integer,
  finding_count integer,
  requested_by text,
  created_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, pg_temp
stable
as $$
  select
    r.id, r.domain, r.run_type, r.scope_type, r.scope_ref, r.scope_fingerprint, r.capped,
    r.cap_reason, r.resolved_count, r.finding_count, r.requested_by, r.created_at
  from public.agent_runs r
  where r.deleted_at is null
    and (coalesce(p_include_test, false) = true or r.test_owned = false)
    and (p_domain is null or r.domain = p_domain)
  order by r.created_at desc;
$$;

revoke all on function public.agent_runs_list(text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.agent_runs_list(text, boolean) to service_role;

-- ─── WRITE (the ONLY mutation): set review_state ──────────────────────────────
-- Updates only review_state / reviewed_by / reviewed_at (updated_at via 083 trigger).
-- Never touches identity, domain, dedupe_key, target_*, run refs, detection_status,
-- payload, governance flags, test_owned, or deleted_at. Acts only where deleted_at IS NULL.
create or replace function public.agent_finding_set_review_state(
  p_finding_id uuid,
  p_review_state text,
  p_reviewed_by text
)
returns table (
  id uuid,
  domain text,
  issue_code text,
  review_state text,
  reviewed_by text,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := now();
begin
  -- NOT IN does not catch NULL — reject null review_state explicitly.
  if p_review_state is null
     or p_review_state not in ('open', 'acknowledged', 'dismissed') then
    raise exception 'INVALID_REVIEW_STATE';
  end if;

  -- This is the review record — reviewed_by must never be null or blank.
  if p_reviewed_by is null or pg_catalog.btrim(p_reviewed_by) = '' then
    raise exception 'INVALID_REVIEWED_BY';
  end if;

  return query
  update public.agent_findings f
     set review_state = p_review_state,
         reviewed_by  = p_reviewed_by,
         reviewed_at  = v_now
   where f.id = p_finding_id
     and f.deleted_at is null
  returning f.id, f.domain, f.issue_code, f.review_state, f.reviewed_by, f.reviewed_at;
end;
$$;

revoke all on function public.agent_finding_set_review_state(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.agent_finding_set_review_state(uuid, text, text) to service_role;
