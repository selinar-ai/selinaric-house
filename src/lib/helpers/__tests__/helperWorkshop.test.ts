/**
 * Phase 41.15 — Helper Workshop spatial review surface tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/helperWorkshop.test.ts
 *
 * Covers, with no DOM render:
 *  A. Room definitions + safe vocabulary (Trace Shelf, never Archive; no batch-ready)
 *  B. buildWorkshopMap — counts derived from the existing queue read model
 *  C. roomStateFor — soft ambient state (review state only, never authority)
 *  D. View-mode helpers
 *  E. Page wiring (static): default Workshop, session-only pref, list fallback,
 *     map → room navigation, ONE output per room, reuse of the existing card +
 *     review handler + trace, silent courier, accessibility, no new route/mutation,
 *     no forbidden controls/words.
 *
 * The whole point: the Workshop changes the room Tara stands in. It does not add
 * a route, a migration, a mutation, batch, approval, or any authority. The lever
 * underneath is the same governed 41.12 route and 41.14 read-only trace.
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  WORKSHOP_ROOMS,
  WORKSHOP_VIEW_LABELS,
  WORKSHOP_MAP_CAPTION,
  WORKSHOP_COURIER_CAPTION,
  WORKSHOP_ATRIUM_LABEL,
  WORKSHOP_AGENT_BOUNDARY,
  WORKSHOP_EMPTY_CLARIFICATION,
  NO_ACTIVE_AGENT_LABEL,
  MULTIPLE_AGENTS_LABEL,
  buildWorkshopMap,
  bucketInRoom,
  roomDef,
  roomStateFor,
  isWorkshopViewMode,
  agentDisplayName,
  agentSummaryFor,
  agentOutcomeSubline,
  type WorkshopRoomId,
} from '../helperWorkshop'
import type { QueueBucket, ReviewQueue } from '../helperReviewQueue'
import type { HelperOutputRow } from '../helperReviewPresenter'

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

function countsOf(partial: Partial<Record<QueueBucket, number>>): ReviewQueue['counts'] {
  return {
    authority_critical: 0, high_risk: 0, medium_review: 0,
    low_risk_batch_candidate: 0, low_risk_no_review: 0,
    dismissed_or_closed: 0, deleted: 0, ...partial,
  }
}

/**
 * Build a minimal queue (counts derived from entries, so they always agree — just
 * like the real read model) from [bucket, review_state] pairs. Only the two fields
 * buildWorkshopMap reads are populated; the rest is irrelevant to the map.
 */
function queueFrom(pairs: Array<[QueueBucket, string]>): Pick<ReviewQueue, 'counts' | 'entries'> {
  const counts = countsOf({})
  for (const [b] of pairs) counts[b] += 1
  const entries = pairs.map(([queue_bucket, review_state], i) => ({ id: `id-${i}`, queue_bucket, review_state } as ReviewQueue['entries'][number]))
  return { counts, entries }
}

/**
 * Build a consistent queue + rows (ids matched) from specs, so buildWorkshopMap
 * can derive Agent summaries from helper_type. Only the fields the map reads are
 * populated.
 */
function tileMapFrom(specs: Array<{ bucket: QueueBucket; state?: string; helper?: string }>) {
  const counts = countsOf({})
  const entries: ReviewQueue['entries'] = []
  const rows: HelperOutputRow[] = []
  specs.forEach((s, i) => {
    const id = `id-${i}`
    counts[s.bucket] += 1
    entries.push({ id, queue_bucket: s.bucket, review_state: s.state ?? 'unreviewed' } as ReviewQueue['entries'][number])
    rows.push({ id, helper_type: s.helper ?? 'library_metadata_helper' } as HelperOutputRow)
  })
  return { queue: { counts, entries }, rows }
}

// ═════════════════════════════════════════════════════════════════════════════
// A. Rooms + safe vocabulary
// ═════════════════════════════════════════════════════════════════════════════

section('A. Rooms + safe vocabulary')
{
  assert(WORKSHOP_ROOMS.length === 6, 'six rooms defined')
  const names = WORKSHOP_ROOMS.map((r) => r.name)
  const ids = WORKSHOP_ROOMS.map((r) => r.id)

  assert(names.includes('The Trace Shelf'), 'uses The Trace Shelf for dismissed/closed/kept-as-trace')
  assert(!names.some((n) => /archive/i.test(n)), 'NO room is named Archive (authority-sensitive)')
  assert(!WORKSHOP_ROOMS.some((r) => /batch-ready/i.test(r.subtitle)), 'no "batch-ready" wording in subtitles')
  assert(WORKSHOP_ROOMS.some((r) => /grouped/i.test(r.subtitle)), 'low-risk grouped room uses safe "grouped" wording')

  // Expected room → bucket mapping (existing buckets only — no invented category).
  const map: Record<WorkshopRoomId, QueueBucket[]> = {
    'vault': ['authority_critical'],
    'spire': ['high_risk'],
    'reading-hall': ['medium_review'],
    'sorting-hall': ['low_risk_batch_candidate'],
    'quiet-shelf': ['low_risk_no_review'],
    'trace-shelf': ['dismissed_or_closed', 'deleted'],
  }
  for (const id of ids) {
    const def = roomDef(id)
    assert(def !== null, `roomDef('${id}') resolves`)
    assert(JSON.stringify(def?.buckets) === JSON.stringify(map[id]), `room '${id}' maps to expected existing buckets`)
  }

  // bucketInRoom is the inverse used for filtering entries into a room.
  assert(bucketInRoom('authority_critical', 'vault'), 'authority_critical → Vault')
  assert(bucketInRoom('dismissed_or_closed', 'trace-shelf'), 'dismissed_or_closed → Trace Shelf')
  assert(bucketInRoom('deleted', 'trace-shelf'), 'soft-deleted (kept as trace) → Trace Shelf')
  assert(!bucketInRoom('deleted', 'vault'), 'soft-deleted does NOT land in the Vault')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Map counts derive from the existing queue read model
// ═════════════════════════════════════════════════════════════════════════════

section('B. Map counts derive from queue.counts')
{
  const queue = queueFrom([
    ['authority_critical', 'unreviewed'], ['authority_critical', 'unreviewed'],
    ['high_risk', 'unreviewed'], ['dismissed_or_closed', 'dismissed'], ['deleted', 'dismissed'],
  ])
  const tiles = buildWorkshopMap(queue)
  const byId = Object.fromEntries(tiles.map((t) => [t.id, t]))

  assert(tiles.length === 6, 'one tile per room')
  assert(byId['vault'].count === 2, 'Vault count = authority_critical count (2)')
  assert(byId['spire'].count === 1, 'Spire count = high_risk count (1)')
  assert(byId['trace-shelf'].count === 2, 'Trace Shelf count = dismissed (1) + deleted (1) = 2')
  assert(byId['reading-hall'].count === 0, 'empty bucket → 0 (no invented count)')

  // Map total never exceeds the queue's own bucket totals (no inflation).
  const tileTotal = tiles.reduce((n, t) => n + t.count, 0)
  const queueTotal = Object.values(queue.counts).reduce((n, c) => n + c, 0)
  assert(tileTotal === queueTotal, 'sum of tile counts equals sum of queue counts (no invention)')

  // Empty queue → all-zero map, no throw.
  const empty = buildWorkshopMap({ counts: countsOf({}), entries: [] })
  assert(empty.every((t) => t.count === 0), 'empty queue → every room count 0')
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Room state reflects review_state (read-only label; never authority)
// ═════════════════════════════════════════════════════════════════════════════

section('C. roomStateFor — label tracks review_state')
{
  // Count gates: empty when nothing, regardless of states.
  assert(roomStateFor('vault', 0, []) === 'empty', 'Vault with 0 → empty')
  assert(roomStateFor('trace-shelf', 0, []) === 'resting', 'Trace Shelf with 0 → resting')

  // The four-way mapping Tara asked for.
  assert(roomStateFor('vault', 1, ['unreviewed']) === 'needs attention', 'unreviewed → needs attention')
  assert(roomStateFor('vault', 1, ['viewed']) === 'reviewed / trace visible', 'viewed → reviewed / trace visible')
  assert(roomStateFor('vault', 1, ['useful']) === 'reviewed / trace visible', 'useful (reviewed) → reviewed / trace visible')
  assert(roomStateFor('vault', 1, ['needs_action']) === 'follow-up needed', 'needs_action → follow-up needed')
  assert(roomStateFor('vault', 1, ['needs_decision']) === 'follow-up needed', 'needs_decision → follow-up needed')
  assert(roomStateFor('trace-shelf', 2, ['dismissed', 'dismissed']) === 'kept as trace', 'dismissed (Trace Shelf) → kept as trace')

  // Aggregation: the most-attention-needing state wins.
  assert(roomStateFor('reading-hall', 2, ['viewed', 'unreviewed']) === 'needs attention', 'any unreviewed in the room → needs attention')
  assert(roomStateFor('reading-hall', 2, ['viewed', 'needs_action']) === 'follow-up needed', 'follow-up outranks an already-viewed sibling')
  assert(roomStateFor('reading-hall', 2, ['viewed', 'viewed']) === 'reviewed / trace visible', 'all viewed → reviewed / trace visible')

  // The exact refinement Tara flagged: a reviewed Vault row no longer reads "needs attention".
  assert(roomStateFor('vault', 1, ['viewed']) !== 'needs attention', 'a viewed Vault row does NOT read "needs attention"')

  // The Quiet Shelf (no review needed) rests regardless of review_state.
  assert(roomStateFor('quiet-shelf', 2, ['unreviewed', 'unreviewed']) === 'resting', 'Quiet Shelf rests even with unreviewed rows')
  assert(roomStateFor('quiet-shelf', 0, []) === 'empty', 'Quiet Shelf with 0 → empty')

  // End-to-end through the map: a Vault holding one viewed row reads reviewed.
  const reviewedVault = buildWorkshopMap(queueFrom([['authority_critical', 'viewed']]))
  assert(reviewedVault.find((t) => t.id === 'vault')?.state === 'reviewed / trace visible', 'map: viewed Vault row → reviewed / trace visible')
  assert(reviewedVault.find((t) => t.id === 'vault')?.count === 1, 'map: Vault count still 1 (count/bucket logic unchanged)')
}

// ═════════════════════════════════════════════════════════════════════════════
// D. View-mode helpers
// ═════════════════════════════════════════════════════════════════════════════

section('D. View-mode helpers')
{
  assert(WORKSHOP_VIEW_LABELS.workshop === 'Workshop' && WORKSHOP_VIEW_LABELS.list === 'List', 'plain English view labels')
  assert(isWorkshopViewMode('workshop') && isWorkshopViewMode('list'), 'recognises valid modes')
  assert(!isWorkshopViewMode('archive') && !isWorkshopViewMode(null) && !isWorkshopViewMode(undefined), 'rejects invalid/empty modes')
  assert(WORKSHOP_ATRIUM_LABEL === 'Atrium', 'atrium label')
  // Captions carry the boundary.
  assert(/review state only/i.test(WORKSHOP_MAP_CAPTION) && /not.*authority/i.test(WORKSHOP_MAP_CAPTION), 'map caption: glow is review state, not authority')
  assert(/does not speak/i.test(WORKSHOP_COURIER_CAPTION) && /make anything true/i.test(WORKSHOP_COURIER_CAPTION), 'courier caption: silent, makes nothing true')
}

// ═════════════════════════════════════════════════════════════════════════════
// E. Page wiring (static scan)
// ═════════════════════════════════════════════════════════════════════════════

section('E. Page wiring')
{
  const page = readSrc('../../../app/(house)/helpers/page.tsx')

  // View toggle + default Workshop + session-only preference (never the DB).
  assert(page.includes("useState<WorkshopViewMode>('workshop')"), 'Workshop is the default view')
  assert(page.includes('WORKSHOP_VIEW_LABELS') && page.includes('aria-pressed'), 'accessible view toggle present')
  assert(page.includes('sessionStorage.getItem(WORKSHOP_VIEW_STORAGE_KEY)') && page.includes('sessionStorage.setItem(WORKSHOP_VIEW_STORAGE_KEY'), 'view preference is session-only')
  assert(!page.includes('localStorage'), 'view preference is NOT persisted to localStorage')
  // The review body is exactly action + expectedReviewState — no view mode, no
  // room, no spatial state ever reaches the mutation route.
  assert(page.includes('body: JSON.stringify({ action, expectedReviewState: reviewStateForDisplay(row) })'), 'review request body carries only action + expectedReviewState (no view/room state)')

  // List fallback remains intact alongside Workshop.
  assert(page.includes("viewMode === 'workshop'"), 'Workshop branch exists')
  assert(page.includes('<WorkshopMap') && page.includes('<WorkshopRoom'), 'map + room views wired')
  assert(page.includes('HELPER_REVIEW_EMPTY_PRIMARY') && page.includes('queue.entries.map'), 'List view (fallback) still renders the full card list')

  // Map → room navigation (read-only).
  assert(page.includes('enterRoom') && page.includes('setSelectedRoomId'), 'clicking a room enters it')
  assert(page.includes('backToMap'), 'back-to-map navigation exists')
  assert(page.includes('buildWorkshopMap(queue, rows)'), 'map tiles derive from the same queue + rows as the list')
  assert(page.includes('bucketInRoom(e.queue_bucket, selectedRoomId)'), 'room entries filtered from the same queue entries')

  // ONE output per room, via the SAME card (so controls + trace are reused, not forked).
  const roomFn = page.slice(page.indexOf('function WorkshopRoom'), page.indexOf('export default function'))
  assert((roomFn.match(/<HelperOutputCard/g) ?? []).length === 1, 'room shows exactly ONE HelperOutputCard at a time')
  assert(roomFn.includes('entries[safeIndex]'), 'room selects a single entry by clamped index')
  assert(roomFn.includes('onAction={onAction}'), 'room controls call the SAME review handler as the list')
  assert(roomFn.includes('WORKSHOP_COURIER_CAPTION'), 'room shows the silent-courier boundary caption')

  // The single review handler is unchanged: one POST to the existing 41.12 route.
  assert((page.match(/method: 'POST'/g) ?? []).length === 3, 'three page POSTs: review (41.12) + delegate + rollback (42.2.1)')
  assert(page.includes('/api/helpers/outputs/${row.id}/review'), 'reuses the existing single-row review route')

  // No NEW endpoints — only the two existing ones may appear.
  const apiRefs = [...page.matchAll(/['`](\/api\/[a-z0-9/\[\]$.{}_-]+)['`]/gi)].map((m) => m[1])
  const allowed = (u: string) => u.startsWith('/api/helper-outputs') || u.startsWith('/api/helpers/outputs/') || u.startsWith('/api/helpers/work-orders/')
  assert(apiRefs.length > 0 && apiRefs.every(allowed), `only existing endpoints referenced (${[...new Set(apiRefs)].join(', ')})`)

  // No new mutation surface of any kind.
  for (const mut of ['.insert(', '.update(', '.delete(', '.upsert(', "method: 'PATCH'", "method: 'PUT'", "method: 'DELETE'"]) {
    assert(!page.includes(mut), `page performs no ${mut}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// F. Silent courier + no forbidden controls/words
// ═════════════════════════════════════════════════════════════════════════════

section('F. Silent courier + forbidden surface')
{
  const page = readSrc('../../../app/(house)/helpers/page.tsx')
  const courierFn = page.slice(page.indexOf('function WorkshopCourier'), page.indexOf('function WorkshopRoomTileButton'))

  // The courier is pure decoration: aria-hidden, no interactivity, no text.
  assert(courierFn.includes('aria-hidden="true"'), 'courier is aria-hidden (decorative)')
  assert(!courierFn.includes('onClick'), 'courier is not interactive')
  assert(!courierFn.includes('<text'), 'courier SVG contains no text element')
  assert(!/recommend|approve|decide|suggest/i.test(courierFn), 'courier renders no recommendation/decision text')

  // No batch / multi-select / bulk anywhere.
  for (const banned of ['batch-ready', 'Batch', 'Bulk', 'Select all', 'selectAll', 'multi-select']) {
    assert(!page.includes(banned), `no '${banned}' control/wording`)
  }
  // No Archive room label leaked into the page.
  assert(!page.includes('The Archive'), 'no "The Archive" room label in the page')

  // No authority / approval / execution controls.
  for (const forbidden of [
    'Approve output', 'Accept', 'Apply output', 'Promote', 'Confirm', 'Make Memory', 'Make Evidence',
    'Send to Prompt', 'Send to Graph', 'Route to Reasoning', 'Make Candidate', 'Auto-fix',
    'Run helper', 'Re-run', 'Execute helper', 'Make truth', 'Restore', 'Undo',
  ]) {
    assert(!page.includes(forbidden), `page has no '${forbidden}' control`)
  }

  // Accessibility / reduced-motion / mobile fallback signals.
  assert(page.includes('useReducedMotion'), 'animations respect prefers-reduced-motion (useReducedMotion gate)')
  assert(page.includes('focus-visible:ring'), 'interactive elements have visible keyboard focus')
  assert(page.includes('grid-cols-1') && page.includes('sm:grid-cols-2'), 'map collapses to a single-column list on mobile')
}

// ═════════════════════════════════════════════════════════════════════════════
// G. Agent clarity layer — display naming, tile summary, outcome subline
// ═════════════════════════════════════════════════════════════════════════════

section('G. Agent clarity (display only)')
{
  // Display-name mapping: curated names for known helpers.
  assert(agentDisplayName('library_metadata_helper') === 'Library Metadata Agent', 'library_metadata_helper → Library Metadata Agent')
  assert(agentDisplayName('memory_candidate_helper') === 'Memory Candidate Agent', 'memory_candidate_helper → Memory Candidate Agent')
  assert(agentDisplayName('graph_proposal_helper') === 'Graph Proposal Agent', 'graph_proposal_helper → Graph Proposal Agent')
  assert(agentDisplayName('conflict_detection_helper') === 'Conflict Detection Agent', 'conflict_detection_helper → Conflict Detection Agent')
  assert(agentDisplayName('recall_evaluation_helper') === 'Recall Evaluation Agent', 'recall_evaluation_helper → Recall Evaluation Agent')
  // Fallback for unknown/future helpers — readable "… Agent", never raw snake_case.
  assert(agentDisplayName('future_widget_helper') === 'Future Widget Agent', 'unknown helper → derived "… Agent" name')
  assert(!agentDisplayName('future_widget_helper').includes('_'), 'derived name has no raw snake_case')
  assert(agentDisplayName('') === 'Agent' && agentDisplayName(null) === 'Agent', 'empty/null helper → safe "Agent"')

  // Tile summary: one Agent / multiple Agents / empty room.
  assert(agentSummaryFor([]) === NO_ACTIVE_AGENT_LABEL && NO_ACTIVE_AGENT_LABEL === 'No active Agent work', 'empty room → No active Agent work')
  assert(agentSummaryFor(['library_metadata_helper']) === 'Library Metadata Agent', 'one helper type → that Agent name')
  assert(agentSummaryFor(['library_metadata_helper', 'library_metadata_helper']) === 'Library Metadata Agent', 'same type repeated → one Agent name (deduped)')
  assert(agentSummaryFor(['library_metadata_helper', 'graph_proposal_helper']) === MULTIPLE_AGENTS_LABEL && MULTIPLE_AGENTS_LABEL === 'Multiple Agents', 'two helper types → Multiple Agents')

  // Through the map: tile.agentSummary derives from the rows in the room.
  const m1 = tileMapFrom([{ bucket: 'authority_critical', helper: 'library_metadata_helper' }])
  const t1 = buildWorkshopMap(m1.queue, m1.rows)
  assert(t1.find((t) => t.id === 'vault')?.agentSummary === 'Library Metadata Agent', 'map: single-Agent Vault → Library Metadata Agent')
  assert(t1.find((t) => t.id === 'spire')?.agentSummary === 'No active Agent work', 'map: empty Spire → No active Agent work')

  const m2 = tileMapFrom([
    { bucket: 'authority_critical', helper: 'library_metadata_helper' },
    { bucket: 'authority_critical', helper: 'graph_proposal_helper' },
  ])
  const t2 = buildWorkshopMap(m2.queue, m2.rows)
  assert(t2.find((t) => t.id === 'vault')?.agentSummary === 'Multiple Agents', 'map: mixed-Agent Vault → Multiple Agents')
  assert(t2.find((t) => t.id === 'vault')?.count === 2, 'map: count still from queue.counts (unchanged)')

  // Outcome subline: governance-safe verbs only.
  assert(agentOutcomeSubline('library_metadata_helper') === 'This Agent is preparing a Library metadata suggestion.', 'library outcome subline')
  assert(agentOutcomeSubline('conflict_detection_helper') === 'This Agent is surfacing a conflict for review.', 'conflict outcome subline (surfacing)')
  assert(agentOutcomeSubline('memory_candidate_helper').includes('Memory candidate'), 'memory outcome subline')
  assert(agentOutcomeSubline('unknown_helper') === 'This Agent is preparing work for review.', 'unknown helper → safe generic subline')

  const SAFE_VERB = /\b(preparing|suggesting|surfacing|presenting)\b/i
  const FORBIDDEN = /\b(approv|applying|apply\b|creating truth|creating Memory|creating evidence|routing authority|remember(s|ing)?|evidence\b)\b/i
  for (const ht of ['library_metadata_helper', 'memory_candidate_helper', 'graph_proposal_helper', 'conflict_detection_helper', 'recall_evaluation_helper', 'unknown_helper']) {
    const line = agentOutcomeSubline(ht)
    assert(SAFE_VERB.test(line), `outcome subline for ${ht} uses a safe verb`)
    assert(!FORBIDDEN.test(line), `outcome subline for ${ht} has no approval/authority wording`)
  }

  // Governance boundary line: present, with the negations, no affirmative approval.
  assert(WORKSHOP_AGENT_BOUNDARY.includes('presented for review only'), 'boundary: presented for review only')
  assert(WORKSHOP_AGENT_BOUNDARY.includes('change workflow state'), 'boundary: actions change workflow state')
  for (const neg of ['do not approve', 'apply', 'remember', 'evidence', 'route', 'make anything true']) {
    assert(WORKSHOP_AGENT_BOUNDARY.includes(neg), `boundary disclaims: ${neg}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// H. Page wiring for the Agent clarity layer (static scan)
// ═════════════════════════════════════════════════════════════════════════════

section('H. Page wiring — Agent clarity')
{
  const page = readSrc('../../../app/(house)/helpers/page.tsx')

  // Tile renders the Agent summary.
  assert(page.includes('tile.agentSummary'), 'room tile renders the Agent summary')

  // Room renders Agent name + outcome subline + governance boundary.
  const roomFn = page.slice(page.indexOf('function WorkshopRoom'), page.indexOf('export default function'))
  assert(roomFn.includes('agentDisplayName(row.helper_type)'), 'room shows the Agent display name')
  assert(roomFn.includes('agentOutcomeSubline(row.helper_type)'), 'room shows the outcome subline')
  assert(roomFn.includes('WORKSHOP_AGENT_BOUNDARY'), 'room shows the governance boundary line')

  // The Agent layer is display only — it added no mutation/route and the review
  // body is still exactly action + expectedReviewState.
  assert((page.match(/method: 'POST'/g) ?? []).length === 3, 'three page POSTs: review (41.12) + delegate + rollback (42.2.1)')
  assert(page.includes('body: JSON.stringify({ action, expectedReviewState: reviewStateForDisplay(row) })'), 'review body unchanged by the Agent layer')

  // No approval/authority CONTROL wording introduced by the Agent layer. (Plain
  // "approve"/"apply" appear only inside the existing NOT-approve/NOT-apply
  // governance comments — section F already forbids the actual control labels.)
  for (const forbidden of ['Apply output', 'Promote', 'creating truth', 'make truth', 'Approve Agent', 'Apply Agent']) {
    assert(!page.includes(forbidden), `page has no '${forbidden}' wording`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// I. Phase 41.16 — empty-state boundary clarification + closure record
// ═════════════════════════════════════════════════════════════════════════════

section('I. Empty-state clarification + closure record')
{
  // Wording: truthful boundary, no bridge/import/execution implied.
  assert(WORKSHOP_EMPTY_CLARIFICATION.includes('No active Agent work in the Helper Workshop'), 'clarification: no active Agent work')
  assert(/Memory Candidate and Graph candidate queues remain on their governed review surfaces/.test(WORKSHOP_EMPTY_CLARIFICATION), 'clarification: candidates remain on their governed surfaces')
  assert(/future bridge phase/.test(WORKSHOP_EMPTY_CLARIFICATION), 'clarification: bridge is future-facing, not present')
  // Must NOT imply a present bridge/import/execution exists.
  for (const bad of ['imported', 'imports', 'bridged', 'executes', 'executed', 'bridge exists', 'now appears here', 'has been deposited']) {
    assert(!new RegExp(bad, 'i').test(WORKSHOP_EMPTY_CLARIFICATION), `clarification does not imply a present "${bad}"`)
  }

  const page = readSrc('../../../app/(house)/helpers/page.tsx')
  // Rendered only when there are no active helper outputs.
  assert(page.includes('WORKSHOP_EMPTY_CLARIFICATION'), 'page renders the empty-state clarification')
  assert(page.includes('activeHelperCount === 0'), 'clarification is gated on zero active helper outputs')
  assert(page.includes("rows.filter((r) => !isSoftDeleted(r)).length"), 'active count = non-soft-deleted rows (read-only, no new source)')

  // No candidate data is read anywhere in the page (no bridge/import path).
  for (const banned of ['graph_candidate_suggestions', 'graph-candidate-suggestions', 'candidate_type', 'memory_candidate', '/api/graph']) {
    assert(!page.includes(banned), `page does not read candidate data (${banned})`)
  }
  // Still no new endpoint beyond the two existing ones.
  const apiRefs = [...page.matchAll(/['`](\/api\/[a-z0-9/\[\]$.{}_-]+)['`]/gi)].map((m) => m[1])
  assert(apiRefs.every((u) => u.startsWith('/api/helper-outputs') || u.startsWith('/api/helpers/outputs/') || u.startsWith('/api/helpers/work-orders/')), 'no new endpoint introduced by 41.16')

  // Closure record exists and does not claim a bridge already exists.
  const closure = readSrc('../../../../docs/phase-41-helper-floor-closure-record.md')
  assert(/Helper Floor Closure Record/.test(closure), 'closure record present')
  assert(/Memory Crown boundary/.test(closure) && /excluded \/ future-facing/.test(closure), 'closure record keeps the Memory Crown boundary')
  assert(/future, separately\s+governed bridge phase|future governed phase/.test(closure), 'closure record states a bridge requires a future governed phase')
  for (const falseClaim of ['bridge exists', 'bridge is live', 'candidates are imported', 'now imports candidates', 'Workshop reads graph_candidate_suggestions']) {
    assert(!new RegExp(falseClaim, 'i').test(closure), `closure record does not claim "${falseClaim}"`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// K. Visual pass Slice 1 — courier motion (presentation only)
// ═════════════════════════════════════════════════════════════════════════════

section('K. Courier motion (Slice 1)')
{
  const page = readSrc('../../../app/(house)/helpers/page.tsx')

  // One animation dependency, via the current Motion React entry + the seam module.
  assert(page.includes("from 'motion/react'"), 'imports from the current motion/react entry')
  assert(page.includes("from '@/lib/helpers/workshopMotion'"), 'uses the workshopMotion seam (useReducedMotion + constants)')
  assert(!page.includes("'framer-motion'"), 'does not import the legacy framer-motion path')

  // The still sprite no longer self-animates (motion now drives it) but stays silent.
  const sprite = page.slice(page.indexOf('function WorkshopCourier'), page.indexOf('function AnimatedCourier'))
  assert(sprite.includes('aria-hidden="true"'), 'courier sprite stays aria-hidden')
  assert(!sprite.includes('animate-pulse'), 'courier sprite no longer self-animates with CSS (motion drives it)')
  assert(!sprite.includes('<text') && !/recommend|approve|decide|suggest/i.test(sprite), 'courier sprite stays silent (no text/recommendation)')

  // The motion wrapper: reduced-motion returns the still sprite; reuses it; keyed.
  const anim = page.slice(page.indexOf('function AnimatedCourier'), page.indexOf('function WorkshopRoomTileButton'))
  assert(anim.includes('const reduce = useReducedMotion()'), 'courier reads reduced-motion preference')
  assert(anim.includes('if (reduce) return <WorkshopCourier'), 'reduced motion → still sprite, no animation')
  assert(anim.includes('<AnimatePresence') && anim.includes('mode="wait"'), 'exit completes before re-enter (mode=wait)')
  assert(anim.includes('<WorkshopCourier'), 'animated courier wraps the SAME silent sprite')
  assert(anim.includes('WORKSHOP_MOTION.courierBob') && anim.includes('WORKSHOP_MOTION.courierTravel'), 'uses the seam timing constants (idle bob + travel)')
  assert(!anim.includes('onClick') && !/recommend|approve|decide|suggest/i.test(anim), 'animated courier is non-interactive and silent')

  // The room presents via the animated courier, keyed by item id + review state,
  // so a successful action (state change) or stepping re-presents the courier.
  const roomFn = page.slice(page.indexOf('function WorkshopRoom'), page.indexOf('export default function'))
  assert(roomFn.includes('<AnimatedCourier presentKey='), 'room uses the animated courier')
  assert(/presentKey=\{`\$\{entry\?\.id[^`]*reviewStateForDisplay\(row\)\}`\}/.test(roomFn), 'courier key = item id + review state (re-presents on 200 action / step)')

  // Slice 1 did NOT touch the review-action path or add a route.
  assert((page.match(/method: 'POST'/g) ?? []).length === 3, 'three page POSTs: review (41.12) + delegate + rollback (42.2.1)')
  assert(page.includes('body: JSON.stringify({ action, expectedReviewState: reviewStateForDisplay(row) })'), 'review request body unchanged by Slice 1')
  const apiRefs = [...page.matchAll(/['`](\/api\/[a-z0-9/\[\]$.{}_-]+)['`]/gi)].map((m) => m[1])
  assert(apiRefs.every((u) => u.startsWith('/api/helper-outputs') || u.startsWith('/api/helpers/outputs/') || u.startsWith('/api/helpers/work-orders/')), 'no new endpoint introduced by Slice 1')
}

// ═════════════════════════════════════════════════════════════════════════════
// L. Visual pass Slice 2 — room transitions (presentation only)
// ═════════════════════════════════════════════════════════════════════════════

section('L. Room transitions (Slice 2)')
{
  const page = readSrc('../../../app/(house)/helpers/page.tsx')

  // Transition variants exist and are transform/opacity only (GPU-friendly).
  assert(page.includes('MAP_STAGE_ANIM') && page.includes('ROOM_STAGE_ANIM') && page.includes('CARD_STEP_ANIM'), 'map/room/card transition variants defined')
  const variants = page.slice(page.indexOf('const MAP_STAGE_ANIM'), page.indexOf('const CARD_STEP_ANIM') + 240)
  assert(/opacity/.test(variants) && /scale/.test(variants), 'transitions animate opacity + scale')
  for (const layout of ['width:', 'height:', 'left:', 'top:', 'margin']) {
    assert(!variants.includes(layout), `transitions do not animate layout property "${layout}" (no jank)`)
  }

  // Map ↔ room corridor-zoom via AnimatePresence, page-level reduced-motion gate.
  assert(page.includes('const reduceMotion = useReducedMotion()'), 'page reads reduced-motion preference')
  assert(page.includes('key="ws-map"') && page.includes('`ws-room:${selectedRoomId}`'), 'map and each room are keyed stages')
  assert(page.includes('selectedRoomId === null ? workshopMapView : workshopRoomView'), 'reduced motion → plain map/room switch, no animation')
  assert(page.includes('<AnimatePresence mode="wait" initial={false}>'), 'map↔room waits for exit and skips the first-paint animation')

  // Room-level prev/next cross-fade, keyed by item id, reduced-motion safe.
  const roomFn = page.slice(page.indexOf('function WorkshopRoom'), page.indexOf('export default function'))
  assert(roomFn.includes('const reduce = useReducedMotion()'), 'room reads reduced-motion preference')
  assert(roomFn.includes('{reduce ? presented : ('), 'reduced motion → plain presented content, no slide')
  assert(roomFn.includes('key={entry?.id ?? ') && roomFn.includes('CARD_STEP_ANIM'), 'presented output cross-fades keyed by item id (step), not on action')

  // Slice 2 did NOT touch the review-action path or add a route.
  assert((page.match(/method: 'POST'/g) ?? []).length === 3, 'three page POSTs: review (41.12) + delegate + rollback (42.2.1)')
  assert(page.includes('body: JSON.stringify({ action, expectedReviewState: reviewStateForDisplay(row) })'), 'review request body unchanged by Slice 2')
  const apiRefs = [...page.matchAll(/['`](\/api\/[a-z0-9/\[\]$.{}_-]+)['`]/gi)].map((m) => m[1])
  assert(apiRefs.every((u) => u.startsWith('/api/helper-outputs') || u.startsWith('/api/helpers/outputs/') || u.startsWith('/api/helpers/work-orders/')), 'no new endpoint introduced by Slice 2')
}

// ═════════════════════════════════════════════════════════════════════════════
// M. Visual pass Slice 3 — map ambience (presentation only)
// ═════════════════════════════════════════════════════════════════════════════

section('M. Map ambience (Slice 3)')
{
  const page = readSrc('../../../app/(house)/helpers/page.tsx')

  // Tile glow pulse — tied to the existing review-state visual, opacity only,
  // reduced-motion safe; tile hover/tap micro-interactions are also gated.
  const tileFn = page.slice(page.indexOf('function WorkshopRoomTileButton'), page.indexOf('function WorkshopMotes'))
  assert(tileFn.includes('const v = roomStateVisual(tile.state)'), 'glow derives from the existing review-state visual mapping')
  assert(tileFn.includes('const reduce = useReducedMotion()') && tileFn.includes('const pulsing = v.pulse && !reduce'), 'pulse is gated by review state + reduced motion')
  assert(tileFn.includes('WORKSHOP_MOTION.glowPulse') && /animate=\{\{\s*opacity:/.test(tileFn), 'glow pulse animates opacity only (GPU-friendly)')
  assert(tileFn.includes('whileHover={reduce ? undefined :') && tileFn.includes('whileTap={reduce ? undefined :'), 'hover/tap micro-interactions disabled under reduced motion')
  assert(!tileFn.includes('animate-pulse'), 'tile dot no longer uses the CSS pulse (motion drives the glow)')

  // Atrium motes — subtle, decorative, off under reduced motion, behind content.
  const motesFn = page.slice(page.indexOf('function WorkshopMotes'), page.indexOf('function WorkshopMap'))
  assert(motesFn.includes('if (reduce) return null'), 'motes are fully OFF under reduced motion (no toggle in v1)')
  assert(motesFn.includes('aria-hidden="true"') && motesFn.includes('pointer-events-none'), 'motes are decorative + non-interactive')
  assert(motesFn.includes('w-1 h-1') && motesFn.includes('WORKSHOP_MOTION.motes'), 'motes are subtle (1px) and use the seam timing')
  assert(motesFn.includes('z-0'), 'motes sit behind the tiles')

  // The map renders the motes behind content (relative + z-10 content layer).
  const mapFn = page.slice(page.indexOf('function WorkshopMap'), page.indexOf('export default function'))
  assert(mapFn.includes('<WorkshopMotes />') && mapFn.includes('relative max-w-4xl') && mapFn.includes('relative z-10'), 'map layers motes behind the tile content')

  // Slice 3 did NOT touch the review-action path or add a route.
  assert((page.match(/method: 'POST'/g) ?? []).length === 3, 'three page POSTs: review (41.12) + delegate + rollback (42.2.1)')
  assert(page.includes('body: JSON.stringify({ action, expectedReviewState: reviewStateForDisplay(row) })'), 'review request body unchanged by Slice 3')
  const apiRefs = [...page.matchAll(/['`](\/api\/[a-z0-9/\[\]$.{}_-]+)['`]/gi)].map((m) => m[1])
  assert(apiRefs.every((u) => u.startsWith('/api/helper-outputs') || u.startsWith('/api/helpers/outputs/') || u.startsWith('/api/helpers/work-orders/')), 'no new endpoint introduced by Slice 3')
}

// ═════════════════════════════════════════════════════════════════════════════
// N. Visual pass Slice 5 — courier character + room glow richness
// ═════════════════════════════════════════════════════════════════════════════

section('N. Courier character + room wash (Slice 5)')
{
  const page = readSrc('../../../app/(house)/helpers/page.tsx')

  // The richer Storybook-Spirit sprite: larger, has a face + carries a page,
  // but stays silent (no text), aria-hidden, non-interactive.
  const sprite = page.slice(page.indexOf('function WorkshopCourier'), page.indexOf('function AnimatedCourier'))
  assert(sprite.includes('aria-hidden="true"'), 'courier stays aria-hidden')
  assert(sprite.includes('viewBox="0 0 64 80"'), 'courier scaled up to a character (64×80)')
  assert(sprite.includes('#F3E7C9'), 'courier carries a page (parchment fill)')
  assert(sprite.includes('Q26 29') || sprite.includes('Q32 34'), 'courier has a gentle face (smile path)')
  assert(!sprite.includes('<text') && !/recommend|approve|decide|suggest/i.test(sprite), 'courier stays silent (no text/recommendation)')
  // Its motion wrapper grew to fit the character.
  assert(page.includes('style={{ width: 64, minHeight: 80 }}'), 'courier motion wrapper sized to the character')

  // Per-room glow richness: a low-alpha state-tinted wash, behind content, legible.
  const visualFn = page.slice(page.indexOf('function roomStateVisual'), page.indexOf('/**\n * The silent courier'))
  assert(visualFn.includes('wash:'), 'roomStateVisual returns a per-state wash')
  assert(visualFn.includes('radial-gradient') && visualFn.includes('transparent 62%'), 'wash is a soft radial that fades out')
  // Legibility-first: washes use low alpha (<= 0.14) and calm states have none.
  const alphas = [...visualFn.matchAll(/rgba\([^)]*?,\s*(0\.\d+)\)/g)].map((m) => parseFloat(m[1]))
  const washAlphas = alphas.filter((a) => a <= 0.2)
  assert(washAlphas.length > 0 && washAlphas.every((a) => a <= 0.14), 'wash tints stay faint (<= 0.14 alpha) for legibility')
  assert(visualFn.includes("case 'resting':") && /resting'[\s\S]*?wash: 'none'/.test(visualFn), 'calm (resting) state has no wash')
  // The tile applies the wash as a background behind its content.
  assert(page.includes('backgroundImage: v.wash'), 'tile renders the wash behind content (background layer)')

  // Slice 5 is presentation only — no review-path or route change.
  assert((page.match(/method: 'POST'/g) ?? []).length === 3, 'three page POSTs: review (41.12) + delegate + rollback (42.2.1)')
  assert(page.includes('body: JSON.stringify({ action, expectedReviewState: reviewStateForDisplay(row) })'), 'review request body unchanged by Slice 5')
  const apiRefs = [...page.matchAll(/['`](\/api\/[a-z0-9/\[\]$.{}_-]+)['`]/gi)].map((m) => m[1])
  assert(apiRefs.every((u) => u.startsWith('/api/helper-outputs') || u.startsWith('/api/helpers/outputs/') || u.startsWith('/api/helpers/work-orders/')), 'no new endpoint introduced by Slice 5')
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
