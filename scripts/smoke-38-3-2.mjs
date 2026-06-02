// Phase 38.3.2a — Route Smoke Script
// Read-only. No writes. No storage. Tests the LLM draft route against live server.

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

const BASE = 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const HAS_LLM_KEY = !!process.env.ANTHROPIC_API_KEY

let allPassed = true
function check(label, ok, detail) {
  const mark = ok ? '✓' : '✗'
  if (!ok) allPassed = false
  console.log(`  ${mark} ${label}`)
  if (detail) console.log(`      ${detail}`)
}

console.log(`\n── Route availability ──`)
check('ANTHROPIC_API_KEY present', HAS_LLM_KEY, HAS_LLM_KEY ? undefined : 'LLM_UNAVAILABLE expected')

// 1. Fetch existing suggestions from Supabase directly
const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
const sugRes = await fetch(`${SUPABASE_URL}/rest/v1/graph_candidate_suggestions?select=id,candidate_type,status&deleted_at=is.null&order=created_at.desc&limit=5`, { headers })
const suggestions = sugRes.ok ? await sugRes.json() : []
console.log(`\n── Existing suggestions ──`)
check(`DB reachable and returned ${suggestions.length} suggestion(s)`, sugRes.ok)
if (suggestions.length > 0) {
  for (const s of suggestions) console.log(`      id=${s.id} type=${s.candidate_type} status=${s.status}`)
}

// 2. Route responds (POST with non-existent ID → should get hydration failure)
console.log(`\n── Route availability — non-existent ID ──`)
const nonExistentRes = await fetch(`${BASE}/api/graph-candidate-suggestions/00000000-0000-0000-0000-000000000000/llm-reasoning-draft`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }
})
check('Route responds to POST', [404, 400, 422, 503].includes(nonExistentRes.status), `HTTP ${nonExistentRes.status}`)
const nonExistentBody = await nonExistentRes.json()
check('Non-existent ID returns ok:false', nonExistentBody.ok === false)
check('Non-existent ID returns stored:false', nonExistentBody.stored === false)
check('Non-existent ID returns evidence:false', nonExistentBody.evidence === false)
check('Non-existent ID returns authority_changed:false', nonExistentBody.authority_changed === false)
check('Non-existent ID does not expose raw prompt or stack trace', !JSON.stringify(nonExistentBody).includes('ANTHROPIC_API_KEY') && !JSON.stringify(nonExistentBody).includes('supabase'))

// 3. Try a real suggestion (if any exist and has sufficient packet)
if (suggestions.length > 0) {
  const targetId = suggestions[0].id
  console.log(`\n── Live suggestion smoke — id: ${targetId} ──`)

  const draftRes = await fetch(`${BASE}/api/graph-candidate-suggestions/${targetId}/llm-reasoning-draft`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }
  })

  const draftBody = await draftRes.json()

  if (!HAS_LLM_KEY) {
    check('No API key → LLM_UNAVAILABLE (expected)', draftBody.code === 'LLM_UNAVAILABLE' || draftBody.code === 'INSUFFICIENT_PACKET' || !draftBody.ok)
    check('No API key → stored:false', draftBody.stored === false)
    check('No API key → evidence:false', draftBody.evidence === false)
    check('No API key → authority_changed:false', draftBody.authority_changed === false)
    check('No API key → no secret exposed in response', !JSON.stringify(draftBody).includes('sk-') && !JSON.stringify(draftBody).includes('ANTHROPIC'))
  } else if (draftBody.ok === true) {
    console.log('  [live LLM call succeeded]')
    const draft = draftBody.draft
    const meta = draftBody.meta
    check('Draft has evidence_summary', typeof draft?.evidence_summary === 'string' && draft.evidence_summary.length > 0)
    check('Draft has authority_boundary', typeof draft?.authority_boundary === 'string')
    check('authority_boundary contains mandatory header', draft?.authority_boundary?.includes('Does not change authority'))
    check('possible_review_route is null in draft', draft?.possible_review_route === null)
    check('possible_review_route is null in meta', meta?.possible_review_route === null)
    check('meta.stored is false', meta?.stored === false)
    check('meta.evidence is false', meta?.evidence === false)
    check('meta.authority_changed is false', meta?.authority_changed === false)
    check('do_not_conclude includes base items', Array.isArray(draft?.do_not_conclude) && draft.do_not_conclude.some(i => i.includes('Memory')))
    const allText = JSON.stringify(draft).toLowerCase()
    const forbiddenFound = ['approve this', 'the graph confirms', 'this is true', 'verdict', 'confidence score'].find(p => allText.includes(p.toLowerCase()))
    check('No forbidden language in draft', !forbiddenFound, forbiddenFound ? `Found: "${forbiddenFound}"` : undefined)
  } else {
    check(`Failure handled safely: ${draftBody.code}`, draftBody.ok === false)
    check('Failure: stored:false', draftBody.stored === false)
    check('Failure: evidence:false', draftBody.evidence === false)
    check('Failure: authority_changed:false', draftBody.authority_changed === false)
  }
} else {
  console.log('\n  [no suggestions in DB — skipping live suggestion smoke]')
}

// 4. GET should not be a valid method
console.log(`\n── Method boundary ──`)
const getRes = await fetch(`${BASE}/api/graph-candidate-suggestions/00000000-0000-0000-0000-000000000000/llm-reasoning-draft`, { method: 'GET' })
check('GET returns 405 (POST-only route)', getRes.status === 405, `HTTP ${getRes.status}`)

console.log('\n══════════════════════════════════════════')
console.log(allPassed ? '  ALL SMOKE CHECKS PASSED' : '  SOME CHECKS FAILED')
console.log('══════════════════════════════════════════\n')
process.exit(allPassed ? 0 : 1)
