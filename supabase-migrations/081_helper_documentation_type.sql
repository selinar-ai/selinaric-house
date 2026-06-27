-- Phase 41.17.1 — Register the Library Documentation Helper type
--
-- Mirrors the committed helper contract (src/lib/helpers/helperContract.ts):
--   library_documentation_helper is now v1_allowed, reading the same two
--   readable surfaces as the metadata helper (library_item, library_item_file).
--
-- This is the ONLY governed widening Phase 41.17.1 performs. It is additive and
-- whitelist-only. A documentation helper output is still an inert, review-only
-- helper_outputs row — no apply path, no authority.
--
-- Scope (Ari-approved). This migration may ONLY:
--   (a) widen the ho_helper_type_v1 CHECK to also admit library_documentation_helper
--   (b) update validate_helper_output_source_refs() so the new helper_type maps to
--       the SAME two readable surfaces the existing helper already uses.
-- It adds NO grants, NO RLS change, NO new policy, NO new table/column, NO change
-- to the apply / work-order / apply-events tables, and NO new suggested_action /
-- output_status / source-surface / confidence / created_by / presence vocabulary.
--
-- Migration success = "No rows returned".

-- (a) Widen the helper_type allow-list. Drop the single-value CHECK, re-add it as
--     a closed two-value set. Forbidden helper types remain rejected.
alter table helper_outputs drop constraint ho_helper_type_v1;
alter table helper_outputs add constraint ho_helper_type_v1 check (
  helper_type in ('library_metadata_helper', 'library_documentation_helper')
);

-- (b) Update the source-ref validation trigger's helper/surface allow-map. Both
--     v1 helpers read only library_item / library_item_file. No new surface is
--     admitted; forbidden surfaces (incl. helper_output → C1) remain rejected.
--     `create or replace` keeps the existing trigger binding
--     (trg_validate_helper_output_source_refs) intact — no trigger re-create.
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

  -- v1 helper/surface allow-list. Both v1 helpers read the same two surfaces.
  if NEW.helper_type in ('library_metadata_helper', 'library_documentation_helper') then
    allowed_for_helper := array['library_item', 'library_item_file'];
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
