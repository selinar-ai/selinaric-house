/**
 * Phase 41.10 — Helper Review Queue Read Model tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/helperReviewQueue.test.ts
 *
 * No DB, no Supabase, no network, no UI. Pure read-only queue model tests.
 */

import {
  bucketOf,
  buildReviewQueue,
  isActiveBucket,
  isQueueBucket,
  QUEUE_BUCKET_ORDER,
  type QueueBucket,
  type ReviewQueueEntry,
} from '../helperReviewQueue'
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

// ─── Fixtures ──────────────────────────────────────────────────────────────

let seq = 0
function makeRow(o: Partial<HelperOutputRow> = {}): HelperOutputRow {
  seq += 1
  return {
    id: `row-${seq}`,
    helper_type: 'library_metadata_helper',
    output_status: 'deterministic_check',
    suggested_action: 'add_summary',
    confidence_label: 'structural',
    presence_scope: 'house',
    created_by: 'system_candidate',
    created_at: '2026-06-14T00:00:00Z',
    not_memory: true, not_evidence: true, prompt_eligible: false, authority_changed: false,
    human_review_required: true, review_routed: false, reviewed_by: null, reviewed_at: null,
    source_refs: [{ source_surface: 'library_item', source_id: 'i' }], suggestion_payload: {},
    deleted_at: null,
    review_state: 'unreviewed',
    // burden (41.9) — default to a conservative authority_critical shape
    risk_class: 'authority_critical',
    review_priority: 'normal',
    review_mode: 'two_gate_review_required',
    batch_eligible: false,
    sample_required: false,
    escalation_required: true,
    escalation_reasons: ['human_judgement_required'],
    ...o,
  }
}

// Burden presets matching the 41.8 classifier / 41.9 schema lanes.
const LOW_BATCH = { risk_class: 'low', review_mode: 'batch_review_allowed', batch_eligible: true, escalation_required: false, escalation_reasons: [] as string[], review_priority: 'routine' }
const LOW_NOREVIEW = { risk_class: 'low', review_mode: 'no_review_needed', batch_eligible: false, escalation_required: false, escalation_reasons: [] as string[], review_priority: 'routine' }
const MEDIUM = { risk_class: 'medium', review_mode: 'individual_review_required', batch_eligible: false, escalation_required: true, escalation_reasons: ['human_judgement_required'], review_priority: 'normal' }
const HIGH = { risk_class: 'high', review_mode: 'individual_review_required', batch_eligible: false, escalation_required: true, escalation_reasons: ['sensitive_scope'], review_priority: 'elevated' }
const AUTHORITY = { risk_class: 'authority_critical', review_mode: 'two_gate_review_required', batch_eligible: false, escalation_required: true, escalation_reasons: ['authority_surface'], review_priority: 'urgent' }

// ═════════════════════════════════════════════════════════════════════════════
// A. Bucketing
// ═════════════════════════════════════════════════════════════════════════════

section('A. Bucketing')
{
  assert(bucketOf(makeRow(AUTHORITY)) === 'authority_critical', 'authority_critical risk → authority_critical')
  assert(bucketOf(makeRow({ ...MEDIUM, review_mode: 'two_gate_review_required', risk_class: 'medium' })) === 'authority_critical', 'two_gate mode → authority_critical (even if risk medium)')
  assert(bucketOf(makeRow(HIGH)) === 'high_risk', 'high → high_risk')
  assert(bucketOf(makeRow(MEDIUM)) === 'medium_review', 'medium → medium_review')
  assert(bucketOf(makeRow({ risk_class: 'low', review_mode: 'individual_review_required', batch_eligible: false, escalation_required: true, escalation_reasons: ['human_judgement_required'] })) === 'medium_review', 'individual_review mode (non-AC) → medium_review')
  assert(bucketOf(makeRow(LOW_BATCH)) === 'low_risk_batch_candidate', 'low batch-eligible → low_risk_batch_candidate')
  assert(bucketOf(makeRow(LOW_NOREVIEW)) === 'low_risk_no_review', 'low no-review → low_risk_no_review')
  assert(bucketOf(makeRow({ ...LOW_BATCH, deleted_at: '2026-06-14T01:00:00Z' })) === 'deleted', 'deleted_at set → deleted (precedence)')
  assert(bucketOf(makeRow({ ...MEDIUM, review_state: 'dismissed' })) === 'dismissed_or_closed', 'dismissed → dismissed_or_closed')
  // viewed / useful / needs_action / needs_decision stay active (not closed).
  for (const st of ['viewed', 'useful', 'needs_action', 'needs_decision', 'unreviewed']) {
    assert(bucketOf(makeRow({ ...MEDIUM, review_state: st })) === 'medium_review', `review_state '${st}' stays active (medium)`)
  }
  // Absent burden → classify upward.
  assert(bucketOf(makeRow({ risk_class: undefined, review_mode: undefined })) === 'authority_critical', 'absent burden → authority_critical (upward)')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Bucket vocabulary + helpers
// ═════════════════════════════════════════════════════════════════════════════

section('B. Bucket vocabulary')
{
  assert(QUEUE_BUCKET_ORDER.length === 7, 'seven buckets')
  for (const b of ['authority_critical', 'high_risk', 'medium_review', 'low_risk_batch_candidate', 'low_risk_no_review', 'dismissed_or_closed', 'deleted']) {
    assert(isQueueBucket(b), `${b} is a queue bucket`)
  }
  assert(!isQueueBucket('approved'), 'approved is NOT a queue bucket')
  assert(isActiveBucket('authority_critical') && isActiveBucket('low_risk_no_review'), 'work buckets are active')
  assert(!isActiveBucket('deleted') && !isActiveBucket('dismissed_or_closed'), 'deleted + dismissed are inactive')
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Queue ranking across buckets
// ═════════════════════════════════════════════════════════════════════════════

section('C. Queue ranking (bucket order)')
{
  const rows = [
    makeRow(LOW_NOREVIEW),
    makeRow(AUTHORITY),
    makeRow(LOW_BATCH),
    makeRow(MEDIUM),
    makeRow(HIGH),
  ]
  const { entries } = buildReviewQueue(rows)
  const order = entries.map((e) => e.queue_bucket)
  assert(order[0] === 'authority_critical', 'authority_critical ranked first')
  assert(order.indexOf('authority_critical') < order.indexOf('high_risk'), 'authority_critical before high')
  assert(order.indexOf('high_risk') < order.indexOf('medium_review'), 'high before medium')
  assert(order.indexOf('medium_review') < order.indexOf('low_risk_batch_candidate'), 'medium before low_risk_batch_candidate')
  assert(order.indexOf('low_risk_batch_candidate') < order.indexOf('low_risk_no_review'), 'batch candidate before no_review')
  // Ranks are 1-based and contiguous.
  assert(entries.every((e, i) => e.queue_rank === i + 1), 'queue_rank is 1-based contiguous')
}

// ═════════════════════════════════════════════════════════════════════════════
// D. Priority ordering within a bucket
// ═════════════════════════════════════════════════════════════════════════════

section('D. Priority within bucket')
{
  const rows = [
    makeRow({ ...MEDIUM, id: 'm-routine', review_priority: 'routine' }),
    makeRow({ ...MEDIUM, id: 'm-urgent', review_priority: 'urgent' }),
    makeRow({ ...MEDIUM, id: 'm-normal', review_priority: 'normal' }),
    makeRow({ ...MEDIUM, id: 'm-elevated', review_priority: 'elevated' }),
  ]
  const { entries } = buildReviewQueue(rows)
  const ids = entries.map((e) => e.id)
  assert(ids[0] === 'm-urgent', 'urgent first within bucket')
  assert(ids.indexOf('m-urgent') < ids.indexOf('m-elevated'), 'urgent before elevated')
  assert(ids.indexOf('m-elevated') < ids.indexOf('m-normal'), 'elevated before normal')
  assert(ids.indexOf('m-normal') < ids.indexOf('m-routine'), 'normal before routine')
}

// ═════════════════════════════════════════════════════════════════════════════
// E. Newest-first tiebreak (documented choice)
// ═════════════════════════════════════════════════════════════════════════════

section('E. Newest-first tiebreak')
{
  const older = makeRow({ ...MEDIUM, id: 'older', created_at: '2026-06-01T00:00:00Z' })
  const newer = makeRow({ ...MEDIUM, id: 'newer', created_at: '2026-06-14T00:00:00Z' })
  const { entries } = buildReviewQueue([older, newer])
  assert(entries[0].id === 'newer', 'newest first within equal bucket+priority (default)')
  const asc = buildReviewQueue([older, newer], { order: 'oldest_first' })
  assert(asc.entries[0].id === 'older', 'oldest_first option respected')
}

// ═════════════════════════════════════════════════════════════════════════════
// F. Active filtering — deleted + dismissed excluded by default
// ═════════════════════════════════════════════════════════════════════════════

section('F. Active filtering')
{
  const rows = [
    makeRow(AUTHORITY),
    makeRow({ ...LOW_BATCH, deleted_at: '2026-06-14T01:00:00Z' }),
    makeRow({ ...MEDIUM, review_state: 'dismissed' }),
  ]
  const active = buildReviewQueue(rows)
  assert(active.total === 1, 'default queue excludes deleted + dismissed')
  assert(active.entries.every((e) => e.is_active), 'all default entries are active')
  const all = buildReviewQueue(rows, { includeInactive: true })
  assert(all.total === 3, 'includeInactive shows all')
  assert(all.entries[all.entries.length - 1].queue_bucket === 'deleted', 'deleted ranked last when included')
}

// ═════════════════════════════════════════════════════════════════════════════
// G. Attention flags + batch-candidate is read-only
// ═════════════════════════════════════════════════════════════════════════════

section('G. Attention flags')
{
  const ac = buildReviewQueue([makeRow(AUTHORITY)]).entries[0]
  assert(ac.requires_two_gate_attention === true && ac.requires_individual_attention === false, 'authority_critical → two-gate attention')
  const med = buildReviewQueue([makeRow(MEDIUM)]).entries[0]
  assert(med.requires_individual_attention === true && med.requires_two_gate_attention === false, 'medium → individual attention')
  const batch = buildReviewQueue([makeRow(LOW_BATCH)]).entries[0]
  assert(batch.is_low_risk_batch_candidate === true, 'low batch → is_low_risk_batch_candidate')
  // Batch candidate is read-only metadata — it implies no approval.
  assert(!('approved' in batch) && !('batch_approved' in batch), 'batch candidate carries no approval field')
  assert(batch.is_escalated === false, 'low batch is not escalated')
  assert(buildReviewQueue([makeRow(HIGH)]).entries[0].is_escalated === true, 'high is escalated')
}

// ═════════════════════════════════════════════════════════════════════════════
// H. No mutation of input rows
// ═════════════════════════════════════════════════════════════════════════════

section('H. Input immutability')
{
  const rows = [makeRow(AUTHORITY), makeRow(MEDIUM), makeRow(LOW_BATCH)]
  const before = JSON.stringify(rows)
  buildReviewQueue(rows, { includeInactive: true })
  bucketOf(rows[0])
  assert(JSON.stringify(rows) === before, 'input rows are not mutated')
}

// ═════════════════════════════════════════════════════════════════════════════
// I. No authority / prompt fields leak into the queue entry
// ═════════════════════════════════════════════════════════════════════════════

section('I. No authority / prompt exposure')
{
  const e = buildReviewQueue([makeRow(MEDIUM)]).entries[0]
  for (const forbidden of ['prompt_eligible', 'not_memory', 'not_evidence', 'authority_changed', 'reviewed_by', 'reviewed_at', 'suggestion_payload', 'source_refs']) {
    assert(!(forbidden in (e as unknown as Record<string, unknown>)), `queue entry has no '${forbidden}' field`)
  }
  // Queue entry exposes only read-only triage metadata.
  const keys = Object.keys(e as ReviewQueueEntry).sort()
  const expected = ['escalation_reasons', 'id', 'is_active', 'is_escalated', 'is_low_risk_batch_candidate', 'queue_bucket', 'queue_rank', 'requires_individual_attention', 'requires_two_gate_attention', 'review_mode', 'review_priority', 'review_state', 'risk_class'].sort()
  assert(JSON.stringify(keys) === JSON.stringify(expected), 'queue entry exposes only read-only triage fields')
}

// ═════════════════════════════════════════════════════════════════════════════
// J. Counts
// ═════════════════════════════════════════════════════════════════════════════

section('J. Bucket counts')
{
  const rows = [makeRow(AUTHORITY), makeRow(AUTHORITY), makeRow(HIGH), makeRow(LOW_BATCH)]
  const q = buildReviewQueue(rows)
  assert(q.counts.authority_critical === 2, 'two authority_critical counted')
  assert(q.counts.high_risk === 1, 'one high_risk counted')
  assert(q.counts.low_risk_batch_candidate === 1, 'one batch candidate counted')
  assert(q.total === 4, 'total matches')
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
