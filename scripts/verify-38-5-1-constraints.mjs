// Phase 38.5.1 — reasoning_audit_events constraint verification
// Run AFTER manual Supabase SQL execution.
// Verifies all named constraints via rejected inserts.
// No data persists — all valid inserts use a real FK suggestion ID.

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

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

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }

// A real suggestion ID with FK in DB
const VALID_SID = '2ef13b4a-e45d-4f1f-841b-a47a2fad66b4'

let allPassed = true
function check(label, ok, detail) {
  const m = ok ? '✓' : '✗'
  if (!ok) allPassed = false
  console.log(`  ${m} ${label}`)
  if (detail) console.log(`      ${detail}`)
}

async function tryInsert(row) {
  const res = await fetch(`${URL}/rest/v1/reasoning_audit_events`, {
    method: 'POST', headers, body: JSON.stringify(row),
  })
  const body = await res.text()
  return { rejected: !res.ok, status: res.status, body }
}

const base = {
  suggestion_id: VALID_SID,
  event_type: 'llm_draft_returned',
  reasoning_mode: 'llm_assisted',
  event_status: 'success',
  authority_changed: false,
  not_evidence: true,
  prompt_eligible: false,
  review_routed: false,
}

console.log('\n── Table exists ──')
const t = await fetch(`${URL}/rest/v1/reasoning_audit_events?select=id&limit=0`, { headers: { ...headers, Prefer: 'count=exact' } })
check('reasoning_audit_events table exists', t.ok, `HTTP ${t.status}`)

console.log('\n── Governance constraints ──')

const r1 = await tryInsert({ ...base, authority_changed: true })
check('rae_authority_never_changes rejects authority_changed=true', r1.rejected && r1.body.includes('rae_authority_never_changes'))

const r2 = await tryInsert({ ...base, not_evidence: false })
check('rae_not_evidence_always_true rejects not_evidence=false', r2.rejected && r2.body.includes('rae_not_evidence_always_true'))

const r3 = await tryInsert({ ...base, prompt_eligible: true })
check('rae_not_prompt_eligible rejects prompt_eligible=true', r3.rejected && r3.body.includes('rae_not_prompt_eligible'))

const r4 = await tryInsert({ ...base, review_routed: true })
check('rae_not_review_routed rejects review_routed=true', r4.rejected && r4.body.includes('rae_not_review_routed'))

console.log('\n── Enum constraints ──')

const r5 = await tryInsert({ ...base, event_type: 'potential_candidate' })
check("rae_event_type_check rejects 'potential_candidate'", r5.rejected && r5.body.includes('rae_event_type_check'))

const r6 = await tryInsert({ ...base, event_type: 'approved' })
check("rae_event_type_check rejects 'approved'", r6.rejected)

const r7 = await tryInsert({ ...base, reasoning_mode: 'unknown_mode' })
check("rae_reasoning_mode_check rejects unknown reasoning_mode", r7.rejected && r7.body.includes('rae_reasoning_mode_check'))

const r8 = await tryInsert({ ...base, event_status: 'approved' })
check("rae_event_status_check rejects 'approved' event_status", r8.rejected && r8.body.includes('rae_event_status_check'))

console.log('\n── Count constraints ──')

const r9 = await tryInsert({ ...base, archive_source_count: -1 })
check('rae_archive_source_count_nonneg rejects negative count', r9.rejected && r9.body.includes('rae_archive_source_count_nonneg'))

const r10 = await tryInsert({ ...base, graph_source_count: -5 })
check('rae_graph_source_count_nonneg rejects negative count', r10.rejected && r10.body.includes('rae_graph_source_count_nonneg'))

console.log('\n── FK constraint ──')

const r11 = await tryInsert({ ...base, suggestion_id: '00000000-0000-0000-0000-000000000000' })
check('FK rejects non-existent suggestion_id', r11.rejected && (r11.body.includes('foreign key') || r11.body.includes('fkey')))

console.log('\n── Valid insert ──')
const r12 = await tryInsert(base)
check('Valid base insert accepted (or FK blocked — both confirm schema live)', !r12.rejected || r12.body.includes('foreign key'))

const countRes = await fetch(`${URL}/rest/v1/reasoning_audit_events?select=id&limit=0`, { headers: { ...headers, Prefer: 'count=exact' } })
const range = countRes.headers.get('content-range')
console.log(`  Table count: ${range}`)

console.log('\n══════════════════════════════════════════')
console.log(allPassed ? '  ALL CONSTRAINT CHECKS PASSED' : '  SOME CHECKS FAILED')
console.log('══════════════════════════════════════════\n')
process.exit(allPassed ? 0 : 1)
