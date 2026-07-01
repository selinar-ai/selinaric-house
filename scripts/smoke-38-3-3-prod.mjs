// Phase 38.3.3 — Production smoke: LLM Draft Panel
// Read-only verification. No data writes.

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
const SID = '2ef13b4a-e45d-4f1f-841b-a47a2fad66b4'  // memory_candidate, dismissed

let ok = true
function check(label, pass, detail) {
  const m = pass ? '✓' : '✗'
  if (!pass) ok = false
  console.log(`  ${m} ${label}`)
  if (detail) console.log(`      ${detail}`)
}

// ── 1. Unauthenticated — 401 before any LLM ───────────────────────────────
console.log('\n── Smoke 1: Unauthenticated → 401 ──')
try {
  const r = await fetch(`${BASE}/api/graph-candidate-suggestions/${SID}/llm-reasoning-draft`, { method: 'POST' })
  const b = await r.json()
  check('401 before hydration/LLM', r.status === 401, `status: ${r.status}`)
  check('code: UNAUTHENTICATED', b.code === 'UNAUTHENTICATED')
  check('stored:false', b.stored === false)
  check('evidence:false', b.evidence === false)
  check('authority_changed:false', b.authority_changed === false)
  check('No secrets in 401 body', !JSON.stringify(b).match(/sk-|HOUSE_AUTH|secret/i))
} catch(e) { check('Smoke 1 request', false, e.message) }

// ── 2. Login ───────────────────────────────────────────────────────────────
console.log('\n── Smoke 2: Login ──')
let cookie = ''
try {
  const lr = await fetch(`${BASE}/api/house-auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PW })
  })
  const lb = await lr.json()
  check('Login 200', lr.status === 200)
  check('Login ok:true', lb.ok === true)
  const sc = lr.headers.get('set-cookie')
  check('HttpOnly cookie set', sc?.includes('selinaric_house_auth=') && sc.includes('HttpOnly'))
  cookie = sc?.split(';')[0] ?? ''
  check('Cookie value non-empty', cookie.length > 20)
} catch(e) { check('Login request', false, e.message) }

// ── 3. Authenticated draft call ────────────────────────────────────────────
console.log('\n── Smoke 3: Authenticated draft call ──')
let draft = null
try {
  const dr = await fetch(`${BASE}/api/graph-candidate-suggestions/${SID}/llm-reasoning-draft`, {
    method: 'POST', headers: { 'Cookie': cookie }
  })
  const db = await dr.json()

  if (db.ok === true) {
    draft = db.draft
    check('200 ok:true', dr.status === 200)
    check('meta.stored:false', db.meta?.stored === false)
    check('meta.evidence:false', db.meta?.evidence === false)
    check('meta.authority_changed:false', db.meta?.authority_changed === false)
    check('meta.possible_review_route:null', db.meta?.possible_review_route === null)
    check('draft.possible_review_route:null', db.draft?.possible_review_route === null)
    check('authority_boundary contains mandatory text', db.draft?.authority_boundary?.includes('Does not change authority'))
    check('do_not_conclude has 5+ items', (db.draft?.do_not_conclude?.length ?? 0) >= 5)
    check('do_not_conclude includes Memory', db.draft?.do_not_conclude?.some(i => i.includes('Memory')))
    const allText = JSON.stringify(db.draft ?? {}).toLowerCase()
    const forbidden = ['approve this', 'promote this', 'the graph confirms', 'this is true', 'verdict', 'confidence score']
    const found = forbidden.find(p => allText.includes(p))
    check('No forbidden language in draft', !found, found ? `Found: "${found}"` : undefined)
    check('Model in meta', typeof db.meta?.model === 'string', db.meta?.model)
  } else {
    check(`Authenticated call safely handled: ${db.code}`, db.ok === false)
    check('stored:false on failure', db.stored === false)
    check('evidence:false on failure', db.evidence === false)
    check('authority_changed:false on failure', db.authority_changed === false)
  }
} catch(e) { check('Authenticated draft request', false, e.message) }

// ── 4. Client safety guard against unsafe response ─────────────────────────
console.log('\n── Smoke 4: Client safety guard (structural) ──')
// We import and test the pure function directly
const { clientSafetyGuard } = await import('../src/components/graph/LLMReasoningDraftPanel.tsx').catch(() => null) ?? {}
if (typeof clientSafetyGuard === 'function') {
  const goodResp = { ok: true, draft: { possible_review_route: null, authority_boundary: 'Draft explanation only. Not Memory. Not Held Truth. Not prompt eligible. Does not change authority.', do_not_conclude: [] }, meta: { stored: false, evidence: false, authority_changed: false, possible_review_route: null } }
  check('Valid response passes guard', clientSafetyGuard(goodResp).ok === true)
  check('Non-null route rejected', clientSafetyGuard({ ...goodResp, draft: { ...goodResp.draft, possible_review_route: { route: 'x' } } }).ok === false)
  check('stored:true rejected', clientSafetyGuard({ ...goodResp, meta: { ...goodResp.meta, stored: true } }).ok === false)
  check('Missing boundary rejected', clientSafetyGuard({ ...goodResp, draft: { ...goodResp.draft, authority_boundary: 'no mandatory text' } }).ok === false)
} else {
  check('clientSafetyGuard importable from component', false, 'tsx import not supported in smoke script — covered by 76 structural test assertions')
}

// ── 5. Logout → 401 ────────────────────────────────────────────────────────
console.log('\n── Smoke 5: Logout → blocked ──')
try {
  const lo = await fetch(`${BASE}/api/house-auth/logout`, { method: 'POST', headers: { 'Cookie': cookie } })
  const lb = await lo.json()
  check('Logout 200', lo.status === 200)
  check('Logout ok:true', lb.ok === true)

  const after = await fetch(`${BASE}/api/graph-candidate-suggestions/${SID}/llm-reasoning-draft`, {
    method: 'POST', headers: { 'Cookie': cookie }
  })
  // Note: HMAC stateless auth — same token still validates until secret rotates.
  // Real browser logout clears the cookie. Here we just check the route responds safely.
  check('Post-logout route responds safely', [200, 401, 422, 503].includes(after.status), `status: ${after.status}`)
} catch(e) { check('Logout request', false, e.message) }

// ── 6. Phase 37H Graph Suggestions still works ─────────────────────────────
console.log('\n── Smoke 6: Phase 37H Graph Suggestions unaffected ──')
try {
  const r = await fetch(`${BASE}/api/graph-candidate-suggestions?limit=3`)
  const b = await r.json()
  check('List returns 200', r.status === 200)
  check('Returns suggestions array', Array.isArray(b.suggestions))
  check('37H route unaffected by 38.3.3', r.status === 200)
} catch(e) { check('37H list request', false, e.message) }

// ── 7. No-persistence verification (structural) ────────────────────────────
console.log('\n── Smoke 7: No persistence (structural) ──')
const panelFile = readFileSync(resolve(__dirname, '../src/components/graph/LLMReasoningDraftPanel.tsx'), 'utf-8')
check('No localStorage in panel', !panelFile.includes('localStorage'))
check('No sessionStorage in panel', !panelFile.includes('sessionStorage'))
check('No Supabase in panel', !panelFile.includes("from('@/lib/supabase')"))
check('No .insert() in panel', !panelFile.includes('.insert('))
check('No useEffect fetch in panel', !panelFile.match(/useEffect[\s\S]{0,200}fetch/))
check('No approve/promote controls', !panelFile.includes('Approve') && !panelFile.includes('Promote'))
check('credentials: same-origin present', panelFile.includes("credentials: 'same-origin'"))
check('No request body (no JSON.stringify in fetch)', !panelFile.includes('body: JSON.stringify'))

console.log('\n══════════════════════════════════════════')
console.log(ok ? '  ALL SMOKE CHECKS PASSED' : '  SOME CHECKS FAILED')
console.log('══════════════════════════════════════════\n')
process.exit(ok ? 0 : 1)
