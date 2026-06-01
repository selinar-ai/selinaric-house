// Phase 37H.1 — Constraint verification via rejected inserts
// Each test attempts an INSERT that should be rejected by a specific CHECK constraint.
// No data persists — all inserts are expected to fail.
// Read the error message to confirm which constraint fired.

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
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

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
}

let allPassed = true
function check(label, ok, detail) {
  const mark = ok ? '✓' : '✗'
  console.log(`  ${mark} ${label}`)
  if (detail) console.log(`      ${detail}`)
  if (!ok) allPassed = false
}

async function tryInsert(row) {
  const res = await fetch(`${URL}/rest/v1/graph_candidate_suggestions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(row),
  })
  const body = await res.text()
  return { rejected: !res.ok, status: res.status, body }
}

// Base valid row (memory_candidate shape) — should be rejected because
// target_archive_item_id references a non-existent archive_items row.
// But we can still test CHECK constraints which fire before FK checks.

const baseMemory = {
  candidate_type: 'memory_candidate',
  status: 'pending_review',
  proposed_label: '__constraint_test__',
  reason_for_candidate: 'constraint verification',
  evidence_strength: 'moderate',
  prompt_eligible: false,
  supporting_archive_sources: [],
  target_archive_item_id: null, // will be set per test
}

console.log('\n── Constraint verification via rejected inserts ──\n')

// 1. gcs_prompt_eligible_check — prompt_eligible = true must be rejected
{
  const r = await tryInsert({ ...baseMemory, prompt_eligible: true, target_archive_item_id: '00000000-0000-0000-0000-000000000001' })
  check('gcs_prompt_eligible_check rejects prompt_eligible=true', r.rejected && r.body.includes('gcs_prompt_eligible_check'))
}

// 2. gcs_archive_sources_is_array — object instead of array must be rejected
{
  const r = await tryInsert({ ...baseMemory, supporting_archive_sources: {}, target_archive_item_id: '00000000-0000-0000-0000-000000000001' })
  check('gcs_archive_sources_is_array rejects object', r.rejected && r.body.includes('gcs_archive_sources_is_array'))
}

// 3. gcs_governance_context_is_object — array instead of object must be rejected
{
  const r = await tryInsert({ ...baseMemory, governance_context: [], target_archive_item_id: '00000000-0000-0000-0000-000000000001' })
  check('gcs_governance_context_is_object rejects array', r.rejected && r.body.includes('gcs_governance_context_is_object'))
}

// 4. gcs_no_candidate_as_confirmed_evidence — canonical_candidate + confirmed_memory_evidence
{
  const r = await tryInsert({
    ...baseMemory,
    target_archive_item_id: '00000000-0000-0000-0000-000000000001',
    supporting_archive_sources: [
      { archive_item_id: 'x', canonical_status_snapshot: 'canonical_candidate', evidence_role: 'confirmed_memory_evidence', used_for_weighting: true }
    ],
  })
  check('gcs_no_candidate_as_confirmed_evidence rejects canonical_candidate+confirmed_memory_evidence',
    r.rejected && r.body.includes('gcs_no_candidate_as_confirmed_evidence'))
}

// 5. gcs_memory_archive_check — memory_candidate without target_archive_item_id
{
  const r = await tryInsert({ ...baseMemory, target_archive_item_id: null })
  check('gcs_memory_archive_check rejects memory_candidate without archive id', r.rejected && r.body.includes('gcs_memory_archive_check'))
}

// 6. gcs_memory_no_presence_check — memory_candidate with target_presence_id
{
  const r = await tryInsert({ ...baseMemory, target_archive_item_id: '00000000-0000-0000-0000-000000000001', target_presence_id: 'ari' })
  check('gcs_memory_no_presence_check rejects memory_candidate with presence_id', r.rejected && r.body.includes('gcs_memory_no_presence_check'))
}

// 7. gcs_memory_no_truth_text_check — memory_candidate with proposed_truth_text
{
  const r = await tryInsert({ ...baseMemory, target_archive_item_id: '00000000-0000-0000-0000-000000000001', proposed_truth_text: 'should not be here' })
  check('gcs_memory_no_truth_text_check rejects memory_candidate with truth text', r.rejected && r.body.includes('gcs_memory_no_truth_text_check'))
}

// 8. gcs_held_truth_presence_check — held_truth_candidate without target_presence_id
{
  const r = await tryInsert({
    ...baseMemory,
    candidate_type: 'held_truth_candidate',
    target_archive_item_id: null,
    proposed_truth_text: 'test',
    target_presence_id: null,
  })
  check('gcs_held_truth_presence_check rejects held_truth without presence_id', r.rejected && r.body.includes('gcs_held_truth_presence_check'))
}

// 9. gcs_held_truth_text_check — held_truth_candidate without proposed_truth_text
{
  const r = await tryInsert({
    ...baseMemory,
    candidate_type: 'held_truth_candidate',
    target_archive_item_id: null,
    proposed_truth_text: null,
    target_presence_id: 'eli',
  })
  check('gcs_held_truth_text_check rejects held_truth without truth text', r.rejected && r.body.includes('gcs_held_truth_text_check'))
}

// 10. gcs_held_truth_no_archive_check — held_truth_candidate with target_archive_item_id
{
  const r = await tryInsert({
    ...baseMemory,
    candidate_type: 'held_truth_candidate',
    target_archive_item_id: '00000000-0000-0000-0000-000000000001',
    proposed_truth_text: 'test',
    target_presence_id: 'ari',
  })
  check('gcs_held_truth_no_archive_check rejects held_truth with archive id', r.rejected && r.body.includes('gcs_held_truth_no_archive_check'))
}

// 11. gcs_canonical_status_requires_archive — canonical_status_before without target_archive_item_id
{
  const r = await tryInsert({
    ...baseMemory,
    candidate_type: 'held_truth_candidate',
    target_archive_item_id: null,
    proposed_truth_text: 'test',
    target_presence_id: 'ari',
    canonical_status_before: 'canonical',
  })
  check('gcs_canonical_status_requires_archive rejects status snapshot without archive', r.rejected && r.body.includes('gcs_canonical_status_requires_archive'))
}

// 12. canonical_status_before CHECK — invalid status value
{
  const r = await tryInsert({
    ...baseMemory,
    target_archive_item_id: '00000000-0000-0000-0000-000000000001',
    canonical_status_before: 'invalid_status',
  })
  check('canonical_status_before rejects invalid status value', r.rejected && r.body.includes('canonical_status_before'))
}

// ─── Verify no data persisted ──────────────────────────────────────────

const countRes = await fetch(`${URL}/rest/v1/graph_candidate_suggestions?select=id&limit=0`, {
  headers: { ...headers, Prefer: 'count=exact' },
})
const range = countRes.headers.get('content-range')
check('No test data persisted (table still empty)', range === '*/0')

// ─── Summary ──────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log(allPassed ? '  ALL CONSTRAINT CHECKS PASSED' : '  SOME CHECKS FAILED')
console.log('══════════════════════════════════════════\n')

process.exit(allPassed ? 0 : 1)
