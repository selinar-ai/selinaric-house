/**
 * Phase 42.3.2 — Scope caps (T-CAP) + surface guard (T-SCOPE)
 *
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-2-scope-caps.test.ts
 *
 * T-CAP : applyScopeCaps truncates over-cap node/edge scopes and DECLARES it.
 * T-SCOPE: inspectors + data layer read ONLY archive_graph_nodes/edges — never
 *          graph_proposals / graph_candidate_suggestions / archive_items / helper_outputs.
 *
 * Pure. No DB, no Supabase, no LLM, no writes.
 */

import * as fs from 'fs'

import { applyScopeCaps } from '../packs/archive_graph/readonly-data'
import { MAX_NODES_PER_REPORT, MAX_EDGES_SCANNED } from '../packs/archive_graph/payloads'
import type { ArchiveGraphEdgeRecord, ArchiveGraphNodeRecord } from '../packs/archive_graph/payloads'

let passed = 0
let failed = 0
const failures: string[] = []
function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}
function section(name: string) { console.log(`\n── ${name} ──`) }
function readSrc(rel: string): string {
  if (!fs.existsSync(rel)) throw new Error(`expected source file not found (run from repo root): ${rel}`)
  return fs.readFileSync(rel, 'utf8')
}

function mkNode(id: string): ArchiveGraphNodeRecord {
  return { id, archive_name: 'house', label: id, node_type: 'concept', approval_status: 'approved', source_item_ids: ['x'] }
}
function mkEdge(id: string): ArchiveGraphEdgeRecord {
  return { id, archive_name: 'house', from_node_id: 'a', to_node_id: 'b', edge_type: 'anchors', approval_status: 'approved', source_item_ids: ['s'] }
}

section('T-CAP — over-cap nodes truncate and declare')
const manyNodes = Array.from({ length: MAX_NODES_PER_REPORT + 1 }, (_, i) => mkNode(`n${i}`))
const cappedN = applyScopeCaps(manyNodes, [], { type: 'whole_graph' })
assert(cappedN.input.nodes.length === MAX_NODES_PER_REPORT, `nodes truncated to ${MAX_NODES_PER_REPORT}`)
assert(cappedN.scope.capped === true, 'scope.capped true')
assert((cappedN.scope.cap_reason ?? '').includes('nodes capped'), 'cap_reason explains node truncation')

section('T-CAP — over-cap edges truncate and declare')
const manyEdges = Array.from({ length: MAX_EDGES_SCANNED + 1 }, (_, i) => mkEdge(`e${i}`))
const cappedE = applyScopeCaps([mkNode('a')], manyEdges, { type: 'archive', archiveName: 'house' })
assert(cappedE.input.edges.length === MAX_EDGES_SCANNED, `edges truncated to ${MAX_EDGES_SCANNED}`)
assert(cappedE.scope.capped === true, 'scope.capped true on edge overflow')
assert((cappedE.scope.cap_reason ?? '').includes('edges capped'), 'cap_reason explains edge truncation')
assert(cappedE.scope.ref === 'house', 'archive scope ref recorded')

section('T-CAP — under-cap not flagged')
const small = applyScopeCaps([mkNode('a')], [mkEdge('e')], { type: 'whole_graph' })
assert(small.scope.capped === false && small.scope.cap_reason === undefined, 'small scope not capped')

section('T-SCOPE — inspectors & data layer read only archive_graph_nodes/edges')
const surfaceFiles = [
  'src/lib/agents/packs/archive_graph/inspectors.ts',
  'src/lib/agents/packs/archive_graph/readonly-data.ts',
]
const forbiddenTables = ["'graph_proposals'", "'graph_candidate_suggestions'", "'archive_items'", "'helper_outputs'"]
for (const rel of surfaceFiles) {
  const src = readSrc(rel)
  for (const tok of forbiddenTables) assert(!src.includes(tok), `${rel} does not query ${tok}`)
}
const dataSrc = readSrc('src/lib/agents/packs/archive_graph/readonly-data.ts')
assert(dataSrc.includes('.select('), 'data layer uses .select()')
assert(dataSrc.includes("'archive_graph_nodes'"), 'data layer reads archive_graph_nodes')
assert(dataSrc.includes("'archive_graph_edges'"), 'data layer reads archive_graph_edges')

console.log(`\n══════════════════════════════════════════`)
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log(`══════════════════════════════════════════`)
if (failed > 0) { console.log('Failures:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
