/**
 * Phase 39.2 — Deterministic Recall Packet Builder
 *
 * Pure deterministic function that classifies already-available source surfaces
 * into active_sources and excluded_sources, applies scope / relevance / exclusion
 * rules, ranks authority, detects simple structural conflicts, and produces
 * response instructions.
 *
 * Purity guarantee:
 *   Does not call fetch, Supabase, OpenAI, Anthropic, Brave Search,
 *   Date.now, crypto.randomUUID, process.env, localStorage, sessionStorage,
 *   window, or document.
 *   The caller provides packet_id and computed_at.
 *
 * Laws:
 *   Recall classifies source authority.  Recall does not create authority.
 *   A visible miss is safer than a hidden misread.
 *   Trace-only sources cannot enter response content.
 *   High relevance cannot override low authority.
 */

import {
  AUTHORITY_RANK,
  AuthorityLabel,
  AuthorityTier,
  CandidateRecallSource,
  ClassifiedSource,
  ConflictType,
  ExclusionReason,
  RecallPacket,
  RecallPacketBuilderInput,
  ResponseInstruction,
  SOURCE_SURFACE_REGISTRY,
  SourceConflict,
  SourceSurface,
  SourceSurfaceDefinition,
} from './recallPacketTypes';

// ─────────────────────────────────────────────────────────────────────────────
// EXCLUSION PRIORITY
// Lower number = stronger gate — applied first, wins when multiple apply.
// Also used as the sort key for excluded_sources.
// ─────────────────────────────────────────────────────────────────────────────

const EXCLUSION_PRIORITY: Record<ExclusionReason, number> = {
  [ExclusionReason.unknown_source]:        1,
  [ExclusionReason.trace_only]:            2,
  [ExclusionReason.raw_source]:            3,
  [ExclusionReason.draft_source]:          4,
  [ExclusionReason.tara_only]:             5,
  [ExclusionReason.scope_prohibited]:      6,
  [ExclusionReason.expired]:               7,
  [ExclusionReason.not_prompt_eligible]:   8,
  [ExclusionReason.not_in_runtime_builder]:9,
  [ExclusionReason.topic_shift]:           10,
  [ExclusionReason.relevance_too_weak]:    11,
  [ExclusionReason.insufficient_ground]:   12,
};

// ─────────────────────────────────────────────────────────────────────────────
// TOPIC-SHIFT-SENSITIVE SURFACES
// Excluded when query_context.topic_shift_detected === true.
// Confirmed Memory is NOT in this set — relevance handles that.
// ─────────────────────────────────────────────────────────────────────────────

const TOPIC_SHIFT_SENSITIVE_SURFACES = new Set<SourceSurface>([
  SourceSurface.short_horizon_thread_context,
  SourceSurface.recent_continuity_not_memory,
  SourceSurface.lounge_recent_continuity,
  SourceSurface.recent_cross_room_context,
  SourceSurface.cross_room_prompt_carryforward,
]);

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT RESOLUTION TABLE
// Maps each ConflictType to default response instruction and Tara review flag.
// ─────────────────────────────────────────────────────────────────────────────

const CONFLICT_RESOLUTION_TABLE: Record<
  ConflictType,
  { instruction: ResponseInstruction; requiresTaraReview: boolean }
> = {
  [ConflictType.confirmed_memory_vs_recent_continuity]: {
    instruction: ResponseInstruction.answer_confidently_from_confirmed_memory,
    requiresTaraReview: false,
  },
  [ConflictType.confirmed_memory_vs_journal_context]: {
    instruction: ResponseInstruction.answer_confidently_from_confirmed_memory,
    requiresTaraReview: false,
  },
  [ConflictType.confirmed_memory_vs_graph_context]: {
    instruction: ResponseInstruction.answer_confidently_from_confirmed_memory,
    requiresTaraReview: false,
  },
  [ConflictType.confirmed_memory_vs_held_truth]: {
    instruction: ResponseInstruction.surface_source_conflict,
    requiresTaraReview: true,
  },
  [ConflictType.recent_continuity_vs_journal_context]: {
    instruction: ResponseInstruction.answer_with_caveat,
    requiresTaraReview: false,
  },
  [ConflictType.pulse_authored_choice_vs_inferred_emotion]: {
    instruction: ResponseInstruction.say_pulse_continuity_only,
    requiresTaraReview: false,
  },
  [ConflictType.cross_room_context_vs_presence_scope]: {
    instruction: ResponseInstruction.do_not_inject,
    requiresTaraReview: false,
  },
  [ConflictType.lounge_context_vs_individual_room_scope]: {
    instruction: ResponseInstruction.answer_with_source_label,
    requiresTaraReview: false,
  },
  [ConflictType.graph_only_authority_risk]: {
    instruction: ResponseInstruction.say_graph_context_only,
    requiresTaraReview: false,
  },
  [ConflictType.rag_reference_vs_memory_authority]: {
    instruction: ResponseInstruction.answer_with_source_label,
    requiresTaraReview: false,
  },
  [ConflictType.trace_only_source_used_as_content]: {
    instruction: ResponseInstruction.do_not_inject,
    requiresTaraReview: false,
  },
  [ConflictType.topic_shift_relevance_failure]: {
    instruction: ResponseInstruction.say_not_enough_grounded_recall,
    requiresTaraReview: false,
  },
  [ConflictType.ambiguous_reference]: {
    instruction: ResponseInstruction.ask_clarifying_question,
    requiresTaraReview: false,
  },
  [ConflictType.insufficient_ground]: {
    instruction: ResponseInstruction.say_not_enough_grounded_recall,
    requiresTaraReview: false,
  },
  [ConflictType.presence_memory_scope_collision]: {
    instruction: ResponseInstruction.surface_source_conflict,
    requiresTaraReview: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Convert caller-provided relevance to a sort rank (lower = stronger). */
function relevanceToRank(r: CandidateRecallSource['relevance']): number {
  switch (r) {
    case 'strong': return 1;
    case 'medium': return 2;
    case 'weak':   return 3;
    case 'none':   return 4;
    default:       return 2; // unspecified treated as medium
  }
}

/** Build an active ClassifiedSource from a registry definition. */
function makeActive(surface: SourceSurface, def: SourceSurfaceDefinition): ClassifiedSource {
  return {
    surface,
    authority_label: def.authority_label,
    authority_tier:  def.authority_tier,
    authority_rank:  AUTHORITY_RANK[def.authority_label],
    status: 'active',
    is_memory:        def.is_memory,
    is_continuity:    def.is_continuity,
    is_trace_only:    def.is_trace_only,
    is_reference_only: def.is_reference_only,
    response_instruction: def.default_response_instruction,
  };
}

/** Build an excluded ClassifiedSource from a registry definition and reason. */
function makeExcluded(
  surface: SourceSurface,
  def: SourceSurfaceDefinition,
  reason: ExclusionReason,
): ClassifiedSource {
  return {
    surface,
    authority_label: def.authority_label,
    authority_tier:  def.authority_tier,
    authority_rank:  AUTHORITY_RANK[def.authority_label],
    status: 'excluded',
    exclusion_reason: reason,
    is_memory:        def.is_memory,
    is_continuity:    def.is_continuity,
    is_trace_only:    def.is_trace_only,
    is_reference_only: def.is_reference_only,
    response_instruction: def.default_response_instruction,
  };
}

/** Build an excluded ClassifiedSource for an unrecognised surface. */
function makeUnknownExcluded(surface: SourceSurface): ClassifiedSource {
  return {
    surface,
    authority_label: AuthorityLabel.unknown_ground,
    authority_tier:  AuthorityTier.GroundFailure,
    authority_rank:  AUTHORITY_RANK[AuthorityLabel.unknown_ground],
    status: 'excluded',
    exclusion_reason: ExclusionReason.unknown_source,
    is_memory:        false,
    is_continuity:    false,
    is_trace_only:    false,
    is_reference_only: false,
    response_instruction: ResponseInstruction.say_not_enough_grounded_recall,
  };
}

/**
 * Scope check.
 * Returns false (excluded) when the candidate does not belong in the target room.
 *
 * Hard scope laws:
 *   ari_room  — blocks eli-scoped and tara_only-scoped candidates
 *   eli_room  — blocks ari-scoped and tara_only-scoped candidates
 *   lounge    — blocks surfaces with lounge_allowed:false;
 *               blocks same_presence_only surfaces with explicit non-shared scope
 *   watchtower — allows all (Tara review context)
 */
function isScopeAllowed(
  candidate: CandidateRecallSource,
  def: SourceSurfaceDefinition,
  room: RecallPacketBuilderInput['room'],
): boolean {
  const candidateScope = candidate.presence_scope;

  if (room === 'lounge') {
    if (!def.lounge_allowed) return false;
    // same_presence_only with explicit private scope → blocked in shared Lounge
    if (def.same_presence_only && candidateScope && candidateScope !== 'shared') return false;
    return true;
  }

  if (room === 'watchtower') return true; // inspect-all for Tara review

  if (room === 'ari_room') {
    if (candidateScope === 'eli')       return false;
    if (candidateScope === 'tara_only') return false;
    return true;
  }

  if (room === 'eli_room') {
    if (candidateScope === 'ari')       return false;
    if (candidateScope === 'tara_only') return false;
    return true;
  }

  return true; // unknown room: conservative allow
}

// ─────────────────────────────────────────────────────────────────────────────
// GATE CLASSIFICATION
// Applies gates in priority order. First failing gate determines exclusion reason.
// ─────────────────────────────────────────────────────────────────────────────

function classifyCandidate(
  candidate: CandidateRecallSource,
  room: RecallPacketBuilderInput['room'],
  queryContext: RecallPacketBuilderInput['query_context'],
): ClassifiedSource {
  const { surface } = candidate;

  // Gate 1 — unknown source (not in registry)
  const def = SOURCE_SURFACE_REGISTRY[surface];
  if (!def) return makeUnknownExcluded(surface);

  // Gate 2 — trace only
  if (def.is_trace_only) return makeExcluded(surface, def, ExclusionReason.trace_only);

  // Gate 3 — raw source material
  if (def.authority_label === AuthorityLabel.raw_source_not_recallable)
    return makeExcluded(surface, def, ExclusionReason.raw_source);

  // Gate 4 — draft (unapproved proposal)
  if (def.authority_label === AuthorityLabel.draft_proposal_not_recallable)
    return makeExcluded(surface, def, ExclusionReason.draft_source);

  // Gate 5 — tara-only (never enters presence prompts)
  if (def.authority_label === AuthorityLabel.tara_only_confirmed_memory)
    return makeExcluded(surface, def, ExclusionReason.tara_only);

  // Gate 6 — scope
  if (!isScopeAllowed(candidate, def, room))
    return makeExcluded(surface, def, ExclusionReason.scope_prohibited);

  // Gate 7 — expiry
  if (candidate.expired === true)
    return makeExcluded(surface, def, ExclusionReason.expired);

  // Gate 8 — prompt eligibility (registry policy OR caller override)
  if (!def.can_enter_prompt || candidate.prompt_eligible === false)
    return makeExcluded(surface, def, ExclusionReason.not_prompt_eligible);

  // Gate 9 — runtime builder v1 coverage
  if (!def.in_runtime_builder_v1)
    return makeExcluded(surface, def, ExclusionReason.not_in_runtime_builder);

  // Gate 10 — topic shift
  if (queryContext?.topic_shift_detected && TOPIC_SHIFT_SENSITIVE_SURFACES.has(surface))
    return makeExcluded(surface, def, ExclusionReason.topic_shift);

  // Gate 11 — relevance (v1 simpler model: strong/medium/weak pass, none excluded)
  if (candidate.relevance === 'none')
    return makeExcluded(surface, def, ExclusionReason.relevance_too_weak);

  // All gates passed — active
  return makeActive(surface, def);
}

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURAL CONFLICT DETECTION
// Detects conflicts that can be identified from source-type combinations and
// query metadata — without reading any source content.
// ─────────────────────────────────────────────────────────────────────────────

function detectStructuralConflicts(
  activeSources: ClassifiedSource[],
  excludedSources: ClassifiedSource[],
  queryContext: RecallPacketBuilderInput['query_context'],
): SourceConflict[] {
  const conflicts: SourceConflict[] = [];

  // 1. Insufficient ground — no active sources
  if (activeSources.length === 0) {
    conflicts.push({
      conflict_type: ConflictType.insufficient_ground,
      involved_sources: [],
      resolution_instruction: CONFLICT_RESOLUTION_TABLE[ConflictType.insufficient_ground].instruction,
      requires_tara_review: false,
    });
  }

  // 2. Ambiguous reference — caller flagged reference as ambiguous
  if (queryContext?.reference_ambiguous) {
    conflicts.push({
      conflict_type: ConflictType.ambiguous_reference,
      involved_sources: activeSources.map(s => s.surface),
      resolution_instruction: CONFLICT_RESOLUTION_TABLE[ConflictType.ambiguous_reference].instruction,
      requires_tara_review: false,
    });
  }

  // 3. Topic shift relevance failure — any topic_shift exclusions occurred
  const topicShiftExcluded = excludedSources.filter(
    s => s.exclusion_reason === ExclusionReason.topic_shift,
  );
  if (topicShiftExcluded.length > 0) {
    conflicts.push({
      conflict_type: ConflictType.topic_shift_relevance_failure,
      involved_sources: topicShiftExcluded.map(s => s.surface),
      resolution_instruction: CONFLICT_RESOLUTION_TABLE[ConflictType.topic_shift_relevance_failure].instruction,
      requires_tara_review: false,
    });
  }

  // 4. Graph-only authority risk — graph-tier active, no confirmed Memory active
  //    NOTE: In v1, graph surfaces have in_runtime_builder_v1:false so will always be
  //    excluded. This detection is implemented ready for when graph surfaces are enabled.
  const hasActiveMemory = activeSources.some(s => s.is_memory);
  const activeGraphSurfaces = activeSources.filter(
    s => s.authority_tier === AuthorityTier.Graph,
  );
  if (activeGraphSurfaces.length > 0 && !hasActiveMemory) {
    conflicts.push({
      conflict_type: ConflictType.graph_only_authority_risk,
      involved_sources: activeGraphSurfaces.map(s => s.surface),
      resolution_instruction: CONFLICT_RESOLUTION_TABLE[ConflictType.graph_only_authority_risk].instruction,
      requires_tara_review: false,
    });
  }

  // 5. Trace-only source used as content — defensive bug detection
  //    A trace source should never reach active_sources. Flag it if it does.
  const traceInActive = activeSources.filter(s => s.is_trace_only);
  if (traceInActive.length > 0) {
    conflicts.push({
      conflict_type: ConflictType.trace_only_source_used_as_content,
      involved_sources: traceInActive.map(s => s.surface),
      resolution_instruction: CONFLICT_RESOLUTION_TABLE[ConflictType.trace_only_source_used_as_content].instruction,
      requires_tara_review: false,
    });
  }

  return conflicts;
}

// ─────────────────────────────────────────────────────────────────────────────
// CALLER-PROVIDED CONFLICT CONSTRUCTION
// Builds SourceConflict objects from conflict_types declared on candidates.
// Only creates conflicts for candidates that are in active_sources.
// ─────────────────────────────────────────────────────────────────────────────

function buildCallerConflicts(
  candidates: CandidateRecallSource[],
  activeSources: ClassifiedSource[],
): SourceConflict[] {
  const conflicts: SourceConflict[] = [];
  const activeSurfaceSet = new Set(activeSources.map(s => s.surface));

  for (const candidate of candidates) {
    if (!candidate.conflict_types || candidate.conflict_types.length === 0) continue;
    if (!activeSurfaceSet.has(candidate.surface)) continue; // only active sources generate conflicts

    for (const conflictType of candidate.conflict_types) {
      const resolution = CONFLICT_RESOLUTION_TABLE[conflictType];
      const involved: SourceSurface[] = [candidate.surface];
      if (candidate.conflicts_with) {
        for (const other of candidate.conflicts_with) {
          if (!involved.includes(other)) involved.push(other);
        }
      }

      conflicts.push({
        conflict_type: conflictType,
        involved_sources: involved,
        primary_source: candidate.surface,
        secondary_source: candidate.conflicts_with?.[0],
        resolution_instruction: resolution.instruction,
        requires_tara_review: resolution.requiresTaraReview,
      });
    }
  }

  return conflicts;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE INSTRUCTION SELECTION
// Picks primary_response_instruction from active sources and conflict state.
// ─────────────────────────────────────────────────────────────────────────────

function selectPrimary(
  activeSources: ClassifiedSource[],
  conflicts: SourceConflict[],
  queryContext: RecallPacketBuilderInput['query_context'],
): ResponseInstruction {
  // No active sources
  if (activeSources.length === 0) {
    return ResponseInstruction.say_not_enough_grounded_recall;
  }

  // Any conflict that demands surfacing takes priority
  const hasSurfaceConflict = conflicts.some(
    c => c.resolution_instruction === ResponseInstruction.surface_source_conflict,
  );
  if (hasSurfaceConflict) return ResponseInstruction.surface_source_conflict;

  // Ambiguous reference: ask clarifying question unless there is exactly one
  // active source that is confirmed Memory (unambiguous ground)
  if (queryContext?.reference_ambiguous) {
    const isSingleMemory = activeSources.length === 1 && activeSources[0].is_memory;
    if (!isSingleMemory) return ResponseInstruction.ask_clarifying_question;
  }

  // Default: instruction of the highest-authority active source (first in sorted list)
  return activeSources[0].response_instruction;
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNTHETIC INSUFFICIENT SOURCE
// Added to excluded_sources when candidate list is empty, making the
// "no sources were available" state explicit in the packet.
// ─────────────────────────────────────────────────────────────────────────────

function makeSyntheticInsufficient(): ClassifiedSource {
  const def = SOURCE_SURFACE_REGISTRY[SourceSurface.insufficient];
  return {
    surface: SourceSurface.insufficient,
    authority_label: def.authority_label,
    authority_tier:  def.authority_tier,
    authority_rank:  AUTHORITY_RANK[def.authority_label],
    status: 'excluded',
    exclusion_reason: ExclusionReason.insufficient_ground,
    is_memory:        false,
    is_continuity:    false,
    is_trace_only:    false,
    is_reference_only: false,
    response_instruction: ResponseInstruction.say_not_enough_grounded_recall,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a deterministic Context Authority Packet (Recall Packet).
 *
 * Pure function — no side effects, no retrieval, no DB, no LLM.
 * Every candidate source ends up in exactly one of active_sources or excluded_sources.
 *
 * @param input - Caller-assembled candidate sources and query context.
 * @returns Complete RecallPacket with classified sources, conflicts, and response instructions.
 */
export function buildRecallPacket(input: RecallPacketBuilderInput): RecallPacket {
  const { packet_id, computed_at, presence, room, candidate_sources, query_context } = input;

  // ── Empty candidate list ─────────────────────────────────────────────────
  // No candidates were assembled — return ground-failure packet.
  if (candidate_sources.length === 0) {
    const excluded_sources = [makeSyntheticInsufficient()];
    const conflicts: SourceConflict[] = [{
      conflict_type: ConflictType.insufficient_ground,
      involved_sources: [],
      resolution_instruction: ResponseInstruction.say_not_enough_grounded_recall,
      requires_tara_review: false,
    }];
    return {
      packet_id,
      computed_at,
      presence,
      room,
      active_sources: [],
      excluded_sources,
      conflicts,
      has_conflict: true,
      primary_response_instruction: ResponseInstruction.say_not_enough_grounded_recall,
      response_instructions: [],
      has_sufficient_ground: false,
      summary: {
        total_surfaces_considered: 0,
        active_count: 0,
        excluded_count: 1,
        memory_count: 0,
        continuity_count: 0,
        reference_count: 0,
        trace_count: 0,
        conflict_count: 1,
      },
    };
  }

  // ── Classify each candidate ───────────────────────────────────────────────
  const active_sources: ClassifiedSource[] = [];
  const excluded_sources: ClassifiedSource[] = [];

  for (const candidate of candidate_sources) {
    const classified = classifyCandidate(candidate, room, query_context);
    if (classified.status === 'active') {
      active_sources.push(classified);
    } else {
      excluded_sources.push(classified);
    }
  }

  // ── Sort active sources ───────────────────────────────────────────────────
  // authority_rank ascending → relevance ascending → surface stable
  const relevanceBySource = new Map<SourceSurface, number>();
  for (const c of candidate_sources) {
    relevanceBySource.set(c.surface, relevanceToRank(c.relevance));
  }

  active_sources.sort((a, b) => {
    if (a.authority_rank !== b.authority_rank) return a.authority_rank - b.authority_rank;
    const ra = relevanceBySource.get(a.surface) ?? 2;
    const rb = relevanceBySource.get(b.surface) ?? 2;
    if (ra !== rb) return ra - rb;
    return a.surface.localeCompare(b.surface);
  });

  // ── Sort excluded sources ─────────────────────────────────────────────────
  // exclusion priority ascending → authority_rank ascending → surface stable
  excluded_sources.sort((a, b) => {
    const pa = EXCLUSION_PRIORITY[a.exclusion_reason ?? ExclusionReason.insufficient_ground] ?? 12;
    const pb = EXCLUSION_PRIORITY[b.exclusion_reason ?? ExclusionReason.insufficient_ground] ?? 12;
    if (pa !== pb) return pa - pb;
    if (a.authority_rank !== b.authority_rank) return a.authority_rank - b.authority_rank;
    return a.surface.localeCompare(b.surface);
  });

  // ── Detect conflicts ──────────────────────────────────────────────────────
  const structuralConflicts = detectStructuralConflicts(active_sources, excluded_sources, query_context);
  const callerConflicts     = buildCallerConflicts(candidate_sources, active_sources);
  const conflicts: SourceConflict[] = [...structuralConflicts, ...callerConflicts];

  // ── Build response instructions ───────────────────────────────────────────
  const response_instructions = active_sources.map(s => ({
    instruction:    s.response_instruction,
    source_surface: s.surface,
    authority_rank: s.authority_rank,
  }));

  const primary_response_instruction = selectPrimary(active_sources, conflicts, query_context);

  // ── Build summary ─────────────────────────────────────────────────────────
  const summary = {
    total_surfaces_considered: candidate_sources.length,
    active_count:    active_sources.length,
    excluded_count:  excluded_sources.length,
    memory_count:    active_sources.filter(s => s.is_memory).length,
    continuity_count: active_sources.filter(s => s.is_continuity).length,
    reference_count: active_sources.filter(s => s.is_reference_only).length,
    trace_count:     excluded_sources.filter(s => s.is_trace_only).length,
    conflict_count:  conflicts.length,
  };

  return {
    packet_id,
    computed_at,
    presence,
    room,
    active_sources,
    excluded_sources,
    conflicts,
    has_conflict:    conflicts.length > 0,
    primary_response_instruction,
    response_instructions,
    has_sufficient_ground: active_sources.length > 0,
    summary,
  };
}
