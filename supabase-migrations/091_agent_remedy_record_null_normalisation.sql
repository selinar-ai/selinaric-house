-- Phase 43.C patch — normalise SQL NULL plan-value arguments to JSON null in agent_remedy_plan_record
--
-- Found by the halted path-real smoke (nothing was recorded; the halt was clean):
-- PostgREST cannot express a jsonb 'null' argument — a JS null arrives as SQL NULL.
-- jsonb_typeof(SQL NULL) is SQL NULL, so guards written as `<> 'null'` evaluate to NULL
-- (not true) and silently pass; the INSERT then dies on the column's NOT NULL constraint.
-- Correct rows were therefore IMPOSSIBLE to record for A1 (current = JSON null) and
-- A2 (proposed = JSON null). Fail-closed throughout — no wrong row was ever writable.
--
-- Fix (this migration redefines ONLY agent_remedy_plan_record; identical signature and
-- RETURNS shape — no 42P13 exposure; apply/rollback/validate already handle stored
-- JSON-null values correctly and are untouched):
--   * coalesce(p_current_value, 'null'::jsonb) and coalesce(p_proposed_value, 'null'::jsonb)
--     at entry — the caller's SQL NULL now MEANS JSON null, matching the arp_class_typed
--     branches and the NOT NULL columns.
--   * all other guards unchanged; with normalised inputs they now evaluate as designed
--     (e.g. title_trim's VALUES_MUST_BE_STRINGS correctly raises on a null argument).
--
-- Run via: Supabase SQL Editor -> paste -> Run. Success = "No rows returned".
-- Rollback notes (manual): re-run the agent_remedy_plan_record definition from 090.

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
  v_current jsonb := coalesce(p_current_value, 'null'::jsonb);   -- SQL NULL argument ⇒ JSON null
  v_proposed jsonb := coalesce(p_proposed_value, 'null'::jsonb); -- SQL NULL argument ⇒ JSON null
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
    if jsonb_typeof(v_current) <> 'string' or jsonb_typeof(v_proposed) <> 'string' then
      raise exception 'VALUES_MUST_BE_STRINGS';
    end if;
    if (v_current #>> '{}') is distinct from v_actual_title then
      raise exception 'CURRENT_VALUE_MISMATCH';
    end if;
    if (v_proposed #>> '{}') <> pg_catalog.btrim(v_actual_title, ' ') then
      raise exception 'PROPOSED_NOT_TRIM_OF_TARGET';
    end if;
    if (v_proposed #>> '{}') = '' then
      raise exception 'PROPOSED_EMPTY';
    end if;
    if (v_proposed #>> '{}') = v_actual_title then
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
    -- supplied current must faithfully record the live prior label (JSON null or blank string)
    if not ( (jsonb_typeof(v_current) = 'null' and v_actual_label is null)
          or (jsonb_typeof(v_current) = 'string'
              and (v_current #>> '{}') is not distinct from v_actual_label) ) then
      raise exception 'CURRENT_VALUE_MISMATCH';
    end if;
    -- recompute the label from the LIVE title (regex-free first-em-dash rule)
    if v_actual_title not like 'Phase %' or position('—' in v_actual_title) = 0 then
      raise exception 'TITLE_NOT_CONVENTIONAL';
    end if;
    v_derived := pg_catalog.btrim(pg_catalog.substr(v_actual_title, position('—' in v_actual_title) + 1), ' ');
    if v_derived = '' then
      raise exception 'TITLE_NOT_CONVENTIONAL';
    end if;
    if jsonb_typeof(v_proposed) <> 'string' or (v_proposed #>> '{}') <> v_derived then
      raise exception 'PROPOSED_NOT_DERIVED_FROM_TITLE';
    end if;
    -- observed-title provenance: the reason must carry the exact title the label came from
    if position(v_actual_title in p_deterministic_reason) = 0 then
      raise exception 'REASON_MISSING_OBSERVED_TITLE';
    end if;

  else -- library_source_url_clear_non_url
    if jsonb_typeof(v_current) <> 'string' then
      raise exception 'VALUES_MUST_BE_STRINGS';
    end if;
    if jsonb_typeof(v_proposed) <> 'null' then
      raise exception 'PROPOSED_NOT_NULL';
    end if;
    if v_actual_url is null or pg_catalog.btrim(v_actual_url) = '' then
      raise exception 'URL_NOT_MALFORMED';
    end if;
    if (v_current #>> '{}') is distinct from v_actual_url then
      raise exception 'CURRENT_VALUE_MISMATCH';
    end if;
    -- SQL twin of the shipped helper predicate (parity locked by shared test vectors)
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
    v_current, v_proposed, p_deterministic_reason, 'proposed', coalesce(p_test_owned, false)
  )
  returning agent_remedy_plans.id, agent_remedy_plans.finding_id, agent_remedy_plans.action_type,
            agent_remedy_plans.target_table, agent_remedy_plans.target_field, agent_remedy_plans.plan_state;
end;
$$;
revoke all on function public.agent_remedy_plan_record(uuid, text, jsonb, jsonb, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.agent_remedy_plan_record(uuid, text, jsonb, jsonb, text, boolean) to service_role;
