/**
 * Phase 41.17.1 — Manual Helper Runner for the Library Documentation Agent (CLI, MANUAL ONLY)
 *
 * Runs the deterministic v1 `library_documentation_helper` against ONE named
 * Library item and deposits inert `helper_outputs` rows into the closed Workshop.
 * The helper and the safe writer are reused UNCHANGED; this is only the manual
 * trigger + a runner-side duplicate guard.
 *
 *   Dry run (preview only — writes NOTHING):
 *     npx tsx scripts/run-library-documentation-helper.ts --confirm-helper-run --library-item-id <id> --dry-run
 *
 *   Test-owned run (default — safe, cleanable):
 *     npx tsx scripts/run-library-documentation-helper.ts --confirm-helper-run --library-item-id <id>
 *
 *   Real deposit (separate approval required — writes non-test rows that persist):
 *     npx tsx scripts/run-library-documentation-helper.ts --confirm-helper-run --library-item-id <id> --deposit-real
 *
 * Boundaries: one named item per run (no "all"); refuses without an explicit
 * confirmation flag; reads only `library_items` / `library_item_files`; INSERT
 * only (never updates/deletes/upserts); never sets review/authority/deleted
 * fields (the writer forbids them); never reads candidate / Memory / Graph
 * surfaces; no route, no migration, no schema change. Never wired to cron, chat,
 * prompts, or the UI — manual invocation only.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

import {
  inspectLibraryDocumentation,
  type LibraryDocItemSnapshot,
  type LibraryDocFileSnapshot,
} from '../src/lib/helpers/libraryDocumentationHelper'
import {
  insertHelperOutputs,
  type HelperOutputDbClient,
  type HelperOutputInsertResult,
} from '../src/lib/helpers/helperOutputStore'
import {
  parseRunnerArgs,
  dedupeKeyForDraft,
  stampRunnerMetadata,
  stampedDedupeKey,
  planDeposit,
  LIBRARY_DOCUMENTATION_HELPER_VERSION,
} from '../src/lib/helpers/libraryDocumentationRunner'
import type { HelperPresenceScope } from '../src/lib/helpers/helperContract'

// ─── arg validation (delegated to the pure runner) ───────────────────────────

const parsed = parseRunnerArgs(process.argv.slice(2))
function refuse(message: string): never {
  console.error(`\n[run-library-documentation-helper] REFUSED: ${message}\n`)
  console.error('Usage:')
  console.error('  Dry run:    --confirm-helper-run --library-item-id <id> --dry-run')
  console.error('  Test-owned: --confirm-helper-run --library-item-id <id>')
  console.error('  Real:       --confirm-helper-run --library-item-id <id> --deposit-real\n')
  process.exit(1)
}
if (!parsed.ok) refuse(parsed.reason)
const { libraryItemId, dryRun, depositReal, runMode } = parsed

// ─── env + PostgREST client (fetch-based; matches the house's other scripts) ─

type Rest = { url: string; headers: Record<string, string> }

function loadEnvAndRest(): Rest {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const envPath = resolve(__dirname, '..', '.env.local')
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const k = t.slice(0, eq).trim()
      let v = t.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v
    }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) refuse('Missing NEXT_PUBLIC_SUPABASE_URL or a Supabase key in .env.local')
  return { url: url.replace(/\/$/, ''), headers: { apikey: key, Authorization: `Bearer ${key}` } }
}

/** INSERT-only client backed by PostgREST. The validated writer does the rest. */
function restHelperOutputClient(rest: Rest): HelperOutputDbClient {
  return {
    from(table) {
      return {
        insert(rows) {
          return {
            async select(_columns): Promise<HelperOutputInsertResult> {
              const res = await fetch(`${rest.url}/rest/v1/${table}`, {
                method: 'POST',
                headers: { ...rest.headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
                body: JSON.stringify(rows),
              })
              if (!res.ok) return { data: null, error: { message: `${res.status} ${await res.text()}` } }
              return { data: (await res.json()) as HelperOutputInsertResult['data'], error: null }
            },
          }
        },
      }
    },
  }
}

async function restGet<T>(rest: Rest, pathAndQuery: string): Promise<T[]> {
  const res = await fetch(`${rest.url}/rest/v1/${pathAndQuery}`, { headers: rest.headers })
  if (!res.ok) refuse(`read failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as T[]
}

// ─── run ─────────────────────────────────────────────────────────────────────

async function main() {
  const rest = loadEnvAndRest()
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}_${randomUUID().slice(0, 8)}`

  // Read ONE library item (+ a count of its files). Read-only; never a scan.
  const itemRows = await restGet<{
    id: string; collection: string | null; presence_scope: string | null
    phase_code: string | null; phase_number: number | null; phase_label: string | null
    file_path: string | null; source_url: string | null; content_text: string | null
  }>(rest, `library_items?id=eq.${encodeURIComponent(libraryItemId)}&select=id,collection,presence_scope,phase_code,phase_number,phase_label,file_path,source_url,content_text`)
  const itemRow = itemRows[0]
  if (!itemRow) refuse(`Library item not found: ${libraryItemId}`)

  const item: LibraryDocItemSnapshot = {
    id: itemRow.id,
    collection: itemRow.collection ?? '',
    presence_scope: (itemRow.presence_scope ?? 'house') as HelperPresenceScope,
    phase_code: itemRow.phase_code ?? null,
    phase_number: itemRow.phase_number ?? null,
    phase_label: itemRow.phase_label ?? null,
    file_path: itemRow.file_path ?? null,
    source_url: itemRow.source_url ?? null,
    content_text: itemRow.content_text ?? null,
  }
  const fileRows = await restGet<{ id: string; library_item_id: string }>(
    rest,
    `library_item_files?library_item_id=eq.${encodeURIComponent(libraryItemId)}&select=id,library_item_id`,
  )
  const files: LibraryDocFileSnapshot[] = fileRows.map((f) => ({ id: f.id, library_item_id: f.library_item_id }))

  console.log(`[run-library-documentation-helper] item ${libraryItemId} · ${files.length} file(s) · mode=${runMode} · helper v${LIBRARY_DOCUMENTATION_HELPER_VERSION}`)

  // Deterministic inspection (clean item → nothing). Then stamp each draft.
  const drafts = inspectLibraryDocumentation(item, files)
  if (drafts.length === 0) {
    console.log('[run-library-documentation-helper] No documentation-structure gaps found — nothing to deposit.')
    process.exit(0)
  }
  const stamped = drafts.map((d) =>
    stampRunnerMetadata(d, { helperVersion: LIBRARY_DOCUMENTATION_HELPER_VERSION, dedupeKey: dedupeKeyForDraft(d), runId, runMode }),
  )

  // Dry run: preview the candidates and write NOTHING (no dedupe query, no insert).
  if (dryRun) {
    console.log(`\n[run-library-documentation-helper] DRY RUN — ${stamped.length} candidate(s), nothing written:`)
    for (const s of stamped) {
      const p = s.suggestion_payload as Record<string, unknown>
      console.log(`  - ${String(p.issue_code)}  (${s.suggested_action})  dedupe=${stampedDedupeKey(s)}`)
    }
    process.exit(0)
  }

  // Dedupe: which keys already exist among ACTIVE (deleted_at is null) rows?
  // No review-state filter — blocks across unreviewed/viewed/needs_action/
  // needs_decision/dismissed. Soft-deleted rows do not block.
  const existing = new Set<string>()
  for (const key of stamped.map(stampedDedupeKey)) {
    if (!key) continue
    const hits = await restGet<{ id: string }>(
      rest,
      `helper_outputs?deleted_at=is.null&suggestion_payload->>_dedupe_key=eq.${encodeURIComponent(key)}&select=id&limit=1`,
    )
    if (hits.length > 0) existing.add(key)
  }

  const plan = planDeposit(stamped, existing)
  if (plan.toInsert.length === 0) {
    console.log(`[run-library-documentation-helper] All ${stamped.length} candidate(s) already active (dedupe) — nothing new deposited.`)
    process.exit(0)
  }

  const inserted = await insertHelperOutputs(restHelperOutputClient(rest), plan.toInsert, { testOwned: !depositReal })

  console.log(`\n[run-library-documentation-helper] Deposited ${inserted.length} row(s) · skipped ${plan.skipped.length} (dedupe) · run_id=${runId} · test_owned=${!depositReal}`)
  for (const r of inserted) console.log(`  - ${r.id}  (${r.helper_type} · ${r.output_status})`)
  if (!depositReal) {
    console.log('\nTest-owned cleanup (soft-delete by run_id):')
    console.log(`  PATCH helper_outputs?test_owned=eq.true&deleted_at=is.null&suggestion_payload->>run_id=eq.${runId}  { "deleted_at": "<now>" }`)
  }
}

main().catch((e) => { console.error(`\n[run-library-documentation-helper] ERROR: ${e?.message ?? e}\n`); process.exit(1) })
