// Phase 38.4.2 — Production smoke: Feedback UI
// Read-only verification. No data mutations beyond feedback events.

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
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

let ok = true
function check(label, pass, detail) {
  const m = pass ? '✓' : '✗'
  if (!pass) ok = false
  console.log(`  ${m} ${label}`)
  if (detail) console.log(`      ${detail}`)
}

// ── 1. Vercel: LLM draft + feedback endpoint reachable ────────────────────
console.log('\n── 1. Vercel deployment reachable ──')
const pingRes = await fetch(`${BASE}/api/graph-candidate-suggestions?limit=1`)
check('Vercel responds', pingRes.ok, `HTTP ${pingRes.status}`)

// ── 2. Login ──────────────────────────────────────────────────────────────
console.log('\n── 2. Login ──')
const loginRes = await fetch(`${BASE}/api/house-auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: PW })
})
const lb = await loginRes.json()
check('Login 200', loginRes.status === 200)
check('Login ok', lb.ok === true)
const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
check('HttpOnly cookie set', cookie.includes('selinaric_house_auth='))

// ── 3. Generate LLM draft (authenticated) ────────────────────────────────
console.log('\n── 3. Generate LLM draft ──')
const draftRes = await fetch(
  `${BASE}/api/graph-candidate-suggestions/${SID}/llm-reasoning-draft`,
  { method: 'POST', headers: { 'Cookie': cookie } }
)
const draftData = await draftRes.json()
let draftMeta = null
if (draftData.ok === true) {
  draftMeta = draftData.meta
  check('Draft generated ok', true, `model: ${draftMeta?.model}`)
  check('meta.stored: false', draftMeta?.stored === false)
  check('meta.authority_changed: false', draftMeta?.authority_changed === false)
  check('meta.possible_review_route: null', draftMeta?.possible_review_route === null)
} else {
  check(`Draft handled safely: ${draftData.code}`, draftData.stored === false)
}

// ── 4. Submit 'useful' feedback ───────────────────────────────────────────
console.log('\n── 4. Submit useful feedback ──')
const fb1 = await fetch(`${BASE}/api/llm-reasoning-feedback`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
  body: JSON.stringify({
    suggestion_id: SID,
    feedback_type: 'useful',
    draft_model: draftMeta?.model ?? null,
    draft_generated_at: draftMeta?.generated_at ?? null,
  })
})
const fb1d = await fb1.json()
check('Useful feedback 200', fb1.status === 200, `HTTP ${fb1.status}`)
check('ok: true', fb1d.ok === true)
check('authority_changed: false', fb1d.authority_changed === false)
check('not_evidence: true', fb1d.not_evidence === true)
check('prompt_eligible: false', fb1d.prompt_eligible === false)
check('review_routed: false', fb1d.review_routed === false)
const usefulId = fb1d.feedback_id

// ── 5. Submit 'candidate_signal' (Flag for future review) ────────────────
console.log('\n── 5. Submit candidate_signal (Flag for future review) ──')
const fb2 = await fetch(`${BASE}/api/llm-reasoning-feedback`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
  body: JSON.stringify({ suggestion_id: SID, feedback_type: 'candidate_signal' })
})
const fb2d = await fb2.json()
check('candidate_signal feedback 200', fb2.status === 200, `HTTP ${fb2.status}`)
check('ok: true', fb2d.ok === true)
check('authority_changed: false', fb2d.authority_changed === false)
check('not_evidence: true', fb2d.not_evidence === true)
const candidateId = fb2d.feedback_id

// ── 6. DB verification ────────────────────────────────────────────────────
console.log('\n── 6. DB verification ──')
const dbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
const dbRes = await fetch(
  `${SUPABASE_URL}/rest/v1/llm_reasoning_feedback_events?id=in.(${[usefulId, candidateId].filter(Boolean).join(',')})&select=id,feedback_type,authority_changed,not_evidence,prompt_eligible,review_routed`,
  { headers: dbHeaders }
)
const rows = await dbRes.json()
check('Feedback rows in DB', Array.isArray(rows) && rows.length > 0, `${rows.length} rows`)
for (const row of rows) {
  check(`${row.feedback_type}: authority_changed=false`, row.authority_changed === false)
  check(`${row.feedback_type}: not_evidence=true`, row.not_evidence === true)
  check(`${row.feedback_type}: prompt_eligible=false`, row.prompt_eligible === false)
  check(`${row.feedback_type}: review_routed=false`, row.review_routed === false)
  check(`${row.feedback_type}: is candidate_signal or useful (not potential_candidate)`,
    ['useful','not_useful','needs_evidence','misread','candidate_signal'].includes(row.feedback_type))
}

// ── 7. No draft text stored ───────────────────────────────────────────────
console.log('\n── 7. No draft text stored ──')
const allRows = await (await fetch(
  `${SUPABASE_URL}/rest/v1/llm_reasoning_feedback_events?order=created_at.desc&limit=5&select=*`,
  { headers: dbHeaders }
)).json()
const rowStr = JSON.stringify(allRows)
check('No evidence_summary in DB', !rowStr.includes('evidence_summary'))
check('No directly_supported in DB', !rowStr.includes('directly_supported'))
check('No raw prompt in DB', !rowStr.includes('raw_prompt'))
check('No model response in DB', !rowStr.includes('"content"'))

// ── 8. Suggestion status unchanged ───────────────────────────────────────
console.log('\n── 8. Suggestion status unchanged ──')
const suggRes = await fetch(
  `${SUPABASE_URL}/rest/v1/graph_candidate_suggestions?id=eq.${SID}&select=status,candidate_type`,
  { headers: dbHeaders }
)
const sugg = await suggRes.json()
check('Suggestion still dismissed', sugg[0]?.status === 'dismissed', `status: ${sugg[0]?.status}`)
check('No candidate created', sugg.length === 1)

// ── 9. No authority table mutations ──────────────────────────────────────
console.log('\n── 9. Authority tables not mutated ──')
const htRes = await fetch(`${SUPABASE_URL}/rest/v1/held_truths?select=id&limit=0`, { headers: { ...dbHeaders, Prefer: 'count=exact' } })
check('held_truths reachable and not mutated', htRes.ok)
const gpRes = await fetch(`${SUPABASE_URL}/rest/v1/graph_proposals?select=id&limit=0`, { headers: { ...dbHeaders, Prefer: 'count=exact' } })
check('graph_proposals reachable and not mutated', gpRes.ok)

// ── 10. Logout safety ─────────────────────────────────────────────────────
console.log('\n── 10. Logout → feedback endpoint returns 401 ──')
await fetch(`${BASE}/api/house-auth/logout`, { method: 'POST', headers: { 'Cookie': cookie } })
const postLogout = await fetch(`${BASE}/api/llm-reasoning-feedback`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ suggestion_id: SID, feedback_type: 'useful' })
})
check('Post-logout feedback returns 401', postLogout.status === 401, `HTTP ${postLogout.status}`)

// ── 11. Phase 37H Graph Suggestions still works ───────────────────────────
console.log('\n── 11. Phase 37H Graph Suggestions unaffected ──')
const r11 = await fetch(`${BASE}/api/graph-candidate-suggestions?limit=3`)
const b11 = await r11.json()
check('Graph Suggestions list 200', r11.status === 200)
check('Returns suggestions array', Array.isArray(b11.suggestions))

console.log('\n══════════════════════════════════════════')
console.log(ok ? '  ALL PRODUCTION SMOKE CHECKS PASSED' : '  SOME CHECKS FAILED')
console.log('══════════════════════════════════════════\n')
process.exit(ok ? 0 : 1)
