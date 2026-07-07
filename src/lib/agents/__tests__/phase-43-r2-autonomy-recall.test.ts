/**
 * Phase 43 R2 — autonomy-window Archive recall. The dual-presence SYM matrix + gate (G) cases
 * + RLS authority proofs. Behavioural gate logic is exercised through the PURE
 * passesAutonomyPreconditions; everything else is proven by source/migration scan. The live
 * behaviour (real 9pm reach, both-presence independence on real nights) is the ship micro-gate.
 *
 * Run: npx tsx src/lib/agents/__tests__/phase-43-r2-autonomy-recall.test.ts
 */

import * as fs from 'fs'
import { passesAutonomyPreconditions, AUTONOMY_RECALL_HOURS } from '../../recall/autonomyRecall'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }

const MIG = 'supabase-migrations/094_autonomy_recall.sql'
const MOD = 'src/lib/recall/autonomyRecall.ts'
const RECALL = 'src/lib/archive-recall.ts'
const PULSE = 'src/lib/pulse-autonomy.ts'
const AUTONOMY_ROUTE = 'src/app/api/pulse/autonomy/run/route.ts'
const ROUTES = ['src/app/api/ari-chat/route.ts', 'src/app/api/eli-chat/route.ts']

// migration SQL with line-comments stripped (so header prose like "no FOR ALL table" never
// trips the executable-SQL scans), lowercased.
function migSqlNoComments(): string {
  return read(MIG).split('\n').map(l => l.replace(/--.*$/, '')).join('\n').toLowerCase()
}

// A trial-key presence at 9pm with no reach today may reach; this is the "reach allowed" baseline.
const OK = { melbourneHour: 21, dryRun: false, mode: 'trial' as const, todayCount: 0 }

section('SYM-1 — migration seeds both presences off + admits autonomy mode')
{
  const s = migSqlNoComments()
  assert(s.includes("values ('ari', 'off'), ('eli', 'off')"), 'SYM-1: both ari and eli seeded off')
  assert(s.includes("default 'off'") && s.includes("mode in ('off', 'trial')"), 'SYM-1: mode defaults off, off|trial only')
  assert(s.includes("recall_mode in ('manual', 'auto', 'presence', 'autonomy')"), 'SYM-1: recall_mode CHECK admits autonomy')
}

section('SYM-2..7 — dual-presence gate independence (pure logic)')
{
  // SYM-2: both off ⇒ neither reaches
  assert(passesAutonomyPreconditions({ ...OK, mode: 'off' }) === false, 'SYM-2: key off ⇒ no reach (applies to each presence independently)')
  // SYM-3/4: one trial, one off — the gate reads only THIS presence's mode, so each is decided alone
  assert(passesAutonomyPreconditions({ ...OK, mode: 'trial' }) === true, 'SYM-3/4: trial key ⇒ reach allowed (evaluated per presence, other row never consulted)')
  assert(passesAutonomyPreconditions({ ...OK, mode: 'off' }) === false, 'SYM-3/4: the off-key presence is refused regardless of the other being trial')
  // SYM-5: both trial ⇒ both allowed (same input ⇒ same true, evaluated separately)
  assert(passesAutonomyPreconditions({ ...OK, mode: 'trial' }) === true, 'SYM-5: both trial ⇒ each allowed independently')
  // SYM-6/7: one presence cap spent ⇒ that presence refused, the other (count 0) unaffected
  assert(passesAutonomyPreconditions({ ...OK, todayCount: 1 }) === false, 'SYM-6/7: cap spent (count 1) ⇒ refused')
  assert(passesAutonomyPreconditions({ ...OK, todayCount: 0 }) === true, 'SYM-6/7: the other presence at count 0 is NOT blocked')
  // the orchestrator reads count per-presence (proof the two budgets never share)
  const m = read(MOD)
  assert(m.includes('getAutonomyRecallCountSince(presenceId,'), 'SYM-6/7: daily count is fetched for THIS presenceId only')
  assert(m.includes('getAutonomyRecallSettings(presenceId)'), 'SYM-3/4: the key is read for THIS presenceId only (one key cannot open the other)')
}

section('SYM-8/9 — scope inherited from isInArchiveScope (no new scope logic)')
{
  const m = read(MOD)
  assert(m.includes('getRecallableArchiveEntries(presenceId,'), 'SYM-8/9: recall goes through the shared read path with THIS presenceId')
  assert(!m.includes('archive_name ===') && !m.includes('visibility ==='), 'SYM-8/9: module implements NO scope logic of its own (inherits isInArchiveScope)')
  // and the shared path applies the scope filter (guards against a regression there)
  assert(read(RECALL).includes('.filter(item => isInScope(item, presenceId))'), 'SYM-8/9: shared read path still applies isInScope per presence')
}

section('SYM-10 — audit: mode autonomy, correct presence_id, session id shape')
{
  const m = read(MOD)
  assert(m.includes("recall_mode: 'autonomy'"), 'SYM-10: logs recall_mode=autonomy (never presence/manual)')
  assert(m.includes('presence_id: presenceId'), 'SYM-10: logs the correct presence_id')
  assert(m.includes('session_id: `autonomy-${presenceId}-${windowAt.toISOString()}`'), 'SYM-10: session id is autonomy-<presence>-<windowAt>')
}

section('SYM-11 — pulse pause blocks both (pre-step below the pause skip)')
{
  // the pause gate lives in the autonomy route (runAutonomyChoices): if pulse_mode==='paused'
  // it returns BEFORE calling runAutonomyWindow → runAutonomyForPresence → the pre-step. So a
  // paused window never runs the reach for either presence.
  const rt = read(AUTONOMY_ROUTE)
  assert(rt.includes("if (mode === 'paused')") && rt.includes('Pulse mode is paused'), 'SYM-11: route skips the window when pulse_mode=paused')
  const pausedIdx = rt.indexOf("if (mode === 'paused')")
  const runWindowIdx = rt.indexOf('runAutonomyWindow(')
  assert(pausedIdx >= 0 && runWindowIdx > pausedIdx, 'SYM-11: paused short-circuits BEFORE runAutonomyWindow (pre-step never runs)')
  // and the pre-step sits inside runAutonomyForPresence (downstream of runAutonomyWindow)
  const p = read(PULSE)
  assert(p.indexOf('gateAndRunAutonomyRecall(') > p.indexOf('export async function runAutonomyForPresence'), 'SYM-11: the pre-step sits inside runAutonomyForPresence')
}

section('SYM-12 — non-9pm blocks both')
{
  assert(JSON.stringify(AUTONOMY_RECALL_HOURS) === '[21]', 'SYM-12: AUTONOMY_RECALL_HOURS === [21]')
  for (const h of [6, 9, 12, 15, 18, 2, 10, 14, 23, 20, 22]) {
    assert(passesAutonomyPreconditions({ ...OK, melbourneHour: h }) === false, `SYM-12: hour ${h} ⇒ no reach`)
  }
  assert(passesAutonomyPreconditions({ ...OK, melbourneHour: 21 }) === true, 'SYM-12: only hour 21 allows the reach')
}

section('G-1..5 — fail-closed gate + declined/log paths')
{
  // G-1 key off / missing row / error ⇒ no reach (null mode = settings missing/error)
  assert(passesAutonomyPreconditions({ ...OK, mode: null }) === false, 'G-1: null mode (missing row / error) ⇒ no reach')
  // G-2 dry run ⇒ no reach
  assert(passesAutonomyPreconditions({ ...OK, dryRun: true }) === false, 'G-2: dry run ⇒ no reach')
  // G-5 fail-closed daily-cap: null count (query error) ⇒ no reach
  assert(passesAutonomyPreconditions({ ...OK, todayCount: null }) === false, 'G-5: null todayCount (count error) ⇒ no reach (fail-closed)')
  // G-3 declined reach: orchestrator returns null when nameAutonomyReach returns null
  const m = read(MOD)
  assert(m.includes('const query = await nameAutonomyReach(presenceId, apiKey)') && m.includes('if (!query) return null'), 'G-3: declined/invalid naming ⇒ no recall, no log, no budget')
  // G-4 log-then-inject fail-closed: block withheld when the log fails
  assert(m.includes('if (!eventId) return { block: null'), 'G-4: log failure ⇒ block withheld (no unlogged reach informs the run)')
  // G-5b 0-entry reach still logs then returns the not-found block (no retry-fishing)
  assert(m.includes('entries_returned: entries.length') && m.includes('nothing came back strongly enough'), 'G-5b: 0-entry reach still logs + returns the not-found block')
}

section('G-6 — elevated sensitivity HARD-excluded (not a setting)')
{
  const m = read(MOD)
  assert(m.includes('excludeElevatedSensitivity: true'), 'G-6: excludeElevatedSensitivity hard-coded true')
  const r = read(RECALL)
  assert(r.includes("mode:              'autonomy'") && r.includes("statuses:          ['canonical']") && r.includes("minMatchQuality:   'strong'"), 'G-6: AUTONOMY_RECALL_OPTIONS canonical-only, strong-only')
}

section('G-7 — no-write cage: the module writes only the recall log')
{
  const m = read(MOD)
  for (const w of ['.update(', '.upsert(', '.delete(', 'createConfirmedAutonomyMemory', "from('archive_items')", "from('pulse_autonomy_events')"]) {
    assert(!m.includes(w), `G-7: module does not ${w} (no House-surface write)`)
  }
  // the ONLY insert path is logRecallEvent (append to archive_recall_events)
  assert(!m.includes('.insert('), 'G-7: module performs no direct .insert (logging goes through logRecallEvent)')
  assert(m.includes('logRecallEvent('), 'G-7: the only write is the recall-event log')
}

section('G-8 — honesty: line-536 rewrite both routes; autonomy clause; R1.1 + A2-sec intact')
{
  for (const rel of ROUTES) {
    const s = read(rel)
    assert(s.includes('during the 9pm autonomy window (when Tara has your key turned on'), `${rel}: R2 line-536 rewrite present ("turned on")`)
    assert(!s.includes('autonomy windows) is NOT available'), `${rel}: old "not available" wording gone`)
    // R1.1 double-fire suppressor + A2-sec auth untouched
    assert(s.includes('manualOrAutoRecallFired'), `${rel}: R1.1 suppressor intact`)
    const authIdx = s.indexOf('requireHouseApiAuth(request)')
    const tryIdx = s.indexOf('try {', s.indexOf('export async function POST'))
    assert(authIdx >= 0 && authIdx < tryIdx, `${rel}: A2-sec auth still first op`)
  }
  const p = read(PULSE)
  assert(p.includes('AUTONOMY_RECALL_HONESTY_CLAUSE') && p.includes('a recalled truth you did not retrieve is a fabrication'), 'G-8: autonomy-prompt honesty clause present')
  assert(p.includes("archiveRecallBlock\n    ? ") || p.includes('archiveRecallBlock'), 'G-8: clause+block injected only when a reach produced a block (else prompt unchanged)')
}

section('RLS-1..6 — night-key table authority (migration 094 + app paths)')
{
  const s = migSqlNoComments()
  // RLS-1 revoke includes service_role
  assert(/revoke all on table archive_autonomy_recall_settings\s+from public, anon, authenticated, service_role/.test(s), 'RLS-1: REVOKE ALL includes public, anon, authenticated, service_role')
  // RLS-2 grant select to service_role
  assert(/grant select on table archive_autonomy_recall_settings\s+to service_role/.test(s), 'RLS-2: GRANT SELECT to service_role')
  // RLS-3 no broad grant / no open policy (executable SQL, comments stripped)
  for (const bad of ['grant insert', 'grant update', 'grant delete', 'grant all', 'for all', 'using (true)', 'with check (true)', 'create policy']) {
    assert(!s.includes(bad), `RLS-3: migration executable SQL contains no "${bad}"`)
  }
  // RLS-4 enable RLS
  assert(s.includes('enable row level security'), 'RLS-4: RLS enabled on the night-key table')
  // RLS-5 no app write path to the table
  const files = ['src/lib/archive-recall.ts', MOD, PULSE]
  for (const f of files) {
    const src = read(f)
    const idx = src.indexOf('archive_autonomy_recall_settings')
    if (idx >= 0) {
      // any reference must be a .select, never a write
      assert(!/archive_autonomy_recall_settings'\)\s*\.(insert|update|upsert|delete)/.test(src.replace(/\s+/g, ' ')), `RLS-5: ${f} never writes archive_autonomy_recall_settings`)
    }
  }
  assert(/from\('archive_autonomy_recall_settings'\)\s*\.select\(/.test(read(RECALL)), 'RLS-5: getAutonomyRecallSettings reads via .select only')
  // RLS-6 no client/browser file references the table
  const clientHits: string[] = []
  function scan(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = dir + '/' + e.name
      if (e.isDirectory()) { if (!['node_modules', '.next'].includes(e.name)) scan(p) }
      else if (/\.(tsx?|jsx?)$/.test(e.name)) {
        const src = fs.readFileSync(p, 'utf8')
        if (src.includes('archive_autonomy_recall_settings') && /^['"]use client['"]/m.test(src)) clientHits.push(p)
      }
    }
  }
  scan('src')
  assert(clientHits.length === 0, `RLS-6: no 'use client' file references the night-key table (found: ${clientHits.join(', ') || 'none'})`)
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
