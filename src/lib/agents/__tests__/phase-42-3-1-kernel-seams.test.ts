/**
 * Phase 42.3.1 — Acceptance Test A: Generic seams (T-SEAM)
 *
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-1-kernel-seams.test.ts
 *
 * Proves a hypothetical SECOND domain pack plugs into the kernel with NO change
 * to the kernel types and NO change to the report lifecycle. This file imports
 * ONLY the generic kernel (no Library code) and defines a throwaway 'demo' domain
 * inspector with its own payload — if that compiles and the report builds, the
 * seams are generic.
 *
 * Pure. No DB, no Supabase, no LLM, no writes.
 */

import { createInspectorRegistry } from '../kernel/registry'
import { buildReport } from '../kernel/report'
import type { AgentReportScope, Inspector } from '../kernel/types'

let passed = 0
let failed = 0
const failures: string[] = []
function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}
function section(name: string) { console.log(`\n── ${name} ──`) }

// ── A throwaway SECOND domain, defined entirely outside the kernel ──
type DemoInput = { widgets: { id: string; broken: boolean }[] }
type DemoPayload = { detail: string }

const demoInspector: Inspector<DemoInput, DemoPayload> = {
  id: 'demo.broken_widget',
  domain: 'demo',
  issue_codes: ['widget_broken'],
  level: 'L1',
  tables_read: ['widgets'],
  run(input) {
    return input.widgets
      .filter((w) => w.broken)
      .map((w) => ({
        domain: 'demo',
        capability_id: 'demo.broken_widget',
        issue_code: 'widget_broken',
        target_ref: { table: 'widgets', id: w.id },
        severity: 'low' as const,
        review_burden: 'low' as const,
        summary: 'widget is broken',
        payload: { detail: 'broken flag set' },
      }))
  },
}

section('A. A second domain registers and reports with zero kernel change')

const registry = createInspectorRegistry<DemoInput, DemoPayload>()
registry.register(demoInspector)
assert(registry.list('demo').length === 1, 'demo inspector registered and listed by domain')
assert(registry.list('library').length === 0, 'unrelated domain returns no inspectors')

const scope: AgentReportScope = { type: 'all', resolved_count: 2, capped: false }
const report = buildReport<DemoInput, DemoPayload>({
  domain: 'demo',
  scope,
  generatedAt: '2026-06-29T00:00:00.000Z',
  inspectors: registry.list('demo'),
  input: { widgets: [{ id: 'w1', broken: true }, { id: 'w2', broken: false }] },
})

assert(report.domain === 'demo', 'report carries the demo domain')
assert(report.run_type === 'health_report', 'report run_type is health_report')
assert(report.findings.length === 1, 'one broken widget became one finding')
assert(report.findings[0].issue_code === 'widget_broken', 'finding issue_code preserved')
assert(report.findings[0].payload.detail === 'broken flag set', 'domain-typed payload preserved')
assert(report.counts.total === 1, 'counts.total derived generically')
assert(report.counts.affected_items === 1, 'affected_items derived generically')
assert(report.groups.by_issue_code['widget_broken'] === 1, 'grouping derived generically')
assert(report.governance.not_memory === true && report.governance.authority_changed === false,
  'governance flags stamped by the kernel')

section('A. Duplicate registration is rejected')
let threw = false
try { registry.register(demoInspector) } catch { threw = true }
assert(threw, 'registering the same inspector id twice throws')

// ── summary ──
console.log(`\n══════════════════════════════════════════`)
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log(`══════════════════════════════════════════`)
if (failed > 0) { console.log('Failures:'); for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
