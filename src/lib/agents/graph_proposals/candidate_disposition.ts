/**
 * Phase 43 — Candidate Disposition (READ-ONLY re-verification).
 *
 * Given a live candidate (a test_owned agent_graph_proposal for an archive_graph edge) and a read-only
 * snapshot of live archive state, report whether it WOULD pass re-verification if it were ever promoted
 * later — WITHOUT flipping, writing, or mutating anything. This is a pure function: no I/O, no DB, no SDK.
 *
 * It re-runs the SAME deterministic gauntlet the generation RPC used (agent_graph_llm_proposal_record),
 * against CURRENT archive state, so the view reflects drift (a node un-approved, an edge now existing, a
 * real dupe appearing, source_item_ids changed). It is a read-only mirror of that logic — it NEVER writes.
 */

import { LLM_EDGE_WHITELIST, LLM_MIN_CONFIDENCE, edgeSymmetry, type EdgeSymmetry } from './contract'

export type DispositionCandidate = {
  id: string
  runId: string
  edgeType: string
  fromNodeId: string
  toNodeId: string
  sourceRefs: string[]
  confidence: number
}

export type ArchiveNodeSnapshot = {
  id: string
  label: string
  archiveName: string
  approvalStatus: string
  sourceItemIds: string[]
}

export type DispositionContext = {
  /** Current approved+other archive_graph nodes, by id. */
  nodesById: Map<string, ArchiveNodeSnapshot>
  /** Current archive_graph_edges (truth), undirected key `a|b|edge`. */
  existingArchiveEdgeKeys: Set<string>
  /** Dedupe keys of active REAL (test_owned=false) agent_graph_proposals — `archive_graph:from:to:edge`. */
  realDedupeKeys: Set<string>
}

/** The read-only verdict. `eligible` ⇒ would pass; else `blockingReason` names the first failing check. */
export type ReverifyResult = { eligible: boolean; blockingReason: string | null }

const WHITELIST = new Set<string>(LLM_EDGE_WHITELIST as readonly string[])

function undirected(a: string, b: string): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`
}

/** Build the undirected archive-edge key used by existingArchiveEdgeKeys. */
export function archiveEdgeKey(from: string, to: string, edgeType: string): string {
  return `${undirected(from, to)}|${edgeType}`
}

/** Build the canonical dedupe key used by realDedupeKeys (matches the generation RPC). */
export function dedupeKey(from: string, to: string, edgeType: string): string {
  return `archive_graph:${from}:${to}:${edgeType}`
}

/**
 * READ-ONLY re-verification. Returns { eligible:true } only if every deterministic check the promotion
 * path would run currently passes; otherwise the first failing reason. Writes nothing.
 */
export function reverifyCandidate(c: DispositionCandidate, ctx: DispositionContext): ReverifyResult {
  const nf = ctx.nodesById.get(c.fromNodeId)
  const nt = ctx.nodesById.get(c.toNodeId)

  // endpoints must still exist and be approved
  if (!nf || !nt) return blocked('ENDPOINT_NO_LONGER_APPROVED')
  if (nf.approvalStatus !== 'approved' || nt.approvalStatus !== 'approved') return blocked('ENDPOINT_NO_LONGER_APPROVED')
  // same archive
  if (nf.archiveName !== nt.archiveName) return blocked('ARCHIVE_MISMATCH')
  // canonical undirected pair (intrinsic to a valid stored row; checked for completeness)
  if (c.fromNodeId === c.toNodeId) return blocked('SELF_LOOP')
  if (!(c.fromNodeId < c.toNodeId)) return blocked('NON_CANONICAL_PAIR')
  // whitelist + confidence floor (intrinsic)
  if (!WHITELIST.has(c.edgeType)) return blocked('OFF_WHITELIST')
  if (!(c.confidence >= LLM_MIN_CONFIDENCE)) return blocked('CONFIDENCE_BELOW_FLOOR')
  // source refs must still be a non-empty subset of the endpoints' CURRENT source_item_ids
  const union = new Set<string>([...(nf.sourceItemIds ?? []), ...(nt.sourceItemIds ?? [])])
  if (c.sourceRefs.length === 0) return blocked('SOURCE_REFS_MISSING')
  if (!c.sourceRefs.every((r) => union.has(r))) return blocked('SOURCE_REFS_OUT_OF_SCOPE')
  // an archive_graph edge of this type must not already connect the pair (either direction)
  if (ctx.existingArchiveEdgeKeys.has(archiveEdgeKey(c.fromNodeId, c.toNodeId, c.edgeType))) return blocked('EXISTING_ARCHIVE_EDGE_DUPLICATE')
  // a real (non-test) proposal must not already exist for this pair+type
  if (ctx.realDedupeKeys.has(dedupeKey(c.fromNodeId, c.toNodeId, c.edgeType))) return blocked('DUPLICATE_REAL_PROPOSAL')

  return { eligible: true, blockingReason: null }
}

function blocked(reason: string): ReverifyResult {
  return { eligible: false, blockingReason: reason }
}

// ─── Phase 43 — READ-ONLY semantic-direction ANNOTATION (advisory; never authority) ──────────
//
// The cage stores from_node_id < to_node_id CANONICALLY (by UUID), which is a dedup identity, NOT
// semantic direction. For asymmetric edge types (extends, precedes) the true direction — which
// concept extends/precedes which — must be represented separately. This helper INFERS an advisory
// semantic direction from the rationale for READ-ONLY display; it writes nothing, mutates nothing,
// and every asymmetric edge stays direction-PENDING (human confirmation is mandatory before any
// persist-real). Inference is deliberately CONSERVATIVE: when it cannot cleanly identify the edge's
// object it returns `ambiguous` rather than guessing. Symmetric edges (contrasts_with) have no
// direction. Undeclared edge types fail closed.

export type DirectionStatus = 'inferred-forward' | 'inferred-reverse' | 'symmetric' | 'ambiguous' | 'undeclared'

export type DirectionInput = {
  edgeType: string
  /** Canonical pair (from < to by UUID) — a DEDUP identity, not semantic direction. */
  canonicalFromId: string
  canonicalToId: string
  canonicalFromLabel: string
  canonicalToLabel: string
  rationale: string
}

export type DirectionAnnotation = {
  edgeType: string
  symmetry: EdgeSymmetry | 'undeclared'
  status: DirectionStatus
  /** Machine reason when not a clean forward/reverse/symmetric (else null). */
  reason: string | null
  /** Always true — inferred direction is advisory, never authoritative. */
  advisory: true
  /** True whenever a human must still confirm direction (all asymmetric + undeclared). */
  directionPending: boolean
  /** Derived from canonical pair + inferred direction; null unless a clean direction was inferred. */
  semanticFromId: string | null
  semanticToId: string | null
  semanticFromLabel: string | null
  semanticToLabel: string | null
}

// Grammatical-only stopwords (content words like "practice"/"circle" are intentionally NOT here —
// they are meaningful label tokens). Keep this list purely structural.
const DIR_STOPWORDS = new Set<string>([
  'the', 'a', 'an', 'of', 'and', 'or', 'vs', 'as', 'at', 'in', 'to', 'with', 'for', 'on', 'into',
  'that', 'this', 'by', 'its', 'it', 'both', 'same', 'from', 'is', 'are', 'was', 'were',
])

// Directional verb families (first match anchors the object search). Extend-family also covers
// broaden/elaborate/expand/build-on synonyms seen in the live rationales.
const EXTEND_VERBS = /\b(?:extend(?:s|ing|ed)?|broaden(?:s|ing|ed)?|elaborat(?:e|es|ing|ed)|expand(?:s|ing|ed)?|build(?:s|ing)?\s+on)\b/
const PRECEDE_VERBS = /\b(?:preced(?:e|es|ing|ed)|lead(?:s)?\s+to|prior\s+to|come(?:s)?\s+before|before)\b/
// Opposite-polarity cue: mixing "extends" with "subset of"/"part of" is self-contradictory → ambiguous.
const OPPOSITE_CUE = /\b(?:subset\s+of|part\s+of|subsumed|contained\s+in|narrows)\b/

/** Significant, order-independent tokens of a label (parenthetical + stopwords + 1-char dropped). */
function coreTokens(label: string): string[] {
  return label
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !DIR_STOPWORDS.has(t))
}

/** True only if EVERY significant token of `tokens` appears as a word in `haystack`. */
function allTokensPresent(haystack: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false
  return tokens.every((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(haystack))
}

/**
 * READ-ONLY advisory direction annotation for one candidate. Pure: string/regex only, no I/O.
 * Never mutates; every asymmetric result is directionPending=true (human confirmation required).
 */
export function annotateDirection(input: DirectionInput): DirectionAnnotation {
  const sym = edgeSymmetry(input.edgeType)
  const base = {
    edgeType: input.edgeType,
    advisory: true as const,
    semanticFromId: null as string | null,
    semanticToId: null as string | null,
    semanticFromLabel: null as string | null,
    semanticToLabel: null as string | null,
  }

  // Fail-closed: an undeclared edge type cannot be safely annotated.
  if (sym === null) {
    return { ...base, symmetry: 'undeclared', status: 'undeclared', reason: 'EDGE_TYPE_NOT_IN_SYMMETRY_REGISTRY', directionPending: true }
  }
  // Symmetric: no direction to assert; not pending (direction is meaningless for this type).
  if (sym === 'symmetric') {
    return { ...base, symmetry: sym, status: 'symmetric', reason: null, directionPending: false }
  }

  // Asymmetric: infer an ADVISORY direction; ALWAYS pending human confirmation.
  const finish = (status: DirectionStatus, reason: string | null, forward: boolean | null): DirectionAnnotation => {
    let sf: string | null = null, st: string | null = null, sfl: string | null = null, stl: string | null = null
    if (forward === true) {
      sf = input.canonicalFromId; st = input.canonicalToId; sfl = input.canonicalFromLabel; stl = input.canonicalToLabel
    } else if (forward === false) {
      sf = input.canonicalToId; st = input.canonicalFromId; sfl = input.canonicalToLabel; stl = input.canonicalFromLabel
    }
    return { ...base, symmetry: sym, status, reason, directionPending: true, semanticFromId: sf, semanticToId: st, semanticFromLabel: sfl, semanticToLabel: stl }
  }

  const r = input.rationale.toLowerCase()
  const isPrecedes = input.edgeType === 'precedes'
  // Contradiction (extend-family only): an "extends" claim mixed with a "subset of" claim can't be inferred.
  if (!isPrecedes && EXTEND_VERBS.test(r) && OPPOSITE_CUE.test(r)) {
    return finish('ambiguous', 'CONTRADICTORY_POLARITY', null)
  }
  const verbRe = isPrecedes ? PRECEDE_VERBS : EXTEND_VERBS
  const vm = r.match(verbRe)
  if (!vm || vm.index === undefined) return finish('ambiguous', 'NO_DIRECTIONAL_VERB', null)

  // The OBJECT of the directional verb (the thing extended / the later item) = the semantic TARGET.
  // object == canonical TO  ⇒ forward (semantic runs a→b);  object == canonical FROM ⇒ reverse (b→a).
  const afterText = r.slice(vm.index + vm[0].length)
  const fromAfter = allTokensPresent(afterText, coreTokens(input.canonicalFromLabel))
  const toAfter = allTokensPresent(afterText, coreTokens(input.canonicalToLabel))
  if (fromAfter && toAfter) return finish('ambiguous', 'BOTH_ENDPOINTS_AFTER_VERB', null)
  if (!fromAfter && !toAfter) return finish('ambiguous', 'OBJECT_NOT_IDENTIFIED', null)
  const forward = toAfter
  return finish(forward ? 'inferred-forward' : 'inferred-reverse', null, forward)
}
