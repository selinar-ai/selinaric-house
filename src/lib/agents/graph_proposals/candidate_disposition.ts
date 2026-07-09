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

import { LLM_EDGE_WHITELIST, LLM_MIN_CONFIDENCE } from './contract'

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
