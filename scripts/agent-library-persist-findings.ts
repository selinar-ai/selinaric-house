/**
 * Phase 42.3.3a — Library persistence runner (+ Phase 43.A persist-real gate)
 *
 * Run (from repo root, env loaded):
 *   Test-owned (default):
 *     npx tsx scripts/agent-library-persist-findings.ts --scope collection --collection development_documentation
 *   Real (Phase 43.A+; per-run Tara authorisation; never unbounded):
 *     npx tsx scripts/agent-library-persist-findings.ts --scope collection --collection development_documentation \
 *       --persist-real --confirm-persist-real --max-findings <n>
 *   Cleanup (test-owned runs only — the cleanup RPC is structurally test-only):
 *     npx tsx scripts/agent-library-persist-findings.ts --cleanup <run_id>
 *
 * Reads Library source read-only (via the existing pack), builds the ephemeral
 * report, and records it into the durable store through the governed ingest RPC.
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * Writes ONLY through `agent_record_findings` / `agent_findings_cleanup_test_run`
 *     RPCs (service-role execute). No direct table DML. No House-surface writes.
 *   * Default remains test-owned. A REAL run requires BOTH --persist-real and
 *     --confirm-persist-real, must declare --max-findings, and is stamped
 *     requested_by='tara'. The report is built BEFORE persisting; if the finding
 *     count exceeds the cap, NOTHING is persisted.
 */

import { createClient } from '@supabase/supabase-js'

import { buildLibraryHealthReport } from '../src/lib/agents/packs/library/index'
import { fetchLibraryScope, type ReadOnlyDb } from '../src/lib/agents/packs/library/readonly-data'
import type { LibraryScopeDescriptor } from '../src/lib/agents/packs/library/payloads'
import { buildPersistInputs, persistReport, cleanupTestRun, type RpcClient } from '../src/lib/agents/persistence/ingest'
import { resolvePersistGate, findingCapRefusal } from '../src/lib/agents/persistence/gate'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function resolveDescriptor(): LibraryScopeDescriptor {
  const scope = arg('scope') ?? 'whole_library'
  switch (scope) {
    case 'item': { const id = arg('id'); if (!id) throw new Error('--scope item requires --id'); return { type: 'item', itemId: id } }
    case 'collection': { const c = arg('collection'); if (!c) throw new Error('--scope collection requires --collection'); return { type: 'collection', collection: c } }
    case 'items_with_files': return { type: 'items_with_files' }
    case 'manual': { const ids = (arg('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean); if (!ids.length) throw new Error('--scope manual requires --ids'); return { type: 'manual_batch', itemIds: ids } }
    case 'whole_library': case 'whole': return { type: 'whole_library' }
    default: throw new Error(`unknown --scope '${scope}'`)
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (RPC execute is service-role only).')
    process.exit(1)
    return
  }
  const sb = createClient(url, key)

  const cleanupId = arg('cleanup')
  if (cleanupId) {
    const res = await cleanupTestRun(sb as unknown as RpcClient, cleanupId)
    console.log(`cleanup: ${JSON.stringify(res)}`)
    return
  }

  const gate = resolvePersistGate(process.argv.slice(2))
  if (!gate.ok) { console.error(`REFUSED: ${gate.reason}`); process.exit(1); return }

  const descriptor = resolveDescriptor()
  const { input, scope } = await fetchLibraryScope(sb as unknown as ReadOnlyDb, descriptor)
  const report = buildLibraryHealthReport({ input, scope, generatedAt: new Date().toISOString() })

  // Report is built BEFORE persisting — a capped run refuses without writing anything.
  const capRefusal = findingCapRefusal(report.findings.length, gate)
  if (capRefusal) { console.error(capRefusal); process.exit(1); return }

  const inputs = buildPersistInputs(report, {
    requestedBy: gate.requestedBy,
    testOwned: !gate.real,
    scope: {
      scope_type: scope.type,
      scope_ref: scope.ref ?? null,
      item_ids: descriptor.type === 'manual_batch' ? descriptor.itemIds : undefined,
    },
  })

  const result = await persistReport(sb as unknown as RpcClient, inputs)
  console.log(`\n── Library findings persisted (${gate.real ? 'REAL' : 'TEST-OWNED'}) ──`)
  console.log(`run_id:        ${result.run_id}`)
  console.log(`findings:      ${result.finding_count}`)
  console.log(`reconciled:    ${result.reconciled}`)
  if (gate.real) console.log('(REAL rows are the product — no bulk-delete path exists; un-wanting a finding = triage dismissal)')
  else console.log(`(cleanup with: --cleanup ${result.run_id})`)
}

main().catch((err) => {
  console.error('library persist failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
