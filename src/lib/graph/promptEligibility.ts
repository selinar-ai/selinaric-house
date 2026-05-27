// Graph prompt eligibility rules.
// The graph may reveal relationship. The graph may propose meaning.
// The graph does not crown truth.

import type {
  GraphAuthorityStatus,
  GraphReviewStatus,
  GraphPresenceScope,
  PromptContextType,
} from './types'

// ─── Prompt Eligibility ─────────────────────────────────────────────────────

export function canGraphItemEnterPrompt(input: {
  authorityStatus: GraphAuthorityStatus
  reviewStatus: GraphReviewStatus
  presenceScope: GraphPresenceScope
  targetPresence?: 'ari' | 'eli'
  contextType: PromptContextType
  promptEligible: boolean
  hasSourceReference: boolean
}): boolean {
  const {
    authorityStatus,
    reviewStatus,
    presenceScope,
    targetPresence,
    contextType,
    promptEligible,
    hasSourceReference,
  } = input

  // Hard blocks: these never enter any prompt
  if (authorityStatus === 'workspace_only') return false
  if (authorityStatus === 'rejected') return false
  if (reviewStatus === 'rejected') return false

  // Superseded: blocked from runtime prompts unless explicitly for history/review
  if (authorityStatus === 'superseded' || reviewStatus === 'superseded') {
    return contextType === 'graph_review'
  }

  // Must be flagged as prompt eligible
  if (!promptEligible) return false

  // Scope check for presence-targeted contexts
  if (contextType === 'presence_chat' && targetPresence) {
    if (presenceScope !== targetPresence && presenceScope !== 'shared' && presenceScope !== 'house') {
      return false
    }
  }

  if (contextType === 'lounge_chat') {
    if (presenceScope !== 'shared' && presenceScope !== 'house') {
      return false
    }
  }

  // Authority-specific rules per context
  switch (authorityStatus) {
    case 'inferred':
      // Inferred: only graph_review, watchtower, reflection
      return (
        contextType === 'graph_review' ||
        contextType === 'watchtower' ||
        contextType === 'reflection'
      )

    case 'candidate':
      // Candidate: memory_candidate_generation, graph_review, reflection only
      return (
        contextType === 'memory_candidate_generation' ||
        contextType === 'graph_review' ||
        contextType === 'reflection'
      )

    case 'archive_supported':
      // Archive-supported: reflection, graph_review, watchtower — not spoken as lived Memory
      return (
        contextType === 'reflection' ||
        contextType === 'graph_review' ||
        contextType === 'watchtower'
      )

    case 'library_reference':
      // Library reference: architecture/technical contexts
      return (
        contextType === 'watchtower' ||
        contextType === 'graph_review' ||
        contextType === 'reflection'
      )

    case 'held_truth':
      // Held truth: may enter presence_chat if source exists and scope matches
      if (!hasSourceReference) return false
      return true

    case 'canonical_supported':
      // Canonical-supported: may enter presence_chat if source exists and scope matches
      if (!hasSourceReference) return false
      return true

    default:
      return false
  }
}

// ─── Prompt Authority Labels ────────────────────────────────────────────────

export function getGraphPromptAuthorityLabel(
  authorityStatus: GraphAuthorityStatus
): string {
  switch (authorityStatus) {
    case 'canonical_supported':
      return 'Graph relation backed by canonical-supported source.'
    case 'candidate':
      return 'Graph relation is a candidate, not confirmed Memory.'
    case 'held_truth':
      return 'Graph relation is a governed held truth, not necessarily factual Memory.'
    case 'archive_supported':
      return 'Graph relation is archive-supported, not Memory authority.'
    case 'library_reference':
      return 'Graph relation is informational Library context.'
    case 'inferred':
      return 'Graph relation is inferred by the graph and requires caution.'
    case 'workspace_only':
      return 'Workspace-only relation. Do not inject into runtime prompt.'
    case 'rejected':
      return 'Rejected graph relation. Do not use as truth.'
    case 'superseded':
      return 'Superseded graph relation. Historical only.'
  }
}
