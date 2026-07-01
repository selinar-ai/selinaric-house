/**
 * Phase 42.4.1 — Deterministic graph-proposal runner (NO LLM). Deliberate, Tara-run only.
 *
 *   npx tsx scripts/agent-graph-propose.ts --archive-name <name> [--test-owned]
 *   npx tsx scripts/agent-graph-propose.ts --cleanup <run_id>
 *
 * Reads archive_graph READ-ONLY, computes deterministic `shared_source` edge candidates among
 * existing approved nodes in ONE explicit archive, and records them as SUGGEST-ONLY proposals
 * via the governed `agent_graph_proposal_record` RPC. No whole-graph default, hard caps, no LLM,
 * no auto-approval, no graph-truth write, no scheduler/daemon/queue. Writes ONLY agent_graph_proposals.
 */

import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { computeSharedSourceProposals, computeInputHash, type GraphNode, type ExistingEdge } from '../src/lib/agents/graph_proposals/detect'
import { GRAPH_PROPOSAL_RECORD_RPC, GRAPH_PROPOSALS_CLEANUP_RPC } from '../src/lib/agents/graph_proposals/contract'

// Hard run bounds (Ari amendment 8).
const CAPS = { maxNodes: 500, maxPairs: 5000, maxProposals: 200 }

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
function hasFlag(name: string): boolean { return process.argv.includes(`--${name}`) }

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (RPC execute is service-role only).')
    process.exit(1); return
  }
  const sb = createClient(url, key)

  const cleanup = arg('cleanup')
  if (cleanup) {
    const { data, error } = await sb.rpc(GRAPH_PROPOSALS_CLEANUP_RPC, { p_run_id: cleanup })
    if (error) { console.error(`cleanup failed: ${error.message}`); process.exit(1); return }
    console.log(`cleanup: ${JSON.stringify(Array.isArray(data) ? data[0] : data)}`)
    return
  }

  const archive = arg('archive-name')
  if (!archive) {
    console.error('Refusing: requires --archive-name <name> (one explicit archive; no whole-graph default).')
    process.exit(1); return
  }
  const testOwned = hasFlag('test-owned')

  // READ-ONLY: approved nodes in this archive + existing shared_source edges
  const { data: nodeRows, error: nErr } = await sb
    .from('archive_graph_nodes')
    .select('id, archive_name, approval_status, source_item_ids')
    .eq('archive_name', archive)
    .eq('approval_status', 'approved')
  if (nErr) { console.error(`node read failed: ${nErr.message}`); process.exit(1); return }
  const { data: edgeRows, error: eErr } = await sb
    .from('archive_graph_edges')
    .select('from_node_id, to_node_id, edge_type')
    .eq('edge_type', 'shared_source')
  if (eErr) { console.error(`edge read failed: ${eErr.message}`); process.exit(1); return }

  const nodes = (nodeRows ?? []) as GraphNode[]
  const edges = (edgeRows ?? []) as ExistingEdge[]
  const result = computeSharedSourceProposals(nodes, edges, CAPS)
  const runId = randomUUID()
  const inputHash = computeInputHash(nodes.slice(0, CAPS.maxNodes).map((n) => n.id))

  console.log(`\n== deterministic graph proposals (archive="${archive}"${testOwned ? ', TEST-OWNED' : ''}) ==`)
  console.log(`run_id ${runId}  nodes_scanned ${result.nodes_scanned}  pairs_examined ${result.pairs_examined}  candidates ${result.proposals.length}  capped ${result.capped}`)

  let recorded = 0, skipped = 0
  for (const p of result.proposals) {
    const { data, error } = await sb.rpc(GRAPH_PROPOSAL_RECORD_RPC, {
      p_from_node_id: p.from_node_id,
      p_to_node_id: p.to_node_id,
      p_source_item_ids: p.source_item_ids,
      p_dedupe_key: p.dedupe_key,
      p_run_id: runId,
      p_input_hash: inputHash,
      p_rationale: p.rationale,
      p_allow_test_owned: testOwned,
    })
    if (error) { console.error(`  record failed (${p.from_node_id}→${p.to_node_id}): ${error.message}`); continue }
    const row = Array.isArray(data) ? data[0] : data
    if (row?.recorded) recorded++; else skipped++
  }
  console.log(`recorded ${recorded}  skipped ${skipped}  (cleanup with: --cleanup ${runId})`)
}

main().catch((err) => { console.error('graph propose failed:', err instanceof Error ? err.message : err); process.exit(1) })
