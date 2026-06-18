-- Phase 41.14 — Helper Review Event read-only trace (narrow definer read)
-- Additive. ONE SECURITY DEFINER function that returns SAFE review-event
-- summaries for a given set of helper outputs.
--
-- Why a definer function: helper_review_events stays strict — service_role has
-- INSERT only, no SELECT, RLS enabled with 0 policies, no public/anon/
-- authenticated access (migration 077 + the live grant-hardening). This function
-- is owned by the migration role (which can read the table) and runs as definer,
-- so the app server can read safe summaries WITHOUT the events table ever being
-- granted a direct SELECT, and without the browser ever touching it.
--
-- Read-only and non-authoritative. A review event is a trace of workflow
-- movement — it records that Tara reviewed a helper output. It is not Memory,
-- not evidence, not prompt authority, not proof of correctness.
--
-- Hardening (Ari): schema-qualified function + table; tight search_path
-- (pg_catalog, pg_temp — body is fully qualified, so public is not needed on the
-- path); safe fields only; deterministic order (created_at asc); null/empty
-- input never means "return all"; execute reset on every grantee then granted
-- ONLY to service_role; no broad table SELECT grant; no table policies added.

create or replace function public.helper_review_events_for_outputs(p_helper_output_ids uuid[])
returns table (
  id uuid,
  helper_output_id uuid,
  previous_review_state text,
  new_review_state text,
  action text,
  actor text,
  created_at timestamptz,
  authority_changed boolean,
  not_memory boolean,
  not_evidence boolean,
  not_prompt_authority boolean
)
language sql
security definer
set search_path = pg_catalog, pg_temp
stable
as $$
  select e.id, e.helper_output_id, e.previous_review_state, e.new_review_state,
         e.action, e.actor, e.created_at,
         e.authority_changed, e.not_memory, e.not_evidence, e.not_prompt_authority
  from public.helper_review_events e
  where p_helper_output_ids is not null
    and cardinality(p_helper_output_ids) >= 1
    and e.helper_output_id = any (p_helper_output_ids)
  order by e.created_at asc, e.id asc;
$$;

-- Execute permissions — strict reset on every grantee, then grant the single
-- server-side role. Browser roles (anon / authenticated) and public cannot call
-- it; the events table itself is never granted SELECT.
revoke all on function public.helper_review_events_for_outputs(uuid[]) from public;
revoke all on function public.helper_review_events_for_outputs(uuid[]) from anon;
revoke all on function public.helper_review_events_for_outputs(uuid[]) from authenticated;
revoke all on function public.helper_review_events_for_outputs(uuid[]) from service_role;
grant execute on function public.helper_review_events_for_outputs(uuid[]) to service_role;
