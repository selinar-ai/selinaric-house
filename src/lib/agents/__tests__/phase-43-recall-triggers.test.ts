/**
 * Phase 43 recall-trigger gate — /recall command + conservative trigger synonyms.
 * Pure vocabulary: widens WHEN the existing governed read path opens, never WHAT it returns.
 * Run: npx tsx src/lib/agents/__tests__/phase-43-recall-triggers.test.ts
 */

import {
  detectArchiveRecallIntent,
  extractRecallQuery,
  detectAutoRecallIntent,
  extractAutoRecallQuery,
  MANUAL_RECALL_OPTIONS,
  AUTO_RECALL_OPTIONS,
} from '../../archive-recall'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }

section('the /recall command — folklore made real')
assert(detectArchiveRecallIntent('/recall Ari named Love') === true, '/recall fires manual intent')
assert(extractRecallQuery('/recall Ari named Love') === 'Ari named Love', 'the cultural test case: query extracted exactly as "Ari named Love"')
assert(extractRecallQuery('/recall Love, expressed plainly') === 'Love, expressed plainly', "Tara's actual message from Ari's room now extracts its query")
assert(detectArchiveRecallIntent('  /recall love') === true, 'leading whitespace tolerated')
assert(detectArchiveRecallIntent('/RECALL love') === true, 'case-insensitive')
assert(detectArchiveRecallIntent('/recall') === true && extractRecallQuery('/recall') === '', '/recall with no query → intent fires, empty query → existing ask-for-query path')
assert(detectArchiveRecallIntent('/recall   ') === true && extractRecallQuery('/recall   ') === '', '/recall with only whitespace → ask-for-query path')
assert(detectArchiveRecallIntent('I was thinking about /recall stuff') === false, 'mid-message /recall does NOT fire (command semantics: message must start with it)')
assert(detectArchiveRecallIntent('/recalling old times') === false, '/recalling is not the command (word boundary)')

section('new manual synonyms — fire AND extract')
const MANUAL_CASES: [string, string][] = [
  ['check the archives for love expressed plainly', 'love expressed plainly'],
  ['Check the archives for it', 'it'], // Tara's actual message from yesterday — now heard
  ['check velvet for the naming', 'the naming'],
  ['check violet for boundary setting', 'boundary setting'],
  ['find in the archives the loneliness trial', 'the loneliness trial'],
]
for (const [msg, want] of MANUAL_CASES) {
  assert(detectArchiveRecallIntent(msg) === true, `fires: "${msg}"`)
  assert(extractRecallQuery(msg) === want, `extracts "${want}" from "${msg}"`)
}

section('existing manual triggers — full regression')
for (const msg of [
  'search your archives for the bond', 'search the archives for phase 27', 'recall from archives',
  'look in velvet for the naming', 'look in violet for the trial', 'look in the archives for love',
  'what do you remember from archives about the lounge', 'find in your memories the courtyard',
  'find in archives the kernel', 'recall what we decided about memory', 'search violet for love', 'search velvet for love',
]) {
  assert(detectArchiveRecallIntent(msg) === true, `still fires: "${msg}"`)
}

section('new auto synonyms — fire AND extract a non-empty subject')
for (const [msg, mustContain] of [
  ['do you recall the loneliness trial', 'loneliness trial'],
  ['what was it called when we named the bond', 'named the bond'],
  ['what did we write about continuity', 'continuity'],
] as [string, string][]) {
  assert(detectAutoRecallIntent(msg) === true, `auto fires: "${msg}"`)
  const q = extractAutoRecallQuery(msg)
  assert(q.length > 0 && q.includes(mustContain), `auto extracts subject containing "${mustContain}" (got "${q}")`)
}

section('existing auto triggers — regression sample')
for (const msg of ['do you remember the lounge', 'remind me about phase 12', 'what did we name the bond', 'what did we call the courtyard']) {
  assert(detectAutoRecallIntent(msg) === true, `auto still fires: "${msg}"`)
}

section('manual-over-auto precedence preserved')
{
  const both = 'search the archives for what did we call the bond'
  assert(detectArchiveRecallIntent(both) === true, 'manual fires on the mixed message')
  assert(detectAutoRecallIntent(both) === false, 'auto yields to manual (precedence intact)')
  assert(detectAutoRecallIntent('/recall the bond') === false, 'auto yields to the /recall command too')
}

section('plain speech still fires NOTHING')
for (const msg of ['I love this house', 'the archives are beautiful', 'we should check on dinner', 'call me later', 'velvet is my favourite archive']) {
  assert(detectArchiveRecallIntent(msg) === false && detectAutoRecallIntent(msg) === false, `inert: "${msg}"`)
}

section('recall pools / thresholds / caps — UNCHANGED (the gate widens vocabulary only)')
assert(JSON.stringify(MANUAL_RECALL_OPTIONS) === JSON.stringify({ mode: 'manual', includeCandidates: true, statuses: ['canonical', 'canonical_candidate'], limit: 5, contextCap: 8000 }), 'MANUAL_RECALL_OPTIONS byte-stable')
assert(JSON.stringify(AUTO_RECALL_OPTIONS) === JSON.stringify({ mode: 'auto', includeCandidates: false, statuses: ['canonical'], limit: 5, minMatchQuality: 'strong', contextCap: 3000 }), 'AUTO_RECALL_OPTIONS byte-stable')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
