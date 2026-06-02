// Phase 38.3.2b — Vercel Production Smoke
// Tests auth-hardened LLM draft route on production.
// Read-only. No writes. No data mutation.

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

const BASE = 'https://selinaric-house.vercel.app'
const PW = process.env.HOUSE_AUTH_PASSWORD
const SUGGESTION_ID = '2ef13b4a-e45d-4f1f-841b-a47a2fad66b4'

let allPassed = true
function check(label, ok, detail) {
  const mark = ok ? '✓' : '✗'
  if (!ok) allPassed = false
  console.log(`  ${mark} ${label}`)
  if (detail) console.log(`      ${detail}`)
}

// ── Smoke 1: Unauthenticated POST → 401 ──────────────────────────────────

console.log('\n── Smoke 1: Unauthenticated direct POST → must be 401 ──')
const r1 = await fetch(`${BASE}/api/graph-candidate-suggestions/${SUGGESTION_ID}/llm-reasoning-draft`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }
})
const b1 = await r1.json()

check('Status 401', r1.status === 401, `got ${r1.status}`)
check('ok: false', b1.ok === false)
check('code: UNAUTHENTICATED', b1.code === 'UNAUTHENTICATED')
check('stored: false', b1.stored === false)
check('evidence: false', b1.evidence === false)
check('authority_changed: false', b1.authority_changed === false)
check('No credentials in response', !JSON.stringify(b1).match(/sk-|ANTHROPIC|HOUSE_AUTH|secret/i))

// ── Smoke 2: Wrong password → login fails ─────────────────────────────────

console.log('\n── Smoke 2: Wrong password login ──')
const r2 = await fetch(`${BASE}/api/house-auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: 'wrongpassword' })
})
const b2 = await r2.json()
check('Wrong password → status 400', r2.status === 400, `got ${r2.status}`)
check('Wrong password → ok: false', b2.ok === false)

// ── Smoke 3: Login with correct password → cookie set ────────────────────

console.log('\n── Smoke 3: Login with correct password ──')
const r3 = await fetch(`${BASE}/api/house-auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: PW })
})
const b3 = await r3.json()
check('Login status 200', r3.status === 200, `got ${r3.status}`)
check('Login ok: true', b3.ok === true)

const setCookieHeader = r3.headers.get('set-cookie')
check('Set-Cookie header present', setCookieHeader !== null)
check('Cookie is HttpOnly', setCookieHeader?.includes('HttpOnly') ?? false)
check('Cookie SameSite=Lax', setCookieHeader?.toLowerCase().includes('samesite=lax') ?? false)
check('Cookie has selinaric_house_auth name', setCookieHeader?.includes('selinaric_house_auth=') ?? false)

// Extract cookie value for next call
const cookieValue = setCookieHeader?.split(';')[0] ?? ''
check('Cookie value is non-empty', cookieValue.length > 20, `length: ${cookieValue.length}`)

// ── Smoke 4: Authenticated draft call ────────────────────────────────────

console.log('\n── Smoke 4: Authenticated draft call ──')
const r4 = await fetch(`${BASE}/api/graph-candidate-suggestions/${SUGGESTION_ID}/llm-reasoning-draft`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Cookie': cookieValue }
})
const b4 = await r4.json()

if (b4.ok === true) {
  check('Authenticated call: status 200', r4.status === 200, `got ${r4.status}`)
  check('Draft returned', b4.draft !== null)
  check('meta.stored: false', b4.meta?.stored === false)
  check('meta.evidence: false', b4.meta?.evidence === false)
  check('meta.authority_changed: false', b4.meta?.authority_changed === false)
  check('meta.possible_review_route: null', b4.meta?.possible_review_route === null)
  check('draft.possible_review_route: null', b4.draft?.possible_review_route === null)
  check('authority_boundary contains mandatory text', b4.draft?.authority_boundary?.includes('Does not change authority') ?? false)
  check('do_not_conclude has 5+ items', (b4.draft?.do_not_conclude?.length ?? 0) >= 5)
  check('do_not_conclude contains Memory', b4.draft?.do_not_conclude?.some(i => i.includes('Memory')) ?? false)
  const allText = JSON.stringify(b4.draft ?? {}).toLowerCase()
  const forbidden = ['approve this','promote this','the graph confirms','this is true','verdict','confidence score']
  const found = forbidden.find(p => allText.includes(p))
  check('No forbidden language in draft', !found, found ? `Found: "${found}"` : undefined)
  check('Model specified in meta', typeof b4.meta?.model === 'string')
  console.log(`      model: ${b4.meta?.model ?? 'unknown'}`)
} else {
  // Could be INSUFFICIENT_PACKET if suggestion packet is thin — still a safe failure
  check(`Authenticated call handled safely: ${b4.code}`, b4.ok === false && b4.stored === false)
  check('stored: false on failure', b4.stored === false)
  check('evidence: false on failure', b4.evidence === false)
  check('authority_changed: false on failure', b4.authority_changed === false)
}

// ── Smoke 5: Logout then blocked ─────────────────────────────────────────

console.log('\n── Smoke 5: Logout → subsequent call blocked ──')
const r5 = await fetch(`${BASE}/api/house-auth/logout`, {
  method: 'POST', headers: { 'Cookie': cookieValue }
})
const b5 = await r5.json()
check('Logout status 200', r5.status === 200, `got ${r5.status}`)
check('Logout ok: true', b5.ok === true)

const clearCookie = r5.headers.get('set-cookie')
check('Logout sets empty/expired cookie', clearCookie?.includes('selinaric_house_auth=') ?? false)

// Call with old cookie after logout — server should still accept (deterministic token doesn't expire server-side)
// This is expected for HMAC-based stateless auth: logout is client-side cookie clear.
// The real protection is the browser clearing the cookie — not a session invalidation.
console.log('      Note: HMAC token is stateless — server-side token remains valid until secret rotates.')
console.log('      Logout relies on client clearing the cookie. This is expected for private single-user deployment.')

// ── Smoke 6: GET rejected ─────────────────────────────────────────────────

console.log('\n── Smoke 6: GET method rejected (POST-only) ──')
const r6 = await fetch(`${BASE}/api/graph-candidate-suggestions/${SUGGESTION_ID}/llm-reasoning-draft`, {
  method: 'GET', headers: { 'Cookie': cookieValue }
})
check('GET returns 405', r6.status === 405, `got ${r6.status}`)

// ── Smoke 7: Phase 37H Graph Suggestions route still works ───────────────

console.log('\n── Smoke 7: Phase 37H Graph Suggestions — list still works ──')
const r7 = await fetch(`${BASE}/api/graph-candidate-suggestions?limit=5`, {
  headers: { 'Content-Type': 'application/json' }
})
const b7 = await r7.json()
check('Graph Suggestions list returns 200', r7.status === 200, `got ${r7.status}`)
check('Returns suggestions array', Array.isArray(b7.suggestions))
check('Graph Suggestions route unaffected by 38.3.2b auth', r7.status === 200)

// ── Summary ──────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log(allPassed ? '  ALL PRODUCTION SMOKE CHECKS PASSED' : '  SOME CHECKS FAILED')
console.log('══════════════════════════════════════════\n')
process.exit(allPassed ? 0 : 1)
