/**
 * Gate A2-truth — recall capability honesty. Static guards proving both prompts carry the
 * standing "you cannot self-execute /recall" discipline, and that no recall LOGIC changed.
 * (The behavioural proof — the model no longer performs "Running /recall now" — is exercised
 * by the authenticated live smoke in the ship report; prompt discipline is what we can assert here.)
 * Run: npx tsx src/lib/agents/__tests__/phase-43-recall-honesty.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }

const ROUTES = ['src/app/api/ari-chat/route.ts', 'src/app/api/eli-chat/route.ts']

section('both prompts carry the standing recall-honesty block')
for (const rel of ROUTES) {
  const s = read(rel)
  assert(s.includes('Recall capability — speak honestly (Gate A2-truth):'), `${rel}: honesty block present`)
  // the block sits inside the system prompt, before Library guidance (so it is always sent)
  const blockIdx = s.indexOf('Recall capability — speak honestly')
  const libIdx = s.indexOf('Library search guidance:')
  assert(blockIdx >= 0 && libIdx >= 0 && blockIdx < libIdx, `${rel}: honesty block precedes Library guidance in the prompt`)
}

section('the block forbids the confabulation wording and allows the honest wording')
for (const rel of ROUTES) {
  const s = read(rel)
  // forbidden framings are explicitly named as things NOT to say
  assert(s.includes('CANNOT execute /recall from inside your own reply'), `${rel}: states presences cannot self-execute /recall`)
  assert(s.includes('inert text, not an action'), `${rel}: names /recall-in-reply as inert`)
  assert(s.includes('Never say "Running /recall now" or "I\'ll run /recall"'), `${rel}: forbids "Running /recall now"`)
  assert(s.includes('Never say "I searched the Archives", "the Archive returned…", or "the command opened the Archive" without that context actually present'), `${rel}: forbids false search claims without recall context`)
  // conditional truth: speak from recall context only when it actually appears this turn
  assert(s.includes('If ARCHIVE RECALL CONTEXT appears above in this turn'), `${rel}: honesty is conditional on real recall context`)
  assert(s.includes('If ARCHIVE RECALL CONTEXT is NOT present above, you did not search'), `${rel}: no context → must not claim a search`)
  // allowed honest framings
  assert(s.includes('You can run /recall <query>') && s.includes('from your side'), `${rel}: offers the Tara-run framing`)
  assert(s.includes('I can tell you what I would search for'), `${rel}: offers "what I would search for"`)
  assert(s.includes('presence-initiated recall is not built'), `${rel}: names the parked future capability honestly`)
}

section('the recall LOGIC is unchanged (A2-truth is wording only)')
for (const rel of ROUTES) {
  const s = read(rel)
  // detection/extraction/logging still exactly as before — the honesty block adds no logic
  assert(s.includes('detectArchiveRecallIntent(message)') && s.includes('extractRecallQuery(message)'), `${rel}: trigger detection/extraction intact`)
  assert(s.includes('logRecallEvent') && s.includes('MANUAL_RECALL_OPTIONS') && s.includes('AUTO_RECALL_OPTIONS'), `${rel}: event logging + option constants intact`)
  // the honesty text does NOT itself introduce a recall/search/DB call
  const block = s.slice(s.indexOf('Recall capability — speak honestly'), s.indexOf('Library search guidance:'))
  for (const tok of ['.rpc(', ".from('", 'getRecallableArchiveEntries', 'logRecallEvent(']) {
    assert(!block.includes(tok), `${rel}: honesty block is pure prompt text (no ${tok})`)
  }
}

section('A2-sec auth guard still first (honesty patch did not disturb it)')
for (const rel of ROUTES) {
  const s = read(rel)
  const authIdx = s.indexOf('requireHouseApiAuth(request)')
  const tryIdx = s.indexOf('try {', s.indexOf('export async function POST'))
  assert(authIdx >= 0 && authIdx < tryIdx, `${rel}: auth remains the first op, above the try`)
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
