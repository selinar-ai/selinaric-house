/**
 * Phase 43 Wave 1 — "Continuity & Impermanence" midlevel node+edge promotion (static guards).
 *
 * Proves the wave is exactly the 8 curated nodes + their self-contained edges, promoted at MIDLEVEL
 * grain (never overview), pending_review only, provenance-preserving, capped-and-refusing. The live
 * behaviour (preview shows 8 nodes + 8 edges; confirmed run creates 16 pending_review; Tara approves
 * → they render at midlevel) is the read-only preview + governed run in the ship report.
 *
 * Run: npx tsx src/lib/agents/__tests__/phase-43-wave1-promotion.test.ts
 */

import * as fs from 'fs'
import { GRAPH_EDGE_TYPES } from '../../../lib/graph/types'
import { NODE_TYPE_DEFAULT_GRAIN } from '../../../lib/graph/graphGrain'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }
function stripComments(s: string): string { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '') }

const MOD = 'src/lib/graph/archiveWavePromotion.ts'

section('vocabulary — all 4 wave edge types admitted (anchors added for Wave 1)')
for (const t of ['contrasts_with', 'shaped_by', 'precedes', 'anchors']) {
  assert((GRAPH_EDGE_TYPES as readonly string[]).includes(t), `GRAPH_EDGE_TYPES admits ${t}`)
}

section('exact 8-node allowlist + 8/8 caps')
{
  const s = read(MOD)
  const m = s.match(/WAVE1_NODE_IDS[^=]*=\s*\[([\s\S]*?)\]/)
  const ids = (m?.[1] ?? '').match(/'([0-9a-f-]{36})'/g)?.map(x => x.replace(/'/g, '')) ?? []
  assert(ids.length === 8, `WAVE1_NODE_IDS has exactly 8 ids (got ${ids.length})`)
  assert(new Set(ids).size === 8, 'all 8 ids distinct')
  assert(s.includes('WAVE1_MAX_NODES = 8') && s.includes('WAVE1_MAX_EDGES = 8'), 'hard caps 8/8')
}

section('MIDLEVEL grain guaranteed — never overview')
{
  const s = read(MOD)
  assert(s.includes("new Set(['concept', 'ritual'])") || s.includes('ALLOWED_NODE_TYPES'), 'node types restricted to concept + ritual')
  assert(s.includes("ALLOWED_NODE_TYPES.has(n.node_type)"), 'selection enforces the allowed node types')
  // both allowed types map to midlevel in the grain table (so nothing can land overview)
  assert(NODE_TYPE_DEFAULT_GRAIN['concept'] === 'midlevel' && NODE_TYPE_DEFAULT_GRAIN['ritual'] === 'midlevel', 'concept + ritual both default to MIDLEVEL grain')
  // none of the overview types are promotable here
  for (const ov of ['person', 'presence', 'room', 'wing', 'project', 'architecture_law']) {
    assert(!s.includes(`'${ov}'`), `${MOD}: does not reference overview type ${ov}`)
  }
}

section('node-first, then edges; pending_review + prompt_eligible false; no approved_graph write')
{
  const s = read(MOD)
  const nodeIdx = s.indexOf('// NODE-first')
  const edgeIdx = s.indexOf('// then EDGES')
  assert(nodeIdx >= 0 && edgeIdx > nodeIdx, 'nodes created before edges')
  assert(s.includes("proposalType: 'node'") && s.includes("proposalType: 'edge'"), 'creates both node and edge proposals')
  const code = stripComments(s)
  const reads = code.replace(/\.in\('status',\s*\[[^\]]*\]\)/g, '').replace(/\.eq\('status',\s*'approved_graph'\)/g, '')
  assert(!reads.includes('approved_graph'), 'never writes approved_graph (only read filters reference it)')
  assert(!code.includes('prompt_eligible'), 'never sets prompt_eligible (createProposal default false)')
}

section('scope — archive→scope (violet→eli); per-endpoint scope in edge payload')
{
  const s = read(MOD)
  assert(s.includes("if (archiveName === 'violet') return 'eli'") && s.includes("if (archiveName === 'velvet') return 'ari'"), 'archive→scope remap (violet→eli, velvet→ari)')
  assert(s.includes("archive_name !== 'violet'"), 'Wave 1 confined to violet nodes')
  assert(s.includes('presenceScope: e.from.scope') && s.includes('presenceScope: e.to.scope'), 'per-endpoint scope carried (binds real nodes)')
}

section('self-contained edges — both endpoints must be wave nodes; dedup; approved-only')
{
  const s = read(MOD)
  assert(s.includes('if (!from || !to) continue'), 'edge requires BOTH endpoints among the wave nodes')
  assert(s.includes('existingSig.has('), 'dedup vs existing map proposals')
  assert(s.includes("approval_status', 'approved'") || s.includes(".eq('approval_status', 'approved')"), 'only approved archive_graph nodes/edges')
  assert(s.includes('mapLabels.has(normalizeLabel(n.label))'), 'dedup vs existing approved map nodes')
}

section('caps refuse (never truncate); preview-first')
{
  const s = read(MOD)
  assert(s.includes('nodes.length > WAVE1_MAX_NODES || edges.length > WAVE1_MAX_EDGES') && s.includes("mode: 'refused'"), 'refuses beyond caps (no truncation)')
  assert(s.includes("if (!opts.confirm) return { mode: 'preview'"), 'preview-first (no write without confirm)')
}

section('provenance — archive_graph_node/edge + source_item_ids + legacy_system')
{
  const s = read(MOD)
  assert(s.includes("primarySourceType: 'archive_graph_node'"), 'node provenance = archive_graph_node')
  assert(s.includes("primarySourceType: 'archive_graph_edge'"), 'edge provenance = archive_graph_edge')
  assert(s.includes("legacy_system: 'phase_29B'"), 'legacy tag')
  assert(s.includes('source_item_ids: e.sourceItemIds'), 'edge carries source_item_ids (trace to archive)')
}

section('boundaries — no archive_graph write / no 51 / no relational-map / no new engine')
{
  const code = stripComments(read(MOD))
  for (const bad of ['agent_graph_proposals', '.update(', '.upsert(', '.delete(', 'relational-map', 'canonical_status', 'held_truths', 'eligible_for_graph', 'eligible_for_recall']) {
    assert(!code.includes(bad), `${MOD}: no ${bad} in executable code`)
  }
  assert(!code.includes("from('archive_graph_nodes').insert") && !code.includes("from('archive_graph_edges').insert"), 'archive_graph is read-only here')
  assert(code.includes('createProposal('), 'writes only through the shared createProposal primitive')
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
