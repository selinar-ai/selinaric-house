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
import { createClient } from '@supabase/supabase-js'

import {
  inspectLibraryItem,
  type LibraryItemSnapshot,
  type LibraryItemFileSnapshot,
} from '../src/lib/helpers/libraryMetadataHelper'
import {
  insertHelperOutputs,
  type HelperOutputDbClient,
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

// ─── env loader (only called once an action is confirmed) ────────────────────

function loadEnvAndClient() {
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
  return createClient(url, key)
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

  const supabase = loadEnvAndClient()
  const libraryItemId = flagValue('--library-item-id')

  let item: LibraryItemSnapshot
  let files: LibraryItemFileSnapshot[] = []

  if (libraryItemId) {
    // Real-target mode: read ONE item (+ its files). Never a scan, never "all".
    const { data: itemRow, error: itemErr } = await supabase
      .from('library_items')
      .select('id, title, description, tags, presence_scope')
      .eq('id', libraryItemId)
      .single()
    if (itemErr || !itemRow) refuse(`Library item not found: ${libraryItemId}`)
    item = {
      id: itemRow.id,
      title: itemRow.title ?? '',
      description: itemRow.description ?? null,
      tags: Array.isArray(itemRow.tags) ? itemRow.tags : [],
      presence_scope: (itemRow.presence_scope ?? 'house') as HelperPresenceScope,
    }
    const { data: fileRows } = await supabase
      .from('library_item_files')
      .select('id, library_item_id, file_name, file_type, extraction_status, extracted_text, extraction_char_count')
      .eq('library_item_id', libraryItemId)
    files = (fileRows ?? []).map((f) => ({
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
    supabase as unknown as HelperOutputDbClient,
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

  const supabase = loadEnvAndClient()
  const { data, error } = await supabase
    .from('helper_outputs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('test_owned', true)
    .is('deleted_at', null)
    .filter('suggestion_payload->_verification->>run_id', 'eq', runId)
    .select('id')
  if (error) refuse(`cleanup failed: ${error.message}`)
  console.log(`\n[seed-helper-output] Soft-deleted ${(data ?? []).length} test_owned row(s) for run_id ${runId}.\n`)
}

// ─── dispatch (refuses before any env/DB work when no action is given) ───────

if (hasFlag('--cleanup-test-owned-helper-output')) {
  cleanup()
} else if (hasFlag('--confirm-test-owned-helper-output')) {
  seed()
} else {
  refuse('no action flag provided')
}
