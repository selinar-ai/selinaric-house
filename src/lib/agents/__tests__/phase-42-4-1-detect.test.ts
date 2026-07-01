/**
 * Phase 42.4.1 — pure deterministic graph-proposal detector.
 * Run: npx tsx src/lib/agents/__tests__/phase-42-4-1-detect.test.ts
 */

import {
  computeSharedSourceProposals, computeGraphDedupeKey, computeInputHash,
  type GraphNode, type ExistingEdge,
} from '../graph_proposals/detect'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
const CAPS = { maxNodes: 500, maxPairs: 5000, maxProposals: 200 }
function node(id: string, archive: string, approval: string, sources: string[]): GraphNode {
  return { id, archive_name: archive, approval_status: approval, source_item_ids: sources }
}

console.log('\n── shared-source candidate generation ──')
{
  const nodes = [node('n1', 'X', 'approved', ['s1', 's2']), node('n2', 'X', 'approved', ['s2', 's3'])]
  const r = computeSharedSourceProposals(nodes, [], CAPS)
  assert(r.proposals.length === 1, 'two approved same-archive nodes sharing a source → 1 proposal')
  const p = r.proposals[0]
  assert(p.from_node_id === 'n1' && p.to_node_id === 'n2', 'canonical from<to')
  assert(JSON.stringify(p.source_item_ids) === JSON.stringify(['s2']), 'source_item_ids = sorted shared intersection')
  assert(p.dedupe_key === computeGraphDedupeKey('n1', 'n2'), 'dedupe_key set')
}

console.log('\n── exclusions ──')
assert(computeSharedSourceProposals([node('a', 'X', 'pending', ['s1']), node('b', 'X', 'approved', ['s1'])], [], CAPS).proposals.length === 0, 'non-approved node excluded')
assert(computeSharedSourceProposals([node('a', 'X', 'approved', ['s1']), node('b', 'Y', 'approved', ['s1'])], [], CAPS).proposals.length === 0, 'different archive → no proposal')
assert(computeSharedSourceProposals([node('a', 'X', 'approved', ['s1']), node('b', 'X', 'approved', ['s2'])], [], CAPS).proposals.length === 0, 'no shared source → no proposal')
assert(computeSharedSourceProposals([node('a', 'X', 'approved', ['s1'])], [], CAPS).proposals.length === 0, 'single node → no self-loop / no proposal')

console.log('\n── skip existing shared_source edge (either direction) ──')
{
  const nodes = [node('n1', 'X', 'approved', ['s1']), node('n2', 'X', 'approved', ['s1'])]
  const fwd: ExistingEdge[] = [{ from_node_id: 'n1', to_node_id: 'n2', edge_type: 'shared_source' }]
  const rev: ExistingEdge[] = [{ from_node_id: 'n2', to_node_id: 'n1', edge_type: 'shared_source' }]
  const other: ExistingEdge[] = [{ from_node_id: 'n1', to_node_id: 'n2', edge_type: 'other_type' }]
  assert(computeSharedSourceProposals(nodes, fwd, CAPS).proposals.length === 0, 'existing shared_source edge (fwd) → skip')
  assert(computeSharedSourceProposals(nodes, rev, CAPS).proposals.length === 0, 'existing shared_source edge (rev) → skip')
  assert(computeSharedSourceProposals(nodes, other, CAPS).proposals.length === 1, 'different edge_type does NOT skip')
}

console.log('\n── dedupe key + input hash are undirected / order-stable ──')
assert(computeGraphDedupeKey('n1', 'n2') === computeGraphDedupeKey('n2', 'n1'), 'dedupe key is undirected')
assert(computeInputHash(['a', 'b', 'c']) === computeInputHash(['c', 'a', 'b']), 'input hash stable regardless of order')

console.log('\n── deterministic + capped ──')
{
  const nodes = [node('n1', 'X', 'approved', ['s']), node('n2', 'X', 'approved', ['s']), node('n3', 'X', 'approved', ['s'])]
  const a = computeSharedSourceProposals(nodes, [], CAPS)
  const b = computeSharedSourceProposals(nodes, [], CAPS)
  assert(JSON.stringify(a.proposals) === JSON.stringify(b.proposals), 'same input → identical output (deterministic)')
  const cap = computeSharedSourceProposals(nodes, [], { maxNodes: 500, maxPairs: 5000, maxProposals: 1 })
  assert(cap.proposals.length === 1 && cap.capped === true, 'maxProposals cap enforced + flagged')
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
