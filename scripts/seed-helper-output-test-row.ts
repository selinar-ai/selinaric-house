/**
 * Phase 41.5 — Controlled Helper Output Seed (MANUAL ONLY)
 *
 * Run with tsx. Refuses to do anything without an explicit confirmation flag.
 * Creates a TINY number (≤ 3) of test_owned, draft-only, inert helper_outputs
 * rows so the helper → ledger → /helpers review surface path can be verified.
 *
 *   Seed from a built-in fixture (no production Library read):
 *     npx tsx scripts/seed-helper-output-test-row.ts --confirm-test-owned-helper-output
 *
 *   Seed from ONE explicitly named Library item (read-only fetch of that item):
 *     npx tsx scripts/seed-helper-output-test-row.ts --confirm-test-owned-helper-output --library-item-id <id>
 *
 *   Soft-delete (cleanup) a previous run's rows by run_id:
 *     npx tsx scripts/seed-helper-output-test-row.ts --cleanup-test-owned-helper-output --run-id <run_id>
 *
 * Boundaries: no flag = no action. No --library-item-id = no real-target read
 * (never "all"). Cleanup is soft-delete (deleted_at = now()) only, scoped to one
 * run_id and test_owned rows — never a hard delete, never "all". This script
 * runs ONLY when invoked by hand; it is never wired to cron, chat, prompts, or
 * the UI. Every row it writes is test_owned and inert.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

import {
  inspectLibraryItem,
  type LibraryItemSnapshot,
  type LibraryItemFileSnapshot,
} from '../src/lib/helpers/libraryMetadataHelper'
import {
  insertHelperOutputs,
  type HelperOutputDbClient,
  type HelperOutputInsertResult,
  type VerificationRunMarker,
} from '../src/lib/helpers/helperOutputStore'
import type { HelperPresenceScope } from '../src/lib/helpers/helperContract'

const MAX_SEED_ROWS = 3
const VERIFICATION_RUN = 'phase_41_5_controlled_seed'

// ─── arg parsing ─────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
function hasFlag(name: string): boolean {
  return argv.includes(name)
}
function flagValue(name: string): string | null {
  const i = argv.indexOf(name)
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null
}

function refuse(message: string): never {
  console.error(`\n[seed-helper-output] REFUSED: ${message}\n`)
  console.error('Usage:')
  console.error('  Seed (fixture):      --confirm-test-owned-helper-output')
  console.error('  Seed (one item):     --confirm-test-owned-helper-output --library-item-id <id>')
  console.error('  Cleanup (by run):    --cleanup-test-owned-helper-output --run-id <run_id>\n')
  process.exit(1)
}

// ─── env loader + PostgREST client (no supabase-js — avoids the Node<22
//     Realtime/WebSocket requirement; matches the house's fetch-based scripts) ─

type Rest = {
  url: string
  headers: Record<string, string>
}

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

/**
 * Minimal HelperOutputDbClient backed by PostgREST fetch. Only the insert path
 * the writer needs is implemented; it writes to /rest/v1/<table> and returns the
 * representation. This keeps the validated writer (insertHelperOutputs) intact.
 */
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
              if (!res.ok) {
                return { data: null, error: { message: `${res.status} ${await res.text()}` } }
              }
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

// ─── fixture (no production read) ────────────────────────────────────────────

function fixtureItem(runId: string): LibraryItemSnapshot {
  // A deliberately gap-ridden synthetic item. Its id is synthetic (not a real
  // library_items row) — helper_outputs has no FK to Library, so this is safe.
  return {
    id: `fixture-item-${runId}`,
    title: '',
    description: null,
    tags: [],
    presence_scope: 'house',
  }
}

// ─── seed ────────────────────────────────────────────────────────────────────

async function seed() {
  if (!hasFlag('--confirm-test-owned-helper-output')) {
    refuse('seeding requires --confirm-test-owned-helper-output')
  }

  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}_${randomUUID().slice(0, 8)}`
  const marker: VerificationRunMarker = {
    verification_run: VERIFICATION_RUN,
    run_id: runId,
    expected: 'visible_in_helper_review_surface',
  }

  const rest = loadEnvAndRest()
  const libraryItemId = flagValue('--library-item-id')

  let item: LibraryItemSnapshot
  let files: LibraryItemFileSnapshot[] = []

  if (libraryItemId) {
    // Real-target mode: read ONE item (+ its files). Never a scan, never "all".
    const itemRows = await restGet<{
      id: string; title: string | null; description: string | null
      tags: string[] | null; presence_scope: string | null
    }>(rest, `library_items?id=eq.${encodeURIComponent(libraryItemId)}&select=id,title,description,tags,presence_scope`)
    const itemRow = itemRows[0]
    if (!itemRow) refuse(`Library item not found: ${libraryItemId}`)
    item = {
      id: itemRow.id,
      title: itemRow.title ?? '',
      description: itemRow.description ?? null,
      tags: Array.isArray(itemRow.tags) ? itemRow.tags : [],
      presence_scope: (itemRow.presence_scope ?? 'house') as HelperPresenceScope,
    }
    const fileRows = await restGet<{
      id: string; library_item_id: string; file_name: string; file_type: string
      extraction_status: string; extracted_text: string | null; extraction_char_count: number | null
    }>(rest, `library_item_files?library_item_id=eq.${encodeURIComponent(libraryItemId)}&select=id,library_item_id,file_name,file_type,extraction_status,extracted_text,extraction_char_count`)
    files = fileRows.map((f) => ({
      id: f.id,
      library_item_id: f.library_item_id,
      file_name: f.file_name,
      file_type: f.file_type,
      extraction_status: f.extraction_status,
      extracted_text: f.extracted_text ?? null,
      extraction_char_count: f.extraction_char_count ?? null,
    }))
    console.log(`[seed-helper-output] Real-target mode: library item ${libraryItemId} (${files.length} file(s))`)
  } else {
    item = fixtureItem(runId)
    console.log('[seed-helper-output] Fixture mode (no production Library read).')
  }

  const drafts = inspectLibraryItem(item, files).slice(0, MAX_SEED_ROWS)
  if (drafts.length === 0) {
    console.log('[seed-helper-output] Helper found no documentation gaps — nothing to seed.')
    process.exit(0)
  }

  const inserted = await insertHelperOutputs(
    restHelperOutputClient(rest),
    drafts,
    { testOwned: true, runMarker: marker },
  )

  console.log(`\n[seed-helper-output] Seeded ${inserted.length} test_owned row(s). run_id = ${runId}`)
  for (const r of inserted) console.log(`  - ${r.id}  (${r.helper_type} · ${r.output_status})`)
  console.log('\nCleanup when done:')
  console.log(`  npx tsx scripts/seed-helper-output-test-row.ts --cleanup-test-owned-helper-output --run-id ${runId}\n`)
}

// ─── cleanup (soft-delete only) ──────────────────────────────────────────────

async function cleanup() {
  const runId = flagValue('--run-id')
  if (!runId) refuse('cleanup requires --run-id <run_id>')

  const rest = loadEnvAndRest()
  // Soft-delete ONLY: PATCH deleted_at, scoped to this run_id + test_owned, and
  // only rows not already soft-deleted. Never a hard delete, never "all".
  const query =
    `helper_outputs?test_owned=eq.true&deleted_at=is.null` +
    `&suggestion_payload->_verification->>run_id=eq.${encodeURIComponent(runId)}`
  const res = await fetch(`${rest.url}/rest/v1/${query}`, {
    method: 'PATCH',
    headers: { ...rest.headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  })
  if (!res.ok) refuse(`cleanup failed: ${res.status} ${await res.text()}`)
  const rows = (await res.json()) as { id: string }[]
  console.log(`\n[seed-helper-output] Soft-deleted ${rows.length} test_owned row(s) for run_id ${runId}.\n`)
}

// ─── dispatch (refuses before any env/DB work when no action is given) ───────

if (hasFlag('--cleanup-test-owned-helper-output')) {
  cleanup()
} else if (hasFlag('--confirm-test-owned-helper-output')) {
  seed()
} else {
  refuse('no action flag provided')
}
