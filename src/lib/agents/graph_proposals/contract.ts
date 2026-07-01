/**
 * Phase 42.4.1 — Graph Proposal Pack: shared constants + RPC names (crypto-free; route-safe).
 *
 * v1 is DETERMINISTIC and SUGGEST-ONLY: propose `shared_source` edges between existing approved
 * archive_graph nodes. No LLM, no graph-truth write, no Memory, no prompt eligibility.
 */

export const GRAPH_PROPOSAL_TARGET = 'archive_graph' as const
export const GRAPH_PROPOSAL_KIND = 'edge' as const
export const GRAPH_PROPOSAL_EDGE_TYPE = 'shared_source' as const
export const GRAPH_PROPOSAL_RULE_ID = 'shared_source_v1' as const

// v1 whitelist (single deterministic, low-risk edge type).
export const GRAPH_EDGE_WHITELIST = ['shared_source'] as const

export const GRAPH_PROPOSAL_RECORD_RPC = 'agent_graph_proposal_record'
export const GRAPH_PROPOSALS_LIST_RPC = 'agent_graph_proposals_list'
export const GRAPH_PROPOSAL_SET_REVIEW_RPC = 'agent_graph_proposal_set_review_state'
export const GRAPH_PROPOSALS_CLEANUP_RPC = 'agent_graph_proposals_cleanup_test'

// Triage-only review vocab (reused from the Maintenance Room). NO approve/promote/crown.
export const GRAPH_REVIEW_STATES = ['open', 'acknowledged', 'dismissed'] as const
export function isValidGraphReviewState(x: unknown): x is (typeof GRAPH_REVIEW_STATES)[number] {
  return typeof x === 'string' && (GRAPH_REVIEW_STATES as readonly string[]).includes(x)
}
