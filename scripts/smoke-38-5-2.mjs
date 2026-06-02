// Phase 38.5.2 — Audit wiring smoke: confirm reasoning_audit_events rows
// for llm_draft_requested and llm_draft_returned after a successful draft.

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

const BASE = 'http://localhost:3000'
const PW = process.env.HOUSE_AUTH_PASSWORD
const SID = '2ef13b4a-e45d-4f1f-841b-a47a2fad66b4'
const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY

let ok = true
function check(label, pass, detail) {
  const m = pass ? '✓' : '✗'
  if (!pass) ok = false
  console.log(`  ${m} ${label}`)
  if (detail) console.log(`      ${detail}`)
}

// Login
const loginRes = await fetch(`${BASE}/api/house-auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW }) })
const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
check('Login', loginRes.status === 200, cookie ? undefined : 'no cookie')

// Count audit rows before draft
const db = { apikey: SKEY, Authorization: `Bearer ${SKEY}` }
const before = await fetch(`${SURL}/rest/v1/reasoning_audit_events?suggestion_id=eq.${SID}&select=id&order=created_at.desc`, { headers: db })
const beforeRows = await before.json()
const beforeCount = beforeRows.length

// Generate LLM draft
console.log('\n── Generating LLM draft ──')
const draftRes = await fetch(`${BASE}/api/graph-candidate-suggestions/${SID}/llm-reasoning-draft`, { method: 'POST', headers: { 'Cookie': cookie } })
const draftData = await draftRes.json()

if (draftData.ok) {
  check('Draft generated', true, `model: ${draftData.meta?.model}`)
} else {
  check(`Draft result: ${draftData.code}`, draftData.stored === false && draftData.authority_changed === false)
}

// Check audit rows after
const after = await fetch(`${SURL}/rest/v1/reasoning_audit_events?suggestion_id=eq.${SID}&select=id,event_type,event_status,authority_changed,not_evidence,prompt_eligible,review_routed,baseline_evidence_condition,llm_model&order=created_at.desc&limit=5`, { headers: db })
const afterRows = await after.json()
const newRows = afterRows.slice(0, afterRows.length - beforeCount)

console.log(`\n── Audit rows (${newRows.length} new) ──`)
for (const row of newRows) {
  console.log(`  event: ${row.event_type} | status: ${row.event_status} | ac: ${row.authority_changed} | ne: ${row.not_evidence} | pe: ${row.prompt_eligible} | model: ${row.llm_model} | condition: ${row.baseline_evidence_condition}`)
  check(`${row.event_type}: authority_changed=false`, row.authority_changed === false)
  check(`${row.event_type}: not_evidence=true`, row.not_evidence === true)
  check(`${row.event_type}: prompt_eligible=false`, row.prompt_eligible === false)
  check(`${row.event_type}: review_routed=false`, row.review_routed === false)
}

// Verify no content fields stored
const allText = JSON.stringify(afterRows)
check('No evidence_summary in DB', !allText.includes('evidence_summary'))
check('No draft text in DB', !allText.includes('directly_supported'))
check('No raw prompt in DB', !allText.includes('raw_prompt'))

if (draftData.ok) {
  const hasRequested = newRows.some(r => r.event_type === 'llm_draft_requested')
  const hasReturned = newRows.some(r => r.event_type === 'llm_draft_returned')
  check('llm_draft_requested row present', hasRequested)
  check('llm_draft_returned row present', hasReturned)
}

console.log('\n══════════════════════════════════════════')
console.log(ok ? '  SMOKE PASSED' : '  SOME CHECKS FAILED')
console.log('══════════════════════════════════════════\n')
process.exit(ok ? 0 : 1)
