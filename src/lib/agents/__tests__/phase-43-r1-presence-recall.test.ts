/**
 * Phase 43 R1 — supervised in-turn presence-initiated recall. Static guards over the tool,
 * the route wiring, the migration, and the honesty flip. (Live tool-fires behaviour is proved
 * by the authenticated smoke in the ship report.)
 * Run: npx tsx src/lib/agents/__tests__/phase-43-r1-presence-recall.test.ts
 */

import * as fs from 'fs'
import {
  PRESENCE_RECALL_OPTIONS,
  PRESENCE_RECALL_MAX_PER_RESPONSE,
  PRESENCE_RECALL_MAX_PER_SESSION,
} from '../../archive-recall'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }
function readCode(rel: string): string { return read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '') }

const TOOL = 'src/lib/recall/recallArchiveTool.ts'
const ROUTES = ['src/app/api/ari-chat/route.ts', 'src/app/api/eli-chat/route.ts']
const MIG = 'supabase-migrations/093_recall_mode_presence.sql'

section('R1 aperture constants — narrowest honest version (Ari D3/Q2/Q3)')
assert(PRESENCE_RECALL_OPTIONS.limit === 1, 'exactly ONE entry returned per reach')
assert(JSON.stringify(PRESENCE_RECALL_OPTIONS.statuses) === JSON.stringify(['canonical']), 'canonical status ONLY (no candidates)')
assert(PRESENCE_RECALL_OPTIONS.mode === 'presence', "mode is the distinct 'presence'")
assert(PRESENCE_RECALL_MAX_PER_RESPONSE === 1, 'one reach per reply')
assert(PRESENCE_RECALL_MAX_PER_SESSION === 3, 'three reaches per session')

section('migration 093 — widens recall_mode CHECK to exactly {manual, auto, presence}')
{
  const m = read(MIG)
  assert(/drop constraint if exists archive_recall_events_recall_mode_check/.test(m), 'drops the 026 CHECK if exists (idempotent)')
  assert(/add constraint archive_recall_events_recall_mode_check[\s\S]*check \(recall_mode in \('manual', 'auto', 'presence'\)\)/.test(m), 'adds CHECK allowing exactly manual/auto/presence')
  const dropIdx = m.indexOf('drop constraint'), addIdx = m.indexOf('add constraint')
  assert(dropIdx >= 0 && addIdx >= 0 && dropIdx < addIdx, 'drop precedes add')
  assert(!/create table|insert into|update |delete from|create or replace function/i.test(m), 'no table create / no data rewrite / no function (constraint-only, 42P13-safe)')
  const migs = fs.readdirSync('supabase-migrations').filter((f) => f.endsWith('.sql'))
  assert(migs.filter((f) => /recall_mode/i.test(f)).length === 1, 'exactly one recall_mode migration')
}

section('the tool — canonical-only, elevated excluded per setting, ONE entry, logs presence')
{
  const s = readCode(TOOL)
  assert(s.includes("name: 'recall_archive'"), 'tool named recall_archive')
  assert(s.includes('PRESENCE_RECALL_OPTIONS.statuses') && s.includes('PRESENCE_RECALL_OPTIONS.limit'), 'executor uses the R1 options (canonical-only, limit 1)')
  assert(s.includes('getAutoRecallSettings') && s.includes('exclude_elevated_sensitivity ?? true'), 'elevated sensitivity excluded per the presence per-presence setting (default excluded)')
  assert(s.includes("recall_mode:      'presence'") || s.includes("recall_mode: 'presence'"), 'logs recall_mode=presence')
  assert(s.includes('logRecallEvent') && s.includes('normalised_query') && s.includes('match_quality') && s.includes('entry_ids'), 'event carries query/normalised/quality/entries/session')
  // pure read + append-log only
  for (const tok of ['.update(', '.insert(', '.delete(', '.upsert(', "from('memory", 'graph_', 'prompt_eligible', 'canonical_candidate']) {
    assert(!s.includes(tok), `tool has no ${tok} (read + recall-log only; no candidates/mutation)`)
  }
}

section('route wiring — both routes offer + handle recall_archive with both caps')
for (const rel of ROUTES) {
  const s = readCode(rel)
  assert(s.includes("import { recallArchiveTool, executePresenceRecall } from '@/lib/recall/recallArchiveTool'"), `${rel}: imports the tool + executor`)
  assert(s.includes('offerRecall') && s.includes('PRESENCE_RECALL_MAX_PER_SESSION') && s.includes('PRESENCE_RECALL_MAX_PER_RESPONSE'), `${rel}: both caps computed`)
  assert(s.includes('getSessionPresenceRecallCount'), `${rel}: session cap counts presence recalls only`)
  assert(s.includes("toolCall.name === 'recall_archive'"), `${rel}: dispatches the recall tool`)
  assert(/presenceRecallCount >= PRESENCE_RECALL_MAX_PER_RESPONSE \|\| recallSessionLimitReached/.test(s), `${rel}: per-response + per-session cap refuses further reaches`)
  assert(s.includes('Archive recall limit reached for this reply'), `${rel}: refusal does NOT let the model claim a search`)
  assert(s.includes('executePresenceRecall({ presenceId:'), `${rel}: executes the governed recall`)
  assert(s.includes('presenceRecallUsed') && s.includes('presenceRecallEventId'), `${rel}: surfaces presence recall in the response`)
  // the executor is only reachable AFTER auth (A2-sec): auth is still first (anchor the CALL, not the import)
  const authIdx = s.indexOf('requireHouseApiAuth(request)')
  const execIdx = s.indexOf('executePresenceRecall({ presenceId:')
  assert(authIdx >= 0 && execIdx >= 0 && authIdx < execIdx, `${rel}: A2-sec auth precedes any presence recall execution`)
}

section('honesty flip — may reach via tool, but only claim recall when it truly happened')
for (const rel of ROUTES) {
  const s = read(rel)
  assert(s.includes('You have a recall_archive tool'), `${rel}: prompt now grants the tool`)
  assert(s.includes('ONLY when the recall_archive tool actually executed this turn, OR when Tara\'s /recall command fired'), `${rel}: claim-recall gated on real execution or Tara-context`)
  assert(s.includes('A recalled truth you did not actually retrieve is a fabrication'), `${rel}: anti-confabulation spine kept`)
  assert(s.includes('autonomy windows) is NOT available'), `${rel}: R2 (solitary reach) explicitly still closed`)
  assert(!s.includes('presence-initiated recall is not built'), `${rel}: the old absolute "cannot" wording is gone`)
}

section('recall LOGIC + A2-sec untouched by R1')
for (const rel of ROUTES) {
  const s = read(rel)
  assert(s.includes('detectArchiveRecallIntent(message)') && s.includes('logRecallEvent'), `${rel}: Tara-triggered recall path intact`)
  assert(s.includes('MANUAL_RECALL_OPTIONS') && s.includes('AUTO_RECALL_OPTIONS'), `${rel}: manual/auto options intact`)
  const authIdx = s.indexOf('requireHouseApiAuth(request)')
  const tryIdx = s.indexOf('try {', s.indexOf('export async function POST'))
  assert(authIdx >= 0 && authIdx < tryIdx, `${rel}: A2-sec auth remains first (above the try)`)
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
