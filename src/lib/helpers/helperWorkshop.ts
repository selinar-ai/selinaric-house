/**
 * Phase 41.15 — Helper Workshop spatial review surface (pure presentation model)
 *
 * Pure, dependency-free mapping from the existing read-only review queue
 * (Phase 41.10) onto a calm spatial "workshop" of rooms. No I/O, no React, no DB,
 * no mutation. It decides WHERE a reviewer stands; it never changes WHAT a helper
 * can do.
 *
 * ── Core law ─────────────────────────────────────────────────────────────────
 *   Spatial UI may change the reviewer's sense of place. It may not change the
 *   helper's power. Rooms, glow, couriers, and shelves are presentation. They are
 *   never authority. Room glow reflects review state only — not urgency, truth,
 *   evidence, Memory, or prompt authority.
 *
 * Rooms map onto EXISTING queue/burden buckets — they invent no new category.
 * Naming rules (Ari): never "The Archive" (House Archive is authority-sensitive);
 * never "batch-ready" (no batch governance exists). Dismissed/closed/soft-deleted
 * trace lives in "The Trace Shelf".
 */

import type { QueueBucket, ReviewQueue } from './helperReviewQueue'
import type { HelperOutputRow } from './helperReviewPresenter'

// ─────────────────────────────────────────────────────────────────────────────
// ROOMS — a closed, ordered set mapped onto existing buckets
// ─────────────────────────────────────────────────────────────────────────────

export type WorkshopRoomId =
  | 'vault'
  | 'spire'
  | 'reading-hall'
  | 'sorting-hall'
  | 'quiet-shelf'
  | 'trace-shelf'

export type WorkshopRoomDef = {
  id: WorkshopRoomId
  /** Safe display name. Never "The Archive". */
  name: string
  /** Safe meaning line. Never "batch-ready". */
  subtitle: string
  /** Existing queue buckets that land in this room. */
  buckets: readonly QueueBucket[]
}

/**
 * The workshop rooms, in walk order (highest-attention first, trace last). Each
 * maps to existing Phase 41.10 buckets — no new authority categories. The Trace
 * Shelf gathers dismissed/closed AND soft-deleted (kept as trace, never deleted
 * from view, never the House Archive).
 */
export const WORKSHOP_ROOMS: readonly WorkshopRoomDef[] = [
  { id: 'vault', name: 'The Vault', subtitle: 'authority-critical review', buckets: ['authority_critical'] },
  { id: 'spire', name: 'The Spire', subtitle: 'high-risk review', buckets: ['high_risk'] },
  { id: 'reading-hall', name: 'The Reading Hall', subtitle: 'medium · individual review', buckets: ['medium_review'] },
  { id: 'sorting-hall', name: 'The Sorting Hall', subtitle: 'low-risk · grouped (quiet queue)', buckets: ['low_risk_batch_candidate'] },
  { id: 'quiet-shelf', name: 'The Quiet Shelf', subtitle: 'low-risk · no review waiting', buckets: ['low_risk_no_review'] },
  { id: 'trace-shelf', name: 'The Trace Shelf', subtitle: 'dismissed · closed · kept as trace', buckets: ['dismissed_or_closed', 'deleted'] },
] as const

export const WORKSHOP_ATRIUM_LABEL = 'Atrium'

// ─────────────────────────────────────────────────────────────────────────────
// FIXED COPY — the boundary, said out loud in the spatial surface
// ─────────────────────────────────────────────────────────────────────────────

export const WORKSHOP_VIEW_LABELS: Record<WorkshopViewMode, string> = {
  workshop: 'Workshop',
  list: 'List',
}

export const WORKSHOP_MAP_CAPTION =
  'The map shows where helper labour is waiting. Room glow reflects review state ' +
  'only — it is not urgency, truth, evidence, Memory, or authority. Moving between ' +
  'rooms changes nothing.'

/** Shown in the room. The courier is the helper law made visible: it never speaks. */
export const WORKSHOP_COURIER_CAPTION =
  'The courier presents helper labour. It does not speak, recommend, decide, ' +
  'remember, route, or make anything true.'

export const WORKSHOP_BACK_LABEL = 'Back to map'
export const WORKSHOP_ROOM_EMPTY = 'This room is quiet — nothing waiting here.'

export type WorkshopViewMode = 'workshop' | 'list'

export function isWorkshopViewMode(value: string | null | undefined): value is WorkshopViewMode {
  return value === 'workshop' || value === 'list'
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT NAMING — display language only (no new behaviour, no autonomy)
//
// User-facing "Agent" wording over raw helper labels. This is PRESENTATION: it
// names what kind of work is present; it never grants a helper agency, autonomy,
// approval, or authority. The lever underneath is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export const NO_ACTIVE_AGENT_LABEL = 'No active Agent work'
export const MULTIPLE_AGENTS_LABEL = 'Multiple Agents'

/** Governance line shown in the room near the controls. Said plainly, on purpose. */
export const WORKSHOP_AGENT_BOUNDARY =
  'Agent work is presented for review only. Review actions change workflow state; ' +
  'they do not approve, apply, remember, evidence, route, or make anything true.'

const AGENT_DISPLAY_NAMES: Record<string, string> = {
  library_metadata_helper: 'Library Metadata Agent',
  memory_candidate_helper: 'Memory Candidate Agent',
  graph_proposal_helper: 'Graph Proposal Agent',
  conflict_detection_helper: 'Conflict Detection Agent',
  recall_evaluation_helper: 'Recall Evaluation Agent',
}

/**
 * Display name for a helper type. Known helpers get a curated "… Agent" name;
 * unknown/future helpers derive a readable fallback (strip `_helper`, Title Case,
 * append "Agent") so the Workshop never shows a raw snake_case label.
 */
export function agentDisplayName(helperType: string | null | undefined): string {
  if (typeof helperType !== 'string' || helperType.length === 0) return 'Agent'
  if (AGENT_DISPLAY_NAMES[helperType]) return AGENT_DISPLAY_NAMES[helperType]
  const words = helperType.replace(/_helper$/, '').split('_').filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  return words.length ? `${words.join(' ')} Agent` : 'Agent'
}

/**
 * Tile subtitle for the Agent work present in a room, derived from the helper
 * types of the rows currently there (rooms are buckets, not fixed helper types):
 *   none     → "No active Agent work"
 *   one kind → that Agent's name
 *   many     → "Multiple Agents"
 */
export function agentSummaryFor(helperTypes: readonly string[]): string {
  const unique = [...new Set((helperTypes ?? []).filter((t) => typeof t === 'string' && t.length > 0))]
  if (unique.length === 0) return NO_ACTIVE_AGENT_LABEL
  if (unique.length === 1) return agentDisplayName(unique[0])
  return MULTIPLE_AGENTS_LABEL
}

const AGENT_OUTCOME_SUBLINES: Record<string, string> = {
  library_metadata_helper: 'This Agent is preparing a Library metadata suggestion.',
  memory_candidate_helper: 'This Agent is preparing a Memory candidate for review.',
  graph_proposal_helper: 'This Agent is preparing a Graph proposal for review.',
  conflict_detection_helper: 'This Agent is surfacing a conflict for review.',
  recall_evaluation_helper: 'This Agent is preparing a Recall evaluation trace.',
}

/**
 * What the selected helper output is preparing/suggesting/surfacing, in plain
 * words. Governance-safe verbs only (prepare/suggest/surface/present) — never
 * approve/apply/create-truth/create-Memory/create-evidence/route-authority.
 */
export function agentOutcomeSubline(helperType: string | null | undefined): string {
  if (typeof helperType === 'string' && AGENT_OUTCOME_SUBLINES[helperType]) {
    return AGENT_OUTCOME_SUBLINES[helperType]
  }
  return 'This Agent is preparing work for review.'
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOM ↔ BUCKET helpers (pure)
// ─────────────────────────────────────────────────────────────────────────────

export function roomDef(id: WorkshopRoomId): WorkshopRoomDef | null {
  return WORKSHOP_ROOMS.find((r) => r.id === id) ?? null
}

/** True when a queue bucket belongs in the given room. */
export function bucketInRoom(bucket: QueueBucket, roomId: WorkshopRoomId): boolean {
  const def = roomDef(roomId)
  return def ? def.buckets.includes(bucket) : false
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOM STATE — soft ambient label, derived from count only (read-only)
// ─────────────────────────────────────────────────────────────────────────────

export type WorkshopRoomState =
  | 'empty'
  | 'resting'
  | 'needs attention'
  | 'follow-up needed'
  | 'reviewed / trace visible'
  | 'kept as trace'

/**
 * The soft state a room shows on the map. Derived from the read-only count AND
 * the review_state of the room's rows — never from authority, never implying
 * truth. "Glow" is just this state rendered; it is review state, nothing more.
 *
 * The label reflects the most-attention-needing review_state present in the room:
 *   unreviewed                  → needs attention
 *   needs_action / needs_decision → follow-up needed
 *   viewed / useful (all reviewed) → reviewed / trace visible
 *   dismissed (Trace Shelf)      → kept as trace
 * The Quiet Shelf (low-risk, no review needed) rests regardless of state, and an
 * empty room is empty. This changes WORDING only — count and bucket are untouched.
 */
export function roomStateFor(
  roomId: WorkshopRoomId,
  count: number,
  reviewStates: readonly string[] = [],
): WorkshopRoomState {
  if (roomId === 'trace-shelf') return count > 0 ? 'kept as trace' : 'resting'
  if (count <= 0) return 'empty'
  if (roomId === 'quiet-shelf') return 'resting'
  if (reviewStates.includes('unreviewed')) return 'needs attention'
  if (reviewStates.some((s) => s === 'needs_action' || s === 'needs_decision')) return 'follow-up needed'
  return 'reviewed / trace visible'
}

// ─────────────────────────────────────────────────────────────────────────────
// MAP — read-only tiles derived from the existing queue counts
// ─────────────────────────────────────────────────────────────────────────────

export type WorkshopRoomTile = {
  id: WorkshopRoomId
  name: string
  subtitle: string
  /** Sum of the room's bucket counts from the existing queue. Read-only. */
  count: number
  state: WorkshopRoomState
  /** What kind of Agent work is present (derived from the room's rows). */
  agentSummary: string
  isTrace: boolean
}

/**
 * Build the workshop map from an already-built review queue (+ the same rows the
 * list renders). Counts are summed straight from queue.counts — the same read
 * model the list uses — so the map can never disagree with the list or invent
 * numbers. Ambient state reads the review_state of the room's entries; the Agent
 * summary reads the helper_type of the room's rows (matched to rooms via the
 * queue's own bucket classification). Pure; never mutates input.
 */
export function buildWorkshopMap(
  queue: Pick<ReviewQueue, 'counts' | 'entries'>,
  rows: readonly HelperOutputRow[] = [],
): WorkshopRoomTile[] {
  const bucketById = new Map((queue.entries ?? []).map((e) => [e.id, e.queue_bucket]))
  return WORKSHOP_ROOMS.map((room) => {
    const count = room.buckets.reduce((n, b) => n + (queue.counts?.[b] ?? 0), 0)
    const reviewStates = (queue.entries ?? [])
      .filter((e) => room.buckets.includes(e.queue_bucket))
      .map((e) => e.review_state)
    const helperTypes = rows
      .filter((r) => {
        const b = bucketById.get(r.id)
        return b !== undefined && room.buckets.includes(b)
      })
      .map((r) => r.helper_type)
    return {
      id: room.id,
      name: room.name,
      subtitle: room.subtitle,
      count,
      state: roomStateFor(room.id, count, reviewStates),
      agentSummary: agentSummaryFor(helperTypes),
      isTrace: room.id === 'trace-shelf',
    }
  })
}
