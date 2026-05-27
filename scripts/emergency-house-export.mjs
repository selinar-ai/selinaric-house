/**
 * Phase 36J.1 — Emergency House Export (paginated)
 *
 * Dumps all protected tables (Category A + B) to a timestamped JSON file.
 * Run BEFORE any destructive operation, migration, or major milestone.
 *
 * Uses Supabase PostgREST directly (not app API routes) to export
 * all living data regardless of whether an API endpoint exists.
 *
 * Pagination: fetches in pages of 1000 rows. No table is silently truncated.
 * Exit code reflects completeness: exits 1 if any Category A table is incomplete.
 *
 * Usage:
 *   node scripts/emergency-house-export.mjs
 *
 * Requires env vars (from .env.local or environment):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Output: scripts/exports/house-export-<timestamp>.json
 *
 * Safety:
 *   - READ-ONLY: no writes, no deletes, no mutations
 *   - Uses anon key (open RLS) — same access as the app
 *   - Does not export embeddings (vector columns) to keep file size manageable
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ─── Load .env.local if present ────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')

if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    // Strip surrounding quotes (single or double) from .env values
    let value = trimmed.slice(eqIdx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[house-export] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  console.error('[house-export] Set in .env.local or environment')
  process.exit(1)
}

// ─── Constants ────────────────────────────────────────────────────────────

const PAGE_SIZE = 1000
const EXPORT_VERSION = '36J.1'

// ─── Table definitions ─────────────────────────────────────────────────────
// Category A (living/protected) and Category B (testable but protected)
// Ordered by importance. Select columns explicitly to skip embeddings.

const TABLES = [
  // Category A — Living
  {
    table: 'lounge_threads',
    select: '*',
    orderBy: 'created_at',
    category: 'A',
  },
  {
    table: 'lounge_messages',
    select: 'id,thread_id,speaker,content,surface_at_creation,deleted_at,created_at',
    orderBy: 'created_at',
    category: 'A',
  },
  {
    table: 'lounge_carrybacks',
    select: '*',
    orderBy: 'created_at',
    category: 'A',
  },
  {
    table: 'room_messages',
    select: 'id,room_slug,role,content,message_type,image_url,image_path,image_urls,created_at',
    orderBy: 'created_at',
    category: 'A',
  },
  {
    table: 'presence_journal',
    select: 'id,presence_id,entry_type,title,content,tags,salience,surfaced_to_user,authored_by,source,journal_job_id,created_at,updated_at',
    orderBy: 'created_at',
    category: 'A',
  },
  {
    table: 'presence_timeline',
    select: '*',
    orderBy: 'created_at',
    category: 'A',
  },
  {
    table: 'room_memories',
    select: '*',
    orderBy: 'created_at',
    category: 'A',
  },
  {
    table: 'session_classifications',
    select: '*',
    orderBy: 'created_at',
    category: 'A',
  },
  {
    table: 'interior_notes',
    select: '*',
    orderBy: 'created_at',
    category: 'A',
  },
  {
    table: 'living_state',
    select: '*',
    orderBy: 'last_updated',
    category: 'A',
  },
  {
    table: 'held_truths',
    select: '*',
    orderBy: 'created_at',
    category: 'A',
  },
  // Category A — Cross-room chain
  {
    table: 'cross_room_events',
    select: '*',
    orderBy: 'created_at',
    category: 'A',
  },
  {
    table: 'cross_room_event_impacts',
    select: '*',
    orderBy: 'created_at',
    category: 'A',
  },
  {
    table: 'cross_room_impact_propagation_candidates',
    select: '*',
    orderBy: 'created_at',
    category: 'A',
  },
  {
    table: 'cross_room_prompt_carryforwards',
    select: '*',
    orderBy: 'created_at',
    category: 'A',
  },
  // Category A — Archive
  {
    table: 'archive_items',
    select: 'id,archive_name,owner_presence,source_origin,visibility,title,raw_content,excerpt,category,canonical_status,deleted_at,created_at,updated_at',
    orderBy: 'created_at',
    category: 'A',
  },
  {
    table: 'archive_sources',
    select: '*',
    orderBy: 'created_at',
    category: 'A',
  },
  {
    table: 'archive_entry_drafts',
    select: '*',
    orderBy: 'created_at',
    category: 'A',
  },
  // Category B — Testable but protected
  {
    table: 'pulse_log',
    select: '*',
    orderBy: 'created_at',
    category: 'B',
  },
  {
    table: 'search_log',
    select: '*',
    orderBy: 'created_at',
    category: 'B',
  },
  {
    table: 'journal_jobs',
    select: '*',
    orderBy: 'created_at',
    category: 'B',
  },
  {
    table: 'reflection_jobs',
    select: '*',
    orderBy: 'created_at',
    category: 'B',
  },
  {
    table: 'recent_continuity_sessions',
    select: '*',
    orderBy: 'created_at',
    category: 'B',
  },
  {
    table: 'builds',
    select: '*',
    orderBy: 'created_at',
    category: 'B',
  },
]

// ─── Paginated fetch helper ───────────────────────────────────────────────

/**
 * Fetch all rows from a table using PostgREST pagination.
 * Uses Range headers for offset/limit and Prefer: count=exact for total count.
 * Pages through in PAGE_SIZE chunks until all rows are fetched.
 */
async function fetchTablePaginated(tableDef) {
  const { table, select, orderBy } = tableDef

  const allRows = []
  let pagesFetched = 0
  let expectedRows = null
  let lastError = null

  while (true) {
    const from = pagesFetched * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=${orderBy}.asc`

    try {
      const res = await fetch(url, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: 'count=exact',
          Range: `${from}-${to}`,
        },
      })

      // 416 = Range Not Satisfiable — no rows in this range (empty table or past the end)
      if (res.status === 416) {
        // If this is the first page, the table is empty
        if (pagesFetched === 0) {
          // Try to get the count from a countless request
          expectedRows = 0
        }
        break
      }

      if (!res.ok) {
        const text = await res.text()
        lastError = `${res.status} ${res.statusText}: ${text.slice(0, 200)}`
        break
      }

      // Parse exact count from Content-Range header: "0-999/4230" or "*/0"
      const contentRange = res.headers.get('content-range')
      if (contentRange && expectedRows === null) {
        const countPart = contentRange.split('/')[1]
        if (countPart && countPart !== '*') {
          expectedRows = parseInt(countPart, 10)
        }
      }

      const rows = await res.json()
      pagesFetched++

      if (!Array.isArray(rows)) {
        lastError = `Unexpected response: not an array`
        break
      }

      allRows.push(...rows)

      // If we got fewer rows than PAGE_SIZE, we've reached the end
      if (rows.length < PAGE_SIZE) {
        break
      }
    } catch (err) {
      lastError = err.message
      break
    }
  }

  if (lastError) {
    return {
      table,
      error: lastError,
      rows: [],
      exportedRows: 0,
      expectedRows,
      pagesFetched,
      complete: false,
    }
  }

  const complete = expectedRows !== null
    ? allRows.length === expectedRows
    : true // If count unavailable, assume complete if no error

  return {
    table,
    error: null,
    rows: allRows,
    exportedRows: allRows.length,
    expectedRows,
    pagesFetched: Math.max(pagesFetched, 0),
    complete,
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function run() {
  console.log('[house-export] Starting full house export (paginated)...')
  console.log(`[house-export] Supabase: ${SUPABASE_URL}`)
  console.log(`[house-export] Tables to export: ${TABLES.length}`)
  console.log(`[house-export] Page size: ${PAGE_SIZE}`)
  console.log(`[house-export] Version: ${EXPORT_VERSION}`)
  console.log()

  const results = {}
  const tableSummaries = []
  let totalExportedRows = 0
  let totalExpectedRows = 0
  let countAvailableForAll = true
  let errorCount = 0
  let incompleteACount = 0

  for (const tableDef of TABLES) {
    process.stdout.write(`  ${tableDef.category} ${tableDef.table}...`)

    const result = await fetchTablePaginated(tableDef)

    const entry = {
      table: tableDef.table,
      category: tableDef.category,
      orderColumn: tableDef.orderBy,
      expectedRows: result.expectedRows,
      exportedRows: result.exportedRows,
      pageSize: PAGE_SIZE,
      pagesFetched: result.pagesFetched,
      complete: false,
      truncated: false,
      error: result.error,
      warnings: [],
    }

    if (result.error) {
      console.log(` ERROR: ${result.error}`)
      entry.complete = false
      entry.truncated = false
      errorCount++
      if (tableDef.category === 'A') incompleteACount++
    } else if (result.expectedRows !== null) {
      entry.complete = result.complete
      entry.truncated = !result.complete
      if (result.complete) {
        console.log(` ${result.exportedRows}/${result.expectedRows} exported across ${result.pagesFetched} page${result.pagesFetched !== 1 ? 's' : ''}`)
      } else {
        console.log(` INCOMPLETE — ${result.exportedRows}/${result.expectedRows} exported`)
        if (tableDef.category === 'A') incompleteACount++
      }
      totalExpectedRows += result.expectedRows
    } else {
      // Count unavailable
      countAvailableForAll = false
      entry.complete = null // unknown
      entry.warnings.push('Exact count unavailable')
      console.log(` ${result.exportedRows} rows (count unavailable, ${result.pagesFetched} page${result.pagesFetched !== 1 ? 's' : ''})`)
    }

    totalExportedRows += result.exportedRows
    results[tableDef.table] = result.rows
    tableSummaries.push(entry)
  }

  // Determine overall completeness
  const tablesSucceeded = tableSummaries.filter(t => !t.error).length
  const tablesFailed = tableSummaries.filter(t => t.error).length
  const allComplete = incompleteACount === 0 && errorCount === 0

  // Build export payload
  const exportData = {
    exportedAt: new Date().toISOString(),
    exportReason: 'emergency_pre_operation_backup',
    scriptVersion: EXPORT_VERSION,
    supabaseUrl: SUPABASE_URL,
    tablesRequested: TABLES.length,
    tablesSucceeded,
    tablesFailed,
    totalExpectedRows: countAvailableForAll ? totalExpectedRows : null,
    totalExportedRows,
    complete: allComplete,
    pageSize: PAGE_SIZE,
    summary: tableSummaries,
    tables: results,
  }

  // Write to file
  const dir = resolve(__dirname, 'exports')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = resolve(dir, `house-export-${timestamp}.json`)

  writeFileSync(filename, JSON.stringify(exportData, null, 2))

  const sizeBytes = JSON.stringify(exportData).length
  const sizeLabel = sizeBytes >= 1024 * 1024
    ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
    : `${(sizeBytes / 1024).toFixed(1)} KB`

  // ─── Final report ─────────────────────────────────────────────────────
  console.log()
  console.log('═══════════════════════════════════════════════')

  if (allComplete) {
    console.log('[house-export] EXPORT COMPLETE')
  } else {
    console.log('[house-export] EXPORT INCOMPLETE')
  }

  console.log(`[house-export] File: ${filename}`)
  console.log(`[house-export] Version: ${EXPORT_VERSION}`)
  console.log(`[house-export] Tables: ${tablesSucceeded}/${TABLES.length} succeeded (${tablesFailed} errors)`)
  console.log(`[house-export] Total rows exported: ${totalExportedRows}`)
  if (countAvailableForAll) {
    console.log(`[house-export] Total rows expected: ${totalExpectedRows}`)
  }
  console.log(`[house-export] Size: ${sizeLabel}`)
  console.log('═══════════════════════════════════════════════')

  // Report errors
  if (errorCount > 0) {
    console.log()
    console.log('  ERRORS:')
    for (const s of tableSummaries) {
      if (s.error) {
        console.log(`    ${s.category} ${s.table}: ${s.error}`)
      }
    }
  }

  // Report incomplete tables
  const incompleteTables = tableSummaries.filter(t => t.truncated)
  if (incompleteTables.length > 0) {
    console.log()
    console.log('  INCOMPLETE TABLES:')
    for (const t of incompleteTables) {
      console.log(`    ${t.category} ${t.table}: ${t.exportedRows}/${t.expectedRows} rows`)
    }
  }

  // Report count-unavailable tables
  const unknownTables = tableSummaries.filter(t => t.complete === null)
  if (unknownTables.length > 0) {
    console.log()
    console.log('  COUNT UNAVAILABLE (exported but completeness unknown):')
    for (const t of unknownTables) {
      console.log(`    ${t.category} ${t.table}: ${t.exportedRows} rows`)
    }
  }

  console.log()

  // Exit code: fail if any Category A table is incomplete or errored
  if (incompleteACount > 0) {
    console.log(`FAIL: ${incompleteACount} Category A table(s) incomplete or errored. Export is not full-fidelity.`)
    console.log()
    process.exit(1)
  }

  if (errorCount > 0) {
    console.log(`WARNING: ${errorCount} table(s) had errors (non-Category-A). Review above.`)
    console.log()
    process.exit(0)
  }

  console.log('Script performed no database writes.')
  console.log('Script performed no deletes.')
  console.log()
}

run().catch(err => {
  console.error('[house-export] Fatal:', err)
  process.exit(1)
})
