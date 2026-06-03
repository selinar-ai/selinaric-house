/**
 * Phase 39.6 — Recall Advisory Signal Mapper
 *
 * Maps already-assembled Tier 1 prompt context structs into RuntimeContextSignal[],
 * calls buildRecallPacketFromRuntimeSignals(), and returns the classified RecallPacket.
 *
 * Tier 1 scope only. Explicitly excluded from this module:
 *   Room Memory (raw string), Attachments, Pulse/Autonomy, Living State,
 *   Identity Timeline, Held Truths, Reflections, Graph/Ontology/Relational Map,
 *   Interior Notes, Watchtower grounding, Reasoning/Feedback/Audit trace sources.
 *
 * Advisory law: calibration, not authority.
 *   Does not create Memory.
 *   Does not move authority.
 *   Does not make excluded sources usable.
 *   Does not treat metadata as evidence.
 *   Does not enforce behaviour.
 *
 * Pure function — no I/O, no async, no side effects.
 */

import { buildRecallPacketFromRuntimeSignals } from './recallCandidateAdapter'
import {
  type PresenceScope,
  type RecallPacket,
  type RelevanceScore,
  type RuntimeContextSignal,
  RuntimeContextSignalType,
} from './recallPacketTypes'
import type { InjectedMemory } from '@/lib/memory-injection'
import type { RecallEntry } from '@/lib/archive-recall'
import type { PromptCarryforward } from '@/lib/cross-room-prompt-carryforward'
import type { RecentContinuitySession } from '@/lib/recent-continuity'
import type { JournalContextReference } from '@/lib/journal'
import type { LibraryReference } from '@/lib/library/chat-library-search'

// ─────────────────────────────────────────────────────────────────────────────
// INPUT TYPE
// ─────────────────────────────────────────────────────────────────────────────

export type RecallAdvisorySignalInput = {
  presence: PresenceScope
  room: 'ari_room' | 'eli_room'
  packet_id: string
  computed_at: string

  /** From buildGovernedMemoryInjection().injectedMemories */
  governedMemory?: InjectedMemory[]

  /** From getRecallableArchiveEntries() */
  archiveRecallEntries?: RecallEntry[]

  /** From getActiveCarryforwardsForAdvisory() */
  crossRoomCarryforwards?: PromptCarryforward[]

  /** From selectRecentContinuityForPrompt().selected */
  recentContinuity?: RecentContinuitySession[]

  /** From getJournalContextForPresence().references */
  journalReferences?: JournalContextReference[]

  /** From extractLibraryReferences() */
  libraryReferences?: LibraryReference[]

  query_context?: {
    reference_ambiguous?: boolean
    topic_shift_detected?: boolean
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: scope derivation
// ─────────────────────────────────────────────────────────────────────────────

function visibilityToScope(visibility: string): PresenceScope | null {
  switch (visibility) {
    case 'shared':   return 'shared'
    case 'ari_only': return 'ari'
    case 'eli_only': return 'eli'
    case 'tara_only': return null // tara-only: exclude from advisory
    default:         return 'shared' // unknown → treat as shared, let scope gate decide
  }
}

function libraryPresenceScopeToScope(scope: string): PresenceScope {
  if (scope === 'ari')                  return 'ari'
  if (scope === 'eli')                  return 'eli'
  if (scope === 'shared' || scope === 'house') return 'shared'
  return 'shared'
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: relevance derivation
// ─────────────────────────────────────────────────────────────────────────────

function rankScoreToRelevance(score: number): RelevanceScore {
  if (score >= 80) return 'strong'
  if (score >= 50) return 'medium'
  if (score >= 20) return 'weak'
  return 'none'
}

function classificationToRelevance(classification: string): RelevanceScore {
  switch (classification) {
    case 'significant': return 'strong'
    case 'relational':  return 'medium'
    case 'transactional': return 'weak'
    default:            return 'medium'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: canonical_status → signal type
// Only canonical / canonical_candidate / archive_only are mapped.
// Staged, needs_review, duplicate, superseded, excluded → skipped.
// ─────────────────────────────────────────────────────────────────────────────

function canonicalStatusToSignalType(
  status: string,
  scope: PresenceScope,
): RuntimeContextSignalType | null {
  switch (status) {
    case 'canonical':
      return scope === 'shared'
        ? RuntimeContextSignalType.GovernedConfirmedMemory
        : RuntimeContextSignalType.PresenceScopedConfirmedMemory
    case 'canonical_candidate':
      return RuntimeContextSignalType.ManualMemoryCandidateRecall
    case 'archive_only':
      return RuntimeContextSignalType.ManualArchiveOnlyRecall
    default:
      return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL MAPPER
// ─────────────────────────────────────────────────────────────────────────────

function mapToSignals(input: RecallAdvisorySignalInput): RuntimeContextSignal[] {
  const signals: RuntimeContextSignal[] = []

  // 1. Governed Memory injection (InjectedMemory[])
  //    All governed injection items are canonical — map to confirmed Memory signals.
  for (const mem of input.governedMemory ?? []) {
    const scope = visibilityToScope(mem.visibility)
    if (!scope) continue // tara_only excluded

    const signalType = scope === 'shared'
      ? RuntimeContextSignalType.GovernedConfirmedMemory
      : RuntimeContextSignalType.PresenceScopedConfirmedMemory

    signals.push({
      signal_type:    signalType,
      presence_scope: scope,
      relevance:      'strong', // governed injection implies relevant
      source_ref:     { source_id: mem.id },
    })
  }

  // 2. Archive Recall Entries (RecallEntry[])
  //    Map by canonical_status. Hard rule: memory_candidate ≠ confirmed Memory.
  for (const entry of input.archiveRecallEntries ?? []) {
    const scope = visibilityToScope(entry.visibility)
    if (!scope) continue // tara_only excluded

    const signalType = canonicalStatusToSignalType(entry.canonical_status, scope)
    if (!signalType) continue // staged/duplicate/superseded/excluded → skip

    signals.push({
      signal_type:    signalType,
      presence_scope: scope,
      relevance:      rankScoreToRelevance(entry.rank_score),
      source_ref:     { source_id: entry.id },
    })
  }

  // 3. Cross-Room Carryforward (PromptCarryforward[])
  //    getActiveCarryforwardsForAdvisory() returns only active (non-expired) rows.
  //    Hard rule: carryforward is not Memory.
  for (const cf of input.crossRoomCarryforwards ?? []) {
    const scope = (cf.target_presence_id === 'ari' || cf.target_presence_id === 'eli')
      ? cf.target_presence_id as PresenceScope
      : 'shared'

    signals.push({
      signal_type:    RuntimeContextSignalType.CrossRoomPromptCarryforward,
      presence_scope: scope,
      expired:        cf.carryforward_status !== 'active',
      relevance:      'medium',
      source_ref:     { source_id: cf.id, count: cf.source_message_ids.length },
    })
  }

  // 4. Recent Continuity (RecentContinuitySession[])
  //    Hard rule: memory_signal=true does NOT change the signal type.
  //    Recent continuity is never confirmed Memory regardless of memory_signal flag.
  for (const session of input.recentContinuity ?? []) {
    const scope = (session.presence_id === 'ari' || session.presence_id === 'eli')
      ? session.presence_id as PresenceScope
      : 'shared'

    signals.push({
      signal_type:    RuntimeContextSignalType.RecentContinuity,
      presence_scope: scope,
      prompt_eligible: session.status === 'active',
      relevance:      classificationToRelevance(session.classification),
      source_ref:     { source_id: session.id, count: session.message_count },
      // memory_signal intentionally NOT used to elevate signal type
    })
  }

  // 5. Journal Inner Continuity (JournalContextReference[])
  //    Hard rule: journal is inner continuity, not canonical Memory.
  for (const ref of input.journalReferences ?? []) {
    signals.push({
      signal_type:    RuntimeContextSignalType.JournalInnerContinuity,
      presence_scope: ref.presenceId as PresenceScope,
      relevance:      'medium',
      source_ref:     { source_id: ref.journalId },
    })
  }

  // 6. Library References (LibraryReference[])
  //    Map canonical_memory (with Archive proof) to LibraryCanonicalMemoryReference.
  //    All others map to LibraryRagReference.
  //    Hard rule: library retrieval score does not increase Memory authority.
  for (const ref of input.libraryReferences ?? []) {
    const signalType = ref.effectiveAuthorityStatus === 'canonical_memory'
      ? RuntimeContextSignalType.LibraryCanonicalMemoryReference
      : RuntimeContextSignalType.LibraryRagReference

    const scope = libraryPresenceScopeToScope(ref.presenceScope)

    signals.push({
      signal_type:    signalType,
      presence_scope: scope,
      relevance:      'medium', // LibraryReference carries no relevance score
      source_ref:     { source_id: ref.id },
    })
  }

  return signals
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a Recall Packet from Tier 1 prompt context structs.
 *
 * Pure function — no I/O, no side effects.
 * Caller provides all inputs as already-assembled structs; this function maps
 * them to RuntimeContextSignal[] and delegates classification to buildRecallPacketFromRuntimeSignals().
 */
export function buildRecallAdvisoryPacket(input: RecallAdvisorySignalInput): RecallPacket {
  const signals = mapToSignals(input)

  return buildRecallPacketFromRuntimeSignals({
    packet_id:    input.packet_id,
    computed_at:  input.computed_at,
    presence:     input.presence,
    room:         input.room,
    signals,
    query_context: input.query_context,
  })
}
