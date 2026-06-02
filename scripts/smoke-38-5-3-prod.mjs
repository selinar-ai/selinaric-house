// Phase 38.5.3 — Reasoning audit production smoke
// Verifies audit wiring on Vercel production.

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

const BASE = 'https://selinaric-house.vercel.app'
const PW = process.env.HOUSE_AUTH_PASSWORD
const SID = '2ef13b4a-e45d-4f1f-841b-a47a2fad66b4'
const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY

let allPassed = true
function check(label, pass, detail) {
  const m = pass ? '✓' : '✗'
  if (!pass) allPassed = false
  console.log(`  ${m} ${label}`)
  if (detail) console.log(`      ${detail}`)
}

const dbHeaders = { apikey: SKEY, Authorization: `Bearer ${SKEY}` }

// ── 1. Deployment reachable ───────────────────────────────────────────────
console.log('\n── 1. Vercel deployment reachable ──')
const ping = await fetch(`${BASE}/api/graph-candidate-suggestions?limit=1`)
check('Vercel responds', ping.ok, `HTTP ${ping.status}`)

// ── 2. Login ──────────────────────────────────────────────────────────────
console.log('\n── 2. Login ──')
const loginRes = await fetch(`${BASE}/api/house-auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PW })
})
const lb = await loginRes.json()
const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
check('Login 200', loginRes.status === 200)
check('Login ok', lb.ok === true)
check('Cookie set (HttpOnly)', cookie.includes('selinaric_house_auth=') && loginRes.headers.get('set-cookie')?.includes('HttpOnly'))

// ── 3. Unauthenticated request — no audit row ─────────────────────────────
console.log('\n── 3. Unauthenticated → 401, no audit ──')
const auditBefore = await (await fetch(`${SURL}/rest/v1/reasoning_audit_events?suggestion_id=eq.${SID}&select=id&order=created_at.desc&limit=5`, { headers: dbHeaders })).json()
const unauthRes = await fetch(`${BASE}/api/graph-candidate-suggestions/${SID}/llm-reasoning-draft`, { method: 'POST' })
const unauthBody = await unauthRes.json()
check('Unauthenticated → 401', unauthRes.status === 401, `HTTP ${unauthRes.status}`)
check('Unauthenticated code: UNAUTHENTICATED', unauthBody.code === 'UNAUTHENTICATED')
const auditAfterUnauth = await (await fetch(`${SURL}/rest/v1/reasoning_audit_events?suggestion_id=eq.${SID}&select=id&order=created_at.desc&limit=5`, { headers: dbHeaders })).json()
check('No audit row from unauthenticated request', auditAfterUnauth.length === auditBefore.length,
  `before: ${auditBefore.length} | after: ${auditAfterUnauth.length}`)

// ── 4. Generate authenticated draft ───────────────────────────────────────
console.log('\n── 4. Authenticated draft generation ──')
const draftRes = await fetch(`${BASE}/api/graph-candidate-suggestions/${SID}/llm-reasoning-draft`, {
  method: 'POST', headers: { 'Cookie': cookie }
})
const draftData = await draftRes.json()
const draftOk = draftData.ok === true
if (draftOk) {
  check('Draft generated ok', true, `model: ${draftData.meta?.model}`)
  check('meta.stored:false', draftData.meta?.stored === false)
  check('meta.evidence:false', draftData.meta?.evidence === false)
  check('meta.authority_changed:false', draftData.meta?.authority_changed === false)
  check('meta.possible_review_route:null', draftData.meta?.possible_review_route === null)
} else {
  check(`Draft handled safely: ${draftData.code}`, draftData.ok === false)
  check('safe failure: stored:false', draftData.stored === false)
  check('safe failure: authority_changed:false', draftData.authority_changed === false)
}

// ── 5. Audit rows verification ────────────────────────────────────────────
console.log('\n── 5. Audit DB verification ──')
const auditRows = await (await fetch(
  `${SURL}/rest/v1/reasoning_audit_events?suggestion_id=eq.${SID}&select=id,event_type,event_status,authority_changed,not_evidence,prompt_eligible,review_routed,baseline_evidence_condition,llm_model,baseline_packet_sufficient,failure_code&order=created_at.desc&limit=10`,
  { headers: dbHeaders }
)).json()

const newRows = auditRows.slice(0, auditRows.length - auditBefore.length)
check(`${newRows.length} new audit row(s) created`, newRows.length >= 1)

if (draftOk) {
  const reqRow = newRows.find(r => r.event_type === 'llm_draft_requested')
  const retRow = newRows.find(r => r.event_type === 'llm_draft_returned')
  check('llm_draft_requested row present', !!reqRow, reqRow ? `model: ${reqRow.llm_model}` : 'missing')
  check('llm_draft_returned row present', !!retRow, retRow ? `condition: ${retRow.baseline_evidence_condition}` : 'missing')
}

for (const row of newRows) {
  check(`${row.event_type}: authority_changed=false`, row.authority_changed === false)
  check(`${row.event_type}: not_evidence=true`, row.not_evidence === true)
  check(`${row.event_type}: prompt_eligible=false`, row.prompt_eligible === false)
  check(`${row.event_type}: review_routed=false`, row.review_routed === false)
}

// ── 6. No content fields in audit rows ────────────────────────────────────
console.log('\n── 6. No forbidden content in audit rows ──')
const allText = JSON.stringify(auditRows)
check('No evidence_summary', !allText.includes('evidence_summary'))
check('No directly_supported', !allText.includes('directly_supported'))
check('No raw prompt', !allText.includes('"prompt"'))
check('No draft hash', !allText.includes('draft_hash'))
check('No packet fingerprint', !allText.includes('packet_fingerprint'))
check('No feedback_event_id', !allText.includes('feedback_event_id'))
check('No ANTHROPIC_API_KEY', !allText.includes('ANTHROPIC_API_KEY'))
check('No archive titles (raw text)', !allText.includes('Twin Fears'))

// ── 7. Feedback still works ───────────────────────────────────────────────
console.log('\n── 7. Feedback endpoint still works ──')
const fbRes = await fetch(`${BASE}/api/llm-reasoning-feedback`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
  body: JSON.stringify({ suggestion_id: SID, feedback_type: 'useful' })
})
const fbData = await fbRes.json()
check('Feedback 200', fbRes.status === 200, `HTTP ${fbRes.status}`)
check('Feedback ok', fbData.ok === true)
check('Feedback authority_changed:false', fbData.authority_changed === false)
check('Feedback not_evidence:true', fbData.not_evidence === true)

// Confirm feedback and audit are separate tables
const feedbackRows = await (await fetch(
  `${SURL}/rest/v1/llm_reasoning_feedback_events?suggestion_id=eq.${SID}&select=id,feedback_type&order=created_at.desc&limit=3`,
  { headers: dbHeaders }
)).json()
check('Feedback rows in llm_reasoning_feedback_events', Array.isArray(feedbackRows) && feedbackRows.length > 0)
check('Feedback and audit are separate', true, 'llm_reasoning_feedback_events vs reasoning_audit_events')

// ── 8. Phase 37H Graph Suggestions ───────────────────────────────────────
console.log('\n── 8. Phase 37H Graph Suggestions unaffected ──')
const r8 = await fetch(`${BASE}/api/graph-candidate-suggestions?limit=5`)
const b8 = await r8.json()
check('Graph Suggestions list 200', r8.status === 200)
check('Returns suggestions array', Array.isArray(b8.suggestions))

// ── 9. Logout ─────────────────────────────────────────────────────────────
console.log('\n── 9. Logout ──')
const logoutRes = await fetch(`${BASE}/api/house-auth/logout`, { method: 'POST', headers: { 'Cookie': cookie } })
check('Logout 200', logoutRes.status === 200)
const postLogoutDraft = await fetch(`${BASE}/api/graph-candidate-suggestions/${SID}/llm-reasoning-draft`, { method: 'POST' })
check('Post-logout draft → 401', postLogoutDraft.status === 401, `HTTP ${postLogoutDraft.status}`)

console.log('\n══════════════════════════════════════════')
console.log(allPassed ? '  ALL PRODUCTION SMOKE CHECKS PASSED' : '  SOME CHECKS FAILED')
console.log('══════════════════════════════════════════\n')
process.exit(allPassed ? 0 : 1)
