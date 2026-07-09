/**
 * Phase 43.B (= 42.4.2b) — LIVE LLM-proposal runner (behind the proven cage). CLI-only.
 *
 * DEFAULT (43.B, unchanged):
 *   npx tsx scripts/agent-graph-llm-live.ts --archive-name <name> --max-proposals <n> --max-usd <ceiling> \
 *     [--max-nodes <n>] [--max-output-tokens <n>] --live --confirm-live
 *
 * WHOLE-ARCHIVE profile (Option B — expanded, opt-in only; covers one whole archive in one run):
 *   npx tsx scripts/agent-graph-llm-live.ts --archive-name <name> --max-usd <ceiling> \
 *     --live --confirm-live --profile whole-archive --confirm-whole-archive-live
 *
 * The expanded caps (100/8192/40) live ONLY in LLM_LIVE_WHOLE_ARCHIVE_PROFILE and are selected ONLY when
 * BOTH --profile whole-archive AND --confirm-whole-archive-live are present. Numeric --max-* args CLAMP to
 * the active profile's max (they can never unlock expansion). One archive per run, one model call, cost
 * ceiling ($0.20) unchanged and never raisable via CLI, test_owned=true only, no real rows. Each live run
 * remains separately Tara-authorised. Refuses unless --live AND --confirm-live.
 *
 * DO NOT RUN until Tara explicitly authorises each run.
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
  LLM_LIVE_DEFAULT_PROFILE, LLM_LIVE_WHOLE_ARCHIVE_PROFILE, type LiveProfile,
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
function clampInt(flag: string, max: number): number {
  return Math.min(parseInt(arg(flag) ?? String(max), 10), max)
}

async function main() {
  // Live gate — refuse a live model call unless BOTH are present.
  if (!has('live') || !has('confirm-live')) {
    console.error('Refusing: a live model call requires BOTH --live and --confirm-live.')
    process.exit(1); return
  }

  // Profile selection — the expanded whole-archive caps require BOTH --profile whole-archive AND
  // --confirm-whole-archive-live. --profile whole-archive without its confirm REFUSES. No number and no
  // single flag can select the expanded profile.
  const wantWhole = arg('profile') === 'whole-archive'
  if (wantWhole && !has('confirm-whole-archive-live')) {
    console.error('Refusing: --profile whole-archive requires --confirm-whole-archive-live.')
    process.exit(1); return
  }
  const wholeArchive = wantWhole && has('confirm-whole-archive-live')
  const base: LiveProfile = wholeArchive ? LLM_LIVE_WHOLE_ARCHIVE_PROFILE : LLM_LIVE_DEFAULT_PROFILE

  const archive = arg('archive-name')
  const maxUsd = arg('max-usd')
  if (!archive) { console.error('Refusing: requires --archive-name <name>.'); process.exit(1); return }
  if (!maxUsd) { console.error('Refusing: requires an explicit cost ceiling --max-usd <usd>.'); process.exit(1); return }
  // --max-proposals stays REQUIRED under the DEFAULT profile (byte-identical to authorised 43.B);
  // under the whole-archive profile it is optional and defaults to the profile cap (40).
  if (!wholeArchive && !arg('max-proposals')) {
    console.error('Refusing: requires --max-proposals <n>.'); process.exit(1); return
  }

  // Effective profile — every CLI value CLAMPS to the active base profile's cap (never exceeds it), and
  // the ceiling can only be LOWERED by --max-usd, never raised above the profile's $0.20.
  const effective: LiveProfile = {
    ...base,
    maxNodes: clampInt('max-nodes', base.maxNodes),
    maxOutputTokens: clampInt('max-output-tokens', base.maxOutputTokens),
    maxProposals: clampInt('max-proposals', base.maxProposals),
    costCeilingUsd: Math.min(base.costCeilingUsd, parseFloat(maxUsd)),
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!url || !key) { console.error('Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); return }
  if (!apiKey) { console.error('Requires ANTHROPIC_API_KEY for the live model call.'); process.exit(1); return }
  const sb = createClient(url, key)

  // Bounded read-only context: approved nodes in this ONE archive, existing edges, pending dupes.
  const { data: nodeRows } = await sb.from('archive_graph_nodes')
    .select('id, label, archive_name, approval_status, source_item_ids')
    .eq('archive_name', archive).eq('approval_status', 'approved')
  const allNodes = (nodeRows ?? []) as Array<{ id: string; label: string; archive_name: string; approval_status: string; source_item_ids: string[] | null }>

  // whole-archive: refuse-not-truncate if the archive holds more approved nodes than the profile allows.
  if (wholeArchive && allNodes.length > effective.maxNodes) {
    console.error(`Refusing: whole-archive "${archive}" has ${allNodes.length} approved nodes, over the profile max ${effective.maxNodes} — refusing rather than truncating coverage.`)
    process.exit(1); return
  }

  const bounded = [...allNodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, effective.maxNodes)
  const liveNodes: LiveContextNode[] = bounded.map((n) => ({ id: n.id, label: n.label, archive_name: n.archive_name, source_item_ids: n.source_item_ids ?? [] }))
  if (liveNodes.length < 2) { console.error(`Refusing: need >=2 approved nodes in "${archive}" (got ${liveNodes.length}).`); process.exit(1); return }

  const { data: edgeRows } = await sb.from('archive_graph_edges').select('from_node_id, to_node_id, edge_type')
  const nodesById = new Map<string, ContextNode>(bounded.map((n) => [n.id, { id: n.id, archive_name: n.archive_name, approval_status: n.approval_status, source_item_ids: n.source_item_ids ?? [] }]))
  const existingEdges = (edgeRows ?? []) as ContextEdge[]
  const { data: pending } = await sb.rpc(GRAPH_PROPOSALS_LIST_RPC, { p_target_graph: GRAPH_PROPOSAL_TARGET, p_review_state: null, p_include_test: true })
  const pendingDedupeKeys = new Set<string>((pending ?? []).map((p: { from_node_id: string; to_node_id: string; edge_type: string }) => `archive_graph:${p.from_node_id}:${p.to_node_id}:${p.edge_type}`))
  const ctx: PostGateContext = { nodesById, existingEdges, pendingDedupeKeys }

  console.log(`\n== live LLM run (profile=${effective.name}, archive="${archive}", nodes=${liveNodes.length}, ceiling=$${effective.costCeilingUsd}, prompt=${effective.promptVersion}) ==`)

  // ONE bounded model call — cost ceiling checked BEFORE the call inside generateLiveProposals.
  const gen = await generateLiveProposals(liveNodes, { apiKey, profile: effective })
  if (gen.refused) { console.error(`Refused: ${gen.reason} (projected $${gen.projectedUsd.toFixed(4)})`); process.exit(1); return }
  console.log(`model responded (projected $${gen.projectedUsd.toFixed(4)}; usage in=${gen.usage?.inputTokens ?? '?'} out=${gen.usage?.outputTokens ?? '?'})`)

  // UNCHANGED deterministic post-gate over the untrusted array.
  const result = runPostGate(gen.raw, ctx)
  console.log(`accepted ${result.accepted.length}  rejected ${result.rejected.length}`)
  for (const r of result.rejected) console.log(`  rejected[#${r.index}]: ${r.reason}`)
  if (result.accepted.length > effective.maxProposals) {
    console.error(`Refusing: ${result.accepted.length} accepted exceeds the profile cap ${effective.maxProposals}.`); process.exit(1); return
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
  console.log(`recorded ${recorded}  skipped ${skipped}  run_id ${runId}  (test_owned=true, generation_mode=live, profile=${effective.name})`)
  console.log(`cleanup: agent_graph_proposals_cleanup_test '${runId}'`)
}

main().catch((err) => { console.error('live runner failed:', err instanceof Error ? err.message : err); process.exit(1) })
