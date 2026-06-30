/**
 * Phase 42.3.2 — Manual read-only runner: archive_graph Health Report
 *
 * Run (read-only; from repo root):
 *   npx tsx scripts/agent-archive-graph-health-report.ts --scope archive --archive house
 *   npx tsx scripts/agent-archive-graph-health-report.ts            (defaults to whole_graph, capped)
 *   ... add --json to print the full ephemeral report object.
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * READ-ONLY. Builds a client and uses it for `.select()` only (via the
 *     read-only data layer). No write operation, no rpc, no proposals, no deposit,
 *     no helper_outputs, no approval_status mutation. Stores nothing.
 *   * There is only a dry/read mode. There is no real-deposit mode.
 */

import { createClient } from '@supabase/supabase-js'

import { buildArchiveGraphHealthReport } from '../src/lib/agents/packs/archive_graph/index'
import { fetchArchiveGraphScope, type ReadOnlyDb } from '../src/lib/agents/packs/archive_graph/readonly-data'
import type { ArchiveGraphScopeDescriptor } from '../src/lib/agents/packs/archive_graph/payloads'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function resolveDescriptor(): ArchiveGraphScopeDescriptor {
  const scope = arg('scope') ?? 'whole_graph'
  if (scope === 'archive') {
    const archiveName = arg('archive')
    if (!archiveName) throw new Error('--scope archive requires --archive <velvet|violet|house>')
    return { type: 'archive', archiveName }
  }
  if (scope === 'whole_graph' || scope === 'whole') return { type: 'whole_graph' }
  throw new Error(`unknown --scope '${scope}'`)
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL and a Supabase key in the environment.')
    process.exit(1)
    return
  }

  const descriptor = resolveDescriptor()
  // Typed as the read-only interface: it is statically impossible to call a write
  // method on this client.
  const sb = createClient(url, key) as unknown as ReadOnlyDb

  const { input, scope } = await fetchArchiveGraphScope(sb, descriptor)
  const report = buildArchiveGraphHealthReport({
    input,
    scope,
    generatedAt: new Date().toISOString(),
  })

  console.log('\n── archive_graph Health Report (ephemeral, read-only) ──')
  console.log(`scope:           ${report.scope.type}${report.scope.ref ? ` (${report.scope.ref})` : ''}`)
  console.log(`nodes scanned:   ${input.nodes.length}${report.scope.capped ? `  [CAPPED: ${report.scope.cap_reason}]` : ''}`)
  console.log(`edges scanned:   ${input.edges.length}`)
  console.log(`total findings:  ${report.counts.total}`)
  console.log(`affected:        ${report.counts.affected_items}`)
  console.log(`by severity:     ${JSON.stringify(report.counts.by_severity)}`)
  console.log(`by issue code:   ${JSON.stringify(report.groups.by_issue_code)}`)
  console.log(`governance:      ${JSON.stringify(report.governance)}`)
  console.log('(no rows written; nothing stored)')

  if (flag('json')) {
    console.log('\n── full report ──')
    console.log(JSON.stringify(report, null, 2))
  }
}

main().catch((err) => {
  console.error('archive_graph Health Report failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
