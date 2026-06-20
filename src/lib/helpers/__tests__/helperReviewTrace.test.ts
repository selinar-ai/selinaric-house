/**
 * Phase 41.14 — Helper Review Event Read-Only Trace tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/helperReviewTrace.test.ts
 *
 * Covers, with no DOM render:
 *  A. Pure trace presenter — action labels, date, line, ordering, defensiveness
 *  B. Boundary copy — caption / toggle / empty state wording
 *  C. Migration 078 — narrow definer read, hardened per Ari's addendum
 *  D. GET route — reads the trace via the RPC, attaches it, stays GET-only
 *  E. Page — renders the trace read-only, with caption + empty state, no power
 *
 * The whole point: a trace records that workflow movement happened. It never
 * makes a helper output true, evidentiary, prompt-visible, applied, Memory, or
 * authority — in code, in SQL, and in the surface.
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  TRACE_ACTION_LABELS,
  traceActionLabel,
  formatTraceDate,
  reviewTraceLine,
  reviewTraceForDisplay,
  HELPER_REVIEW_TRACE_CAPTION,
  HELPER_REVIEW_TRACE_TOGGLE,
  HELPER_REVIEW_TRACE_EMPTY,
  type HelperReviewEvent,
  type HelperOutputRow,
} from '../helperReviewPresenter'

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}

function section(name: string) { console.log(`\n── ${name} ──`) }

function readSrc(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf-8')
}

/** Strip SQL line comments so negative scans don't match prose. */
function stripSqlComments(sql: string): string {
  return sql.replace(/--.*$/gm, '')
}

function mkEvent(over: Partial<HelperReviewEvent> = {}): HelperReviewEvent {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    helper_output_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    previous_review_state: 'unreviewed',
    new_review_state: 'viewed',
    action: 'mark_reviewed_no_action',
    actor: 'tara',
    created_at: '2026-06-17T09:30:00.000Z',
    authority_changed: false,
    not_memory: true,
    not_evidence: true,
    not_prompt_authority: true,
    ...over,
  }
}

function mkRow(events: HelperReviewEvent[] | null | undefined): HelperOutputRow {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    helper_type: 'library_metadata_helper',
    output_status: 'draft_only',
    suggested_action: 'review_metadata',
    confidence_label: 'structural',
    presence_scope: 'house',
    created_by: 'helper_contract',
    created_at: '2026-06-17T09:00:00.000Z',
    not_memory: true,
    not_evidence: true,
    prompt_eligible: false,
    authority_changed: false,
    human_review_required: true,
    review_routed: false,
    reviewed_by: null,
    reviewed_at: null,
    source_refs: [],
    suggestion_payload: null,
    deleted_at: null,
    review_events: events,
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// A. Pure trace presenter
// ═════════════════════════════════════════════════════════════════════════════

section('A. Trace presenter — labels, date, line, ordering')
{
  // Past-tense, neutral labels for the three workflow actions.
  assert(traceActionLabel('mark_reviewed_no_action') === 'Marked reviewed', 'label: mark_reviewed_no_action → Marked reviewed')
  assert(traceActionLabel('dismiss_not_useful') === 'Dismissed', 'label: dismiss_not_useful → Dismissed')
  assert(traceActionLabel('needs_followup') === 'Flagged for follow-up', 'label: needs_followup → Flagged for follow-up')
  assert(Object.keys(TRACE_ACTION_LABELS).length === 3, 'exactly three trace action labels')
  // Unknown action degrades to the raw value (never throws, never invents).
  assert(traceActionLabel('something_else') === 'something_else', 'unknown action falls back to raw value')

  // Deterministic, timezone-stable date.
  assert(formatTraceDate('2026-06-17T09:30:00.000Z') === '17 Jun 2026', 'formatTraceDate renders UTC day/month/year')
  assert(formatTraceDate(null) === '', 'formatTraceDate(null) is empty')
  assert(formatTraceDate('not-a-date') === '', 'formatTraceDate(garbage) is empty, no throw')

  // One trace line: previous → new · action · actor · when.
  const line = reviewTraceLine(mkEvent())
  assert(line.includes('unreviewed → viewed'), 'line shows previous → new state')
  assert(line.includes('Marked reviewed'), 'line shows the human action label')
  assert(line.includes('tara'), 'line shows the actor')
  assert(line.includes('17 Jun 2026'), 'line shows the date')
  assert(line === 'unreviewed → viewed · Marked reviewed · tara · 17 Jun 2026', 'line is the exact composed string')

  // Defensive: null states render as — and a missing date drops cleanly.
  const sparse = reviewTraceLine(mkEvent({ previous_review_state: null, new_review_state: null, created_at: null }))
  assert(sparse.includes('— → —'), 'null states render as —')
  assert(!sparse.endsWith(' · '), 'missing date does not leave a dangling separator')

  // Ordering: oldest-first, stable by id on equal timestamps. Never mutates input.
  const e1 = mkEvent({ id: 'id-1', created_at: '2026-06-17T09:00:00.000Z' })
  const e2 = mkEvent({ id: 'id-2', created_at: '2026-06-17T10:00:00.000Z' })
  const e3 = mkEvent({ id: 'id-0', created_at: '2026-06-17T10:00:00.000Z' })
  const input = [e2, e1, e3]
  const ordered = reviewTraceForDisplay(mkRow(input))
  assert(ordered.map((e) => e.id).join(',') === 'id-1,id-0,id-2', 'trace sorted by created_at asc, id asc tiebreak')
  assert(input.map((e) => e.id).join(',') === 'id-2,id-1,id-0', 'reviewTraceForDisplay does not mutate the input array')

  // Empty / absent traces yield [].
  assert(reviewTraceForDisplay(mkRow(null)).length === 0, 'null review_events → empty trace')
  assert(reviewTraceForDisplay(mkRow(undefined)).length === 0, 'absent review_events → empty trace')
  assert(reviewTraceForDisplay(mkRow([])).length === 0, 'empty review_events → empty trace')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Boundary copy
// ═════════════════════════════════════════════════════════════════════════════

section('B. Boundary copy')
{
  assert(HELPER_REVIEW_TRACE_CAPTION.includes('workflow movement only'), 'caption: workflow movement only')
  for (const word of ['true', 'evidentiary', 'prompt-visible', 'applied', 'Memory', 'authority']) {
    assert(HELPER_REVIEW_TRACE_CAPTION.includes(word), `caption disclaims: ${word}`)
  }
  assert(HELPER_REVIEW_TRACE_EMPTY === 'No review events yet.', 'empty state copy')
  assert(HELPER_REVIEW_TRACE_TOGGLE === 'Show review trace', 'toggle copy')
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Migration 078 — narrow hardened definer read (Ari's addendum)
// ═════════════════════════════════════════════════════════════════════════════

section('C. Migration 078 — definer read hardening')
{
  const raw = readSrc('../../../../supabase-migrations/078_helper_review_events_read.sql')
  const sql = stripSqlComments(raw).toLowerCase()

  // The one function, by exact signature — schema-qualified.
  assert(sql.includes('create or replace function public.helper_review_events_for_outputs(p_helper_output_ids uuid[])'), 'creates public.helper_review_events_for_outputs(uuid[])')
  // Table reference is schema-qualified too (no reliance on search_path resolution).
  assert(sql.includes('from public.helper_review_events e'), 'reads from public.helper_review_events')

  // Security definer + FIXED, tight search_path (Ari).
  assert(sql.includes('security definer'), 'function is SECURITY DEFINER')
  assert(/set\s+search_path\s*=\s*pg_catalog,\s*pg_temp/.test(sql), 'fixed search_path = pg_catalog, pg_temp')
  assert(sql.includes('stable'), 'function is STABLE (read-only)')

  // Null/empty input never means "return all" (Ari).
  assert(sql.includes('p_helper_output_ids is not null'), 'guards against null input')
  assert(sql.includes('cardinality(p_helper_output_ids) >= 1'), 'guards against empty array input')
  assert(sql.includes('= any (p_helper_output_ids)'), 'filters strictly to the requested ids')

  // Deterministic order, created_at asc (Ari).
  assert(/order\s+by\s+e\.created_at\s+asc/.test(sql), 'orders by created_at asc')

  // Safe summary fields only — no payload / source / prompt / target leakage.
  for (const leak of ['suggestion_payload', 'source_refs', 'suggestion', 'payload', 'target', 'prompt_text']) {
    assert(!sql.includes(leak), `definer read does not expose ${leak}`)
  }

  // Execute: strict reset on EVERY grantee, then granted ONLY to service_role.
  const fn = 'public\\.helper_review_events_for_outputs\\(uuid\\[\\]\\)'
  assert(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+${fn}\\s+from\\s+public`).test(sql), 'revokes execute from public')
  assert(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+${fn}\\s+from\\s+anon`).test(sql), 'revokes execute from anon')
  assert(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+${fn}\\s+from\\s+authenticated`).test(sql), 'revokes execute from authenticated')
  assert(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+${fn}\\s+from\\s+service_role`).test(sql), 'resets execute from service_role before re-granting')
  assert(new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${fn}\\s+to\\s+service_role`).test(sql), 'grants execute to service_role')

  // No broad table SELECT grant, no new table policies, no writes (Ari + 077 posture).
  assert(!sql.includes('grant select on table helper_review_events'), 'does not grant a broad table SELECT')
  assert(!sql.includes('create policy'), 'adds no table policy')
  for (const w of ['insert into', 'update ', 'delete from', 'drop ', 'alter table', 'truncate']) {
    assert(!sql.includes(w), `migration performs no ${w.trim()}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// D. GET route reads the trace via the RPC and attaches it, stays GET-only
// ═════════════════════════════════════════════════════════════════════════════

section('D. GET route — trace via definer RPC, read-only preserved')
{
  const route = readSrc('../../../app/api/helper-outputs/route.ts')

  // Reads through the narrow definer RPC, by exact name, passing the row ids.
  assert(route.includes('supabase.rpc('), 'reads through an RPC, not a direct table select')
  assert(route.includes("'helper_review_events_for_outputs'"), 'calls the helper_review_events_for_outputs RPC')
  assert(route.includes('p_helper_output_ids: outputIds'), 'passes the listed row ids to the RPC')
  assert(route.includes('review_events: eventsByOutput[r.id] ?? []'), 'attaches per-row review_events to the response')

  // Best-effort: an RPC error degrades to an empty trace, never a 500.
  assert(route.includes('eventsError') && route.includes('Array.isArray(events)'), 'guards on RPC error / non-array result')

  // The events TABLE is never selected directly — only the function is called.
  assert(!route.includes("from('helper_review_events')"), 'route never selects helper_review_events directly')

  // Still GET-only / read-only — no write paths introduced.
  assert(route.includes('export async function GET'), 'exports GET')
  for (const m of ['export async function POST', 'export async function PATCH', 'export async function PUT', 'export async function DELETE']) {
    assert(!route.includes(m), `route does not export ${m.split(' ').pop()}`)
  }
  for (const mut of ['.insert(', '.update(', '.delete(', '.upsert(']) {
    assert(!route.includes(mut), `route performs no ${mut}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// E. Page renders the trace read-only, with caption + empty state, no power
// ═════════════════════════════════════════════════════════════════════════════

section('E. Page — read-only trace UI')
{
  const page = readSrc('../../../app/(house)/helpers/page.tsx')

  // Uses the pure presenter, not ad-hoc formatting.
  assert(page.includes('reviewTraceForDisplay'), 'page builds the trace via reviewTraceForDisplay')
  assert(page.includes('reviewTraceLine'), 'page renders lines via reviewTraceLine')
  assert(page.includes('HELPER_REVIEW_TRACE_CAPTION'), 'page renders the trace boundary caption')
  assert(page.includes('HELPER_REVIEW_TRACE_EMPTY'), 'page renders the empty state')
  assert(page.includes('HELPER_REVIEW_TRACE_TOGGLE'), 'page renders the disclosure toggle')

  // Keyboard-usable, reduced-motion-safe disclosure (native details/summary).
  assert(page.includes('<details') && page.includes('<summary'), 'trace uses native <details>/<summary> (keyboard usable)')

  // The trace is display only — it never posts, mutates, or carries authority.
  // (No new fetch/POST is introduced for the trace; it reads from the GET feed.)
  for (const forbidden of ['Approve output', 'Accept', 'Apply output', 'Promote', 'Make Memory', 'Make Evidence', 'Send to Prompt', 'Make truth', 'Restore', 'Undo']) {
    assert(!page.includes(forbidden), `page has no '${forbidden}' control`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// F. Immediate trace refresh after a successful action — via the 41.14 READ path
// ═════════════════════════════════════════════════════════════════════════════

section('F. Immediate trace refresh (read-only)')
{
  const page = readSrc('../../../app/(house)/helpers/page.tsx')

  // After a 200, the page re-reads through the existing read path (GET list),
  // not a new endpoint — buildUrl() is the only data source.
  assert(page.includes('buildUrl(filtersRef.current)'), 're-reads the trace via buildUrl (existing 41.14 read path)')
  assert(page.includes('filtersRef'), 'preserves current filters/toggles when re-reading')

  // The refresh merges fresh review_events into the acted row only.
  assert(page.includes('review_events: fresh.review_events ?? []'), 'merges fresh review_events into the acted row')
  assert(/find\(\(r\) => r\.id === row\.id\)/.test(page), 'selects the acted row from the fresh read')

  // It is a GET re-read — no second POST/mutation, no new route. The only POST in
  // the handler remains the single 41.12 review call.
  assert((page.match(/method: 'POST'/g) ?? []).length === 3, 'three page POSTs: review (41.12) + delegate + rollback (42.2.1)')
  assert(!page.includes('review-events') && !page.includes('review_trace'), 'no new per-row trace endpoint was introduced')
  // Best-effort: a failed re-read must not undo the successful action.
  assert(page.includes('trace refresh is best-effort'), 'trace re-read is best-effort, non-blocking')
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
if (failures.length > 0) {
  console.log('\n  Failures:')
  for (const f of failures) console.log(`    ✗ ${f}`)
}
console.log('══════════════════════════════════════════\n')
process.exit(failed > 0 ? 1 : 0)
