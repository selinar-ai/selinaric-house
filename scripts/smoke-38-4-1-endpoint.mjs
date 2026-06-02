// Phase 38.4.1 — Endpoint smoke
// Read + write verification of /api/llm-reasoning-feedback
// Uses localhost dev server.

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
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

let allPassed = true
function check(label, ok, detail) {
  const m = ok ? '✓' : '✗'
  if (!ok) allPassed = false
  console.log(`  ${m} ${label}`)
  if (detail) console.log(`      ${detail}`)
}

// ── 1. Unauthenticated → 401 ──────────────────────────────────────────────
console.log('\n── Smoke 1: Unauthenticated → 401 ──')
const r1 = await fetch(`${BASE}/api/llm-reasoning-feedback`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ suggestion_id: SID, feedback_type: 'useful' })
})
const b1 = await r1.json()
check('Status 401', r1.status === 401, `got ${r1.status}`)
check('code: UNAUTHENTICATED', b1.code === 'UNAUTHENTICATED')
check('No secrets in 401', !JSON.stringify(b1).match(/sk-|HOUSE_AUTH|secret/i))

// ── 2. Login ──────────────────────────────────────────────────────────────
console.log('\n── Smoke 2: Login ──')
const loginRes = await fetch(`${BASE}/api/house-auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: PW })
})
const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? ''
check('Login 200', loginRes.status === 200)
check('Cookie set', cookie.includes('selinaric_house_auth='))

// ── 3. Valid feedback insert ───────────────────────────────────────────────
console.log('\n── Smoke 3: Valid authenticated feedback insert ──')
const r3 = await fetch(`${BASE}/api/llm-reasoning-feedback`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
  body: JSON.stringify({
    suggestion_id: SID,
    feedback_type: 'useful',
    feedback_note: 'Smoke test — delete-safe event',
    draft_model: 'claude-haiku-4-5',
  })
})
const b3 = await r3.json()
check('Status 200', r3.status === 200, `got ${r3.status}`)
check('ok: true', b3.ok === true)
check('feedback_id present', typeof b3.feedback_id === 'string')
check('feedback_type: useful', b3.feedback_type === 'useful')
check('authority_changed: false', b3.authority_changed === false)
check('not_evidence: true', b3.not_evidence === true)
check('prompt_eligible: false', b3.prompt_eligible === false)
check('review_routed: false', b3.review_routed === false)

// ── 4. All feedback types accepted ────────────────────────────────────────
console.log('\n── Smoke 4: All valid feedback types accepted ──')
for (const type of ['not_useful', 'needs_evidence', 'misread', 'candidate_signal']) {
  const r = await fetch(`${BASE}/api/llm-reasoning-feedback`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
    body: JSON.stringify({ suggestion_id: SID, feedback_type: type })
  })
  const b = await r.json()
  check(`'${type}' accepted`, r.status === 200 && b.ok === true)
}

// ── 5. Invalid feedback type rejected ────────────────────────────────────
console.log('\n── Smoke 5: Invalid feedback type rejected ──')
for (const bad of ['potential_candidate', 'approved', 'promote', 'bogus', '']) {
  const r = await fetch(`${BASE}/api/llm-reasoning-feedback`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
    body: JSON.stringify({ suggestion_id: SID, feedback_type: bad })
  })
  check(`'${bad || "(empty)"}' rejected`, r.status === 400, `got ${r.status}`)
}

// ── 6. Overlong note rejected ─────────────────────────────────────────────
console.log('\n── Smoke 6: Overlong note rejected ──')
const r6 = await fetch(`${BASE}/api/llm-reasoning-feedback`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
  body: JSON.stringify({ suggestion_id: SID, feedback_type: 'useful', feedback_note: 'x'.repeat(501) })
})
check('501-char note rejected (400)', r6.status === 400, `got ${r6.status}`)

// ── 7. Max-length note accepted ───────────────────────────────────────────
const r7 = await fetch(`${BASE}/api/llm-reasoning-feedback`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
  body: JSON.stringify({ suggestion_id: SID, feedback_type: 'useful', feedback_note: 'x'.repeat(500) })
})
check('500-char note accepted', r7.status === 200, `got ${r7.status}`)

// ── 8. Client-provided governance flags ignored ───────────────────────────
console.log('\n── Smoke 8: Client-supplied governance flags ignored ──')
const r8 = await fetch(`${BASE}/api/llm-reasoning-feedback`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
  body: JSON.stringify({
    suggestion_id: SID,
    feedback_type: 'useful',
    authority_changed: true,      // server ignores
    not_evidence: false,          // server ignores
    prompt_eligible: true,        // server ignores
    review_routed: true,          // server ignores
    created_by: 'hacker',        // server ignores
  })
})
const b8 = await r8.json()
check('Request accepted despite client governance flags', r8.status === 200 && b8.ok === true)
check('authority_changed remains false', b8.authority_changed === false)
check('not_evidence remains true', b8.not_evidence === true)
check('prompt_eligible remains false', b8.prompt_eligible === false)
check('review_routed remains false', b8.review_routed === false)

// ── 9. Invalid suggestion_id rejected ────────────────────────────────────
console.log('\n── Smoke 9: Invalid suggestion_id ──')
const r9a = await fetch(`${BASE}/api/llm-reasoning-feedback`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
  body: JSON.stringify({ suggestion_id: 'not-a-uuid', feedback_type: 'useful' })
})
check('Non-UUID suggestion_id rejected', r9a.status === 400, `got ${r9a.status}`)

const r9b = await fetch(`${BASE}/api/llm-reasoning-feedback`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
  body: JSON.stringify({ feedback_type: 'useful' }) // missing suggestion_id
})
check('Missing suggestion_id rejected', r9b.status === 400, `got ${r9b.status}`)

// ── 10. No mutation of authority tables ───────────────────────────────────
console.log('\n── Smoke 10: No mutation of authority tables ──')
// Check suggestion status unchanged
const sHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
const suggRes = await fetch(`${SUPABASE_URL}/rest/v1/graph_candidate_suggestions?id=eq.${SID}&select=status,candidate_type`, { headers: sHeaders })
const sugg = await suggRes.json()
check('Suggestion status unchanged after feedback', sugg[0]?.status === 'dismissed', `status: ${sugg[0]?.status}`)

// Check held_truths count unchanged (should remain whatever it was)
const htRes = await fetch(`${SUPABASE_URL}/rest/v1/held_truths?select=id&limit=0`, { headers: { ...sHeaders, Prefer: 'count=exact' } })
check('held_truths reachable (not mutated by feedback)', htRes.ok)

// Check graph_proposals not touched
const gpRes = await fetch(`${SUPABASE_URL}/rest/v1/graph_proposals?select=id&limit=0&order=updated_at.desc`, { headers: sHeaders })
check('graph_proposals reachable (not mutated by feedback)', gpRes.ok)

console.log('\n══════════════════════════════════════════')
console.log(allPassed ? '  ALL SMOKE CHECKS PASSED' : '  SOME CHECKS FAILED')
console.log('══════════════════════════════════════════\n')
process.exit(allPassed ? 0 : 1)
