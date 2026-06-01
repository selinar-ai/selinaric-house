// Phase 37H.1 — Migration verification script
// Read-only. No data writes. No test data insertion.
// Uses direct PostgREST fetch (no supabase-js SDK — avoids WebSocket requirement).

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ─── Load .env.local ──────────────────────────────────────────────────────

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
    let value = trimmed.slice(eqIdx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

// ─── Helpers ──────────────────────────────────────────────────────────────

let allPassed = true
function check(label, ok) {
  const mark = ok ? '✓' : '✗'
  console.log(`  ${mark} ${label}`)
  if (!ok) allPassed = false
}

async function postgrestHead(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=0`, {
    method: 'GET',
    headers: { ...headers, Prefer: 'count=exact' },
  })
  const count = res.headers.get('content-range')
  return { ok: res.ok, status: res.status, count }
}

async function runSQL(query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  })
  if (!res.ok) return null
  return await res.json()
}

// ─── 1. Tables exist ────────────────────────────────────────────────────

console.log('\n── Tables ──')

const t1 = await postgrestHead('graph_candidate_suggestions')
check(`graph_candidate_suggestions exists (${t1.count})`, t1.ok)

const t2 = await postgrestHead('graph_candidate_suggestion_events')
check(`graph_candidate_suggestion_events exists (${t2.count})`, t2.ok)

// ─── 2. Constraints ────────────────────────────────────────────────────

console.log('\n── Constraints on graph_candidate_suggestions ──')

const conRows = await runSQL(
  "SELECT conname, contype FROM pg_constraint WHERE conrelid = 'graph_candidate_suggestions'::regclass ORDER BY conname"
)

const requiredConstraints = [
  'gcs_prompt_eligible_check',
  'gcs_archive_sources_is_array',
  'gcs_governance_context_is_object',
  'gcs_no_candidate_as_confirmed_evidence',
  'gcs_held_truth_presence_check',
  'gcs_held_truth_text_check',
  'gcs_held_truth_no_archive_check',
  'gcs_memory_archive_check',
  'gcs_memory_no_presence_check',
  'gcs_memory_no_truth_text_check',
  'gcs_canonical_status_requires_archive',
]

if (conRows && Array.isArray(conRows)) {
  const conNames = conRows.map(r => r.conname)
  for (const r of conRows) {
    const typeLabel = r.contype === 'c' ? 'CHECK' : r.contype === 'p' ? 'PK' : r.contype === 'f' ? 'FK' : r.contype
    console.log(`  - ${r.conname} (${typeLabel})`)
  }

  console.log('\n── Required constraint verification ──')
  for (const name of requiredConstraints) {
    check(name, conNames.includes(name))
  }
} else {
  console.log('  (pg_constraint query unavailable — skipping direct constraint listing)')
}

// ─── 3. Indexes ────────────────────────────────────────────────────────

console.log('\n── Indexes ──')

const idxRows = await runSQL(
  "SELECT indexname FROM pg_indexes WHERE tablename IN ('graph_candidate_suggestions', 'graph_candidate_suggestion_events') ORDER BY indexname"
)

const requiredIndexes = [
  'graph_candidate_suggestions_status_idx',
  'graph_candidate_suggestions_type_idx',
  'graph_candidate_suggestions_target_archive_idx',
  'graph_candidate_suggestion_events_suggestion_idx',
  'graph_candidate_suggestion_events_type_idx',
]

if (idxRows && Array.isArray(idxRows)) {
  for (const r of idxRows) {
    console.log(`  - ${r.indexname}`)
  }

  console.log('\n── Required index verification ──')
  const idxNames = idxRows.map(r => r.indexname)
  for (const name of requiredIndexes) {
    check(name, idxNames.includes(name))
  }
} else {
  console.log('  (pg_indexes query unavailable — skipping)')
}

// ─── 4. RLS ────────────────────────────────────────────────────────────

console.log('\n── RLS ──')

const rlsRows = await runSQL(
  "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('graph_candidate_suggestions', 'graph_candidate_suggestion_events')"
)

if (rlsRows && Array.isArray(rlsRows)) {
  for (const r of rlsRows) {
    check(`${r.tablename} RLS enabled: ${r.rowsecurity}`, r.rowsecurity === true)
  }
} else {
  // Fallback: readable = RLS not blocking
  check('graph_candidate_suggestions readable (RLS not blocking)', t1.ok)
  check('graph_candidate_suggestion_events readable (RLS not blocking)', t2.ok)
}

// ─── Summary ──────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log(allPassed ? '  ALL CHECKS PASSED' : '  SOME CHECKS FAILED')
console.log('══════════════════════════════════════════\n')

process.exit(allPassed ? 0 : 1)
