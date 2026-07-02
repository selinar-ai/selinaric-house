/**
 * Phase 42.4.2a — fixture-only LLM-proposal runner (NO live LLM, NO provider SDK).
 *
 *   npx tsx scripts/agent-graph-llm-fixture.ts --archive-name <name> --fixture <path-to-json>
 *
 * Reads a FIXTURE file (a simulated LLM output: JSON array of proposals) + archive scope,
 * builds a bounded read-only context from existing approved archive nodes, runs the deterministic
 * post-gate, and records the accepted proposals as SUGGEST-ONLY, TEST-OWNED, fixture-provenance
 * rows via the governed LLM-record RPC. There is NO model call. Live generation is 42.4.2b.
 */

import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { runPostGate, type ContextNode, type ContextEdge, type PostGateContext } from '../src/lib/agents/graph_proposals/llm_postgate'
import { computeInputHash } from '../src/lib/agents/graph_proposals/detect'
import {
  GRAPH_LLM_PROPOSAL_RECORD_RPC, GRAPH_PROPOSALS_LIST_RPC, GRAPH_PROPOSAL_TARGET,
  FIXTURE_MODEL_ID, FIXTURE_PROMPT_VERSION,
} from '../src/lib/agents/graph_proposals/contract'

function arg(name: string): string | undefined { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined }

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); return }
  const archive = arg('archive-name'), fixturePath = arg('fixture')
  if (!archive) { console.error('Refusing: requires --archive-name <name>.'); process.exit(1); return }
  if (!fixturePath) { console.error('Refusing: requires --fixture <path-to-json>.'); process.exit(1); return }
  const sb = createClient(url, key)

  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))

  // bounded read-only context: approved nodes in this archive + existing edges + pending proposals
  const { data: nodeRows } = await sb.from('archive_graph_nodes')
    .select('id, archive_name, approval_status, source_item_ids').eq('archive_name', archive).eq('approval_status', 'approved')
  const { data: edgeRows } = await sb.from('archive_graph_edges').select('from_node_id, to_node_id, edge_type')
  const nodesById = new Map<string, ContextNode>((nodeRows ?? []).map((n) => [n.id, n as ContextNode]))
  const existingEdges = (edgeRows ?? []) as ContextEdge[]
  const { data: pending } = await sb.rpc(GRAPH_PROPOSALS_LIST_RPC, { p_target_graph: GRAPH_PROPOSAL_TARGET, p_review_state: null, p_include_test: true })
  const pendingDedupeKeys = new Set<string>((pending ?? []).map((p: { from_node_id: string; to_node_id: string; edge_type: string }) => `archive_graph:${p.from_node_id}:${p.to_node_id}:${p.edge_type}`))
  const ctx: PostGateContext = { nodesById, existingEdges, pendingDedupeKeys }

  const result = runPostGate(fixture, ctx)
  const runId = randomUUID()
  const inputHash = computeInputHash([...nodesById.keys()])
  console.log(`\n== fixture post-gate (archive="${archive}") ==`)
  console.log(`accepted ${result.accepted.length}  rejected ${result.rejected.length}`)
  for (const r of result.rejected) console.log(`  rejected[#${r.index}]: ${r.reason}`)

  let recorded = 0, skipped = 0
  for (const p of result.accepted) {
    const { data, error } = await sb.rpc(GRAPH_LLM_PROPOSAL_RECORD_RPC, {
      p_from_node_id: p.from_node_id, p_to_node_id: p.to_node_id, p_edge_type: p.edge_type,
      p_source_item_ids: p.source_refs, p_confidence: p.confidence, p_rationale: p.rationale,
      p_model_id: FIXTURE_MODEL_ID, p_prompt_version: FIXTURE_PROMPT_VERSION,
      p_model_settings: { fixture: true }, p_input_hash: inputHash, p_run_id: runId, p_generation_mode: 'fixture',
    })
    if (error) { console.error(`  record failed: ${error.message}`); continue }
    const row = Array.isArray(data) ? data[0] : data
    if (row?.recorded) recorded++; else skipped++
  }
  console.log(`recorded ${recorded}  skipped ${skipped}  run_id ${runId}  (cleanup: agent_graph_proposals_cleanup_test '${runId}')`)
}

main().catch((err) => { console.error('fixture runner failed:', err instanceof Error ? err.message : err); process.exit(1) })
