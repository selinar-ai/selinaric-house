-- Phase 41.17.2 — Register the deterministic helper roster pack (3 new types)
--
-- DRAFT — NOT YET APPLIED. For Tara/Ari SQL review. Do not run until approved.
--
-- Mirrors the committed helper contract (src/lib/helpers/helperContract.ts):
--   library_content_health_helper        → reads library_item, library_item_file
--   source_reference_integrity_helper     → reads library_item, library_item_file
--   documentation_completeness_helper      → reads library_item ONLY
--
-- This is the ONLY governed widening Phase 41.17.2 performs. It is additive and
-- whitelist-only. Every roster helper output is still an inert, review-only
-- helper_outputs row — no apply path, no authority.
--
-- Scope (Ari-approved roster pack). This migration may ONLY:
--   (a) widen the ho_helper_type_v1 CHECK to admit the three new helper types
--   (b) update validate_helper_output_source_refs() so each new helper_type maps
--       to ONLY the readable surfaces it strictly needs.
-- It adds NO grants, NO RLS change, NO new policy, NO new table/column, NO change
-- to the apply / work-order / apply-event tables, and NO new suggested_action /
-- output_status / source-surface / confidence / created_by / presence vocabulary.
-- Source surfaces are NOT broadened: completeness reads library_item only.
--
-- Migration success = "No rows returned".

-- (a) Widen the helper_type allow-list to the five v1 helpers. Forbidden helper
--     types remain rejected.
alter table helper_outputs drop constraint ho_helper_type_v1;
alter table helper_outputs add constraint ho_helper_type_v1 check (
  helper_type in (
    'library_metadata_helper',
    'library_documentation_helper',
    'library_content_health_helper',
    'source_reference_integrity_helper',
    'documentation_completeness_helper'
  )
);

-- (b) Update the source-ref validation trigger's helper/surface allow-map.
--     `create or replace` keeps the existing trigger binding
--     (trg_validate_helper_output_source_refs) intact — no trigger re-create.
--     Note: documentation_completeness_helper is restricted to library_item only;
--     forbidden surfaces (incl. helper_output → C1) remain rejected for all.
create or replace function validate_helper_output_source_refs()
returns trigger
language plpgsql
as $$
declare
  ref jsonb;
  surface text;
  sid text;
  readable_surfaces text[] := array[
    'library_item', 'library_item_file', 'archive_item_metadata',
    'graph_proposal_metadata', 'graph_node_metadata', 'graph_edge_metadata',
    'recall_eval_case', 'workshop_build_metadata'
  ];
  allowed_for_helper text[];
begin
  -- Defence-in-depth: the CHECK also enforces non-empty array.
  if jsonb_typeof(NEW.source_refs) is distinct from 'array'
     or jsonb_array_length(NEW.source_refs) < 1 then
    raise exception 'helper_outputs.source_refs must be a non-empty array (row %)', NEW.id;
  end if;

  -- v1 helper/surface allow-list (per-helper minimal surfaces).
  if NEW.helper_type in (
    'library_metadata_helper',
    'library_documentation_helper',
    'library_content_health_helper',
    'source_reference_integrity_helper'
  ) then
    allowed_for_helper := array['library_item', 'library_item_file'];
  elsif NEW.helper_type = 'documentation_completeness_helper' then
    allowed_for_helper := array['library_item'];
  else
    -- The ho_helper_type_v1 CHECK already blocks this; belt-and-braces.
    raise exception 'helper_type % is not v1-allowed', NEW.helper_type;
  end if;

  for ref in select value from jsonb_array_elements(NEW.source_refs)
  loop
    surface := ref->>'source_surface';
    sid := ref->>'source_id';

    if sid is null or length(sid) = 0 then
      raise exception 'helper_outputs source_ref has empty source_id (row %)', NEW.id;
    end if;

    -- (a) Readable-only. Forbidden surfaces (incl. helper_output) rejected.
    if surface is null or not (surface = any(readable_surfaces)) then
      raise exception 'helper_outputs source_ref surface % is not a readable surface (row %)', surface, NEW.id;
    end if;

    -- (b) Helper/surface allow-list.
    if not (surface = any(allowed_for_helper)) then
      raise exception 'helper % may not read source surface % (row %)', NEW.helper_type, surface, NEW.id;
    end if;
  end loop;

  return NEW;
end;
$$;
