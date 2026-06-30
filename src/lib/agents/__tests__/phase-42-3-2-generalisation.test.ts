/**
 * Phase 42.3.2 — Acceptance Test A: Generalisation (T-GEN), runtime half
 *
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-2-generalisation.test.ts
 *
 * Proves the kernel hosts a REAL second domain (archive_graph) with no kernel
 * change: the pack registers on the kernel's own registry, builds via the kernel's
 * own report builder, and the report carries the kernel's own governance flags
 * (same object), not a pack-local copy. The "kernel diff is empty" half of T-GEN
 * is verified at report time via `git diff main -- src/lib/agents/kernel/`.
 *
 * Pure. No DB, no Supabase, no LLM, no writes.
 */

import { createInspectorRegistry } from '../kernel/registry'
import { buildReport } from '../kernel/report'
import { KERNEL_GOVERNANCE_FLAGS } from '../kernel/types'
import { archiveGraphInspectors, createArchiveGraphRegistry, buildArchiveGraphHealthReport } from '../packs/archive_graph/index'
import type { ArchiveGraphScopeInput } from '../packs/archive_graph/payloads'

let passed = 0
let failed = 0
const failures: string[] = []
function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}
function section(name: string) { console.log(`\n── ${name} ──`) }

const input: ArchiveGraphScopeInput = {
  nodes: [
    { id: 'n_a', archive_name: 'house', label: 'A', node_type: 'concept', approval_status: 'approved', source_item_ids: ['x'] },
    { id: 'n_orphan', archive_name: 'house', label: 'Orphan', node_type: 'concept', approval_status: 'approved', source_item_ids: ['x'] },
  ],
  edges: [],
}

section('A. archive_graph registers + reports on the kernel, unchanged')
// Using the KERNEL's own registry + report builder directly (not a pack copy):
const reg = createInspectorRegistry<ArchiveGraphScopeInput, unknown>()
for (const i of archiveGraphInspectors) reg.register(i as never)
assert(reg.list('archive_graph').length === 4, 'four archive_graph inspectors register on the kernel registry')

const viaKernel = buildReport({
  domain: 'archive_graph',
  scope: { type: 'whole_graph', resolved_count: input.nodes.length, capped: false },
  generatedAt: 'T',
  inspectors: archiveGraphInspectors,
  input,
})
assert(viaKernel.domain === 'archive_graph', 'kernel report carries the archive_graph domain')
assert(viaKernel.run_type === 'health_report', 'kernel report run_type is health_report')
assert(viaKernel.findings.some((f) => f.issue_code === 'graph_node_orphaned'), 'kernel report produced a graph finding')

section('A. pack reuses the kernel governance flags (same object, no pack copy)')
const report = buildArchiveGraphHealthReport({ input, scope: { type: 'whole_graph', resolved_count: 2, capped: false }, generatedAt: 'T' })
assert(report.governance === KERNEL_GOVERNANCE_FLAGS, 'report.governance IS the kernel-exported flags (identity)')
assert(createArchiveGraphRegistry().list('archive_graph').length === 4, 'pack registry registers exactly its four inspectors')

console.log(`\n══════════════════════════════════════════`)
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log(`  (kernel-diff-empty half of T-GEN verified at report time via git)`)
console.log(`══════════════════════════════════════════`)
if (failed > 0) { console.log('Failures:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
