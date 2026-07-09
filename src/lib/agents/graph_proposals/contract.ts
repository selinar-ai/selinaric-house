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

// Phase 42.4.2a — LLM-class proposals (fixture-only in 42.4.2a; live deferred to 42.4.2b).
export const GRAPH_LLM_PROPOSAL_RECORD_RPC = 'agent_graph_llm_proposal_record'
export const LLM_RULE_ID = 'llm_edge_v1' as const
/** v1 LLM edge whitelist — narrow, low-authority, reviewable; NO truthy/canonical relations. */
export const LLM_EDGE_WHITELIST = ['contrasts_with', 'precedes', 'extends'] as const
export const LLM_MIN_CONFIDENCE = 0.7
export const GENERATION_MODES = ['fixture', 'live'] as const
// Fixture provenance — clearly marks 42.4.2a rows as fixture/test, never live.
export const FIXTURE_MODEL_ID = 'fixture-llm-output' as const
export const FIXTURE_PROMPT_VERSION = 'fixture-postgate-v1' as const

// Phase 43.B (= 42.4.2b) — LIVE-mode policy constants (Ari-ruled). A live model is a proposal
// SOURCE only; rows stay suggest-only + test_owned. These are string/number constants (no SDK).
export const LLM_LIVE_MODEL_ID = 'claude-sonnet-5' as const
export const LLM_LIVE_PROMPT_VERSION = 'llm_edge_live_v2' as const // v2: whole-archive context + explicit proposal cap stated in-prompt
// 43.B tuning (Tara-authorised whole-archive sweep, 8 Jul): expands Ari's original D-COST caps
// (nodes 30, output 1024, proposals 20) so a full archive fits in ONE run (velvet 23 / violet 79).
// The $0.20/run COST CEILING is UNCHANGED — every run is still bounded and refuse-before-call.
export const LLM_LIVE_MAX_NODES = 100 // whole-archive context per run
export const LLM_LIVE_MAX_OUTPUT_TOKENS = 8192 // fits ~40 uuid-heavy proposals without truncation
export const LLM_LIVE_MAX_PROPOSALS = 40 // accepted cap per run (also stated in-prompt to self-bound output)
export const LLM_LIVE_COST_CEILING_USD = 0.2 // hard fail-before-call budget ceiling (Ari's ceiling — held)

// Phase 43 (graph bulk triage) — hard cap on ids per bulk review request. The bulk route
// loops the single-proposal RPC; no new SQL, no new verbs.
export const GRAPH_BULK_REVIEW_MAX_IDS = 200

// Triage-only review vocab (reused from the Maintenance Room). NO approve/promote/crown.
export const GRAPH_REVIEW_STATES = ['open', 'acknowledged', 'dismissed'] as const
export function isValidGraphReviewState(x: unknown): x is (typeof GRAPH_REVIEW_STATES)[number] {
  return typeof x === 'string' && (GRAPH_REVIEW_STATES as readonly string[]).includes(x)
}
