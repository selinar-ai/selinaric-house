-- Phase 43.C — Remedy Whitelist v2 (A1 library_phase_label_backfill + A2 library_source_url_clear_non_url)
--
-- Extends agent_remedy_plans from the single v1 action to THREE whitelisted actions via a
-- typed, class-specific CHECK (the proven 089 pattern). The v1 library_title_trim branch is
-- byte-identical in semantics. NO new table, NO new organ: the existing plan/approval/apply
-- lifecycle and the existing agent_remedy_apply_events audit are reused. Static per-action
-- dispatch only — NO dynamic SQL, NO EXECUTE. Writable columns after this migration are
-- EXACTLY {title, phase_label, source_url} on library_items, each only through its branch.
-- No Memory / graph truth / prompt / authority surface is touched. No live LLM. No scheduler.
--
-- A2 is CLEAR-to-null ONLY (Ari): a non-URL value violates the column's contract; the
-- displaced text is preserved byte-exactly in current_value (the inverse) + the apply audit.
--
-- 42P13 note: every redefined function keeps its EXISTING signature and RETURNS shape —
-- CREATE OR REPLACE is safe; there is deliberately NO `drop function` in this migration.
--
-- BEFORE APPLYING THIS MIGRATION: run `node scripts/scan-dangerous-ops.mjs`.
-- Run via: Supabase SQL Editor -> paste -> Run. Success = "No rows returned".
--
-- Rollback notes (manual): re-add the four dropped v1 constraints from 085 and re-run the
-- 085/087 function definitions (agent_remedy_plans is expected to hold no v2 rows before
-- any real v2 plan is recorded; verify before rolling back).

-- ─── agent_remedy_plans: class-typed whitelist (idempotent drops before adds) ──
alter table public.agent_remedy_plans drop constraint if exists arp_v1_action_whitelist;
alter table public.agent_remedy_plans drop constraint if exists arp_values_are_strings;
alter table public.agent_remedy_plans drop constraint if exists arp_proposed_is_trim;
alter table public.agent_remedy_plans drop constraint if exists arp_proposed_nonempty;
alter table public.agent_remedy_plans drop constraint if exists arp_class_typed;

-- v1 branch preserved byte-identically; A1 current MUST be JSON null or blank JSON string
-- (non-blank existing labels are structurally inadmissible); A2 proposed MUST be JSON null.
alter table public.agent_remedy_plans add constraint arp_class_typed check (
  domain = 'library' and target_table = 'library_items'
  and (
    (action_type = 'library_title_trim' and target_field = 'title'
       and jsonb_typeof(current_value) = 'string' and jsonb_typeof(proposed_value) = 'string'
       and (proposed_value #>> '{}') = pg_catalog.btrim(current_value #>> '{}', ' ')
       and (proposed_value #>> '{}') <> '')
    or
    (action_type = 'library_phase_label_backfill' and target_field = 'phase_label'
       and (jsonb_typeof(current_value) = 'null'
            or (jsonb_typeof(current_value) = 'string' and pg_catalog.btrim(current_value #>> '{}') = ''))
       and jsonb_typeof(proposed_value) = 'string'
       and pg_catalog.btrim(proposed_value #>> '{}') <> '')
    or
    (action_type = 'library_source_url_clear_non_url' and target_field = 'source_url'
       and jsonb_typeof(current_value) = 'string' and pg_catalog.btrim(current_value #>> '{}') <> ''
       and jsonb_typeof(proposed_value) = 'null')
  )
);
-- arp_values_differ / arp_plan_state_vocab / arp_reason_nonblank / all flag-locks / the
-- active-only uniqueness index remain UNCHANGED (not dropped, not weakened).

-- ─── agent_remedy_apply_events: values may now be JSON null (A1 before / A2 after) ──
alter table public.agent_remedy_apply_events drop constraint if exists aae_values_are_strings;
alter table public.agent_remedy_apply_events drop constraint if exists aae_values_json_scalar;
alter table public.agent_remedy_apply_events add constraint aae_values_json_scalar check (
  jsonb_typeof(before_value) in ('string', 'null')
  and jsonb_typeof(after_value) in ('string', 'null')
  and jsonb_typeof(verified_current_value) in ('string', 'null')
);

-- ─── RECORD RPC — same signature/return; action derived server-side from the finding ──
create or replace function public.agent_remedy_plan_record(
  p_finding_id uuid,
  p_target_id text,
  p_current_value jsonb,
  p_proposed_value jsonb,
  p_deterministic_reason text,
  p_test_owned boolean
)
returns table (
  id uuid,
  finding_id uuid,
  action_type text,
  target_table text,
  target_field text,
  plan_state text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_domain text;
  v_issue_code text;
  v_target_table text;
  v_target_id text;
  v_deleted_at timestamptz;
  v_action text;
  v_field text;
  v_actual_title text;
  v_actual_label text;
  v_actual_url text;
  v_collection text;
  v_phase_code text;
  v_phase_number numeric;
  v_derived text;
begin
  -- (1) finding exists and is not deleted
  select f.domain, f.issue_code, f.target_table, f.target_id, f.deleted_at
    into v_domain, v_issue_code, v_target_table, v_target_id, v_deleted_at
    from public.agent_findings f where f.id = p_finding_id;
  if not found or v_deleted_at is not null then
    raise exception 'FINDING_NOT_FOUND_OR_DELETED';
  end if;
  -- (2) issue_code -> whitelisted action (server-side; callers cannot choose an action)
  if v_domain <> 'library' or v_target_table <> 'library_items' then
    raise exception 'FINDING_NOT_ELIGIBLE';
  end if;
  if v_issue_code = 'item_title_untrimmed' then
    v_action := 'library_title_trim'; v_field := 'title';
  elsif v_issue_code = 'phase_doc_incomplete_phase_metadata' then
    v_action := 'library_phase_label_backfill'; v_field := 'phase_label';
  elsif v_issue_code = 'source_url_malformed' then
    v_action := 'library_source_url_clear_non_url'; v_field := 'source_url';
  else
    raise exception 'FINDING_NOT_ELIGIBLE';
  end if;
  -- (3) the plan targets the same row the finding points to
  if v_target_id <> p_target_id then
    raise exception 'TARGET_MISMATCH';
  end if;
  -- (4) deterministic_reason is present
  if p_deterministic_reason is null or pg_catalog.btrim(p_deterministic_reason) = '' then
    raise exception 'DETERMINISTIC_REASON_BLANK';
  end if;
  -- (5) read the ACTUAL target row — VERIFICATION ONLY (read, never write)
  select li.title, li.phase_label, li.source_url, li.collection, li.phase_code, li.phase_number
    into v_actual_title, v_actual_label, v_actual_url, v_collection, v_phase_code, v_phase_number
    from public.library_items li
   where li.id::text = p_target_id;
  if not found then
    raise exception 'TARGET_ROW_NOT_FOUND';
  end if;

  -- (6) per-action verification (static dispatch; the DB boundary recomputes from LIVE data)
  if v_action = 'library_title_trim' then
    if jsonb_typeof(p_current_value) <> 'string' or jsonb_typeof(p_proposed_value) <> 'string' then
      raise exception 'VALUES_MUST_BE_STRINGS';
    end if;
    if (p_current_value #>> '{}') is distinct from v_actual_title then
      raise exception 'CURRENT_VALUE_MISMATCH';
    end if;
    if (p_proposed_value #>> '{}') <> pg_catalog.btrim(v_actual_title, ' ') then
      raise exception 'PROPOSED_NOT_TRIM_OF_TARGET';
    end if;
    if (p_proposed_value #>> '{}') = '' then
      raise exception 'PROPOSED_EMPTY';
    end if;
    if (p_proposed_value #>> '{}') = v_actual_title then
      raise exception 'NO_CHANGE';
    end if;

  elsif v_action = 'library_phase_label_backfill' then
    if v_collection is distinct from 'development_documentation' then
      raise exception 'COLLECTION_NOT_ELIGIBLE';
    end if;
    if v_phase_code is null or pg_catalog.btrim(v_phase_code) = '' or v_phase_number is null then
      raise exception 'PHASE_CODE_OR_NUMBER_MISSING';
    end if;
    if v_actual_label is not null and pg_catalog.btrim(v_actual_label, ' ') <> '' then
      raise exception 'LABEL_ALREADY_PRESENT';
    end if;
    -- supplied current must faithfully record the live prior label (null or blank string)
    if not ( (jsonb_typeof(p_current_value) = 'null' and v_actual_label is null)
          or (jsonb_typeof(p_current_value) = 'string'
              and (p_current_value #>> '{}') is not distinct from v_actual_label) ) then
      raise exception 'CURRENT_VALUE_MISMATCH';
    end if;
    -- recompute the label from the LIVE title. Regex-free rule, byte-identical to the JS
    -- derivePhaseLabelFromTitle: prefix 'Phase ' + everything AFTER THE FIRST em-dash, space-trimmed.
    if v_actual_title not like 'Phase %' or position('—' in v_actual_title) = 0 then
      raise exception 'TITLE_NOT_CONVENTIONAL';
    end if;
    v_derived := pg_catalog.btrim(pg_catalog.substr(v_actual_title, position('—' in v_actual_title) + 1), ' ');
    if v_derived = '' then
      raise exception 'TITLE_NOT_CONVENTIONAL';
    end if;
    if jsonb_typeof(p_proposed_value) <> 'string' or (p_proposed_value #>> '{}') <> v_derived then
      raise exception 'PROPOSED_NOT_DERIVED_FROM_TITLE';
    end if;
    -- observed-title provenance: the reason must carry the exact title the label came from
    if position(v_actual_title in p_deterministic_reason) = 0 then
      raise exception 'REASON_MISSING_OBSERVED_TITLE';
    end if;

  else -- library_source_url_clear_non_url
    if jsonb_typeof(p_current_value) <> 'string' then
      raise exception 'VALUES_MUST_BE_STRINGS';
    end if;
    if jsonb_typeof(p_proposed_value) <> 'null' then
      raise exception 'PROPOSED_NOT_NULL';
    end if;
    if v_actual_url is null or pg_catalog.btrim(v_actual_url) = '' then
      raise exception 'URL_NOT_MALFORMED';
    end if;
    if (p_current_value #>> '{}') is distinct from v_actual_url then
      raise exception 'CURRENT_VALUE_MISMATCH';
    end if;
    -- SQL twin of the shipped helper predicate (parity locked by shared test vectors):
    -- a VALID url is ^https?://<no-whitespace>+$ (case-insensitive); malformed = NOT valid
    if v_actual_url ~* '^https?://\S+$' then
      raise exception 'URL_NOT_MALFORMED';
    end if;
  end if;

  -- supersede any prior active proposed plan for this finding/action/test-ownership
  update public.agent_remedy_plans r
     set plan_state = 'superseded'
   where r.finding_id = p_finding_id
     and r.action_type = v_action
     and r.test_owned = coalesce(p_test_owned, false)
     and r.plan_state = 'proposed'
     and r.deleted_at is null;

  return query
  insert into public.agent_remedy_plans (
    finding_id, domain, action_type, target_table, target_id, target_field,
    current_value, proposed_value, deterministic_reason, plan_state, test_owned
  ) values (
    p_finding_id, 'library', v_action, 'library_items', p_target_id, v_field,
    p_current_value, p_proposed_value, p_deterministic_reason, 'proposed', coalesce(p_test_owned, false)
  )
  returning agent_remedy_plans.id, agent_remedy_plans.finding_id, agent_remedy_plans.action_type,
            agent_remedy_plans.target_table, agent_remedy_plans.target_field, agent_remedy_plans.plan_state;
end;
$$;
revoke all on function public.agent_remedy_plan_record(uuid, text, jsonb, jsonb, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.agent_remedy_plan_record(uuid, text, jsonb, jsonb, text, boolean) to service_role;

-- ─── APPLY — same signature/return; static per-action dispatch ─────────────────
create or replace function public.agent_remedy_apply(p_remedy_plan_id uuid)
returns table (
  id uuid,
  event_sequence bigint,
  remedy_plan_id uuid,
  outcome text,
  before_value jsonb,
  after_value jsonb,
  acted_by text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_acted_by text := 'tara';   -- server-derived; never client-supplied
  v_plan_state text;
  v_action text;
  v_ttable text;
  v_tfield text;
  v_tid text;
  v_curr jsonb;
  v_prop jsonb;
  v_plan_test boolean;
  v_plan_deleted timestamptz;
  v_approval_status text;
  v_approval_event_id uuid;
  v_apply_status text;
  v_actual_title text;
  v_actual_label text;
  v_actual_url text;
  v_derived text;
  v_before jsonb;
  v_rows integer;
begin
  -- (1) lock the plan row FOR UPDATE (serialise before deriving status)
  select r.plan_state, r.action_type, r.target_table, r.target_field, r.target_id,
         r.current_value, r.proposed_value, r.test_owned, r.deleted_at
    into v_plan_state, v_action, v_ttable, v_tfield, v_tid, v_curr, v_prop, v_plan_test, v_plan_deleted
    from public.agent_remedy_plans r where r.id = p_remedy_plan_id
    for update;
  if not found or v_plan_deleted is not null then
    raise exception 'PLAN_NOT_FOUND_OR_DELETED';
  end if;
  -- (2) a test-owned plan may NEVER write a House source surface
  if v_plan_test = true then
    raise exception 'TEST_OWNED_NO_WRITE';
  end if;
  -- (3) eligibility / exact v2 whitelist
  if v_plan_state <> 'proposed' then
    raise exception 'PLAN_NOT_PROPOSED';
  end if;
  if v_ttable <> 'library_items'
     or not ( (v_action = 'library_title_trim' and v_tfield = 'title')
           or (v_action = 'library_phase_label_backfill' and v_tfield = 'phase_label')
           or (v_action = 'library_source_url_clear_non_url' and v_tfield = 'source_url') ) then
    raise exception 'PLAN_NOT_ELIGIBLE';
  end if;
  -- (4) derive current approval status (latest by event_sequence); capture the approved event
  select e.decision, e.id into v_approval_status, v_approval_event_id
    from public.agent_remedy_approval_events e
   where e.remedy_plan_id = p_remedy_plan_id and e.deleted_at is null
   order by e.event_sequence desc
   limit 1;
  if coalesce(v_approval_status, 'none') <> 'approved' then
    raise exception 'NOT_APPROVED';
  end if;
  -- (5) derive current apply status; refuse if already applied
  select a.outcome into v_apply_status
    from public.agent_remedy_apply_events a
   where a.remedy_plan_id = p_remedy_plan_id
   order by a.event_sequence desc
   limit 1;
  if v_apply_status = 'applied' then
    raise exception 'ALREADY_APPLIED';
  end if;
  -- (6) read the live row once for all branches
  select li.title, li.phase_label, li.source_url
    into v_actual_title, v_actual_label, v_actual_url
    from public.library_items li where li.id::text = v_tid;
  if not found then
    raise exception 'TARGET_ROW_NOT_FOUND';
  end if;

  -- (7) per-action apply-time revalidation + THE WRITE (conditional single row each)
  if v_action = 'library_title_trim' then
    if (v_curr #>> '{}') is distinct from v_actual_title then
      raise exception 'CURRENT_DRIFT';
    end if;
    if (v_prop #>> '{}') <> pg_catalog.btrim(v_actual_title, ' ') then
      raise exception 'PROPOSED_DRIFT';
    end if;
    update public.library_items li
       set title = (v_prop #>> '{}')
     where li.id::text = v_tid and li.title = v_actual_title;
    get diagnostics v_rows = row_count;
    v_before := to_jsonb(v_actual_title);

  elsif v_action = 'library_phase_label_backfill' then
    if v_actual_label is not null and pg_catalog.btrim(v_actual_label, ' ') <> '' then
      raise exception 'CURRENT_DRIFT';
    end if;
    -- the STRONGER revalidation: recompute the label from the LIVE title (same regex-free
    -- first-em-dash rule); it must still equal the approved proposed value — title edits
    -- since plan-record time abort the apply
    if v_actual_title not like 'Phase %' or position('—' in v_actual_title) = 0 then
      raise exception 'PROPOSED_DRIFT';
    end if;
    v_derived := pg_catalog.btrim(pg_catalog.substr(v_actual_title, position('—' in v_actual_title) + 1), ' ');
    if v_derived = '' or v_derived <> (v_prop #>> '{}') then
      raise exception 'PROPOSED_DRIFT';
    end if;
    update public.library_items li
       set phase_label = (v_prop #>> '{}')
     where li.id::text = v_tid and li.phase_label is not distinct from v_actual_label;
    get diagnostics v_rows = row_count;
    v_before := coalesce(to_jsonb(v_actual_label), 'null'::jsonb);

  else -- library_source_url_clear_non_url
    if (v_curr #>> '{}') is distinct from v_actual_url then
      raise exception 'CURRENT_DRIFT';
    end if;
    if v_actual_url is null or v_actual_url ~* '^https?://\S+$' then
      raise exception 'URL_NOT_MALFORMED';
    end if;
    update public.library_items li
       set source_url = null
     where li.id::text = v_tid and li.source_url = v_actual_url;
    get diagnostics v_rows = row_count;
    v_before := to_jsonb(v_actual_url);
  end if;

  if v_rows <> 1 then
    raise exception 'WRITE_CONFLICT';
  end if;
  -- (8) record the apply event (append-only) in the SAME transaction
  return query
  insert into public.agent_remedy_apply_events (
    remedy_plan_id, approval_event_id, reverses_apply_event_id, outcome,
    before_value, after_value, verified_current_value, acted_by, house_source_write
  ) values (
    p_remedy_plan_id, v_approval_event_id, null, 'applied',
    v_before, v_prop, v_before, v_acted_by, true
  )
  returning
    agent_remedy_apply_events.id, agent_remedy_apply_events.event_sequence,
    agent_remedy_apply_events.remedy_plan_id, agent_remedy_apply_events.outcome,
    agent_remedy_apply_events.before_value, agent_remedy_apply_events.after_value,
    agent_remedy_apply_events.acted_by, agent_remedy_apply_events.created_at;
end;
$$;
revoke all on function public.agent_remedy_apply(uuid) from public, anon, authenticated, service_role;
grant execute on function public.agent_remedy_apply(uuid) to service_role;

-- ─── ROLLBACK — same signature/return; static per-action restore ───────────────
create or replace function public.agent_remedy_rollback(p_remedy_plan_id uuid)
returns table (
  id uuid,
  event_sequence bigint,
  remedy_plan_id uuid,
  outcome text,
  before_value jsonb,
  after_value jsonb,
  acted_by text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_acted_by text := 'tara';
  v_tid text;
  v_action text;
  v_plan_test boolean;
  v_plan_deleted timestamptz;
  v_apply_status text;
  v_applied_event_id uuid;
  v_applied_after jsonb;
  v_applied_before jsonb;
  v_actual_title text;
  v_actual_label text;
  v_actual_url text;
  v_rows integer;
begin
  -- (1) lock the plan row FOR UPDATE
  select r.target_id, r.action_type, r.test_owned, r.deleted_at
    into v_tid, v_action, v_plan_test, v_plan_deleted
    from public.agent_remedy_plans r where r.id = p_remedy_plan_id
    for update;
  if not found or v_plan_deleted is not null then
    raise exception 'PLAN_NOT_FOUND_OR_DELETED';
  end if;
  if v_plan_test = true then
    raise exception 'TEST_OWNED_NO_WRITE';
  end if;
  -- (2) latest apply status must be 'applied'; identify the applied event to reverse
  select a.id, a.outcome, a.after_value, a.before_value
    into v_applied_event_id, v_apply_status, v_applied_after, v_applied_before
    from public.agent_remedy_apply_events a
   where a.remedy_plan_id = p_remedy_plan_id
   order by a.event_sequence desc
   limit 1;
  if coalesce(v_apply_status, 'none') <> 'applied' then
    raise exception 'NOT_APPLIED';
  end if;
  -- (3) read the live row + per-action drift check; (4) restore the exact before_value
  select li.title, li.phase_label, li.source_url
    into v_actual_title, v_actual_label, v_actual_url
    from public.library_items li where li.id::text = v_tid;
  if not found then
    raise exception 'TARGET_ROW_NOT_FOUND';
  end if;

  if v_action = 'library_title_trim' then
    if v_actual_title is distinct from (v_applied_after #>> '{}') then
      raise exception 'ROLLBACK_DRIFT';
    end if;
    update public.library_items li
       set title = (v_applied_before #>> '{}')
     where li.id::text = v_tid and li.title = v_actual_title;
    get diagnostics v_rows = row_count;

  elsif v_action = 'library_phase_label_backfill' then
    if v_actual_label is distinct from (v_applied_after #>> '{}') then
      raise exception 'ROLLBACK_DRIFT';
    end if;
    -- restore the recorded prior label: SQL NULL when the inverse is JSON null
    update public.library_items li
       set phase_label = (v_applied_before #>> '{}')   -- yields NULL for jsonb 'null'
     where li.id::text = v_tid and li.phase_label is not distinct from v_actual_label;
    get diagnostics v_rows = row_count;

  else -- library_source_url_clear_non_url: applied after is JSON null → live must be NULL
    if v_actual_url is not null then
      raise exception 'ROLLBACK_DRIFT';
    end if;
    update public.library_items li
       set source_url = (v_applied_before #>> '{}')
     where li.id::text = v_tid and li.source_url is null;
    get diagnostics v_rows = row_count;
  end if;

  if v_rows <> 1 then
    raise exception 'ROLLBACK_WRITE_CONFLICT';
  end if;
  -- (5) record the rollback event referencing the applied event it reverses
  return query
  insert into public.agent_remedy_apply_events (
    remedy_plan_id, approval_event_id, reverses_apply_event_id, outcome,
    before_value, after_value, verified_current_value, acted_by, house_source_write
  ) values (
    p_remedy_plan_id, null, v_applied_event_id, 'rolled_back',
    v_applied_after, v_applied_before,
    case when v_action = 'library_title_trim' then to_jsonb(v_actual_title)
         when v_action = 'library_phase_label_backfill' then coalesce(to_jsonb(v_actual_label), 'null'::jsonb)
         else coalesce(to_jsonb(v_actual_url), 'null'::jsonb) end,
    v_acted_by, true
  )
  returning
    agent_remedy_apply_events.id, agent_remedy_apply_events.event_sequence,
    agent_remedy_apply_events.remedy_plan_id, agent_remedy_apply_events.outcome,
    agent_remedy_apply_events.before_value, agent_remedy_apply_events.after_value,
    agent_remedy_apply_events.acted_by, agent_remedy_apply_events.created_at;
end;
$$;
revoke all on function public.agent_remedy_rollback(uuid) from public, anon, authenticated, service_role;
grant execute on function public.agent_remedy_rollback(uuid) to service_role;

-- ─── VALIDATE APPLY READINESS — same signature/return; read-only dispatch ───────
create or replace function public.agent_remedy_apply_validate(p_remedy_plan_id uuid)
returns table (ready boolean, reason text, current_value jsonb, proposed_value jsonb)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
stable
as $$
declare
  v_plan_state text;
  v_action text;
  v_ttable text;
  v_tfield text;
  v_tid text;
  v_curr jsonb;
  v_prop jsonb;
  v_plan_test boolean;
  v_plan_deleted timestamptz;
  v_approval_status text;
  v_apply_status text;
  v_actual_title text;
  v_actual_label text;
  v_actual_url text;
  v_derived text;
begin
  select r.plan_state, r.action_type, r.target_table, r.target_field, r.target_id,
         r.current_value, r.proposed_value, r.test_owned, r.deleted_at
    into v_plan_state, v_action, v_ttable, v_tfield, v_tid, v_curr, v_prop, v_plan_test, v_plan_deleted
    from public.agent_remedy_plans r where r.id = p_remedy_plan_id;
  if not found or v_plan_deleted is not null then
    return query select false, 'PLAN_NOT_FOUND_OR_DELETED'::text, null::jsonb, null::jsonb; return;
  end if;
  if v_plan_test = true then
    return query select false, 'TEST_OWNED_NO_WRITE'::text, null::jsonb, null::jsonb; return;
  end if;
  if v_plan_state <> 'proposed' then
    return query select false, 'PLAN_NOT_PROPOSED'::text, v_curr, v_prop; return;
  end if;
  if v_ttable <> 'library_items'
     or not ( (v_action = 'library_title_trim' and v_tfield = 'title')
           or (v_action = 'library_phase_label_backfill' and v_tfield = 'phase_label')
           or (v_action = 'library_source_url_clear_non_url' and v_tfield = 'source_url') ) then
    return query select false, 'PLAN_NOT_ELIGIBLE'::text, v_curr, v_prop; return;
  end if;
  select e.decision into v_approval_status
    from public.agent_remedy_approval_events e
   where e.remedy_plan_id = p_remedy_plan_id and e.deleted_at is null
   order by e.event_sequence desc limit 1;
  if coalesce(v_approval_status, 'none') <> 'approved' then
    return query select false, 'NOT_APPROVED'::text, v_curr, v_prop; return;
  end if;
  select a.outcome into v_apply_status
    from public.agent_remedy_apply_events a
   where a.remedy_plan_id = p_remedy_plan_id
   order by a.event_sequence desc limit 1;
  if v_apply_status = 'applied' then
    return query select false, 'ALREADY_APPLIED'::text, v_curr, v_prop; return;
  end if;
  select li.title, li.phase_label, li.source_url
    into v_actual_title, v_actual_label, v_actual_url
    from public.library_items li where li.id::text = v_tid;
  if not found then
    return query select false, 'TARGET_ROW_NOT_FOUND'::text, v_curr, v_prop; return;
  end if;

  if v_action = 'library_title_trim' then
    if (v_curr #>> '{}') is distinct from v_actual_title then
      return query select false, 'CURRENT_DRIFT'::text, v_curr, v_prop; return;
    end if;
    if (v_prop #>> '{}') <> pg_catalog.btrim(v_actual_title, ' ') then
      return query select false, 'PROPOSED_DRIFT'::text, v_curr, v_prop; return;
    end if;
  elsif v_action = 'library_phase_label_backfill' then
    if v_actual_label is not null and pg_catalog.btrim(v_actual_label, ' ') <> '' then
      return query select false, 'CURRENT_DRIFT'::text, v_curr, v_prop; return;
    end if;
    if v_actual_title not like 'Phase %' or position('—' in v_actual_title) = 0 then
      return query select false, 'PROPOSED_DRIFT'::text, v_curr, v_prop; return;
    end if;
    v_derived := pg_catalog.btrim(pg_catalog.substr(v_actual_title, position('—' in v_actual_title) + 1), ' ');
    if v_derived = '' or v_derived <> (v_prop #>> '{}') then
      return query select false, 'PROPOSED_DRIFT'::text, v_curr, v_prop; return;
    end if;
  else
    if (v_curr #>> '{}') is distinct from v_actual_url then
      return query select false, 'CURRENT_DRIFT'::text, v_curr, v_prop; return;
    end if;
    if v_actual_url is null or v_actual_url ~* '^https?://\S+$' then
      return query select false, 'URL_NOT_MALFORMED'::text, v_curr, v_prop; return;
    end if;
  end if;
  return query select true, 'READY'::text, v_curr, v_prop;
end;
$$;
revoke all on function public.agent_remedy_apply_validate(uuid) from public, anon, authenticated, service_role;
grant execute on function public.agent_remedy_apply_validate(uuid) to service_role;
