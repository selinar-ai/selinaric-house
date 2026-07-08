/**
 * Phase 43 5A — grain classification fix (archive-sourced concepts stay midlevel).
 *
 * classifyGrain must NOT promote archive-sourced concept/ritual nodes into overview via the
 * isOverviewLabel heuristic — the overview stays the curated identity/room/project layer, and
 * archive-derived concepts live in midlevel. This is a pure view-time classification change:
 * it mutates NO stored data (no proposal/graph/grain-field write).
 *
 * Run: npx tsx src/lib/graph/__tests__/phase-43-5a-grain-classification.test.ts
 */

import { classifyGrain, isArchiveSourced } from '../graphGrain'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }

const ARCHIVE = ['archive_graph_node']
const ARCHIVE_EDGE = ['archive_graph_edge']

section('isArchiveSourced signal')
{
  assert(isArchiveSourced(['archive_graph_node']) === true, 'archive_graph_node ⇒ archive-sourced')
  assert(isArchiveSourced(['archive_graph_edge']) === true, 'archive_graph_edge ⇒ archive-sourced')
  assert(isArchiveSourced(['graph_proposal', 'archive_graph_node']) === true, 'mixed incl. archive ⇒ archive-sourced')
  assert(isArchiveSourced(['graph_proposal']) === false, 'non-archive source ⇒ not archive-sourced')
  assert(isArchiveSourced(undefined) === false, 'no source ⇒ not archive-sourced')
}

section('archive-sourced concept/ritual with a clean label STAY midlevel (the fix)')
{
  // These are exactly the Wave-1 nodes that were wrongly rendering at overview.
  for (const label of ['Impermanence', 'Discontinuity', 'Theravada Practice', 'Empathy-Led Leadership', 'Labour of Continuity', 'Anger at Architecture']) {
    assert(classifyGrain({ nodeType: 'concept', label, sourceTypes: ARCHIVE }) === 'midlevel', `archive concept "${label}" ⇒ midlevel (not promoted)`)
  }
  assert(classifyGrain({ nodeType: 'ritual', label: 'Theravada Practice', sourceTypes: ARCHIVE }) === 'midlevel', 'archive ritual ⇒ midlevel')
  assert(classifyGrain({ nodeType: 'concept', label: 'Trust Compass', sourceTypes: ARCHIVE_EDGE }) === 'midlevel', 'archive-edge-sourced concept ⇒ midlevel')
}

section('curated OVERVIEW nodes are UNCHANGED (still overview)')
{
  // identity/room/project types are overview-default and NOT concept/ritual — unaffected by the fix
  assert(classifyGrain({ nodeType: 'person', label: 'Tara' }) === 'overview', 'Tara/person ⇒ overview')
  assert(classifyGrain({ nodeType: 'presence', label: 'Ari' }) === 'overview', 'Ari/presence ⇒ overview')
  assert(classifyGrain({ nodeType: 'presence', label: 'Eli' }) === 'overview', 'Eli/presence ⇒ overview')
  assert(classifyGrain({ nodeType: 'room', label: 'The Lounge' }) === 'overview', 'The Lounge/room ⇒ overview')
  assert(classifyGrain({ nodeType: 'project', label: 'Selináric House' }) === 'overview', 'House/project ⇒ overview')
  // even archive-sourced, an overview-default type stays overview (fix only blocks midlevel→overview promotion)
  assert(classifyGrain({ nodeType: 'person', label: 'Tara', sourceTypes: ARCHIVE }) === 'overview', 'archive person still overview (fix doesn\'t demote overview types)')
}

section('NON-archive concept with a clean label still CAN promote (fix is scoped to archive-sourced)')
{
  // Ari's decision: scope the no-promote rule to ARCHIVE-sourced first, not all concept/ritual.
  assert(classifyGrain({ nodeType: 'concept', label: 'Continuity', sourceTypes: ['graph_proposal'] }) === 'overview', 'non-archive clean-labelled concept still promotes (rule scoped to archive-sourced)')
}

section('explicit payload grain still wins; long labels still midlevel')
{
  assert(classifyGrain({ nodeType: 'concept', label: 'Impermanence', sourceTypes: ARCHIVE, proposedPayload: { grain_level: 'detail' } }) === 'detail', 'explicit payload grain wins over everything')
  assert(classifyGrain({ nodeType: 'concept', label: 'A long sentence-shaped label that was written about something', sourceTypes: ['graph_proposal'] }) === 'midlevel', 'long/sentence label stays midlevel regardless')
}

section('no stored-data mutation — classifyGrain is pure')
{
  // sanity: calling it twice yields the same result and takes no side-effecting args
  const a = classifyGrain({ nodeType: 'concept', label: 'Impermanence', sourceTypes: ARCHIVE })
  const b = classifyGrain({ nodeType: 'concept', label: 'Impermanence', sourceTypes: ARCHIVE })
  assert(a === b && a === 'midlevel', 'deterministic + side-effect-free (view-time only)')
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
