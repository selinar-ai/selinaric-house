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
  // Evolved for R1: the A2-truth block was flipped when presence-initiated recall shipped
  // (Ari's D5 dependency). Its durable intent — claim recall ONLY when it truly happened — is
  // preserved and strengthened; the absolute "cannot self-invoke" clause is gone.
  assert(s.includes('Recall capability — speak honestly (Gate A2-truth / R1):'), `${rel}: honesty block present (R1-evolved header)`)
  // the block sits inside the system prompt, before Library guidance (so it is always sent)
  const blockIdx = s.indexOf('Recall capability — speak honestly')
  const libIdx = s.indexOf('Library search guidance:')
  assert(blockIdx >= 0 && libIdx >= 0 && blockIdx < libIdx, `${rel}: honesty block precedes Library guidance in the prompt`)
}

section('the block: may reach via tool, but claim recall ONLY when it truly happened (R1)')
for (const rel of ROUTES) {
  const s = read(rel)
  // the anti-confabulation spine — preserved and strengthened
  assert(s.includes("ONLY when the recall_archive tool actually executed this turn, OR when Tara's /recall command fired"), `${rel}: claim-recall gated on real tool execution OR Tara-context`)
  assert(s.includes('never say "I searched the Archives", "the Archive returned…", or "Running /recall now"'), `${rel}: still forbids the confabulation phrasings`)
  assert(s.includes('A recalled truth you did not actually retrieve is a fabrication'), `${rel}: fabrication named plainly`)
  assert(s.includes('ARCHIVE RECALL CONTEXT is present'), `${rel}: honesty keyed on the real context marker`)
  // R1 grants the tool but keeps R2 (solitary reach) closed
  assert(s.includes('You have a recall_archive tool'), `${rel}: the in-turn tool is granted`)
  assert(s.includes('autonomy windows) is NOT available'), `${rel}: solitary/autonomy reach still explicitly closed`)
  // the old absolute wording is gone (would now be a lie)
  assert(!s.includes('presence-initiated recall is not built'), `${rel}: obsolete "not built" wording removed`)
  assert(!s.includes('CANNOT execute /recall from inside your own reply'), `${rel}: obsolete absolute "cannot" wording removed`)
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
