/**
 * Phase 43 R1.1 — presence-recall double-fire suppression (static guards).
 *
 * When manual (Tara's /recall) or auto recall already injected ARCHIVE RECALL CONTEXT this turn,
 * the presence recall_archive tool must NOT also be offered — one reach per turn, no double log,
 * per-session cap preserved. The guard is purely SUBTRACTIVE: it can only withhold the presence
 * tool, never grant it. Proven here by shape; the behavioural proof (recall fires → tool absent)
 * is the authed live smoke in the ship report.
 *
 * Run: npx tsx src/lib/agents/__tests__/phase-43-r1-1-double-fire.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }

const ROUTES = ['src/app/api/ari-chat/route.ts', 'src/app/api/eli-chat/route.ts']

section('the double-fire signal is derived from the recall context marker')
for (const rel of ROUTES) {
  const s = read(rel)
  assert(
    s.includes("const manualOrAutoRecallFired = recallContext.includes('ARCHIVE RECALL CONTEXT')"),
    `${rel}: manualOrAutoRecallFired derived from recallContext's ARCHIVE RECALL CONTEXT marker`,
  )
  // it is computed from recallContext, which is set ONLY by the manual/auto paths (not presence),
  // so the signal cannot be tripped by a presence reach itself
  const sigIdx = s.indexOf('const manualOrAutoRecallFired')
  const recallCtxDecl = s.indexOf("let recallContext = ''")
  assert(recallCtxDecl >= 0 && recallCtxDecl < sigIdx, `${rel}: signal computed after recallContext is populated`)
}

section('the presence tool offer is gated on the signal (subtractive)')
for (const rel of ROUTES) {
  const s = read(rel)
  // offerRecall must AND-in the negated signal — withholding only
  assert(
    s.includes('const offerRecall = !recallSessionLimitReached && !recallResponseLimitReached && !manualOrAutoRecallFired'),
    `${rel}: offerRecall withheld when recall already fired`,
  )
  // the tool is pushed only under offerRecall (unchanged gate variable) — no new grant path
  assert(s.includes('if (offerRecall) offeredTools.push(recallArchiveTool as Anthropic.Tool)'), `${rel}: tool still pushed solely under offerRecall`)
}

section('defense-in-depth: exec refuses honestly if recall already fired')
for (const rel of ROUTES) {
  const s = read(rel)
  assert(s.includes('if (manualOrAutoRecallFired) {'), `${rel}: exec-site guard present`)
  assert(
    s.includes('Archive recall context is already present this turn — speak from it. Do not reach again or claim a second search.'),
    `${rel}: honest refusal message (not a false "limit reached")`,
  )
  // the guard sits INSIDE the recall_archive tool branch, before executePresenceRecall runs
  const guardIdx = s.indexOf('if (manualOrAutoRecallFired) {', s.indexOf("toolCall.name === 'recall_archive'"))
  const execIdx = s.indexOf('await executePresenceRecall(', s.indexOf("toolCall.name === 'recall_archive'"))
  assert(guardIdx >= 0 && execIdx >= 0 && guardIdx < execIdx, `${rel}: guard precedes executePresenceRecall in the tool branch`)
}

section('nothing else in the recall authority path changed')
for (const rel of ROUTES) {
  const s = read(rel)
  // caps + logging + honesty spine intact (R1 unchanged)
  assert(s.includes('PRESENCE_RECALL_MAX_PER_RESPONSE') && s.includes('PRESENCE_RECALL_MAX_PER_SESSION'), `${rel}: presence caps intact`)
  assert(s.includes('executePresenceRecall({ presenceId:'), `${rel}: presence recall still wired`)
  // A2-sec: auth still first op
  const authIdx = s.indexOf('requireHouseApiAuth(request)')
  const tryIdx = s.indexOf('try {', s.indexOf('export async function POST'))
  assert(authIdx >= 0 && authIdx < tryIdx, `${rel}: A2-sec auth remains first op`)
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
