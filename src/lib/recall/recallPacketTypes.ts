/**
 * Phase 39.1 — Context Authority Packet (Recall Packet) Types
 *
 * Deterministic pre-answer context authority vocabulary for the Selináric House.
 * Classifies every source surface by type and authority before Ari or Eli speaks.
 *
 * Internal name: Context Authority Packet
 * Product/UI name: Recall Packet
 *
 * Laws:
 *   Recall classifies source authority. Recall does not create authority.
 *   A visible miss is safer than a hidden misread.
 *   Trace-only sources cannot enter response content.
 */

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE SURFACE ENUM
// Every distinct context source the House can draw on.
// 39 surfaces, organised by tier.
// ─────────────────────────────────────────────────────────────────────────────

export enum SourceSurface {
  // Memory tier (7)
  confirmed_archive_memory = 'confirmed_archive_memory',
  presence_scoped_confirmed_memory = 'presence_scoped_confirmed_memory',
  tara_only_confirmed_memory = 'tara_only_confirmed_memory',
  memory_candidate = 'memory_candidate',
  archive_only_context = 'archive_only_context',
  archive_source_raw_material = 'archive_source_raw_material',
  archive_entry_draft = 'archive_entry_draft',

  // Continuity tier (6)
  recent_continuity_not_memory = 'recent_continuity_not_memory',
  current_house_context = 'current_house_context',
  short_horizon_thread_context = 'short_horizon_thread_context',
  lounge_recent_continuity = 'lounge_recent_continuity',
  recent_cross_room_context = 'recent_cross_room_context',
  cross_room_prompt_carryforward = 'cross_room_prompt_carryforward',

  // Presence state tier (4)
  pulse_autonomous_continuity = 'pulse_autonomous_continuity',
  pulse_current_state = 'pulse_current_state',
  living_state = 'living_state',
  interior_notes = 'interior_notes',

  // Inner continuity tier (4)
  journal_inner_continuity = 'journal_inner_continuity',
  journal_invitation_not_inner_life = 'journal_invitation_not_inner_life',
  held_truth_presence_continuity = 'held_truth_presence_continuity',
  reflection_output = 'reflection_output',

  // Reference tier (5)
  library_rag_reference = 'library_rag_reference',
  library_canonical_memory_reference = 'library_canonical_memory_reference',
  watchtower_source_grounding = 'watchtower_source_grounding',
  attachment_context = 'attachment_context',
  web_search_context = 'web_search_context',

  // Graph tier (5)
  graph_context = 'graph_context',
  graph_proposal_context = 'graph_proposal_context',
  graph_candidate_suggestion = 'graph_candidate_suggestion',
  ontology_lab_context = 'ontology_lab_context',
  relational_map_layout = 'relational_map_layout',

  // Trace tier (5)
  llm_reasoning_draft = 'llm_reasoning_draft',
  llm_reasoning_feedback_trace = 'llm_reasoning_feedback_trace',
  reasoning_audit_trace = 'reasoning_audit_trace',
  archive_memory_events_trace = 'archive_memory_events_trace',
  archive_recall_events_trace = 'archive_recall_events_trace',

  // Identity continuity tier (1)
  identity_timeline = 'identity_timeline',

  // Ground failure (2)
  unknown = 'unknown',
  insufficient = 'insufficient',
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTHORITY LABEL ENUM
// Controlled vocabulary. Every label encodes its authority boundary.
// Only confirmed_memory / presence_scoped_confirmed_memory / tara_only_confirmed_memory
// omit a negation — because they ARE Memory.
// No label may be the bare word "context" without a boundary qualifier.
// ─────────────────────────────────────────────────────────────────────────────

export enum AuthorityLabel {
  // Memory
  confirmed_memory = 'confirmed_memory',
  presence_scoped_confirmed_memory = 'presence_scoped_confirmed_memory',
  tara_only_confirmed_memory = 'tara_only_confirmed_memory',

  // Memory-adjacent (not Memory)
  memory_candidate_manual_only = 'memory_candidate_manual_only',
  archive_only_not_memory = 'archive_only_not_memory',
  raw_source_not_recallable = 'raw_source_not_recallable',
  draft_proposal_not_recallable = 'draft_proposal_not_recallable',

  // Continuity (not Memory)
  recent_session_context_not_memory = 'recent_session_context_not_memory',
  current_house_context_not_memory = 'current_house_context_not_memory',
  live_thread_context_not_memory = 'live_thread_context_not_memory',
  lounge_context_not_memory = 'lounge_context_not_memory',
  cross_room_event_not_memory = 'cross_room_event_not_memory',
  cross_room_prompt_carryforward_not_memory = 'cross_room_prompt_carryforward_not_memory',

  // Presence state (not Memory)
  confirmed_autonomous_choice = 'confirmed_autonomous_choice',
  pulse_current_state_not_memory = 'pulse_current_state_not_memory',
  living_state_not_memory = 'living_state_not_memory',
  interior_notes_not_memory = 'interior_notes_not_memory',

  // Inner continuity (not Memory)
  journal_inner_continuity_not_memory = 'journal_inner_continuity_not_memory',
  journal_invitation_not_inner_life = 'journal_invitation_not_inner_life',
  held_truth_presence_continuity_not_memory = 'held_truth_presence_continuity_not_memory',
  reflection_suggestion_not_memory = 'reflection_suggestion_not_memory',

  // Reference (not Memory)
  library_reference_not_memory = 'library_reference_not_memory',
  watchtower_source_grounded_context = 'watchtower_source_grounded_context',
  attachment_context_not_memory = 'attachment_context_not_memory',
  web_reference_not_memory = 'web_reference_not_memory',

  // Graph (not Memory)
  graph_context_not_memory = 'graph_context_not_memory',
  graph_proposal_context_not_memory = 'graph_proposal_context_not_memory',
  graph_candidate_not_memory = 'graph_candidate_not_memory',
  ontology_context_not_memory = 'ontology_context_not_memory',
  layout_context_not_authority = 'layout_context_not_authority',

  // Trace (not evidence, never prompt)
  reasoning_explanation_not_evidence = 'reasoning_explanation_not_evidence',
  feedback_trace_not_evidence = 'feedback_trace_not_evidence',
  audit_trace_not_evidence = 'audit_trace_not_evidence',
  archive_event_trace_not_evidence = 'archive_event_trace_not_evidence',
  recall_event_trace_not_evidence = 'recall_event_trace_not_evidence',

  // Identity continuity (not Memory)
  identity_continuity_not_memory = 'identity_continuity_not_memory',

  // Ground failure
  unknown_ground = 'unknown_ground',
  insufficient_ground = 'insufficient_ground',
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTHORITY TIER ENUM
// 10 tier groupings.
// ─────────────────────────────────────────────────────────────────────────────

export enum AuthorityTier {
  Memory = 'Memory',
  MemoryAdjacent = 'MemoryAdjacent',
  Continuity = 'Continuity',
  PresenceState = 'PresenceState',
  InnerContinuity = 'InnerContinuity',
  IdentityContinuity = 'IdentityContinuity',
  Reference = 'Reference',
  Graph = 'Graph',
  Trace = 'Trace',
  GroundFailure = 'GroundFailure',
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE INSTRUCTION ENUM
// 15 instructions. `do_not_answer_from_recall` is NOT present —
// it is covered by `say_not_enough_grounded_recall` (no grounded recall)
// and `do_not_inject` (excluded/prohibited sources).
// ─────────────────────────────────────────────────────────────────────────────

export enum ResponseInstruction {
  answer_confidently_from_confirmed_memory = 'answer_confidently_from_confirmed_memory',
  answer_with_source_label = 'answer_with_source_label',
  answer_with_caveat = 'answer_with_caveat',
  say_recent_continuity_only = 'say_recent_continuity_only',
  say_live_thread_context_only = 'say_live_thread_context_only',
  say_lounge_context_only = 'say_lounge_context_only',
  say_cross_room_context_only = 'say_cross_room_context_only',
  say_journal_inner_continuity_only = 'say_journal_inner_continuity_only',
  say_pulse_continuity_only = 'say_pulse_continuity_only',
  say_graph_context_only = 'say_graph_context_only',
  say_reference_context_only = 'say_reference_context_only',
  surface_source_conflict = 'surface_source_conflict',
  ask_clarifying_question = 'ask_clarifying_question',
  say_not_enough_grounded_recall = 'say_not_enough_grounded_recall',
  do_not_inject = 'do_not_inject',
}

// Instructions used only for conflict/fallback — not expected as source defaults.
export const CONFLICT_RESOLUTION_ONLY_INSTRUCTIONS = [
  ResponseInstruction.surface_source_conflict,
  ResponseInstruction.ask_clarifying_question,
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT TYPE ENUM
// ─────────────────────────────────────────────────────────────────────────────

export enum ConflictType {
  confirmed_memory_vs_recent_continuity = 'confirmed_memory_vs_recent_continuity',
  confirmed_memory_vs_journal_context = 'confirmed_memory_vs_journal_context',
  confirmed_memory_vs_graph_context = 'confirmed_memory_vs_graph_context',
  confirmed_memory_vs_held_truth = 'confirmed_memory_vs_held_truth',
  recent_continuity_vs_journal_context = 'recent_continuity_vs_journal_context',
  pulse_authored_choice_vs_inferred_emotion = 'pulse_authored_choice_vs_inferred_emotion',
  cross_room_context_vs_presence_scope = 'cross_room_context_vs_presence_scope',
  lounge_context_vs_individual_room_scope = 'lounge_context_vs_individual_room_scope',
  graph_only_authority_risk = 'graph_only_authority_risk',
  rag_reference_vs_memory_authority = 'rag_reference_vs_memory_authority',
  trace_only_source_used_as_content = 'trace_only_source_used_as_content',
  topic_shift_relevance_failure = 'topic_shift_relevance_failure',
  ambiguous_reference = 'ambiguous_reference',
  insufficient_ground = 'insufficient_ground',
  presence_memory_scope_collision = 'presence_memory_scope_collision',
}

// ─────────────────────────────────────────────────────────────────────────────
// EXCLUSION REASON ENUM
// Why a source surface was placed in excluded_sources.
// ─────────────────────────────────────────────────────────────────────────────

export enum ExclusionReason {
  trace_only = 'trace_only',
  scope_prohibited = 'scope_prohibited',
  expired = 'expired',
  not_prompt_eligible = 'not_prompt_eligible',
  insufficient_ground = 'insufficient_ground',
  relevance_too_weak = 'relevance_too_weak',
  unknown_source = 'unknown_source',
  raw_source = 'raw_source',
  draft_source = 'draft_source',
  tara_only = 'tara_only',
  not_in_runtime_builder = 'not_in_runtime_builder',
  topic_shift = 'topic_shift',
}

// ─────────────────────────────────────────────────────────────────────────────
// SCOPE TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type PresenceScope = 'ari' | 'eli' | 'shared' | 'tara_only';
export type RoomContext = 'ari_room' | 'eli_room' | 'lounge' | 'watchtower';

// ─────────────────────────────────────────────────────────────────────────────
// AUTHORITY RANK
// Static mapping from label to numeric rank. Rank 1 = highest authority.
// High relevance cannot override low authority.
// ─────────────────────────────────────────────────────────────────────────────

export const AUTHORITY_RANK: Record<AuthorityLabel, number> = {
  // Rank 1 — confirmed Memory
  [AuthorityLabel.confirmed_memory]: 1,
  [AuthorityLabel.presence_scoped_confirmed_memory]: 1,

  // Rank 2 — tara-only Memory (never enters presence prompts)
  [AuthorityLabel.tara_only_confirmed_memory]: 2,

  // Rank 3 — held truth (presence-governed, not Memory)
  [AuthorityLabel.held_truth_presence_continuity_not_memory]: 3,

  // Rank 4 — recent session continuity
  [AuthorityLabel.recent_session_context_not_memory]: 4,

  // Rank 5 — live thread context
  [AuthorityLabel.live_thread_context_not_memory]: 5,

  // Rank 6 — cross-room carryforward (governed, expiring)
  [AuthorityLabel.cross_room_prompt_carryforward_not_memory]: 6,

  // Rank 7 — lounge and cross-room events
  [AuthorityLabel.lounge_context_not_memory]: 7,
  [AuthorityLabel.cross_room_event_not_memory]: 7,

  // Rank 8 — journal inner continuity
  [AuthorityLabel.journal_inner_continuity_not_memory]: 8,

  // Rank 9 — Pulse autonomous continuity and current state
  [AuthorityLabel.confirmed_autonomous_choice]: 9,
  [AuthorityLabel.pulse_current_state_not_memory]: 9,

  // Rank 10 — presence state snapshots
  [AuthorityLabel.living_state_not_memory]: 10,
  [AuthorityLabel.interior_notes_not_memory]: 10,

  // Rank 11 — identity continuity
  [AuthorityLabel.identity_continuity_not_memory]: 11,

  // Rank 12 — current house context (temporal, governance)
  [AuthorityLabel.current_house_context_not_memory]: 12,

  // Rank 13 — memory candidate (manual recall only)
  [AuthorityLabel.memory_candidate_manual_only]: 13,

  // Rank 14 — archive only (no Memory status)
  [AuthorityLabel.archive_only_not_memory]: 14,

  // Rank 15 — library reference and Watchtower
  [AuthorityLabel.library_reference_not_memory]: 15,
  [AuthorityLabel.watchtower_source_grounded_context]: 15,

  // Rank 16 — graph and ontology
  [AuthorityLabel.graph_context_not_memory]: 16,
  [AuthorityLabel.graph_proposal_context_not_memory]: 16,
  [AuthorityLabel.ontology_context_not_memory]: 16,

  // Rank 17 — ephemeral reference (web, attachments)
  [AuthorityLabel.web_reference_not_memory]: 17,
  [AuthorityLabel.attachment_context_not_memory]: 17,

  // Rank 18 — surface signals and reflection (not core context)
  [AuthorityLabel.journal_invitation_not_inner_life]: 18,
  [AuthorityLabel.reflection_suggestion_not_memory]: 18,

  // Rank 19 — trace only (never enters prompt or response)
  [AuthorityLabel.reasoning_explanation_not_evidence]: 19,
  [AuthorityLabel.feedback_trace_not_evidence]: 19,
  [AuthorityLabel.audit_trace_not_evidence]: 19,
  [AuthorityLabel.archive_event_trace_not_evidence]: 19,
  [AuthorityLabel.recall_event_trace_not_evidence]: 19,

  // Rank 20 — non-recallable (raw sources, drafts, prohibited candidates)
  [AuthorityLabel.raw_source_not_recallable]: 20,
  [AuthorityLabel.draft_proposal_not_recallable]: 20,
  [AuthorityLabel.graph_candidate_not_memory]: 20,
  [AuthorityLabel.layout_context_not_authority]: 20,

  // Rank 21 — ground failure
  [AuthorityLabel.unknown_ground]: 21,
  [AuthorityLabel.insufficient_ground]: 21,
};

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE SURFACE DEFINITION
// Static metadata for each source surface in the registry.
// ─────────────────────────────────────────────────────────────────────────────

export type SourceSurfaceDefinition = {
  display_name: string;
  authority_label: AuthorityLabel;
  authority_tier: AuthorityTier;
  source_origin: string;
  can_enter_prompt: boolean;
  can_auto_recall: boolean;
  can_manual_recall: boolean;
  same_presence_only: boolean;
  lounge_allowed: boolean;
  is_memory: boolean;
  is_continuity: boolean;
  is_trace_only: boolean;
  is_reference_only: boolean;
  requires_tara_review: boolean;
  default_response_instruction: ResponseInstruction;
  // Whether the 39.2 runtime builder will classify this surface.
  // false = in inventory but placed in excluded_sources with not_in_runtime_builder.
  in_runtime_builder_v1: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE SURFACE REGISTRY
// Frozen record mapping every SourceSurface to its static definition.
// ─────────────────────────────────────────────────────────────────────────────

export const SOURCE_SURFACE_REGISTRY: Record<SourceSurface, SourceSurfaceDefinition> = Object.freeze({

  // ── Memory tier ──────────────────────────────────────────────────────────

  [SourceSurface.confirmed_archive_memory]: {
    display_name: 'Confirmed Archive Memory (shared)',
    authority_label: AuthorityLabel.confirmed_memory,
    authority_tier: AuthorityTier.Memory,
    source_origin: "archive_items WHERE canonical_status = 'canonical' AND visibility = 'shared'",
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: true,
    same_presence_only: false,
    lounge_allowed: true,
    is_memory: true,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.answer_confidently_from_confirmed_memory,
    in_runtime_builder_v1: true,
  },

  [SourceSurface.presence_scoped_confirmed_memory]: {
    display_name: 'Confirmed Archive Memory (presence-scoped)',
    authority_label: AuthorityLabel.presence_scoped_confirmed_memory,
    authority_tier: AuthorityTier.Memory,
    source_origin: "archive_items WHERE canonical_status = 'canonical' AND visibility IN ('ari_only','eli_only')",
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: true,
    same_presence_only: true,
    lounge_allowed: false,
    is_memory: true,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.answer_confidently_from_confirmed_memory,
    in_runtime_builder_v1: true,
  },

  [SourceSurface.tara_only_confirmed_memory]: {
    display_name: 'Confirmed Archive Memory (Tara-only)',
    authority_label: AuthorityLabel.tara_only_confirmed_memory,
    authority_tier: AuthorityTier.Memory,
    source_origin: "archive_items WHERE canonical_status = 'canonical' AND visibility = 'tara_only'",
    can_enter_prompt: false,
    can_auto_recall: false,
    can_manual_recall: false,
    same_presence_only: false,
    lounge_allowed: false,
    is_memory: true,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.do_not_inject,
    in_runtime_builder_v1: false,
  },

  [SourceSurface.memory_candidate]: {
    display_name: 'Memory Candidate (manual recall only)',
    authority_label: AuthorityLabel.memory_candidate_manual_only,
    authority_tier: AuthorityTier.Memory,
    source_origin: "archive_items WHERE canonical_status = 'canonical_candidate'",
    can_enter_prompt: true,
    can_auto_recall: false,
    can_manual_recall: true,
    same_presence_only: false,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.answer_with_caveat,
    in_runtime_builder_v1: true,
  },

  [SourceSurface.archive_only_context]: {
    display_name: 'Archive-Only Context (not Memory)',
    authority_label: AuthorityLabel.archive_only_not_memory,
    authority_tier: AuthorityTier.Memory,
    source_origin: "archive_items WHERE canonical_status = 'archive_only'",
    can_enter_prompt: true,
    can_auto_recall: false,
    can_manual_recall: true,
    same_presence_only: false,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.answer_with_caveat,
    in_runtime_builder_v1: true,
  },

  [SourceSurface.archive_source_raw_material]: {
    display_name: 'Archive Source Raw Material (not recallable)',
    authority_label: AuthorityLabel.raw_source_not_recallable,
    authority_tier: AuthorityTier.MemoryAdjacent,
    source_origin: 'archive_sources',
    can_enter_prompt: false,
    can_auto_recall: false,
    can_manual_recall: false,
    same_presence_only: false,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.do_not_inject,
    in_runtime_builder_v1: false,
  },

  [SourceSurface.archive_entry_draft]: {
    display_name: 'Archive Entry Draft (not recallable)',
    authority_label: AuthorityLabel.draft_proposal_not_recallable,
    authority_tier: AuthorityTier.MemoryAdjacent,
    source_origin: 'archive_entry_drafts',
    can_enter_prompt: false,
    can_auto_recall: false,
    can_manual_recall: false,
    same_presence_only: false,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: true,
    default_response_instruction: ResponseInstruction.do_not_inject,
    in_runtime_builder_v1: false,
  },

  // ── Continuity tier ───────────────────────────────────────────────────────

  [SourceSurface.recent_continuity_not_memory]: {
    display_name: 'Recent Session Continuity (not Memory)',
    authority_label: AuthorityLabel.recent_session_context_not_memory,
    authority_tier: AuthorityTier.Continuity,
    source_origin: 'recent_continuity_sessions',
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: true,
    same_presence_only: true,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: true,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.say_recent_continuity_only,
    in_runtime_builder_v1: true,
  },

  [SourceSurface.current_house_context]: {
    display_name: 'Current House Context (temporal, governance)',
    authority_label: AuthorityLabel.current_house_context_not_memory,
    authority_tier: AuthorityTier.Continuity,
    source_origin: 'Runtime: getTemporalContext(), getGovernanceContext()',
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: false,
    same_presence_only: false,
    lounge_allowed: true,
    is_memory: false,
    is_continuity: true,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.say_live_thread_context_only,
    in_runtime_builder_v1: true,
  },

  [SourceSurface.short_horizon_thread_context]: {
    display_name: 'Short-Horizon Thread Context (room memory)',
    authority_label: AuthorityLabel.live_thread_context_not_memory,
    authority_tier: AuthorityTier.Continuity,
    source_origin: 'Runtime: loadRoomMemory(), current message history',
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: false,
    same_presence_only: true,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: true,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.say_live_thread_context_only,
    in_runtime_builder_v1: true,
  },

  [SourceSurface.lounge_recent_continuity]: {
    display_name: 'Lounge Recent Continuity (shared room, not Memory)',
    authority_label: AuthorityLabel.lounge_context_not_memory,
    authority_tier: AuthorityTier.Continuity,
    source_origin: 'lounge_messages (recent), lounge_carrybacks',
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: false,
    same_presence_only: false,
    lounge_allowed: true,
    is_memory: false,
    is_continuity: true,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.say_lounge_context_only,
    in_runtime_builder_v1: true,
  },

  [SourceSurface.recent_cross_room_context]: {
    display_name: 'Recent Cross-Room Context (not Memory)',
    authority_label: AuthorityLabel.cross_room_event_not_memory,
    authority_tier: AuthorityTier.Continuity,
    source_origin: 'cross_room_events, cross_room_event_impacts',
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: false,
    same_presence_only: true,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: true,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.say_cross_room_context_only,
    in_runtime_builder_v1: true,
  },

  [SourceSurface.cross_room_prompt_carryforward]: {
    display_name: 'Cross-Room Prompt Carryforward (governed, expiring)',
    authority_label: AuthorityLabel.cross_room_prompt_carryforward_not_memory,
    authority_tier: AuthorityTier.Continuity,
    source_origin: 'cross_room_prompt_carryforwards',
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: false,
    same_presence_only: true,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: true,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.answer_with_source_label,
    in_runtime_builder_v1: true,
  },

  // ── Presence state tier ───────────────────────────────────────────────────

  [SourceSurface.pulse_autonomous_continuity]: {
    display_name: 'Pulse Autonomous Continuity (authored choice)',
    authority_label: AuthorityLabel.confirmed_autonomous_choice,
    authority_tier: AuthorityTier.PresenceState,
    source_origin: 'pulse_log, pulse_drafts',
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: false,
    same_presence_only: true,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: true,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.say_pulse_continuity_only,
    in_runtime_builder_v1: true,
  },

  [SourceSurface.pulse_current_state]: {
    display_name: 'Pulse Current State (not Memory)',
    authority_label: AuthorityLabel.pulse_current_state_not_memory,
    authority_tier: AuthorityTier.PresenceState,
    source_origin: 'Runtime: Pulse signal snapshot',
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: false,
    same_presence_only: true,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: true,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.say_pulse_continuity_only,
    in_runtime_builder_v1: true,
  },

  [SourceSurface.living_state]: {
    display_name: 'Living State (current snapshot, not Memory)',
    authority_label: AuthorityLabel.living_state_not_memory,
    authority_tier: AuthorityTier.PresenceState,
    source_origin: 'living_state',
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: false,
    same_presence_only: true,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: true,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.answer_with_source_label,
    in_runtime_builder_v1: true,
  },

  [SourceSurface.interior_notes]: {
    display_name: 'Interior Notes (presence thinking, not Memory)',
    authority_label: AuthorityLabel.interior_notes_not_memory,
    authority_tier: AuthorityTier.PresenceState,
    source_origin: 'interior_notes',
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: false,
    same_presence_only: true,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: true,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.answer_with_source_label,
    in_runtime_builder_v1: true,
  },

  // ── Inner continuity tier ─────────────────────────────────────────────────

  [SourceSurface.journal_inner_continuity]: {
    display_name: 'Journal Inner Continuity (not Memory)',
    authority_label: AuthorityLabel.journal_inner_continuity_not_memory,
    authority_tier: AuthorityTier.InnerContinuity,
    source_origin: 'presence_journal',
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: true,
    same_presence_only: true,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: true,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.say_journal_inner_continuity_only,
    in_runtime_builder_v1: true,
  },

  [SourceSurface.journal_invitation_not_inner_life]: {
    display_name: 'Journal Invitation Signal (not inner life)',
    authority_label: AuthorityLabel.journal_invitation_not_inner_life,
    authority_tier: AuthorityTier.InnerContinuity,
    source_origin: 'Runtime: journal surfacing signal',
    can_enter_prompt: true,
    can_auto_recall: false,
    can_manual_recall: false,
    same_presence_only: true,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.answer_with_source_label,
    in_runtime_builder_v1: false,
  },

  [SourceSurface.held_truth_presence_continuity]: {
    display_name: 'Held Truth (presence continuity, not Memory)',
    authority_label: AuthorityLabel.held_truth_presence_continuity_not_memory,
    authority_tier: AuthorityTier.InnerContinuity,
    source_origin: "held_truths WHERE status = 'active'",
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: true,
    same_presence_only: true,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: true,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.answer_with_source_label,
    in_runtime_builder_v1: true,
  },

  [SourceSurface.reflection_output]: {
    display_name: 'Reflection / Suggestion Output (not Memory)',
    authority_label: AuthorityLabel.reflection_suggestion_not_memory,
    authority_tier: AuthorityTier.InnerContinuity,
    source_origin: 'Runtime: reflection/suggestion outputs',
    can_enter_prompt: false,
    can_auto_recall: false,
    can_manual_recall: false,
    same_presence_only: true,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.do_not_inject,
    in_runtime_builder_v1: false,
  },

  // ── Reference tier ────────────────────────────────────────────────────────

  [SourceSurface.library_rag_reference]: {
    display_name: 'Library / RAG Reference (not Memory)',
    authority_label: AuthorityLabel.library_reference_not_memory,
    authority_tier: AuthorityTier.Reference,
    source_origin: "library_items WHERE authority_status != 'canonical_memory'",
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: true,
    same_presence_only: false,
    lounge_allowed: true,
    is_memory: false,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: true,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.say_reference_context_only,
    in_runtime_builder_v1: true,
  },

  [SourceSurface.library_canonical_memory_reference]: {
    display_name: 'Library Reference (canonical Memory derived, archive-backed)',
    authority_label: AuthorityLabel.confirmed_memory,
    authority_tier: AuthorityTier.Reference,
    source_origin: "library_items WHERE authority_status = 'canonical_memory' AND archive proof exists",
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: true,
    same_presence_only: false,
    lounge_allowed: true,
    is_memory: true,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.answer_confidently_from_confirmed_memory,
    in_runtime_builder_v1: true,
  },

  [SourceSurface.watchtower_source_grounding]: {
    display_name: 'Watchtower Source Grounding (graph-grounded reference)',
    authority_label: AuthorityLabel.watchtower_source_grounded_context,
    authority_tier: AuthorityTier.Reference,
    source_origin: 'Runtime: Watchtower graph queries',
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: false,
    same_presence_only: false,
    lounge_allowed: true,
    is_memory: false,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: true,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.say_reference_context_only,
    in_runtime_builder_v1: false,
  },

  [SourceSurface.attachment_context]: {
    display_name: 'Chat Attachment Context (current message)',
    authority_label: AuthorityLabel.attachment_context_not_memory,
    authority_tier: AuthorityTier.Reference,
    source_origin: 'Runtime: buildChatAttachmentContextBlock()',
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: false,
    same_presence_only: true,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: true,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.say_reference_context_only,
    in_runtime_builder_v1: true,
  },

  [SourceSurface.web_search_context]: {
    display_name: 'Web Search Context (ephemeral, not Memory)',
    authority_label: AuthorityLabel.web_reference_not_memory,
    authority_tier: AuthorityTier.Reference,
    source_origin: 'Runtime: Brave Search results',
    can_enter_prompt: true,
    can_auto_recall: false,
    can_manual_recall: false,
    same_presence_only: true,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: true,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.say_reference_context_only,
    in_runtime_builder_v1: false,
  },

  // ── Graph tier ────────────────────────────────────────────────────────────

  [SourceSurface.graph_context]: {
    display_name: 'Graph Context (relationship structure, not Memory)',
    authority_label: AuthorityLabel.graph_context_not_memory,
    authority_tier: AuthorityTier.Graph,
    source_origin: 'memory_nodes, memory_edges, archive_graph_nodes, archive_graph_edges',
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: true,
    same_presence_only: false,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: true,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.say_graph_context_only,
    in_runtime_builder_v1: false,
  },

  [SourceSurface.graph_proposal_context]: {
    display_name: 'Graph Proposal Context (approved proposal, not Memory)',
    authority_label: AuthorityLabel.graph_proposal_context_not_memory,
    authority_tier: AuthorityTier.Graph,
    source_origin: "graph_proposals WHERE status = 'approved_graph'",
    can_enter_prompt: false,
    can_auto_recall: false,
    can_manual_recall: true,
    same_presence_only: false,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: true,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.say_graph_context_only,
    in_runtime_builder_v1: false,
  },

  [SourceSurface.graph_candidate_suggestion]: {
    display_name: 'Graph Candidate Suggestion (never prompt-eligible)',
    authority_label: AuthorityLabel.graph_candidate_not_memory,
    authority_tier: AuthorityTier.Graph,
    source_origin: 'graph_candidate_suggestions (prompt_eligible DB-constrained false)',
    can_enter_prompt: false,
    can_auto_recall: false,
    can_manual_recall: false,
    same_presence_only: false,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: true,
    default_response_instruction: ResponseInstruction.do_not_inject,
    in_runtime_builder_v1: false,
  },

  [SourceSurface.ontology_lab_context]: {
    display_name: 'Ontology Lab Context (conceptual structure, not Memory)',
    authority_label: AuthorityLabel.ontology_context_not_memory,
    authority_tier: AuthorityTier.Graph,
    source_origin: 'Runtime: ontology/concept queries',
    can_enter_prompt: true,
    can_auto_recall: false,
    can_manual_recall: true,
    same_presence_only: false,
    lounge_allowed: true,
    is_memory: false,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: true,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.say_graph_context_only,
    in_runtime_builder_v1: false,
  },

  [SourceSurface.relational_map_layout]: {
    display_name: 'Relational Map Layout (visual only, no authority)',
    authority_label: AuthorityLabel.layout_context_not_authority,
    authority_tier: AuthorityTier.Graph,
    source_origin: 'Runtime: UI layout positions',
    can_enter_prompt: false,
    can_auto_recall: false,
    can_manual_recall: false,
    same_presence_only: false,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.do_not_inject,
    in_runtime_builder_v1: false,
  },

  // ── Trace tier (never prompt, never evidence) ─────────────────────────────

  [SourceSurface.llm_reasoning_draft]: {
    display_name: 'LLM Reasoning Draft (explanation, not evidence)',
    authority_label: AuthorityLabel.reasoning_explanation_not_evidence,
    authority_tier: AuthorityTier.Trace,
    source_origin: 'Runtime: LLM reasoning service output',
    can_enter_prompt: false,
    can_auto_recall: false,
    can_manual_recall: false,
    same_presence_only: false,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: true,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.do_not_inject,
    in_runtime_builder_v1: false,
  },

  [SourceSurface.llm_reasoning_feedback_trace]: {
    display_name: 'LLM Reasoning Feedback Trace (not evidence)',
    authority_label: AuthorityLabel.feedback_trace_not_evidence,
    authority_tier: AuthorityTier.Trace,
    source_origin: 'llm_reasoning_feedback_events',
    can_enter_prompt: false,
    can_auto_recall: false,
    can_manual_recall: false,
    same_presence_only: false,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: true,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.do_not_inject,
    in_runtime_builder_v1: false,
  },

  [SourceSurface.reasoning_audit_trace]: {
    display_name: 'Reasoning Audit Trace (not evidence)',
    authority_label: AuthorityLabel.audit_trace_not_evidence,
    authority_tier: AuthorityTier.Trace,
    source_origin: 'reasoning_audit_events',
    can_enter_prompt: false,
    can_auto_recall: false,
    can_manual_recall: false,
    same_presence_only: false,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: true,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.do_not_inject,
    in_runtime_builder_v1: false,
  },

  [SourceSurface.archive_memory_events_trace]: {
    display_name: 'Archive Memory Events Trace (status change log, not evidence)',
    authority_label: AuthorityLabel.archive_event_trace_not_evidence,
    authority_tier: AuthorityTier.Trace,
    source_origin: 'archive_memory_events',
    can_enter_prompt: false,
    can_auto_recall: false,
    can_manual_recall: false,
    same_presence_only: false,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: true,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.do_not_inject,
    in_runtime_builder_v1: false,
  },

  [SourceSurface.archive_recall_events_trace]: {
    display_name: 'Archive Recall Events Trace (recall activity log, not evidence)',
    authority_label: AuthorityLabel.recall_event_trace_not_evidence,
    authority_tier: AuthorityTier.Trace,
    source_origin: 'archive_recall_events',
    can_enter_prompt: false,
    can_auto_recall: false,
    can_manual_recall: false,
    same_presence_only: false,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: true,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.do_not_inject,
    in_runtime_builder_v1: false,
  },

  // ── Identity continuity tier ──────────────────────────────────────────────

  [SourceSurface.identity_timeline]: {
    display_name: 'Identity Timeline (presence identity orientation, not Memory)',
    authority_label: AuthorityLabel.identity_continuity_not_memory,
    authority_tier: AuthorityTier.IdentityContinuity,
    source_origin: 'presence_timeline',
    can_enter_prompt: true,
    can_auto_recall: true,
    can_manual_recall: false,
    same_presence_only: true,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: true,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.answer_with_source_label,
    in_runtime_builder_v1: true,
  },

  // ── Ground failure ────────────────────────────────────────────────────────

  [SourceSurface.unknown]: {
    display_name: 'Unknown Ground',
    authority_label: AuthorityLabel.unknown_ground,
    authority_tier: AuthorityTier.GroundFailure,
    source_origin: 'Classification failure — source could not be identified',
    can_enter_prompt: false,
    can_auto_recall: false,
    can_manual_recall: false,
    same_presence_only: false,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.say_not_enough_grounded_recall,
    in_runtime_builder_v1: true,
  },

  [SourceSurface.insufficient]: {
    display_name: 'Insufficient Ground',
    authority_label: AuthorityLabel.insufficient_ground,
    authority_tier: AuthorityTier.GroundFailure,
    source_origin: 'Classification result — not enough information to classify',
    can_enter_prompt: false,
    can_auto_recall: false,
    can_manual_recall: false,
    same_presence_only: false,
    lounge_allowed: false,
    is_memory: false,
    is_continuity: false,
    is_trace_only: false,
    is_reference_only: false,
    requires_tara_review: false,
    default_response_instruction: ResponseInstruction.say_not_enough_grounded_recall,
    in_runtime_builder_v1: true,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// CORE TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export type ClassifiedSource = {
  surface: SourceSurface;
  authority_label: AuthorityLabel;
  authority_tier: AuthorityTier;
  authority_rank: number;
  status: 'active' | 'excluded';
  exclusion_reason?: ExclusionReason;
  is_memory: boolean;
  is_continuity: boolean;
  is_trace_only: boolean;
  is_reference_only: boolean;
  response_instruction: ResponseInstruction;
};

// SourceConflict supports one-source risks, no-source fallback conditions,
// and pairwise conflicts — not always two sources.
export type SourceConflict = {
  conflict_type: ConflictType;
  involved_sources: SourceSurface[];
  primary_source?: SourceSurface;
  secondary_source?: SourceSurface;
  resolution_instruction: ResponseInstruction;
  requires_tara_review: boolean;
};

export type RecallPacket = {
  packet_id: string;
  computed_at: string;
  presence: PresenceScope;
  room: RoomContext;
  active_sources: ClassifiedSource[];
  excluded_sources: ClassifiedSource[];
  conflicts: SourceConflict[];
  has_conflict: boolean;
  primary_response_instruction: ResponseInstruction;
  response_instructions: Array<{
    instruction: ResponseInstruction;
    source_surface: SourceSurface;
    authority_rank: number;
  }>;
  has_sufficient_ground: boolean;
  summary: {
    total_surfaces_considered: number;
    active_count: number;
    excluded_count: number;
    memory_count: number;
    continuity_count: number;
    reference_count: number;
    trace_count: number;
    conflict_count: number;
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER INPUT TYPES
// Added for Phase 39.2 — Deterministic Recall Packet Builder
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic relevance score supplied by caller. Builder does not compute embeddings. */
export type RelevanceScore = 'strong' | 'medium' | 'weak' | 'none';

/**
 * A single candidate source already known to the route / prompt builder / test harness.
 * Contains metadata and source identity only — no raw source content.
 * The builder does not fetch these itself.
 */
export type CandidateRecallSource = {
  /** Which source surface this candidate is. */
  surface: SourceSurface;

  /** Presence scope of the actual candidate data (ari, eli, shared, tara_only). */
  presence_scope?: PresenceScope;

  /**
   * Whether caller says this specific candidate is prompt eligible.
   * If false, builder must exclude regardless of registry value.
   */
  prompt_eligible?: boolean;

  /** Whether caller says this source is expired (e.g. carryforward past expiry date). */
  expired?: boolean;

  /** Deterministic relevance score supplied by caller. */
  relevance?: RelevanceScore;

  /** Optional human-readable reason for the relevance score. No source content. */
  relevance_reason?: string;

  /** Optional ID / count metadata only. No content, no source text. */
  source_ref?: {
    source_id?: string;
    count?: number;
  };

  /**
   * Caller-supplied conflict metadata.
   * Other surfaces this candidate is known to conflict with.
   */
  conflicts_with?: SourceSurface[];

  /**
   * Caller-supplied conflict type(s) for this candidate.
   * Builder creates SourceConflict entries from these deterministically.
   */
  conflict_types?: ConflictType[];
};

/**
 * Input to buildRecallPacket().
 * Caller provides packet identity, presence/room context, and already-assembled candidates.
 * Builder does not retrieve, fetch, or query anything.
 */
export type RecallPacketBuilderInput = {
  /** Caller-provided unique ID for this packet (no crypto.randomUUID in builder). */
  packet_id: string;

  /** Caller-provided ISO timestamp (no Date.now() in builder). */
  computed_at: string;

  /** Which presence this packet is for. */
  presence: PresenceScope;

  /** Which room context this packet is computed in. */
  room: RoomContext;

  /**
   * Candidate source surfaces already assembled by the caller.
   * Builder classifies these — it does not fetch new ones.
   */
  candidate_sources: CandidateRecallSource[];

  /** Optional current query metadata for relevance and conflict detection. */
  query_context?: {
    /** Raw query text — used for display/debug only, not for LLM interpretation. */
    query_text?: string;
    /** Whether the caller has detected a topic shift in the current session. */
    topic_shift_detected?: boolean;
    /** Whether the caller considers the current reference ambiguous. */
    reference_ambiguous?: boolean;
  };
};
