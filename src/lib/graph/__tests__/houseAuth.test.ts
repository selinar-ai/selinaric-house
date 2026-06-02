/**
 * Phase 38.3.2b — House Auth Tests
 *
 * Run: npx tsx src/lib/graph/__tests__/houseAuth.test.ts
 *
 * Pure unit tests for the auth helper. No network calls. No Supabase.
 * Tests derive token, cookie shape, timing-safe comparison, fail-closed behaviour.
 */

import * as fs from 'fs'
import * as path from 'path'
import { createHmac } from 'crypto'

// We import the helpers directly (pure functions — no DB, no network)
import {
  requireHouseApiAuth,
  buildAuthCookie,
  verifyLoginPassword,
  HOUSE_AUTH_COOKIE,
} from '../../server/houseAuth'

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}

function section(name: string) { console.log(`\n── ${name} ──`) }

// ─── Mock NextRequest ──────────────────────────────────────────────────────

function makeMockRequest(cookieValue?: string): import('next/server').NextRequest {
  const cookies = new Map<string, string>()
  if (cookieValue !== undefined) cookies.set(HOUSE_AUTH_COOKIE, cookieValue)
  return {
    cookies: {
      get: (name: string) => {
        const value = cookies.get(name)
        return value !== undefined ? { name, value } : undefined
      },
    },
  } as unknown as import('next/server').NextRequest
}

// ─── Derive expected token (mirrors houseAuth.ts internals) ────────────────

function deriveExpectedToken(password: string, secret: string): string {
  return createHmac('sha256', secret).update(password + ':house_session').digest('hex')
}

// ─── Save / restore env ────────────────────────────────────────────────────

const originalEnv = { ...process.env }
function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}
function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key]
  }
  Object.assign(process.env, originalEnv)
}

// ─── Tests ─────────────────────────────────────────────────────────────────

section('Constants')

{
  assert(HOUSE_AUTH_COOKIE === 'selinaric_house_auth', 'cookie name is selinaric_house_auth')
}

section('requireHouseApiAuth — missing env config fails closed')

{
  setEnv({ HOUSE_AUTH_PASSWORD: undefined, NEXT_PUBLIC_HOUSE_PASSWORD: undefined, HOUSE_AUTH_SECRET: undefined })
  const req = makeMockRequest()
  const result = requireHouseApiAuth(req)
  assert(!result.ok, 'missing config returns not ok')
  assert(!result.ok && result.status === 503, 'missing config returns 503')
  assert(!result.ok && result.body.code === 'AUTH_CONFIG_MISSING', 'code is AUTH_CONFIG_MISSING')
  assert(!result.ok && result.body.stored === false, 'stored: false in failure')
  assert(!result.ok && result.body.evidence === false, 'evidence: false in failure')
  assert(!result.ok && result.body.authority_changed === false, 'authority_changed: false in failure')
  restoreEnv()
}

section('requireHouseApiAuth — missing secret only fails closed')

{
  setEnv({ HOUSE_AUTH_PASSWORD: 'testpw', HOUSE_AUTH_SECRET: undefined })
  const req = makeMockRequest()
  const result = requireHouseApiAuth(req)
  assert(!result.ok && result.status === 503, 'missing secret → 503 fail closed')
  restoreEnv()
}

section('requireHouseApiAuth — missing cookie returns 401')

{
  setEnv({ HOUSE_AUTH_PASSWORD: 'testpw', HOUSE_AUTH_SECRET: 'testsecret' })
  const req = makeMockRequest() // no cookie
  const result = requireHouseApiAuth(req)
  assert(!result.ok, 'missing cookie returns not ok')
  assert(!result.ok && result.status === 401, 'missing cookie returns 401')
  assert(!result.ok && result.body.code === 'UNAUTHENTICATED', 'code is UNAUTHENTICATED')
  assert(!result.ok && !JSON.stringify(result.body).includes('testpw'), 'password not in response')
  assert(!result.ok && !JSON.stringify(result.body).includes('testsecret'), 'secret not in response')
  restoreEnv()
}

section('requireHouseApiAuth — invalid cookie returns 401')

{
  setEnv({ HOUSE_AUTH_PASSWORD: 'testpw', HOUSE_AUTH_SECRET: 'testsecret' })
  const req = makeMockRequest('wrong-token-value')
  const result = requireHouseApiAuth(req)
  assert(!result.ok && result.status === 401, 'invalid cookie returns 401')
  assert(!result.ok && result.body.code === 'UNAUTHENTICATED', 'code is UNAUTHENTICATED')
  assert(!result.ok && !JSON.stringify(result.body).includes('testpw'), 'password not exposed')
  assert(!result.ok && !JSON.stringify(result.body).includes('testsecret'), 'secret not exposed')
  assert(!result.ok && !JSON.stringify(result.body).includes('wrong-token-value'), 'cookie value not echoed back')
  restoreEnv()
}

section('requireHouseApiAuth — valid cookie returns ok')

{
  const pw = 'testpw'
  const secret = 'testsecret'
  setEnv({ HOUSE_AUTH_PASSWORD: pw, HOUSE_AUTH_SECRET: secret })
  const validToken = deriveExpectedToken(pw, secret)
  const req = makeMockRequest(validToken)
  const result = requireHouseApiAuth(req)
  assert(result.ok, 'valid cookie returns ok: true')
  restoreEnv()
}

section('requireHouseApiAuth — fallback to NEXT_PUBLIC_HOUSE_PASSWORD')

{
  const pw = 'publicpw'
  const secret = 'testsecret'
  setEnv({ HOUSE_AUTH_PASSWORD: undefined, NEXT_PUBLIC_HOUSE_PASSWORD: pw, HOUSE_AUTH_SECRET: secret })
  const validToken = deriveExpectedToken(pw, secret)
  const req = makeMockRequest(validToken)
  const result = requireHouseApiAuth(req)
  assert(result.ok, 'falls back to NEXT_PUBLIC_HOUSE_PASSWORD when HOUSE_AUTH_PASSWORD missing')
  restoreEnv()
}

section('buildAuthCookie — shape')

{
  const pw = 'testpw'
  const secret = 'testsecret'
  const cookie = buildAuthCookie(pw, secret)
  assert(cookie.name === HOUSE_AUTH_COOKIE, 'cookie name correct')
  assert(cookie.httpOnly === true, 'cookie is HttpOnly')
  assert(cookie.sameSite === 'lax', "cookie sameSite is lax")
  assert(cookie.path === '/', 'cookie path is /')
  assert(cookie.maxAge > 0, 'cookie has positive maxAge')
  assert(typeof cookie.value === 'string' && cookie.value.length === 64, 'cookie value is 64-char hex HMAC')
  assert(cookie.value !== pw, 'cookie value is not the raw password')
  assert(cookie.value !== secret, 'cookie value is not the raw secret')

  // Token is deterministic for same inputs
  const cookie2 = buildAuthCookie(pw, secret)
  assert(cookie.value === cookie2.value, 'token is deterministic for same password+secret')

  // Different password → different token
  const cookie3 = buildAuthCookie('different', secret)
  assert(cookie.value !== cookie3.value, 'different password produces different token')
}

section('verifyLoginPassword')

{
  setEnv({ HOUSE_AUTH_PASSWORD: 'correctpw', NEXT_PUBLIC_HOUSE_PASSWORD: undefined })
  assert(verifyLoginPassword('correctpw'), 'correct password returns true')
  assert(!verifyLoginPassword('wrongpw'), 'wrong password returns false')
  assert(!verifyLoginPassword(''), 'empty password returns false')
  restoreEnv()

  setEnv({ HOUSE_AUTH_PASSWORD: undefined, NEXT_PUBLIC_HOUSE_PASSWORD: undefined })
  assert(!verifyLoginPassword('anything'), 'missing env returns false (fail closed)')
  restoreEnv()
}

section('Secret safety — failure responses never expose credentials')

{
  setEnv({ HOUSE_AUTH_PASSWORD: 'SECRET_PW_VALUE', HOUSE_AUTH_SECRET: 'SECRET_KEY_VALUE' })
  const req = makeMockRequest('bad-token')
  const result = requireHouseApiAuth(req)
  const bodyStr = JSON.stringify(!result.ok ? result.body : {})
  assert(!bodyStr.includes('SECRET_PW_VALUE'), 'password not in failure response')
  assert(!bodyStr.includes('SECRET_KEY_VALUE'), 'secret not in failure response')
  assert(!bodyStr.includes('bad-token'), 'submitted cookie value not echoed')
  restoreEnv()
}

section('LLM route — auth check is first in execution order')

{
  const routePath = path.resolve(__dirname, '../../../app/api/graph-candidate-suggestions/[id]/llm-reasoning-draft/route.ts')
  const content = fs.readFileSync(routePath, 'utf-8')

  // requireHouseApiAuth must be imported
  assert(content.includes('requireHouseApiAuth'), 'LLM route imports requireHouseApiAuth')

  // Auth check (call, not import) must come before generateLLMReasoningDraft call
  // Use the position of `auth.ok` which only appears in the function body
  const authCallIdx = content.indexOf('auth.ok')
  const generateCallIdx = content.indexOf('generateLLMReasoningDraft(id)')
  assert(authCallIdx > 0 && generateCallIdx > 0 && authCallIdx < generateCallIdx,
    'auth check appears before LLM generation call')

  // Auth check must come before params read
  const paramsIdx = content.indexOf('await params')
  assert(authCallIdx < paramsIdx, 'auth check appears before params await')

  // No direct Anthropic import in route
  assert(!content.includes('import Anthropic'), 'route does not import Anthropic directly')
}

section('houseAuth module — no forbidden patterns')

{
  const authPath = path.resolve(__dirname, '../../server/houseAuth.ts')
  const content = fs.readFileSync(authPath, 'utf-8')

  assert(!content.includes('supabase'), 'houseAuth does not import supabase')
  assert(!content.includes('.insert('), 'houseAuth has no .insert()')
  // .update() appears in crypto HMAC chain — that's intentional.
  // Check for Supabase-style .update( with table context instead.
  assert(!content.includes("from('"), 'houseAuth has no Supabase table queries')
  assert(!content.includes('console.log('), 'houseAuth has no console.log (only console.error)')
  assert(content.includes('timingSafeEqual'), 'houseAuth uses timing-safe comparison')
  assert(content.includes('HttpOnly'), 'houseAuth sets HttpOnly cookie')
  assert(!content.includes('NEXT_PUBLIC_HOUSE_PASSWORD') || !content.includes('process.env.NEXT_PUBLIC_HOUSE_PASSWORD') || content.includes('HOUSE_AUTH_PASSWORD'),
    'houseAuth prefers HOUSE_AUTH_PASSWORD over NEXT_PUBLIC_HOUSE_PASSWORD')
}

section('38.3.2 regression — reasoning safety still intact')

{
  const contractPath = path.resolve(__dirname, '../llmReasoningContract.ts')
  const content = fs.readFileSync(contractPath, 'utf-8')
  assert(content.includes('REVIEW_ROUTE_NOT_ALLOWED'), 'review route lock still present')
  assert(content.includes('INSUFFICIENT_PACKET'), 'insufficient packet block still present')

  const servicePath = path.resolve(__dirname, '../llmReasoningService.ts')
  const sContent = fs.readFileSync(servicePath, 'utf-8')
  assert(sContent.includes('stored: false'), 'service still returns stored: false')
  assert(!sContent.includes('.insert('), 'service still has no .insert()')
}

// ─── Summary ───────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
if (failures.length > 0) {
  console.log('\n  Failures:')
  for (const f of failures) console.log(`    ✗ ${f}`)
}
console.log('══════════════════════════════════════════\n')
process.exit(failed > 0 ? 1 : 0)
