/**
 * Phase 42.3.3a — ingest payload + RPC-only write path (pure, fake client)
 * Run: npx tsx src/lib/agents/__tests__/phase-42-3-3a-ingest.test.ts
 */

import type { AgentReport } from '../kernel/types'
import { buildPersistInputs, persistReport, cleanupTestRun, INGEST_RPC, CLEANUP_RPC, type RpcClient } from '../persistence/ingest'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }

const report: AgentReport<Record<string, unknown>> = {
  domain: 'library',
  run_type: 'health_report',
  scope: { type: 'collection', ref: 'development_documentation', resolved_count: 3, capped: false },
  generated_at: 'T',
  governance: { not_memory: true, not_evidence: true, not_authority: true, authority_changed: false, prompt_eligible: false, review_required: true, read_only: true },
  findings: [
    { domain: 'library', capability_id: 'library.metadata', issue_code: 'item_tags_missing', target_ref: { table: 'library_items', id: 'i1', label: 'Item One' }, severity: 'info', review_burden: 'low', summary: 'no tags', payload: { tag_count: 0 } },
  ],
  groups: { by_issue_code: { item_tags_missing: 1 }, by_severity: { info: 1 } },
  counts: { total: 1, by_severity: { info: 1 }, affected_items: 1 },
  excluded: [],
}

async function main() {
  section('buildPersistInputs')
  const inputs = buildPersistInputs(report, { requestedBy: 'system', testOwned: true, scope: { scope_type: 'collection', scope_ref: 'development_documentation' } })
  assert(inputs.run.domain === 'library' && inputs.run.run_type === 'health_report', 'run carries domain + run_type')
  assert(inputs.run.scope_fingerprint === 'development_documentation', 'run carries normalized scope_fingerprint')
  assert(inputs.run.test_owned === true && inputs.run.finding_count === 1, 'run is test-owned with finding_count')
  assert(/^[0-9a-f]{64}$/.test(inputs.findings[0].dedupe_key), 'finding carries computed dedupe_key')
  const fkeys = Object.keys(inputs.findings[0]).sort().join(',')
  assert(
    fkeys === ['capability_id', 'dedupe_key', 'issue_code', 'payload', 'review_burden', 'severity', 'summary', 'target_id', 'target_label', 'target_table'].join(','),
    'finding payload has exactly the ingest fields — no review_state / flags leak',
  )

  section('persistReport — RPC-only write path')
  const calls: { fn: string; params: Record<string, unknown> }[] = []
  const fake: RpcClient = {
    rpc(fn, params) { calls.push({ fn, params }); return Promise.resolve({ data: { run_id: 'r1', finding_count: 1, reconciled: 0 }, error: null }) },
  }
  await persistReport(fake, inputs)
  assert(calls.length === 1 && calls[0].fn === INGEST_RPC, 'persistReport calls the ingest RPC exactly once')
  assert(calls[0].params.p_reconcile === true, 'p_reconcile computed true for non-capped collection scope')
  assert('p_run' in calls[0].params && 'p_findings' in calls[0].params, 'ingest params carry p_run + p_findings')

  section('cleanupTestRun — cleanup RPC')
  calls.length = 0
  const fake2: RpcClient = { rpc(fn, params) { calls.push({ fn, params }); return Promise.resolve({ data: { findings_cleaned: 1, run_cleaned: 1 }, error: null }) } }
  await cleanupTestRun(fake2, 'r1')
  assert(calls.length === 1 && calls[0].fn === CLEANUP_RPC && calls[0].params.p_run_id === 'r1', 'cleanupTestRun calls the cleanup RPC with run id')

  section('error propagation')
  let threw = false
  const errClient: RpcClient = { rpc() { return Promise.resolve({ data: null, error: { message: 'boom' } }) } }
  try { await persistReport(errClient, inputs) } catch { threw = true }
  assert(threw, 'RPC error is surfaced, not swallowed')
}

main().then(() => {
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  Passed: ${passed}\n  Failed: ${failed}`)
  console.log(`══════════════════════════════════════════`)
  if (failed > 0) { for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
})
