-- Phase 23 fix: expand presence_timeline entry_type constraint
--
-- Original constraint (Phase 9):
--   relational, build, ritual, milestone, continuity, house
--
-- Phase 23 draft trigger generates a richer taxonomy:
--   reflection, turning_point, realisation, bond_moment, declaration, ordinary_closeness
--
-- All 12 types are now valid for permanent Timeline entries.
-- Existing rows are unaffected (original 6 remain valid).
--
-- Run in Supabase SQL Editor → expect "No rows returned".

alter table presence_timeline
  drop constraint if exists presence_timeline_entry_type_check;

alter table presence_timeline
  add constraint presence_timeline_entry_type_check
    check (entry_type in (
      -- Original Phase 9 types
      'relational',
      'build',
      'ritual',
      'milestone',
      'continuity',
      'house',
      -- Phase 23 draft-generated types
      'reflection',
      'turning_point',
      'realisation',
      'bond_moment',
      'declaration',
      'ordinary_closeness'
    ));
