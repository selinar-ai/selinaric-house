/**
 * Phase 42.4.2a — deterministic LLM post-gate (PURE; the cage's core).
 *
 * Takes an (untrusted) LLM/fixture output + a bounded context of existing approved archive nodes
 * and validates every proposed edge against hard rules. The model's confidence is soft evidence —
 * it is a floor, never an override. Anything malformed, off-whitelist, out-of-context, out-of-scope,
 * self-referential, non-canonical, duplicate, or making an authority/prompt/memory claim is REJECTED
 * in code. No I/O, no LLM, no DB. Fail closed on unknown fields.
 */

import { LLM_EDGE_WHITELIST, LLM_MIN_CONFIDENCE, GRAPH_PROPOSAL_TARGET } from './contract'

export type ContextNode = { id: string; archive_name: string; approval_status: string; source_item_ids: string[] }
export type ContextEdge = { from_node_id: string; to_node_id: string; edge_type: string }
export type PostGateContext = {
  nodesById: Map<string, ContextNode>   // existing approved nodes in the bounded scope
  existingEdges: ContextEdge[]           // existing archive edges (for existing-edge skip)
  pendingDedupeKeys: Set<string>         // active pending proposal dedupe keys (for dup-pending skip)
}
export type ValidatedProposal = {
  from_node_id: string
  to_node_id: string
  edge_type: string
  confidence: number
  rationale: string
  source_refs: string[]
  dedupe_key: string
}
export type PostGateResult = { accepted: ValidatedProposal[]; rejected: { index: number; reason: string }[] }

const ALLOWED_FIELDS = new Set(['from_node_id', 'to_node_id', 'edge_type', 'confidence', 'rationale', 'source_refs'])
const WHITELIST = new Set<string>(LLM_EDGE_WHITELIST as readonly string[])

function dedupeKey(from: string, to: string, edge: string): string {
  return `${GRAPH_PROPOSAL_TARGET}:${from}:${to}:${edge}`
}
function undirected(a: string, b: string): string { return a <= b ? `${a}|${b}` : `${b}|${a}` }

/** Validate raw LLM output (JSON string or parsed value) against the bounded context. */
export function runPostGate(raw: unknown, ctx: PostGateContext): PostGateResult {
  const accepted: ValidatedProposal[] = []
  const rejected: { index: number; reason: string }[] = []

  let arr: unknown
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw) } catch { return { accepted, rejected: [{ index: -1, reason: 'MALFORMED_JSON' }] } }
  } else {
    arr = raw
  }
  if (!Array.isArray(arr)) return { accepted, rejected: [{ index: -1, reason: 'MALFORMED_JSON' }] }

  const existing = new Set<string>()
  for (const e of ctx.existingEdges) existing.add(`${undirected(e.from_node_id, e.to_node_id)}|${e.edge_type}`)

  arr.forEach((item, index) => {
    const reject = (reason: string) => rejected.push({ index, reason })

    if (item === null || typeof item !== 'object' || Array.isArray(item)) return reject('PARTIAL_OUTPUT')
    const obj = item as Record<string, unknown>
    // fail closed on unknown fields (authority/prompt/memory claims etc.)
    for (const k of Object.keys(obj)) if (!ALLOWED_FIELDS.has(k)) return reject('UNKNOWN_FIELD')
    for (const k of ALLOWED_FIELDS) if (!(k in obj)) return reject('PARTIAL_OUTPUT')

    const from = obj.from_node_id, to = obj.to_node_id, edge = obj.edge_type
    const conf = obj.confidence, rationale = obj.rationale, refs = obj.source_refs
    if (typeof from !== 'string' || typeof to !== 'string' || typeof edge !== 'string') return reject('PARTIAL_OUTPUT')

    const nf = ctx.nodesById.get(from), nt = ctx.nodesById.get(to)
    if (!nf || !nt) return reject('NODE_NOT_IN_CONTEXT')
    if (nf.approval_status !== 'approved' || nt.approval_status !== 'approved') return reject('NODE_NOT_APPROVED')
    if (nf.archive_name !== nt.archive_name) return reject('ARCHIVE_MISMATCH')
    if (from === to) return reject('SELF_LOOP')
    if (!(from < to)) return reject('NON_CANONICAL_PAIR')
    if (!WHITELIST.has(edge)) return reject('OFF_WHITELIST')
    if (typeof conf !== 'number' || Number.isNaN(conf) || conf < 0 || conf > 1) return reject('CONFIDENCE_INVALID')
    if (conf < LLM_MIN_CONFIDENCE) return reject('CONFIDENCE_TOO_LOW')
    if (typeof rationale !== 'string' || rationale.trim() === '') return reject('RATIONALE_REQUIRED')
    if (!Array.isArray(refs) || refs.length === 0 || !refs.every((r) => typeof r === 'string' && r.trim() !== '')) return reject('SOURCE_REFS_REQUIRED')

    const union = new Set<string>([...(nf.source_item_ids ?? []), ...(nt.source_item_ids ?? [])])
    if (!(refs as string[]).every((r) => union.has(r))) return reject('SOURCE_REF_OUT_OF_SCOPE')

    if (existing.has(`${undirected(from, to)}|${edge}`)) return reject('DUPLICATE_EXISTING_EDGE')
    const key = dedupeKey(from, to, edge)
    if (ctx.pendingDedupeKeys.has(key)) return reject('DUPLICATE_PENDING')

    accepted.push({
      from_node_id: from, to_node_id: to, edge_type: edge, confidence: conf, rationale,
      source_refs: [...new Set(refs as string[])].sort(), dedupe_key: key,
    })
  })

  return { accepted, rejected }
}
