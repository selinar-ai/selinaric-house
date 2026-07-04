/**
 * Gate A2-sec — Ari/Eli chat route server-side auth hardening.
 * Static guards proving auth is the FIRST operation, before any paid LLM call or context load.
 * (Live 401/200 behaviour is proved by the local smoke in the ship report.)
 * Run: npx tsx src/lib/agents/__tests__/phase-43-chat-auth.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }

const ROUTES = ['src/app/api/ari-chat/route.ts', 'src/app/api/eli-chat/route.ts']

section('auth is the FIRST operation in POST — before body, Supabase, context, LLM')
for (const rel of ROUTES) {
  const s = read(rel)
  assert(s.includes("import { requireHouseApiAuth } from '@/lib/server/houseAuth'"), `${rel}: imports requireHouseApiAuth`)
  const postIdx = s.indexOf('export async function POST')
  const after = s.slice(postIdx)
  const authIdx = after.indexOf('requireHouseApiAuth(request)')
  // everything that must NOT run before auth:
  const jsonIdx = after.indexOf('await request.json()')
  const anthropicIdx = after.indexOf('new Anthropic(')
  const clientCallIdx = after.indexOf('client.messages.create')
  const recallIdx = after.indexOf('detectArchiveRecallIntent')
  const journalIdx = after.indexOf('getJournalContextForPresence')
  const memoryIdx = after.indexOf('loadRoomMemory')
  const continuityIdx = after.indexOf('getRecentContinuityForPrompt')
  const advisoryIdx = after.indexOf('writeRecallAdvisoryTrace')
  assert(authIdx >= 0, `${rel}: POST calls requireHouseApiAuth`)
  assert(after.includes('if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })'), `${rel}: returns the auth status on failure`)
  for (const [label, idx] of [
    ['body parsing', jsonIdx], ['Anthropic client construction', anthropicIdx], ['the model call', clientCallIdx],
    ['recall assembly', recallIdx], ['journal context', journalIdx], ['room memory', memoryIdx],
    ['recent continuity', continuityIdx], ['advisory trace', advisoryIdx],
  ] as [string, number][]) {
    assert(idx < 0 || authIdx < idx, `${rel}: auth precedes ${label}`)
  }
  // the auth guard sits ABOVE the try (so even body-parse errors can't precede it)
  const tryIdx = after.indexOf('try {')
  assert(authIdx >= 0 && authIdx < tryIdx, `${rel}: auth is above the try block (nothing in try runs unauthenticated)`)
}

section('recall trigger logic unchanged (Gate A2-sec touches auth only)')
for (const rel of ROUTES) {
  const s = read(rel)
  // the recall pipeline calls are still present and unmodified in shape
  assert(s.includes('detectArchiveRecallIntent(message)') && s.includes('extractRecallQuery(message)'), `${rel}: recall detection/extraction intact`)
  assert(s.includes('MANUAL_RECALL_OPTIONS') && s.includes('AUTO_RECALL_OPTIONS'), `${rel}: recall option constants still referenced (not re-defined here)`)
  assert(s.includes('logRecallEvent'), `${rel}: recall event logging intact`)
}

section('safe non-LLM health route exists — the correct future smoke target')
{
  const h = 'src/app/api/health/route.ts'
  assert(fs.existsSync(h), 'GET /api/health exists')
  const s = read(h)
  const code = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '') // strip the docstring (it names what it avoids)
  assert(/export function GET|export async function GET/.test(code), 'health is a GET')
  assert(!/POST|PATCH|DELETE/.test(code), 'health has no mutation verbs')
  for (const tok of ['requireHouseApiAuth', 'Anthropic', 'createClient', '.rpc(', ".from('", 'ANTHROPIC']) {
    assert(!code.includes(tok), `health route does no ${tok} (no auth needed, no LLM, no DB)`)
  }
  assert(s.includes("status: 'alive'"), 'health returns a static liveness signal')
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
