// Phase 37C — Graph Proposal Status Transitions
//
// Proposal is not approval. Approval is not Memory.
// Graph authority is not Memory authority.
//
// This module defines allowed status transitions for graph proposals.
// It does not create final graph items, Memory, or Archive authority.

import type { GraphReviewStatus } from './types'

// ─── Allowed transitions ───────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending_review: ['approved_graph', 'rejected', 'needs_more_evidence', 'workspace_only'],
  needs_more_evidence: ['approved_graph', 'rejected', 'workspace_only'],
  workspace_only: ['pending_review', 'rejected'],
  approved_graph: ['superseded'],
  rejected: ['pending_review'],
  superseded: ['pending_review'],
}

// ─── Public API ────────────────────────────────────────────────────────────

export function canTransitionGraphProposalStatus(input: {
  from: string
  to: string
}): boolean {
  const allowed = ALLOWED_TRANSITIONS[input.from]
  if (!allowed) return false
  return allowed.includes(input.to)
}

export function getInvalidGraphProposalTransitionReason(input: {
  from: string
  to: string
}): string {
  if (input.from === input.to) {
    return `Status is already "${input.from}"`
  }

  const allowed = ALLOWED_TRANSITIONS[input.from]
  if (!allowed) {
    return `Unknown current status: "${input.from}"`
  }

  if (!allowed.includes(input.to)) {
    return `Transition from "${input.from}" to "${input.to}" is not allowed. Allowed: ${allowed.join(', ')}`
  }

  return ''
}

export function getAllowedTransitionsFrom(status: string): string[] {
  return ALLOWED_TRANSITIONS[status] ?? []
}

// ─── Event type mapping ────────────────────────────────────────────────────
// Maps target status to the specific event_type for graph_proposal_events.
// Must match the DB CHECK constraint on event_type.

export function getEventTypeForStatusChange(newStatus: string): string {
  switch (newStatus) {
    case 'approved_graph': return 'approved_graph'
    case 'rejected': return 'rejected'
    case 'needs_more_evidence': return 'marked_needs_more_evidence'
    case 'workspace_only': return 'marked_workspace_only'
    case 'superseded': return 'superseded'
    case 'pending_review': return 'restored'
    default: return 'status_changed'
  }
}
