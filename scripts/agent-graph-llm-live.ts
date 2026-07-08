/**
 * Phase 43.B (= 42.4.2b) — LIVE LLM-proposal runner (behind the proven cage). CLI-only.
 *
 *   npx tsx scripts/agent-graph-llm-live.ts --archive-name <name> --max-proposals <n> \
 *     --max-usd <ceiling> [--max-nodes <n>] [--max-output-tokens <n>] --live --confirm-live
 *
 * Refuses unless BOTH --live and --confirm-live are present (mirrors 43.A's --persist-real +
 * --confirm-persist-real). Builds a BOUNDED read-only context (approved nodes in one archive),
 * makes ONE Sonnet-5 call via llm_live.ts (fail-before-call cost ceiling), runs the UNCHANGED
 * deterministic post-gate, and records accepted proposals as SUGGEST-ONLY, TEST-OWNED,
 * generation_mode='live' rows via the governed RPC (p_live_authorized=true). No graph truth, no
 * Memory, no prompt eligibility, no scheduler. Real (test_owned=false) live rows remain impossible.
 *
 * DO NOT RUN until Tara explicitly authorises the live call after the gates pass.
 */

import ws from 'ws'
if (!globalThis.WebSocket) globalThis.WebSocket = ws as unknown as typeof globalThis.WebSocket

import { randomUUID } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { runPostGate, type ContextNode, type ContextEdge, type PostGateContext } from '../src/lib/agents/graph_proposals/llm_postgate'
import { generateLiveProposals, type LiveContextNode } from '../src/lib/agents/graph_proposals/llm_live'
import {
  GRAPH_LLM_PROPOSAL_RECORD_RPC, GRAPH_PROPOSALS_LIST_RPC, GRAPH_PROPOSAL_TARGET,
  LLM_LIVE_MAX_NODES, LLM_LIVE_MAX_OUTPUT_TOKENS,
} from '../src/lib/agents/graph_proposals/contract'

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

function arg(name: string): string | undefined { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined }
function has(name: string): boolean { return process.argv.includes(`--${name}`) }

async function main() {
  // Double-flag gate — refuse a live model call unless BOTH are present.
  if (!has('live') || !has('confirm-live')) {
    console.error('Refusing: a live model call requires BOTH --live and --confirm-live.')
    process.exit(1); return
  }
  const archive = arg('archive-name')
  const maxProposals = arg('max-proposals')
  const maxUsd = arg('max-usd')
  if (!archive) { console.error('Refusing: requires --archive-name <name>.'); process.exit(1); return }
  if (!maxProposals) { console.error('Refusing: requires --max-proposals <n>.'); process.exit(1); return }
  if (!maxUsd) { console.error('Refusing: requires an explicit cost ceiling --max-usd <usd>.'); process.exit(1); return }
  const maxProposalsN = parseInt(maxProposals, 10)
  const costCeilingUsd = parseFloat(maxUsd)
  const maxNodes = Math.min(parseInt(arg('max-nodes') ?? String(LLM_LIVE_MAX_NODES), 10), LLM_LIVE_MAX_NODES)
  const maxOutputTokens = Math.min(parseInt(arg('max-output-tokens') ?? String(LLM_LIVE_MAX_OUTPUT_TOKENS), 10), LLM_LIVE_MAX_OUTPUT_TOKENS)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!url || !key) { console.error('Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); return }
  if (!apiKey) { console.error('Requires ANTHROPIC_API_KEY for the live model call.'); process.exit(1); return }
  const sb = createClient(url, key)

  // Bounded read-only context: approved nodes in this archive (capped), existing edges, pending dupes.
  const { data: nodeRows } = await sb.from('archive_graph_nodes')
    .select('id, label, archive_name, approval_status, source_item_ids')
    .eq('archive_name', archive).eq('approval_status', 'approved')
  const allNodes = (nodeRows ?? []) as Array<{ id: string; label: string; archive_name: string; approval_status: string; source_item_ids: string[] | null }>
  // Deterministic bounded selection: first N by id.
  const bounded = [...allNodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, maxNodes)
  const liveNodes: LiveContextNode[] = bounded.map((n) => ({ id: n.id, label: n.label, archive_name: n.archive_name, source_item_ids: n.source_item_ids ?? [] }))
  if (liveNodes.length < 2) { console.error(`Refusing: need >=2 approved nodes in "${archive}" (got ${liveNodes.length}).`); process.exit(1); return }

  const { data: edgeRows } = await sb.from('archive_graph_edges').select('from_node_id, to_node_id, edge_type')
  const nodesById = new Map<string, ContextNode>(bounded.map((n) => [n.id, { id: n.id, archive_name: n.archive_name, approval_status: n.approval_status, source_item_ids: n.source_item_ids ?? [] }]))
  const existingEdges = (edgeRows ?? []) as ContextEdge[]
  const { data: pending } = await sb.rpc(GRAPH_PROPOSALS_LIST_RPC, { p_target_graph: GRAPH_PROPOSAL_TARGET, p_review_state: null, p_include_test: true })
  const pendingDedupeKeys = new Set<string>((pending ?? []).map((p: { from_node_id: string; to_node_id: string; edge_type: string }) => `archive_graph:${p.from_node_id}:${p.to_node_id}:${p.edge_type}`))
  const ctx: PostGateContext = { nodesById, existingEdges, pendingDedupeKeys }

  console.log(`\n== live LLM proposal run (archive="${archive}", nodes=${liveNodes.length}, ceiling=$${costCeilingUsd}) ==`)

  // ONE bounded model call — cost ceiling checked BEFORE the call inside generateLiveProposals.
  const gen = await generateLiveProposals(liveNodes, { apiKey, maxOutputTokens, costCeilingUsd })
  if (gen.refused) { console.error(`Refused: ${gen.reason} (projected $${gen.projectedUsd.toFixed(4)})`); process.exit(1); return }
  console.log(`model responded (projected $${gen.projectedUsd.toFixed(4)}; usage in=${gen.usage?.inputTokens ?? '?'} out=${gen.usage?.outputTokens ?? '?'})`)

  // UNCHANGED deterministic post-gate over the untrusted array.
  const result = runPostGate(gen.raw, ctx)
  console.log(`accepted ${result.accepted.length}  rejected ${result.rejected.length}`)
  for (const r of result.rejected) console.log(`  rejected[#${r.index}]: ${r.reason}`)
  if (result.accepted.length > maxProposalsN) {
    console.error(`Refusing: ${result.accepted.length} accepted exceeds --max-proposals ${maxProposalsN}.`); process.exit(1); return
  }

  const runId = randomUUID()
  let recorded = 0, skipped = 0
  for (const p of result.accepted) {
    const { data, error } = await sb.rpc(GRAPH_LLM_PROPOSAL_RECORD_RPC, {
      p_from_node_id: p.from_node_id, p_to_node_id: p.to_node_id, p_edge_type: p.edge_type,
      p_source_item_ids: p.source_refs, p_confidence: p.confidence, p_rationale: p.rationale,
      p_model_id: gen.modelId, p_prompt_version: gen.promptVersion,
      p_model_settings: gen.modelSettings, p_input_hash: gen.inputHash, p_run_id: runId,
      p_generation_mode: 'live', p_live_authorized: true,
    })
    if (error) { console.error(`  record failed: ${error.message}`); continue }
    const row = Array.isArray(data) ? data[0] : data
    if (row?.recorded) recorded++; else skipped++
  }
  console.log(`recorded ${recorded}  skipped ${skipped}  run_id ${runId}  (test_owned=true, generation_mode=live)`)
  console.log(`cleanup: agent_graph_proposals_cleanup_test '${runId}'`)
}

main().catch((err) => { console.error('live runner failed:', err instanceof Error ? err.message : err); process.exit(1) })
