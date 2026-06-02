// Phase 38.1 — Evidence Packet Builder + Deterministic Reasoning Baseline
//
// Reasoning explains evidence. Reasoning does not create authority.
// A reasoning-supported candidate is still only a candidate.
// Reasoning output is not evidence.
//
// This module is pure computation — no database calls, no side effects,
// no writes, no mutations. It takes a HydratedGraphCandidateSuggestion
// and produces a deterministic ReasoningBaseline.

import type { HydratedGraphCandidateSuggestion } from './candidateSuggestionTypes'
import type { ReasoningCategory, EvidenceCondition, ReasoningBaseline } from './reasoningTypes'

// ─── Packet Sufficiency Check ──────────────────────────────────────────────

export function checkPacketSufficiency(
  hydrated: HydratedGraphCandidateSuggestion
): { sufficient: boolean; reasons: string[] } {
  const reasons: string[] = []
  const s = hydrated.suggestion

  // candidate_type must be determinable
  if (!s.candidate_type) {
    reasons.push('Candidate type cannot be determined')
  }

  // Memory candidate must have target
  if (s.candidate_type === 'memory_candidate') {
    if (!s.target_archive_item_id) {
      reasons.push('Memory candidate has no target archive item')
    }
    if (hydrated.targetArchiveItem?.missing) {
      reasons.push('Target archive item is missing or deleted')
    }
  }

  // Held Truth candidate must have presence + truth text
  if (s.candidate_type === 'held_truth_candidate') {
    if (!s.target_presence_id) {
      reasons.push('Held Truth candidate has no target presence')
    }
    if (!s.proposed_truth_text) {
      reasons.push('Held Truth candidate has no proposed truth text')
    }
  }

  // Must have at least some evidence (archive OR graph)
  const hasAnyArchive = hydrated.hydratedArchiveSources.length > 0
  const hasAnyGraph = hydrated.hydratedProposals.length > 0 ||
    hydrated.hydratedLegacyNodes.length > 0 ||
    hydrated.hydratedLegacyEdges.length > 0
  if (!hasAnyArchive && !hasAnyGraph) {
    reasons.push('No evidence sources — neither archive nor graph')
  }

  // All archive sources missing = insufficient
  if (hasAnyArchive && hydrated.hydratedArchiveSources.every(src => src.missing)) {
    reasons.push('All archive evidence sources are missing')
  }

  // Graph-only with zero weighted archive = flagged (not necessarily blocked,
  // but combined with other issues becomes insufficient)
  const hasWeighted = hydrated.hydratedArchiveSources.some(
    src => src.usedForWeighting && !src.missing
  )
  if (hasAnyGraph && !hasAnyArchive) {
    reasons.push('Graph support only — no archive evidence')
  }

  return { sufficient: reasons.length === 0, reasons }
}

// ─── Evidence Profile ──────────────────────────────────────────────────────

function buildEvidenceProfile(hydrated: HydratedGraphCandidateSuggestion) {
  const nonMissingArchive = hydrated.hydratedArchiveSources.filter(s => !s.missing)
  const weighted = nonMissingArchive.filter(s => s.usedForWeighting)
  const unweighted = nonMissingArchive.filter(s => !s.usedForWeighting)

  const graphProposals = hydrated.hydratedProposals.filter(p => !p.missing)
  const legacyNodes = hydrated.hydratedLegacyNodes.filter(n => !n.missing)
  const legacyEdges = hydrated.hydratedLegacyEdges.filter(e => !e.missing)
  const totalGraph = graphProposals.length + legacyNodes.length + legacyEdges.length

  const hasMissing = hydrated.hydratedArchiveSources.some(s => s.missing) ||
    hydrated.hydratedProposals.some(p => p.missing) ||
    hydrated.hydratedLegacyNodes.some(n => n.missing) ||
    hydrated.hydratedLegacyEdges.some(e => e.missing)

  return {
    hasWeightedArchiveEvidence: weighted.length > 0,
    hasUnweightedArchiveEvidence: unweighted.length > 0,
    hasGraphProposalEvidence: graphProposals.length > 0,
    hasLegacyGraphEvidence: legacyNodes.length > 0 || legacyEdges.length > 0,
    hasMissingEvidence: hasMissing,
    totalArchiveSources: nonMissingArchive.length,
    totalGraphSources: totalGraph,
    weightedArchiveSources: weighted.length,
  }
}

// ─── Deterministic Category Computation ────────────────────────────────────

export function computeReasoningCategories(
  hydrated: HydratedGraphCandidateSuggestion
): ReasoningCategory[] {
  const cats: ReasoningCategory[] = []
  const s = hydrated.suggestion
  const profile = buildEvidenceProfile(hydrated)

  // Always true
  cats.push('prompt_ineligible_by_design')
  cats.push('non_authoritative_suggestion')

  // Status-based
  if (s.status === 'pending_review') {
    cats.push('review_required')
  }
  if (s.status === 'dismissed') {
    cats.push('dismissed_suggestion')
  }

  // Evidence classification
  const hasDirectConfirmed = hydrated.hydratedArchiveSources.some(
    src => !src.missing && src.evidenceRole === 'confirmed_memory_evidence' && src.usedForWeighting
  )
  const hasAnyArchive = profile.totalArchiveSources > 0
  const hasAnyGraph = profile.totalGraphSources > 0

  if (hasDirectConfirmed && hasAnyGraph) {
    cats.push('mixed_archive_and_graph')
  } else if (hasDirectConfirmed && !hasAnyGraph) {
    cats.push('direct_archive_support')
  } else if (hasAnyArchive && !hasDirectConfirmed && hasAnyGraph) {
    cats.push('mixed_archive_and_graph')
  } else if (hasAnyArchive && !hasDirectConfirmed && !hasAnyGraph) {
    cats.push('indirect_archive_support')
  } else if (!hasAnyArchive && hasAnyGraph) {
    cats.push('graph_support_only')
  }

  // Missing evidence
  if (!profile.hasWeightedArchiveEvidence) {
    cats.push('missing_primary_evidence')
  }

  // Missing evidence sources
  if (profile.hasMissingEvidence) {
    cats.push('deleted_or_missing_source')
  }

  // Status drift
  const targetDrifted = hydrated.targetArchiveItem?.statusChanged === true
  const sourceDrifted = hydrated.hydratedArchiveSources.some(src => src.statusChanged)
  if (targetDrifted || sourceDrifted) {
    cats.push('status_changed_since_suggestion')
  }

  // Candidate type mismatch
  if (s.candidate_type === 'memory_candidate' && !s.target_archive_item_id) {
    cats.push('candidate_type_mismatch')
  }
  if (s.candidate_type === 'held_truth_candidate' && (!s.target_presence_id || !s.proposed_truth_text)) {
    cats.push('candidate_type_mismatch')
  }

  return cats
}

// ─── Evidence Condition ────────────────────────────────────────────────────

export function computeEvidenceCondition(
  hydrated: HydratedGraphCandidateSuggestion,
  packetSufficient: boolean
): EvidenceCondition {
  if (!packetSufficient) return 'insufficient'

  const profile = buildEvidenceProfile(hydrated)

  // Status drift = conflicting
  const hasDrift = hydrated.targetArchiveItem?.statusChanged === true ||
    hydrated.hydratedArchiveSources.some(src => src.statusChanged)
  if (hasDrift) return 'conflicting_or_unresolved'

  // Direct confirmed evidence
  const hasDirectConfirmed = hydrated.hydratedArchiveSources.some(
    src => !src.missing && src.evidenceRole === 'confirmed_memory_evidence' && src.usedForWeighting
  )
  if (hasDirectConfirmed) return 'directly_supported'

  // Archive support exists but not direct confirmed
  if (profile.totalArchiveSources > 0 && profile.totalGraphSources > 0) {
    return 'partially_supported'
  }
  if (profile.totalArchiveSources > 0) return 'partially_supported'

  // Graph only
  if (profile.totalGraphSources > 0) return 'graph_supported_only'

  // Nothing
  return 'missing_primary'
}

// ─── Main: Build Reasoning Baseline ────────────────────────────────────────

export function buildReasoningBaseline(
  hydrated: HydratedGraphCandidateSuggestion
): ReasoningBaseline {
  const sufficiency = checkPacketSufficiency(hydrated)
  const categories = computeReasoningCategories(hydrated)
  const evidenceCondition = computeEvidenceCondition(hydrated, sufficiency.sufficient)

  if (!sufficiency.sufficient && !categories.includes('insufficient_packet')) {
    categories.push('insufficient_packet')
  }

  const profile = buildEvidenceProfile(hydrated)

  const hasDrift = hydrated.targetArchiveItem?.statusChanged === true ||
    hydrated.hydratedArchiveSources.some(src => src.statusChanged)

  return {
    categories,
    evidenceCondition,
    packetSufficient: sufficiency.sufficient,
    insufficiencyReasons: sufficiency.reasons,
    hasStatusDrift: hasDrift,
    evidenceProfile: profile,
  }
}
