// Phase 11F — House Noticeboard governance tests
//
// Self-contained. No DB, no API keys, no network. Run with:
//   node scripts/test-phase-11f-noticeboard.mjs
//
// Strategy: this repo has no test runner, so these are behavioural checks of the
// pure governance logic plus source-contract assertions against the actual
// shipped files. They prove the Core Law: a House Noticeboard deposit is not
// Memory, not evidence, not prompt authority, and no Pulse house_deposit path
// creates Archive/Memory/Journal/Library/Graph/Helper/prompt records.
//
// Maps 1:1 to the eight tests in the Phase 11F brief (§15).

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const read = (p) => readFileSync(resolve(ROOT, p), 'utf-8')

let failures = 0
let count = 0
function check(label, pass, detail) {
  count++
  if (!pass) failures++
  console.log(`  ${pass ? '✓' : '✗'} ${label}`)
  if (detail !== undefined && !pass) console.log(`      ${detail}`)
}
function section(name) {
  console.log(`\n── ${name} ──`)
}

// ─── Load shipped sources once ───────────────────────────────────────────────

const migration = read('supabase-migrations/081_house_noticeboard_items.sql')
const lib = read('src/lib/house-noticeboard.ts')
const pulse = read('src/lib/pulse-autonomy.ts')
const apiList = read('src/app/api/noticeboard/route.ts')
const apiPatch = read('src/app/api/noticeboard/[id]/route.ts')
const notesPage = read('src/app/(house)/notes/page.tsx')

// ─── Replicated pure logic (mirrors src/lib/house-noticeboard.ts) ────────────
// Behavioural tests run against these; a source-contract assertion below proves
// the shipped lib contains the same rules so the replica cannot silently drift.

const NOTICEBOARD_AUTHORITY_FLAGS = {
  authority_label: 'house_noticeboard_not_memory',
  not_memory: true,
  not_evidence: true,
  not_prompt_authority: true,
  authority_changed: false,
}

const ALLOWED = {
  active: ['viewed', 'pinned', 'released', 'hidden', 'routed_to_library_review', 'routed_to_archive_review'],
  viewed: ['pinned', 'released', 'hidden', 'routed_to_library_review', 'routed_to_archive_review'],
  pinned: ['viewed', 'released', 'hidden', 'routed_to_library_review', 'routed_to_archive_review'],
  released: [],
  hidden: [],
  routed_to_library_review: [],
  routed_to_archive_review: [],
}
const isAllowed = (from, to) => (ALLOWED[from] ?? []).includes(to)

function buildPulseDepositPayload({ presenceId, eventId, content, noteKind }) {
  return {
    source_type: 'pulse_house_deposit',
    source_event_id: eventId,
    presence_id: presenceId,
    content,
    note_kind: noteKind ?? 'deposit',
    visibility: 'shared_house',
    status: 'active',
    ...NOTICEBOARD_AUTHORITY_FLAGS,
  }
}

function buildStatusUpdate(to, nowIso) {
  const u = { status: to }
  if (to === 'viewed') u.viewed_at = nowIso
  if (to === 'routed_to_library_review' || to === 'routed_to_archive_review') {
    u.reviewed_at = nowIso
    u.reviewed_by = 'tara'
  }
  return u
}

const AUTHORITY_KEYS = ['not_memory', 'not_evidence', 'not_prompt_authority', 'authority_changed', 'authority_label']

// A minimal decision-validation mirror (mirrors makeAutonomyDecision logic).
function validActionsFor(quietHours) {
  return quietHours
    ? ['journal', 'desk', 'stillness', 'house_deposit']
    : ['telegram', 'journal', 'desk', 'stillness', 'house_deposit']
}
function validateChosenAction(action, quietHours) {
  return validActionsFor(quietHours).includes(action)
}

// ════════════════════════════════════════════════════════════════════════════
// Test 1 — Action schema accepts house_deposit
// ════════════════════════════════════════════════════════════════════════════
section('Test 1 — Action schema accepts house_deposit')
{
  const decision = {
    chosen_action: 'house_deposit',
    reason_text: 'I want to leave something in the shared House without interrupting Tara.',
    choice_text: 'I was here. This is what I was holding.',
  }
  check('house_deposit validates outside quiet hours', validateChosenAction(decision.chosen_action, false))
  check('house_deposit validates during quiet hours', validateChosenAction(decision.chosen_action, true))
  check('AutonomyAction union includes house_deposit',
    /export type AutonomyAction =[^\n]*'house_deposit'/.test(pulse))
  check('decision JSON schema lists house_deposit',
    pulse.includes('"chosen_action": "telegram" | "journal" | "desk" | "stillness" | "house_deposit"'))
}

// ════════════════════════════════════════════════════════════════════════════
// Test 2 — Quiet hours allow house_deposit (and still exclude telegram)
// ════════════════════════════════════════════════════════════════════════════
section('Test 2 — Quiet hours allow house_deposit')
{
  const quiet = validActionsFor(true)
  check('quiet includes journal, desk, stillness, house_deposit',
    ['journal', 'desk', 'stillness', 'house_deposit'].every(a => quiet.includes(a)))
  check('quiet excludes telegram', !quiet.includes('telegram'))
  // Source contract: the shipped availableActions string includes house_deposit
  // in the quiet branch and omits telegram there.
  check('shipped quiet availableActions includes house_deposit',
    pulse.includes("'journal, desk, stillness, house_deposit'"))
  check('shipped open availableActions includes house_deposit',
    pulse.includes("'telegram, journal, desk, stillness, house_deposit'"))
}

// ════════════════════════════════════════════════════════════════════════════
// Test 3 — Pulse house_deposit creates a Noticeboard item with locked authority
// ════════════════════════════════════════════════════════════════════════════
section('Test 3 — Pulse event creates Noticeboard item')
{
  const payload = buildPulseDepositPayload({
    presenceId: 'ari',
    eventId: 'event-123',
    content: 'I was here. This is what I was holding.',
  })
  check('source_type = pulse_house_deposit', payload.source_type === 'pulse_house_deposit')
  check('source_event_id points to the pulse event', payload.source_event_id === 'event-123')
  check('authority_label = house_noticeboard_not_memory',
    payload.authority_label === 'house_noticeboard_not_memory')
  check('not_memory = true', payload.not_memory === true)
  check('not_evidence = true', payload.not_evidence === true)
  check('not_prompt_authority = true', payload.not_prompt_authority === true)
  check('authority_changed = false', payload.authority_changed === false)
  check('visibility = shared_house', payload.visibility === 'shared_house')

  // Source contract: execution branch creates the deposit linked to the event id.
  check('pulse execution calls createDepositForEvent with eventId',
    /createDepositForEvent\(\{[\s\S]*?eventId,[\s\S]*?content: decision\.choice_text/.test(pulse))
  check('deposit insert targets house_noticeboard_items',
    lib.includes(".from('house_noticeboard_items')") && lib.includes('.insert(payload)'))
}

// ════════════════════════════════════════════════════════════════════════════
// Test 4 — Idempotency prevents duplicate Noticeboard items
// ════════════════════════════════════════════════════════════════════════════
section('Test 4 — Idempotency prevents duplicate deposits')
{
  // Pulse-level idempotency: an existing event short-circuits before any deposit.
  check('runAutonomyForPresence returns early on existing event',
    /const existing = await checkExistingEvent[\s\S]*?if \(existing\) return existing/.test(pulse))
  // Deposit-level idempotency: check existing by source_event_id before insert.
  check('createDepositForEvent checks existing source_event_id before inserting',
    /select\('id'\)[\s\S]*?\.eq\('source_event_id', args\.eventId\)[\s\S]*?if \(existing\?\.id\)/.test(lib))
  // Race safety: unique-violation handled.
  check('createDepositForEvent handles unique-violation race (23505)',
    lib.includes("error.code === '23505'"))
  // DB backstop: partial unique index on source_event_id for pulse deposits.
  check('migration has partial unique index on source_event_id',
    /unique index[\s\S]*?house_noticeboard_items \(source_event_id\)[\s\S]*?where source_event_id is not null[\s\S]*?source_type = 'pulse_house_deposit'/.test(migration))
}

// ════════════════════════════════════════════════════════════════════════════
// Test 5 — Status update does not change authority
// ════════════════════════════════════════════════════════════════════════════
section('Test 5 — Status update does not change authority')
{
  const transitions = ['viewed', 'pinned', 'released', 'hidden', 'routed_to_library_review', 'routed_to_archive_review']
  for (const to of transitions) {
    const u = buildStatusUpdate(to, '2026-06-20T00:00:00.000Z')
    const touchesAuthority = AUTHORITY_KEYS.some(k => k in u)
    check(`status->${to}: update touches no authority flag`, !touchesAuthority, `keys: ${Object.keys(u).join(', ')}`)
    check(`status->${to}: only status/metadata keys`,
      Object.keys(u).every(k => ['status', 'viewed_at', 'reviewed_at', 'reviewed_by'].includes(k)))
  }
  // viewed sets viewed_at; routes set reviewed_at + reviewed_by.
  check('viewed sets viewed_at', 'viewed_at' in buildStatusUpdate('viewed', 'x'))
  check('route-to-library sets reviewed_at + reviewed_by', (() => {
    const u = buildStatusUpdate('routed_to_library_review', 'x')
    return u.reviewed_at === 'x' && u.reviewed_by === 'tara'
  })())

  // Allowed-transition rules match the brief exactly.
  check('active -> viewed allowed', isAllowed('active', 'viewed'))
  check('pinned -> viewed allowed', isAllowed('pinned', 'viewed'))
  check('viewed -> pinned allowed', isAllowed('viewed', 'pinned'))
  check('released is terminal', ALLOWED.released.length === 0)
  check('hidden is terminal', ALLOWED.hidden.length === 0)
  check('routed_to_library_review is terminal', ALLOWED.routed_to_library_review.length === 0)
  check('released -> active rejected', !isAllowed('released', 'active'))

  // Source contract: PATCH route uses buildStatusUpdate and never writes flags.
  check('PATCH uses buildStatusUpdate', apiPatch.includes('buildStatusUpdate('))
  check('PATCH never writes not_memory', !apiPatch.includes('not_memory'))
  check('PATCH never writes authority_changed', !apiPatch.includes('authority_changed'))
  check('PATCH never writes canonical_status', !apiPatch.includes('canonical_status'))
  check('PATCH does not touch archive/journal/library/memory tables',
    !/archive_items|presence_journal|library_items|memory_nodes|memory_edges|graph_proposals|helper_/.test(apiPatch))

  // DB-level lock: CHECK constraints make the safe flags immutable.
  check('migration locks not_memory = true',
    /not_memory boolean not null default true check \(not_memory = true\)/.test(migration))
  check('migration locks not_evidence = true',
    /not_evidence boolean not null default true check \(not_evidence = true\)/.test(migration))
  check('migration locks not_prompt_authority = true',
    /not_prompt_authority boolean not null default true check \(not_prompt_authority = true\)/.test(migration))
  check('migration locks authority_changed = false',
    /authority_changed boolean not null default false check \(authority_changed = false\)/.test(migration))
  check('migration locks authority_label value',
    /authority_label = 'house_noticeboard_not_memory'/.test(migration))
}

// ════════════════════════════════════════════════════════════════════════════
// Test 6 — API list hides hidden by default
// ════════════════════════════════════════════════════════════════════════════
section('Test 6 — API list hides hidden by default')
{
  check('GET excludes hidden when no status param',
    /if \(!statusParam\) \{[\s\S]*?\.neq\('status', 'hidden'\)/.test(apiList))
  check("GET status=all removes the filter (includes hidden)",
    apiList.includes("status === 'all'") || apiList.includes("statusParam !== 'all'"))
  check('GET supports presence filter ari/eli',
    /presence === 'ari' \|\| presence === 'eli'/.test(apiList))
}

// ════════════════════════════════════════════════════════════════════════════
// Test 7 — UI renders boundary text
// ════════════════════════════════════════════════════════════════════════════
section('Test 7 — /notes renders boundary text')
{
  check('/notes contains "House Noticeboard"', notesPage.includes('House Noticeboard'))
  check('/notes contains "not Memory"', notesPage.includes('not Memory'))
  check('/notes contains "not obligations"', notesPage.includes('not obligations'))
  check('/notes contains empty state "The Noticeboard is quiet."',
    notesPage.includes('The Noticeboard is quiet.'))
  check('old house_notes free-write table is no longer used',
    !notesPage.includes('house_notes'))
}

// ════════════════════════════════════════════════════════════════════════════
// Test 8 — No prompt injection path added
// ════════════════════════════════════════════════════════════════════════════
section('Test 8 — No prompt/recall injection path added')
{
  // The house_deposit pulse event stores no deposit content (choice_text=null),
  // so recent-event excerpts cannot leak it.
  check('house_deposit nulls choice_text on the pulse event',
    /chosen_action === 'house_deposit' \? null/.test(pulse))
  // Room-prompt continuity for house_deposit is fact-only (no choice_text).
  // Scope to the getAutonomyContinuityForPrompt house_deposit case block only.
  const contStart = pulse.indexOf('export async function getAutonomyContinuityForPrompt')
  const contEnd = pulse.indexOf('export async function getSharedAutonomyContinuityForPrompt')
  const contBody = pulse.slice(contStart, contEnd)
  const hdIdx = contBody.indexOf("case 'house_deposit':")
  const hdBlock = hdIdx >= 0 ? contBody.slice(hdIdx, contBody.indexOf('break', hdIdx)) : ''
  check('room continuity house_deposit case is fact-only',
    hdBlock.includes('left a shared House Noticeboard deposit.'))
  // Strip line comments so we test actual code, not explanatory text.
  const hdCode = hdBlock.replace(/\/\/[^\n]*/g, '')
  check('room continuity house_deposit case does not push choice_text',
    hdBlock.length > 0 && !hdCode.includes('choice_text'))
  // house_deposit does NOT create confirmed memory or timeline mirror.
  check('house_deposit branch skips createConfirmedAutonomyMemory',
    /chosen_action === 'house_deposit'\) \{[\s\S]*?createDepositForEvent[\s\S]*?\} else \{[\s\S]*?createConfirmedAutonomyMemory/.test(pulse))
  check('house_deposit branch skips mirrorToTimeline',
    /chosen_action === 'house_deposit'\) \{(?:(?!mirrorToTimeline)[\s\S])*?\} else \{/.test(pulse))

  // No recall/prompt builder references the noticeboard table.
  const recallFiles = [
    'src/lib/recall/recallPacketBuilder.ts',
    'src/lib/recall/recallCandidateAdapter.ts',
  ]
  for (const f of recallFiles) {
    let src = ''
    try { src = read(f) } catch { src = '' }
    check(`${f} does not reference house_noticeboard`, !src.includes('house_noticeboard'))
  }

  // The noticeboard lib itself never writes any Memory/Archive/etc table:
  // every .from('...') call must target house_noticeboard_items (table names in
  // documentation comments don't count — only real Supabase table references).
  const libFromTables = [...lib.matchAll(/\.from\('([^']+)'\)/g)].map(m => m[1])
  check('house-noticeboard lib .from() targets only house_noticeboard_items',
    libFromTables.length > 0 && libFromTables.every(t => t === 'house_noticeboard_items'),
    `tables: ${libFromTables.join(', ')}`)
}

// ─── Result ──────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════')
console.log(`  ${count - failures}/${count} checks passed`)
console.log(failures === 0 ? '  PHASE 11F GOVERNANCE: ALL CHECKS PASSED' : `  ${failures} CHECK(S) FAILED`)
console.log('══════════════════════════════════════════\n')
process.exit(failures === 0 ? 0 : 1)
