/**
 * Phase 36J — Emergency House Export
 *
 * Dumps all protected tables (Category A + B) to a timestamped JSON file.
 * Run BEFORE any destructive operation, migration, or major milestone.
 *
 * Uses Supabase PostgREST directly (not app API routes) to export
 * all living data regardless of whether an API endpoint exists.
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

// ─── Fetch helper ──────────────────────────────────────────────────────────

async function fetchTable(tableDef) {
  const { table, select, orderBy } = tableDef
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=${orderBy}.desc&limit=10000`

  try {
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: 'count=exact',
      },
    })

    if (!res.ok) {
      const text = await res.text()
      return { table, error: `${res.status} ${res.statusText}: ${text.slice(0, 200)}`, rows: [], count: 0 }
    }

    const contentRange = res.headers.get('content-range')
    const totalCount = contentRange ? parseInt(contentRange.split('/')[1], 10) : null

    const rows = await res.json()

    return {
      table,
      error: null,
      rows,
      count: rows.length,
      total: totalCount,
      truncated: totalCount != null && totalCount > rows.length,
    }
  } catch (err) {
    return { table, error: err.message, rows: [], count: 0 }
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function run() {
  console.log('[house-export] Starting full house export...')
  console.log(`[house-export] Supabase: ${SUPABASE_URL}`)
  console.log(`[house-export] Tables to export: ${TABLES.length}`)
  console.log()

  const results = {}
  const summary = []
  let totalRows = 0
  let errors = 0

  for (const tableDef of TABLES) {
    process.stdout.write(`  ${tableDef.category} ${tableDef.table}...`)

    const result = await fetchTable(tableDef)

    if (result.error) {
      console.log(` ERROR: ${result.error}`)
      errors++
      summary.push({ table: tableDef.table, category: tableDef.category, status: 'error', error: result.error })
    } else {
      const truncNote = result.truncated ? ` (TRUNCATED, total: ${result.total})` : ''
      console.log(` ${result.count} rows${truncNote}`)
      totalRows += result.count
      summary.push({
        table: tableDef.table,
        category: tableDef.category,
        status: 'ok',
        count: result.count,
        total: result.total,
        truncated: result.truncated || false,
      })
    }

    results[tableDef.table] = result.rows
  }

  // Build export payload
  const exportData = {
    exported_at: new Date().toISOString(),
    export_reason: 'emergency_pre_operation_backup',
    export_version: '36J_v1',
    supabase_url: SUPABASE_URL,
    table_count: TABLES.length,
    total_rows: totalRows,
    errors,
    summary,
    tables: results,
  }

  // Write to file
  const dir = resolve(__dirname, 'exports')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = resolve(dir, `house-export-${timestamp}.json`)

  writeFileSync(filename, JSON.stringify(exportData, null, 2))

  const sizeKB = (JSON.stringify(exportData).length / 1024).toFixed(1)

  console.log()
  console.log('═══════════════════════════════════════════════')
  console.log(`[house-export] Complete`)
  console.log(`[house-export] File: ${filename}`)
  console.log(`[house-export] Tables: ${TABLES.length} (${errors} errors)`)
  console.log(`[house-export] Total rows: ${totalRows}`)
  console.log(`[house-export] Size: ${sizeKB} KB`)
  console.log('═══════════════════════════════════════════════')

  if (errors > 0) {
    console.log()
    console.log('⚠️  Some tables had errors:')
    for (const s of summary) {
      if (s.status === 'error') {
        console.log(`  - ${s.table}: ${s.error}`)
      }
    }
  }
}

run().catch(err => {
  console.error('[house-export] Fatal:', err)
  process.exit(1)
})
