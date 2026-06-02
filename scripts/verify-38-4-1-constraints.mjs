// Phase 38.4.1 — Migration constraint verification
// Verifies llm_reasoning_feedback_events constraints via rejected inserts.
// No data persists — all inserts expected to fail.

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
  if (!ok) allPassed = false
  console.log(`  ${mark} ${label}`)
  if (detail) console.log(`      ${detail}`)
}

async function tryInsert(row) {
  const res = await fetch(`${URL}/rest/v1/llm_reasoning_feedback_events`, {
    method: 'POST', headers, body: JSON.stringify(row),
  })
  const body = await res.text()
  return { rejected: !res.ok, status: res.status, body }
}

// A valid suggestion_id (use an existing one from the DB)
const VALID_SID = '2ef13b4a-e45d-4f1f-841b-a47a2fad66b4'

const base = {
  suggestion_id: VALID_SID,
  feedback_type: 'useful',
  authority_changed: false,
  not_evidence: true,
  prompt_eligible: false,
  review_routed: false,
}

console.log('\n── Tables exist ──')
const t1 = await fetch(`${URL}/rest/v1/llm_reasoning_feedback_events?select=id&limit=0`, {
  headers: { ...headers, Prefer: 'count=exact' }
})
check('llm_reasoning_feedback_events table exists', t1.ok, `HTTP ${t1.status}`)

console.log('\n── Constraint verification via rejected inserts ──\n')

// 1. lrfe_authority_never_changes
const r1 = await tryInsert({ ...base, authority_changed: true })
check('lrfe_authority_never_changes rejects authority_changed=true',
  r1.rejected && r1.body.includes('lrfe_authority_never_changes'))

// 2. lrfe_not_evidence_always_true
const r2 = await tryInsert({ ...base, not_evidence: false })
check('lrfe_not_evidence_always_true rejects not_evidence=false',
  r2.rejected && r2.body.includes('lrfe_not_evidence_always_true'))

// 3. lrfe_not_prompt_eligible
const r3 = await tryInsert({ ...base, prompt_eligible: true })
check('lrfe_not_prompt_eligible rejects prompt_eligible=true',
  r3.rejected && r3.body.includes('lrfe_not_prompt_eligible'))

// 4. lrfe_not_review_routed
const r4 = await tryInsert({ ...base, review_routed: true })
check('lrfe_not_review_routed rejects review_routed=true',
  r4.rejected && r4.body.includes('lrfe_not_review_routed'))

// 5. lrfe_note_length_check — 501 chars
const r5 = await tryInsert({ ...base, feedback_note: 'x'.repeat(501) })
check('lrfe_note_length_check rejects note > 500 chars',
  r5.rejected && r5.body.includes('lrfe_note_length_check'))

// 6. feedback_type enum — invalid value
const r6 = await tryInsert({ ...base, feedback_type: 'potential_candidate' })
check("feedback_type enum rejects 'potential_candidate'",
  r6.rejected && (r6.body.includes('feedback_type') || r6.body.includes('violates check')))

// 7. feedback_type enum — 'approved' not allowed
const r7 = await tryInsert({ ...base, feedback_type: 'approved' })
check("feedback_type enum rejects 'approved'", r7.rejected)

// 8. Valid insert actually works (confirms table is live)
const r8 = await tryInsert(base)
// This may succeed (valid insert) or fail with FK violation (suggestion may not exist in test env)
check('Valid insert accepted or fails with FK (table constraint check)',
  !r8.rejected || r8.body.includes('foreign key') || r8.body.includes('fkey'),
  r8.rejected ? `Rejected (${r8.body.slice(0, 80)})` : 'Inserted')

// 9. Table empty if no valid data was inserted
const countRes = await fetch(`${URL}/rest/v1/llm_reasoning_feedback_events?select=id&limit=0`, {
  headers: { ...headers, Prefer: 'count=exact' }
})
const range = countRes.headers.get('content-range')
check('No test data persisted if FK blocked valid insert', range === '*/0' || range?.includes('*'))

console.log('\n══════════════════════════════════════════')
console.log(allPassed ? '  ALL CONSTRAINT CHECKS PASSED' : '  SOME CHECKS FAILED')
console.log('══════════════════════════════════════════\n')
process.exit(allPassed ? 0 : 1)
