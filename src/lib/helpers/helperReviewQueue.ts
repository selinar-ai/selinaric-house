/**
 * Phase 41.10 — Helper Review Queue Read Model
 *
 * Pure, read-only. Derives queue organisation (bucket, rank, attention flags)
 * from the persisted Phase 41.9 review-burden fields on a helper output. It
 * ORDERS and EXPLAINS review burden; it never performs review.
 *
 * NO DB, NO writes, NO mutation, NO migration, NO route, NO UI, NO review
 * execution, NO prompt assembly, NO LLM, NO automation. Every function here is
 * pure and deterministic, and never mutates its input.
 *
 * ── Laws ─────────────────────────────────────────────────────────────────────
 *   The queue may order review work, display burden, explain priority, and group
 *   rows for human attention. The queue may NOT approve, accept, apply, promote,
 *   remember, make evidence, send to prompt, route to reasoning/Memory, mutate
 *   Library or helper_outputs, change review_state, or batch approve/dismiss.
 *
 *   Queue rank is not authority. Queue bucket is not truth. Batch candidate is
 *   not batch approval.
 */

import type { HelperOutputRow } from './helperReviewPresenter'

// ─────────────────────────────────────────────────────────────────────────────
// QUEUE BUCKET VOCABULARY (closed) — ordered highest-burden first
// ─────────────────────────────────────────────────────────────────────────────

export type QueueBucket =
  | 'authority_critical'
  | 'high_risk'
  | 'medium_review'
  | 'low_risk_batch_candidate'
  | 'low_risk_no_review'
  | 'dismissed_or_closed'
  | 'deleted'

export const QUEUE_BUCKET_ORDER: readonly QueueBucket[] = [
  'authority_critical',
  'high_risk',
  'medium_review',
  'low_risk_batch_candidate',
  'low_risk_no_review',
  'dismissed_or_closed',
  'deleted',
]

export function isQueueBucket(value: string): value is QueueBucket {
  return (QUEUE_BUCKET_ORDER as readonly string[]).includes(value)
}

/** Active buckets are those that belong in the default review queue. */
export function isActiveBucket(bucket: QueueBucket): boolean {
  return bucket !== 'deleted' && bucket !== 'dismissed_or_closed'
}

export const QUEUE_BUCKET_MEANING: Record<QueueBucket, string> = {
  authority_critical: 'risk_class = authority_critical OR review_mode = two_gate_review_required.',
  high_risk: 'risk_class = high.',
  medium_review: 'risk_class = medium OR review_mode = individual_review_required (and not authority-critical).',
  low_risk_batch_candidate: 'low risk, batch_review_allowed, batch_eligible, not escalated — a candidate for grouped review later (NOT approval).',
  low_risk_no_review: 'low risk, no_review_needed, not batch-eligible, not escalated.',
  dismissed_or_closed: 'review_state is dismissed (terminal in v1). viewed/useful stay active; needs_action/needs_decision stay active.',
  deleted: 'deleted_at IS NOT NULL — never in the default active queue.',
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIORITY ORDER (within a bucket)
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  elevated: 1,
  normal: 2,
  routine: 3,
}

function priorityRank(priority: string | null | undefined): number {
  return typeof priority === 'string' && priority in PRIORITY_RANK ? PRIORITY_RANK[priority] : PRIORITY_RANK.normal
}

// ─────────────────────────────────────────────────────────────────────────────
// BUCKETING (pure, single row) — classify UPWARD on absent/ambiguous burden
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Which queue bucket a single helper output belongs in. Read-only. Deleted and
 * dismissed take precedence; otherwise the persisted burden fields decide. If
 * burden is absent or unrecognised, the row classifies UPWARD to
 * authority_critical (safest — most attention), matching the Phase 41.8/41.9
 * "when unsure, classify upward" posture.
 */
export function bucketOf(row: HelperOutputRow): QueueBucket {
  if (row.deleted_at != null) return 'deleted'
  if (row.review_state === 'dismissed') return 'dismissed_or_closed'

  const risk = row.risk_class
  const mode = row.review_mode

  if (risk === 'authority_critical' || mode === 'two_gate_review_required') return 'authority_critical'
  if (risk === 'high') return 'high_risk'
  if (risk === 'medium' || mode === 'individual_review_required') return 'medium_review'

  if (
    risk === 'low' &&
    mode === 'batch_review_allowed' &&
    row.batch_eligible === true &&
    row.escalation_required === false
  ) {
    return 'low_risk_batch_candidate'
  }
  if (
    risk === 'low' &&
    mode === 'no_review_needed' &&
    row.batch_eligible === false &&
    row.escalation_required === false
  ) {
    return 'low_risk_no_review'
  }

  // Absent / ambiguous burden → classify upward.
  return 'authority_critical'
}

// ─────────────────────────────────────────────────────────────────────────────
// QUEUE ENTRY (derived, read-only — never persisted)
// ─────────────────────────────────────────────────────────────────────────────

export type ReviewQueueEntry = {
  id: string
  queue_bucket: QueueBucket
  /** 1-based position in the built queue (lower = reviewed first). */
  queue_rank: number
  requires_two_gate_attention: boolean
  requires_individual_attention: boolean
  is_low_risk_batch_candidate: boolean
  is_escalated: boolean
  is_active: boolean
  // Echoed read-only burden fields for display only — no authority fields here.
  risk_class: string
  review_priority: string
  review_mode: string
  review_state: string
  escalation_reasons: string[]
}

/** Derive the queue entry for a row, minus rank (rank needs the whole set). */
function deriveEntry(row: HelperOutputRow): Omit<ReviewQueueEntry, 'queue_rank'> {
  const bucket = bucketOf(row)
  return {
    id: row.id,
    queue_bucket: bucket,
    requires_two_gate_attention: bucket === 'authority_critical',
    requires_individual_attention: bucket === 'high_risk' || bucket === 'medium_review',
    is_low_risk_batch_candidate: bucket === 'low_risk_batch_candidate',
    is_escalated: row.escalation_required === true,
    is_active: isActiveBucket(bucket),
    risk_class: typeof row.risk_class === 'string' ? row.risk_class : 'authority_critical',
    review_priority: typeof row.review_priority === 'string' ? row.review_priority : 'normal',
    review_mode: typeof row.review_mode === 'string' ? row.review_mode : 'two_gate_review_required',
    review_state: typeof row.review_state === 'string' ? row.review_state : 'unreviewed',
    escalation_reasons: Array.isArray(row.escalation_reasons) ? [...row.escalation_reasons] : [],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// QUEUE BUILD (pure) — deterministic ordering
// ─────────────────────────────────────────────────────────────────────────────

export type BuildQueueOptions = {
  /**
   * Include deleted + dismissed_or_closed buckets. Default false — the default
   * queue shows only active review work. (Deleted never appears unless asked.)
   */
  includeInactive?: boolean
  /**
   * Tiebreak ordering within equal bucket + priority. Default 'newest_first'
   * (helper outputs are operational review items — newest surfaces first).
   */
  order?: 'newest_first' | 'oldest_first'
}

function createdAtMs(row: HelperOutputRow): number {
  if (typeof row.created_at !== 'string') return 0
  const t = Date.parse(row.created_at)
  return Number.isNaN(t) ? 0 : t
}

export type ReviewQueue = {
  entries: ReviewQueueEntry[]
  counts: Record<QueueBucket, number>
  total: number
}

/**
 * Build a deterministic, read-only review queue from helper output rows. Sorts
 * by bucket order → priority (urgent first) → created_at (newest first by
 * default) → id. Assigns a 1-based queue_rank. NEVER mutates the input rows.
 */
export function buildReviewQueue(
  rows: HelperOutputRow[],
  options: BuildQueueOptions = {},
): ReviewQueue {
  const includeInactive = options.includeInactive ?? false
  const newestFirst = (options.order ?? 'newest_first') === 'newest_first'

  // Derive entries (pure — deriveEntry reads only, copies arrays).
  const derived = rows.map((row) => ({ entry: deriveEntry(row), ms: createdAtMs(row) }))

  const filtered = includeInactive ? derived : derived.filter((d) => d.entry.is_active)

  filtered.sort((a, b) => {
    const ba = QUEUE_BUCKET_ORDER.indexOf(a.entry.queue_bucket)
    const bb = QUEUE_BUCKET_ORDER.indexOf(b.entry.queue_bucket)
    if (ba !== bb) return ba - bb
    const pa = priorityRank(a.entry.review_priority)
    const pb = priorityRank(b.entry.review_priority)
    if (pa !== pb) return pa - pb
    if (a.ms !== b.ms) return newestFirst ? b.ms - a.ms : a.ms - b.ms
    return a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0
  })

  const entries: ReviewQueueEntry[] = filtered.map((d, i) => ({ ...d.entry, queue_rank: i + 1 }))

  const counts = QUEUE_BUCKET_ORDER.reduce(
    (acc, b) => ({ ...acc, [b]: entries.filter((e) => e.queue_bucket === b).length }),
    {} as Record<QueueBucket, number>,
  )

  return { entries, counts, total: entries.length }
}
