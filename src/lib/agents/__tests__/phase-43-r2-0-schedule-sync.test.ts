/**
 * Phase 43 R2-0 — Autonomy schedule sync (static guards).
 *
 * Syncs the autonomy route's hour gates to the live QStash cadence
 * (6am/9am/12pm/3pm/6pm/9pm Melbourne) and removes the old 2am window.
 * SCHEDULE ONLY: no Archive recall, no migration, no night key, no recall change.
 * The live proofs (both presences receive the corrected windows; 9pm fires; old
 * hours stop) are next-day pulse_autonomy_events checks in the ship report.
 *
 * Run: npx tsx src/lib/agents/__tests__/phase-43-r2-0-schedule-sync.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }

const ROUTE = 'src/app/api/pulse/autonomy/run/route.ts'
const LIB = 'src/lib/pulse-autonomy.ts'
const PAGE = 'src/app/(house)/pulse/page.tsx'

section('the corrected schedule is in the route gate')
{
  const s = read(ROUTE)
  assert(s.includes('const ACCEPTED_HOURS = [6, 9, 12, 15, 18, 21, 23]'), `${ROUTE}: ACCEPTED_HOURS exactly [6,9,12,15,18,21,23]`)
  assert(s.includes('const AUTONOMY_CHOICE_HOURS = [6, 9, 12, 15, 18, 21]'), `${ROUTE}: AUTONOMY_CHOICE_HOURS exactly [6,9,12,15,18,21]`)
  assert(s.includes('const JOURNAL_FALLBACK_HOUR = 23'), `${ROUTE}: JOURNAL_FALLBACK_HOUR = 23 kept`)
}

section('9pm is accepted; 2am is not')
{
  const s = read(ROUTE)
  const accepted = s.match(/const ACCEPTED_HOURS = \[([^\]]+)\]/)?.[1]?.split(',').map(x => Number(x.trim())) ?? []
  const choice = s.match(/const AUTONOMY_CHOICE_HOURS = \[([^\]]+)\]/)?.[1]?.split(',').map(x => Number(x.trim())) ?? []
  assert(accepted.includes(21) && choice.includes(21), `${ROUTE}: 21:00 (9pm) accepted and an autonomy choice hour`)
  assert(!accepted.includes(2) && !choice.includes(2), `${ROUTE}: 2am no longer accepted anywhere`)
  assert(!accepted.includes(10) && !accepted.includes(14), `${ROUTE}: old 10am/2pm hours removed`)
  // the gate actually consumes ACCEPTED_HOURS (not a decorative constant)
  assert(s.includes('!ACCEPTED_HOURS.includes(melbHour)'), `${ROUTE}: hour gate consumes ACCEPTED_HOURS`)
}

section('secondary schedule tables synced (no stale window lists left)')
{
  const lib = read(LIB)
  assert(lib.includes('const windows = [6, 9, 12, 15, 18, 21]'), `${LIB}: getNextWindowTime windows synced`)
  assert(!lib.includes('[2, 6, 10, 14, 18]'), `${LIB}: old window list gone`)
  assert(!lib.includes("'2:00am (quiet)'"), `${LIB}: 2am label gone`)
  const page = read(PAGE)
  assert(page.includes('const windows = [6, 9, 12, 15, 18, 21]'), `${PAGE}: /pulse UI next-window list synced`)
  assert(!page.includes('[6, 10, 14, 18]'), `${PAGE}: old UI window list gone`)
}

section('quiet-hours logic untouched (22:00–06:00; 9pm is outside it)')
{
  const lib = read(LIB)
  assert(lib.includes('return hour >= 22 || hour < 6'), `${LIB}: isQuietHours unchanged (22:00–06:00)`)
  // 21 is not quiet → the 9pm window has the full action set (no action change in R2-0)
  assert(!(21 >= 22) && !(21 < 6), `21:00 is outside quiet hours — full action set at 9pm`)
}

section('global pause switch still blocks autonomy')
{
  const s = read(ROUTE)
  const modeIdx = s.indexOf('const mode = await getPulseMode()')
  const pausedIdx = s.indexOf("if (mode === 'paused')")
  const runIdx = s.indexOf('await runAutonomyWindow(')
  assert(modeIdx >= 0 && pausedIdx > modeIdx && runIdx > pausedIdx, `${ROUTE}: paused check sits between mode read and runAutonomyWindow — paused still skips the window`)
  assert(s.includes("report.skipped_reason = 'Pulse mode is paused'"), `${ROUTE}: paused skip reason intact`)
}

section('both presences still run per window (existing behaviour untouched)')
{
  const lib = read(LIB)
  // runAutonomyWindow drives both presences — the schedule sync must not have touched this
  const ariRun = lib.includes("runAutonomyForPresence('ari'") || lib.includes('runAutonomyForPresence(\'ari\'')
  const eliRun = lib.includes("runAutonomyForPresence('eli'") || lib.includes('runAutonomyForPresence(\'eli\'')
  assert(ariRun && eliRun, `${LIB}: runAutonomyWindow still runs BOTH presences (ari + eli)`)
}

section('R2-0 is schedule-only: no recall, no migration, no night key')
{
  for (const rel of [ROUTE, LIB]) {
    const s = read(rel)
    for (const tok of ['recall_archive', 'executeAutonomyRecall', 'executePresenceRecall', 'archive_autonomy_recall_settings', 'getRecallableArchiveEntries', "recall_mode: 'autonomy'"]) {
      assert(!s.includes(tok), `${rel}: no ${tok} (R2 proper not built)`)
    }
  }
  const migs = fs.readdirSync('supabase-migrations')
  assert(!migs.some(f => f.startsWith('094')), `no migration 094 exists yet (R2-0 has no migration)`)
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
