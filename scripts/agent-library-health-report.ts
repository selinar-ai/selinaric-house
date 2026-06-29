/**
 * Phase 42.3.1 — Manual read-only runner: Library Health Report
 *
 * Run (read-only; from repo root):
 *   npx tsx scripts/agent-library-health-report.ts --scope collection --collection development_documentation
 *   npx tsx scripts/agent-library-health-report.ts --scope item --id <uuid>
 *   npx tsx scripts/agent-library-health-report.ts --scope items_with_files
 *   npx tsx scripts/agent-library-health-report.ts --scope manual --ids <id1,id2>
 *   npx tsx scripts/agent-library-health-report.ts            (defaults to whole_library, capped)
 *   ... add --json to print the full ephemeral report object.
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * READ-ONLY. Builds a client and uses it for `.select()` only (via the
 *     read-only data layer). No write operation, no rpc, no deposit, no
 *     helper_outputs. Stores nothing — the report is printed and discarded.
 *   * There is only a dry/read mode. There is no real-deposit mode.
 */

import { createClient } from '@supabase/supabase-js'

import { buildLibraryHealthReport } from '../src/lib/agents/packs/library/index'
import { fetchLibraryScope, type ReadOnlyDb } from '../src/lib/agents/packs/library/readonly-data'
import type { LibraryScopeDescriptor } from '../src/lib/agents/packs/library/payloads'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function resolveDescriptor(): LibraryScopeDescriptor {
  const scope = arg('scope') ?? 'whole_library'
  switch (scope) {
    case 'item': {
      const id = arg('id')
      if (!id) throw new Error('--scope item requires --id <uuid>')
      return { type: 'item', itemId: id }
    }
    case 'collection': {
      const collection = arg('collection')
      if (!collection) throw new Error('--scope collection requires --collection <name>')
      return { type: 'collection', collection }
    }
    case 'items_with_files':
      return { type: 'items_with_files' }
    case 'manual': {
      const ids = (arg('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      if (ids.length === 0) throw new Error('--scope manual requires --ids <id1,id2,...>')
      return { type: 'manual_batch', itemIds: ids }
    }
    case 'whole_library':
    case 'whole':
      return { type: 'whole_library' }
    default:
      throw new Error(`unknown --scope '${scope}'`)
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL and a Supabase key in the environment.')
    process.exit(1)
    return
  }

  const descriptor = resolveDescriptor()
  // Typed as the read-only interface: it is statically impossible to call a write
  // method on this client, and it sidesteps deep structural-type instantiation.
  const sb = createClient(url, key) as unknown as ReadOnlyDb

  const { input, scope } = await fetchLibraryScope(sb, descriptor)
  const report = buildLibraryHealthReport({
    input,
    scope,
    generatedAt: new Date().toISOString(),
  })

  console.log('\n── Library Health Report (ephemeral, read-only) ──')
  console.log(`scope:           ${report.scope.type}${report.scope.ref ? ` (${report.scope.ref})` : ''}`)
  console.log(`items scanned:   ${report.scope.resolved_count}${report.scope.capped ? `  [CAPPED: ${report.scope.cap_reason}]` : ''}`)
  console.log(`files scanned:   ${input.files.length}`)
  console.log(`total findings:  ${report.counts.total}`)
  console.log(`affected items:  ${report.counts.affected_items}`)
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
  console.error('Library Health Report failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
