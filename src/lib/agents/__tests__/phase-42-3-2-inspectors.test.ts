/**
 * Phase 42.3.2 — archive_graph inspectors (T-INSP)
 *
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-2-inspectors.test.ts
 *
 * Each inspector emits its issue code in the generic envelope, with archive_graph
 * specifics only inside the payload. Deterministic.
 *
 * Pure. No DB, no Supabase, no LLM, no writes.
 */

import { buildArchiveGraphHealthReport } from '../packs/archive_graph/index'
import type { ArchiveGraphScopeInput } from '../packs/archive_graph/payloads'

let passed = 0
let failed = 0
const failures: string[] = []
function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}
function section(name: string) { console.log(`\n── ${name} ──`) }

// Fixture engineered so exactly one finding of each code fires.
const input: ArchiveGraphScopeInput = {
  nodes: [
    { id: 'n_a', archive_name: 'house', label: 'A', node_type: 'concept', approval_status: 'approved', source_item_ids: ['x'] },
    { id: 'n_b', archive_name: 'house', label: 'B', node_type: 'concept', approval_status: 'approved', source_item_ids: ['x'] },
    { id: 'n_orphan', archive_name: 'house', label: 'Orphan', node_type: 'concept', approval_status: 'approved', source_item_ids: ['x'] },
    { id: 'n_pending', archive_name: 'house', label: 'Pending', node_type: 'concept', approval_status: 'pending', source_item_ids: ['x'] },
    { id: 'n_noprov', archive_name: 'house', label: 'NoProv', node_type: 'concept', approval_status: 'approved', source_item_ids: [] },
  ],
  edges: [
    { id: 'e_good', archive_name: 'house', from_node_id: 'n_a', to_node_id: 'n_b', edge_type: 'anchors', approval_status: 'approved', source_item_ids: ['s'] },
    { id: 'e_endpoint_bad', archive_name: 'house', from_node_id: 'n_a', to_node_id: 'n_pending', edge_type: 'extends', approval_status: 'approved', source_item_ids: ['s'] },
    { id: 'e_noprov', archive_name: 'house', from_node_id: 'n_a', to_node_id: 'n_b', edge_type: 'shaped_by', approval_status: 'approved', source_item_ids: [] },
    { id: 'e_conn', archive_name: 'house', from_node_id: 'n_a', to_node_id: 'n_noprov', edge_type: 'anchors', approval_status: 'approved', source_item_ids: ['s'] },
  ],
}

const report = buildArchiveGraphHealthReport({ input, scope: { type: 'whole_graph', resolved_count: input.nodes.length, capped: false }, generatedAt: 'T' })
const codes = report.findings.map((f) => f.issue_code)
const codeSet = new Set(codes)

section('Each issue code fires exactly as engineered')
for (const c of ['graph_node_orphaned', 'graph_edge_endpoint_not_approved', 'graph_node_no_source_items', 'graph_edge_no_source_items']) {
  assert(codeSet.has(c), `emits ${c}`)
}
assert(codes.filter((c) => c === 'graph_node_orphaned').length === 1, 'exactly one orphan (n_orphan)')
assert(codes.filter((c) => c === 'graph_edge_endpoint_not_approved').length === 1, 'exactly one endpoint integrity (e_endpoint_bad)')
assert(codes.filter((c) => c === 'graph_node_no_source_items').length === 1, 'exactly one node provenance gap (n_noprov)')
assert(codes.filter((c) => c === 'graph_edge_no_source_items').length === 1, 'exactly one edge provenance gap (e_noprov)')

section('Generic envelope; archive_graph specifics only in payload')
const sample = report.findings[0]
const keys = Object.keys(sample).sort().join(',')
assert(keys === ['capability_id', 'domain', 'issue_code', 'payload', 'review_burden', 'severity', 'summary', 'target_ref'].join(','), 'exactly the generic envelope keys')
assert([...new Set(report.findings.map((f) => f.capability_id))].every((c) => c.startsWith('archive_graph.')), 'capability ids are archive_graph.*')
assert(report.findings.every((f) => f.target_ref.table === 'archive_graph_nodes' || f.target_ref.table === 'archive_graph_edges'), 'target_ref points only at archive_graph tables')
assert('approval_status' in sample === false, 'no graph column (approval_status) leaks onto the envelope')

section('Endpoint check skips unverifiable endpoints (not in scope)')
const missingEndpoint = buildArchiveGraphHealthReport({
  input: { nodes: [{ id: 'x', archive_name: 'house', label: 'X', node_type: 'concept', approval_status: 'approved', source_item_ids: ['s'] }],
           edges: [{ id: 'e', archive_name: 'house', from_node_id: 'x', to_node_id: 'not_in_scope', edge_type: 'anchors', approval_status: 'approved', source_item_ids: ['s'] }] },
  scope: { type: 'whole_graph', resolved_count: 1, capped: false }, generatedAt: 'T',
})
assert(!missingEndpoint.findings.some((f) => f.issue_code === 'graph_edge_endpoint_not_approved'), 'endpoint not in scope is skipped, not false-flagged')

section('Determinism')
const again = buildArchiveGraphHealthReport({ input, scope: { type: 'whole_graph', resolved_count: input.nodes.length, capped: false }, generatedAt: 'T' })
assert(JSON.stringify(report) === JSON.stringify(again), 'same input → identical report')

console.log(`\n══════════════════════════════════════════`)
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log(`  Findings: ${report.findings.length}  Codes: ${[...codeSet].sort().join(', ')}`)
console.log(`══════════════════════════════════════════`)
if (failed > 0) { console.log('Failures:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
