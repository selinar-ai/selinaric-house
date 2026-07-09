/**
 * Phase 43 — Candidate Disposition View (READ-ONLY). CLI-only.
 *
 *   npx tsx scripts/agent-graph-candidate-disposition.ts
 *
 * Lists the live (generation_mode='live') candidate agent_graph_proposals with resolved node labels and a
 * READ-ONLY re-verification verdict (eligible / blocked + reason). It WRITES NOTHING: it reuses the existing
 * execute-only LIST RPC and reads archive_graph_nodes/edges directly; there is no promote, no flip, no new
 * RPC, no table, no migration. prompt_version is not returned by the LIST RPC (would need a read-only RPC
 * extension = out of scope), so it is shown as its known closure value for the Option-B candidates.
 */

import ws from 'ws'
if (!globalThis.WebSocket) globalThis.WebSocket = ws as unknown as typeof globalThis.WebSocket

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import {
  reverifyCandidate, archiveEdgeKey, dedupeKey, annotateDirection,
  type DispositionCandidate, type ArchiveNodeSnapshot, type DispositionContext, type DirectionStatus,
} from '../src/lib/agents/graph_proposals/candidate_disposition'
import { GRAPH_PROPOSALS_LIST_RPC, GRAPH_PROPOSAL_TARGET, LLM_LIVE_WHOLE_ARCHIVE_PROFILE } from '../src/lib/agents/graph_proposals/contract'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('='); if (eq === -1) continue
    const k = t.slice(0, eq).trim(); let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v.replace(/\r$/, '')
  }
}

type ListRow = {
  id: string; run_id: string; edge_type: string; from_node_id: string; to_node_id: string
  source_item_ids: string[] | null; confidence: number; rationale: string; model_id: string
  generation_mode: string | null; is_llm_generated: boolean; review_state: string; created_at: string
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); return }
  const sb = createClient(url, key)

  // Read-only: candidates via the execute-only LIST RPC (include test-owned); real rows for dedupe + test_owned derivation.
  const allRes = await sb.rpc(GRAPH_PROPOSALS_LIST_RPC, { p_target_graph: GRAPH_PROPOSAL_TARGET, p_review_state: null, p_include_test: true })
  const realRes = await sb.rpc(GRAPH_PROPOSALS_LIST_RPC, { p_target_graph: GRAPH_PROPOSAL_TARGET, p_review_state: null, p_include_test: false })
  const all = (allRes.data ?? []) as ListRow[]
  const real = (realRes.data ?? []) as ListRow[]
  const realIds = new Set(real.map((r) => r.id))
  const candidates = all.filter((r) => r.generation_mode === 'live')

  // Read-only: current archive_graph nodes + edges (normal tables, service-role readable).
  const { data: nodeRows } = await sb.from('archive_graph_nodes').select('id, label, archive_name, approval_status, source_item_ids')
  const nodesById = new Map<string, ArchiveNodeSnapshot>(
    ((nodeRows ?? []) as Array<{ id: string; label: string; archive_name: string; approval_status: string; source_item_ids: string[] | null }>)
      .map((n) => [n.id, { id: n.id, label: n.label, archiveName: n.archive_name, approvalStatus: n.approval_status, sourceItemIds: n.source_item_ids ?? [] }]),
  )
  const { data: edgeRows } = await sb.from('archive_graph_edges').select('from_node_id, to_node_id, edge_type')
  const existingArchiveEdgeKeys = new Set<string>(
    ((edgeRows ?? []) as Array<{ from_node_id: string; to_node_id: string; edge_type: string }>)
      .map((e) => archiveEdgeKey(e.from_node_id, e.to_node_id, e.edge_type)),
  )
  const realDedupeKeys = new Set<string>(real.map((r) => dedupeKey(r.from_node_id, r.to_node_id, r.edge_type)))
  const ctx: DispositionContext = { nodesById, existingArchiveEdgeKeys, realDedupeKeys }

  console.log(`\n== CANDIDATE DISPOSITION VIEW (read-only) — ${candidates.length} live candidates ==`)
  console.log(`(prompt_version shown as the known Option-B value; not surfaced by the read-only LIST RPC)\n`)

  let eligible = 0
  const blockedBy: Record<string, number> = {}
  const dirBy: Record<DirectionStatus, number> = { 'inferred-forward': 0, 'inferred-reverse': 0, symmetric: 0, ambiguous: 0, undeclared: 0 }
  let directionPending = 0
  for (const r of candidates) {
    const cand: DispositionCandidate = {
      id: r.id, runId: r.run_id, edgeType: r.edge_type, fromNodeId: r.from_node_id, toNodeId: r.to_node_id,
      sourceRefs: r.source_item_ids ?? [], confidence: r.confidence,
    }
    const verdict = reverifyCandidate(cand, ctx)
    if (verdict.eligible) eligible++; else blockedBy[verdict.blockingReason!] = (blockedBy[verdict.blockingReason!] ?? 0) + 1
    const fromLbl = nodesById.get(r.from_node_id)?.label ?? r.from_node_id.slice(0, 8)
    const toLbl = nodesById.get(r.to_node_id)?.label ?? r.to_node_id.slice(0, 8)
    const testOwned = !realIds.has(r.id)
    // Read-only ADVISORY semantic-direction annotation (canonical order is NOT semantic; see helper).
    const ann = annotateDirection({
      edgeType: r.edge_type, canonicalFromId: r.from_node_id, canonicalToId: r.to_node_id,
      canonicalFromLabel: fromLbl, canonicalToLabel: toLbl, rationale: r.rationale,
    })
    dirBy[ann.status]++
    if (ann.directionPending) directionPending++
    console.log(`  [${verdict.eligible ? 'ELIGIBLE' : 'BLOCKED: ' + verdict.blockingReason}]  candidate_id=${r.id}  (conf ${r.confidence})`)
    console.log(`      canonical pair (NON-SEMANTIC, UUID-ordered): ${fromLbl} | ${r.edge_type} | ${toLbl}`)
    console.log(`      symmetry=${ann.symmetry}  direction=${ann.status}${ann.reason ? ' (' + ann.reason + ')' : ''}  direction_pending=${ann.directionPending}  (inference is ADVISORY)`)
    if (ann.status === 'inferred-forward' || ann.status === 'inferred-reverse') {
      console.log(`      inferred semantic (advisory — needs human confirmation): ${ann.semanticFromLabel} —${r.edge_type}→ ${ann.semanticToLabel}`)
    } else if (ann.status === 'symmetric') {
      console.log(`      semantic: symmetric — no direction (contrasts_with)`)
    } else {
      console.log(`      inferred semantic: — (${ann.status}; human review required, not guessed)`)
    }
    console.log(`      run=${r.run_id.slice(0, 8)}  archive=${nodesById.get(r.from_node_id)?.archiveName ?? '?'}  test_owned=${testOwned}  generation_mode=${r.generation_mode}`)
    console.log(`      model=${r.model_id}  prompt_version=${LLM_LIVE_WHOLE_ARCHIVE_PROFILE.promptVersion} (known Option-B value; LIST RPC omits it)  review_state=${r.review_state}`)
    console.log(`      source_refs=[${(r.source_item_ids ?? []).join(', ')}]`)
    console.log(`      rationale: ${r.rationale}`)
  }

  console.log(`\n== SUMMARY ==`)
  console.log(`  total candidates: ${candidates.length}  eligible: ${eligible}  blocked: ${candidates.length - eligible}`)
  if (Object.keys(blockedBy).length) console.log(`  blocked by: ${Object.entries(blockedBy).map(([k, n]) => `${k}=${n}`).join('  ')}`)

  console.log(`\n== DIRECTION ANNOTATION (read-only, ADVISORY) ==`)
  console.log(`  inferred-forward: ${dirBy['inferred-forward']}  inferred-reverse: ${dirBy['inferred-reverse']}  symmetric: ${dirBy.symmetric}  ambiguous: ${dirBy.ambiguous}  undeclared: ${dirBy.undeclared}`)
  console.log(`  direction_pending (human confirmation required before any persist-real): ${directionPending}`)
  console.log(`  (Canonical pair is a dedup identity, not semantic direction. Inferred direction is advisory; ambiguous/contradictory cases are NOT guessed.)`)
  console.log(`  (READ-ONLY — nothing was flipped, promoted, annotated-in-DB, or written.)`)
}

main().catch((err) => { console.error('disposition view failed:', err instanceof Error ? err.message : err); process.exit(1) })
