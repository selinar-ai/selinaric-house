-- Phase 43.C patch — class-aware approval revalidation (the missed FIFTH plan-reading RPC)
--
-- Found by the halted smoke approval step (nothing was recorded; the route failed closed
-- with 400): 090 redefined record/apply/rollback/validate but NOT agent_remedy_approval_record,
-- whose approved-only drift revalidation was still title-trim-specific — an A1 plan (current
-- value = JSON null vs the live TITLE) raised STALE_PLAN_CURRENT_DRIFT. Second gap: the
-- arae_snapshots_by_decision CHECK required approved-event snapshots to be JSON STRINGS,
-- which would reject A1 (verified_current = JSON null) and A2 (verified_proposed = JSON null).
--
-- This migration redefines ONLY:
--   * the arae_snapshots_by_decision CHECK (approved snapshots: JSON string OR JSON null —
--     scalar only, nothing looser; non-approved: both SQL NULL exactly as before)
--   * agent_remedy_approval_record (drop-first because the shipped signature carries a
--     parameter DEFAULT, which CREATE OR REPLACE cannot change — 42P13; recreated with the
--     identical signature INCLUDING the default, and the identical RETURNS shape)
-- Unchanged: FOR UPDATE serialisation, decided_by='tara', structural test-owned gate,
-- transition guards, append-only behaviour, grants posture, authority_changed=false.
-- Approval remains an authority EVENT: it applies nothing and mutates no target row.
--
-- Run via: Supabase SQL Editor -> paste -> Run. Success = "No rows returned".
-- Rollback notes (manual): re-add the 086 arae_snapshots_by_decision definition and re-run
-- the 086 agent_remedy_approval_record definition.

-- ─── snapshot CHECK: approved snapshots may be JSON string OR JSON null (scalar only) ──
alter table public.agent_remedy_approval_events drop constraint if exists arae_snapshots_by_decision;
alter table public.agent_remedy_approval_events add constraint arae_snapshots_by_decision check (
  (decision = 'approved'
     and jsonb_typeof(verified_current_value) in ('string', 'null')
     and jsonb_typeof(verified_proposed_value) in ('string', 'null'))
  or (decision <> 'approved'
     and verified_current_value is null
     and verified_proposed_value is null)
);

-- ─── APPROVAL RECORD — class-aware approved revalidation ─────────────────────
-- 42P13 note: the shipped 086 signature carries `p_allow_test_owned boolean default false`,
-- and CREATE OR REPLACE cannot change parameter defaults — the function must be dropped
-- first and recreated WITH the same default (the 086 calling contract is preserved:
-- an omitted p_allow_test_owned still means false, the safe posture). Idempotent on rerun.
drop function if exists public.agent_remedy_approval_record(uuid, text, text, boolean);
create function public.agent_remedy_approval_record(
  p_remedy_plan_id uuid,
  p_decision text,
  p_decision_reason text,
  p_allow_test_owned boolean default false
)
returns table (
  id uuid,
  event_sequence bigint,
  remedy_plan_id uuid,
  decision text,
  decided_by text,
  created_at timestamptz,
  derived_status text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_decided_by text := 'tara';   -- server-derived; never client-supplied
  v_plan_state text;
  v_action text;
  v_ttable text;
  v_tfield text;
  v_tid text;
  v_curr jsonb;
  v_prop jsonb;
  v_plan_test boolean;
  v_plan_deleted timestamptz;
  v_actual_title text;
  v_actual_label text;
  v_actual_url text;
  v_derived text;
  v_current_status text;
  v_vc jsonb := null;
  v_vp jsonb := null;
begin
  if p_decision is null or p_decision not in ('approved', 'rejected', 'revoked') then
    raise exception 'INVALID_DECISION';
  end if;
  if p_decision_reason is not null and pg_catalog.btrim(p_decision_reason) = '' then
    raise exception 'DECISION_REASON_BLANK';
  end if;

  -- load the remedy plan WITH a transaction-scoped row lock (FOR UPDATE) — race-safe decisions
  select r.plan_state, r.action_type, r.target_table, r.target_field, r.target_id,
         r.current_value, r.proposed_value, r.test_owned, r.deleted_at
    into v_plan_state, v_action, v_ttable, v_tfield, v_tid,
         v_curr, v_prop, v_plan_test, v_plan_deleted
    from public.agent_remedy_plans r where r.id = p_remedy_plan_id
    for update;
  if not found or v_plan_deleted is not null then
    raise exception 'PLAN_NOT_FOUND_OR_DELETED';
  end if;

  -- structural test-owned gate: normal route passes false; only the smoke may pass true
  if v_plan_test = true and coalesce(p_allow_test_owned, false) = false then
    raise exception 'TEST_OWNED_NOT_ALLOWED';
  end if;

  -- derive current status: latest event by event_sequence (non-deleted)
  select e.decision into v_current_status
    from public.agent_remedy_approval_events e
   where e.remedy_plan_id = p_remedy_plan_id and e.deleted_at is null
   order by e.event_sequence desc
   limit 1;
  v_current_status := coalesce(v_current_status, 'none');

  -- transition guards
  if p_decision = 'revoked' and v_current_status <> 'approved' then
    raise exception 'REVOKE_NOT_APPROVED';
  end if;
  if p_decision = 'approved' and v_current_status = 'approved' then
    raise exception 'ALREADY_APPROVED';
  end if;
  if p_decision = 'rejected' and v_current_status = 'approved' then
    raise exception 'REVOKE_REQUIRED';
  end if;

  -- approve: re-verify against reality (class-aware). reject/revoke do NOT revalidate drift.
  if p_decision = 'approved' then
    if v_plan_state <> 'proposed' then
      raise exception 'PLAN_NOT_PROPOSED';
    end if;
    if v_ttable <> 'library_items'
       or not ( (v_action = 'library_title_trim' and v_tfield = 'title')
             or (v_action = 'library_phase_label_backfill' and v_tfield = 'phase_label')
             or (v_action = 'library_source_url_clear_non_url' and v_tfield = 'source_url') ) then
      raise exception 'PLAN_NOT_ELIGIBLE';
    end if;
    select li.title, li.phase_label, li.source_url
      into v_actual_title, v_actual_label, v_actual_url
      from public.library_items li
     where li.id::text = v_tid;
    if not found then
      raise exception 'TARGET_ROW_NOT_FOUND';
    end if;

    if v_action = 'library_title_trim' then
      -- byte-identical 086 branch
      if (v_curr #>> '{}') is distinct from v_actual_title then
        raise exception 'STALE_PLAN_CURRENT_DRIFT';
      end if;
      if (v_prop #>> '{}') <> pg_catalog.btrim(v_actual_title, ' ') then
        raise exception 'STALE_PLAN_PROPOSED_DRIFT';
      end if;
      v_vc := to_jsonb(v_actual_title);
      v_vp := to_jsonb(pg_catalog.btrim(v_actual_title, ' '));

    elsif v_action = 'library_phase_label_backfill' then
      -- live label must still be null/blank AND faithfully match the plan's recorded inverse
      if v_actual_label is not null and pg_catalog.btrim(v_actual_label, ' ') <> '' then
        raise exception 'STALE_PLAN_CURRENT_DRIFT';
      end if;
      if not ( (jsonb_typeof(v_curr) = 'null' and v_actual_label is null)
            or (jsonb_typeof(v_curr) = 'string'
                and (v_curr #>> '{}') is not distinct from v_actual_label) ) then
        raise exception 'STALE_PLAN_CURRENT_DRIFT';
      end if;
      -- recomputed label from the LIVE title (regex-free first-em-dash rule) must equal proposed
      if v_actual_title not like 'Phase %' or position('—' in v_actual_title) = 0 then
        raise exception 'STALE_PLAN_PROPOSED_DRIFT';
      end if;
      v_derived := pg_catalog.btrim(pg_catalog.substr(v_actual_title, position('—' in v_actual_title) + 1), ' ');
      if v_derived = '' or v_derived <> (v_prop #>> '{}') then
        raise exception 'STALE_PLAN_PROPOSED_DRIFT';
      end if;
      v_vc := coalesce(to_jsonb(v_actual_label), 'null'::jsonb);
      v_vp := v_prop;

    else -- library_source_url_clear_non_url
      if (v_curr #>> '{}') is distinct from v_actual_url then
        raise exception 'STALE_PLAN_CURRENT_DRIFT';
      end if;
      if v_actual_url is null or v_actual_url ~* '^https?://\S+$' then
        raise exception 'STALE_PLAN_PROPOSED_DRIFT';
      end if;
      if jsonb_typeof(v_prop) <> 'null' then
        raise exception 'STALE_PLAN_PROPOSED_DRIFT';
      end if;
      v_vc := to_jsonb(v_actual_url);
      v_vp := 'null'::jsonb;
    end if;
  end if;

  -- append the authority event (this becomes the latest → derived status = p_decision)
  return query
  insert into public.agent_remedy_approval_events (
    remedy_plan_id, decision, decided_by, decision_reason,
    verified_current_value, verified_proposed_value, test_owned
  ) values (
    p_remedy_plan_id, p_decision, v_decided_by, p_decision_reason,
    v_vc, v_vp, v_plan_test
  )
  returning
    agent_remedy_approval_events.id,
    agent_remedy_approval_events.event_sequence,
    agent_remedy_approval_events.remedy_plan_id,
    agent_remedy_approval_events.decision,
    agent_remedy_approval_events.decided_by,
    agent_remedy_approval_events.created_at,
    agent_remedy_approval_events.decision;   -- derived_status (newest event = current)
end;
$$;
revoke all on function public.agent_remedy_approval_record(uuid, text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.agent_remedy_approval_record(uuid, text, text, boolean) to service_role;
