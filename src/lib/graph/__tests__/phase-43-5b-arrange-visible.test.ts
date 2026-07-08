/**
 * Phase 43 5B — pin-aware "Arrange Visible" (deterministic, layout-only).
 *
 * arrangeVisible() is a PURE deterministic layout function: it repositions the
 * currently-visible, UNPINNED nodes only, skips pinned nodes, never touches
 * hidden nodes, emits {x,y} numbers only, and performs no I/O. This suite proves
 * the pure-function contract plus a source-scan of the purity + UI wiring.
 *
 * Run: npx tsx src/lib/graph/__tests__/phase-43-5b-arrange-visible.test.ts
 */

import { readFileSync } from 'fs'
import { arrangeVisible } from '../arrangeVisible'
import type { GraphMapNode, GraphMapEdge } from '../relationalMapTypes'
import type { RelationalMapLayoutData } from '../relationalMapWorkspaceTypes'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }

// ─── Fixture helpers ────────────────────────────────────────────────────────

function mkNode(
  id: string,
  grainLevel: GraphMapNode['grainLevel'],
  presenceScope: string,
): GraphMapNode {
  return {
    id,
    label: id.split(':').pop() ?? id,
    nodeType: id.split(':')[2] ?? 'concept',
    presenceScope,
    authorityStatus: 'archive_supported',
    confidence: 0.8,
    salience: 0.5,
    sourceTypes: ['archive_graph_node'],
    proposalIds: [],
    derivedFromEdge: false,
    promptEligible: false,
    grainLevel,
  }
}

function mkEdge(from: string, to: string): GraphMapEdge {
  return {
    id: `edge:${from}->${to}`,
    fromNodeId: from,
    toNodeId: to,
    edgeType: 'relates_to',
    label: 'relates to',
    presenceScope: 'shared',
    authorityStatus: 'archive_supported',
    confidence: 0.8,
    salience: 0.5,
    proposalId: `${from}->${to}`,
    promptEligible: false,
  }
}

const emptyLayout = (): RelationalMapLayoutData => ({ version: 1, nodes: {}, clusters: [] })

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

// Stable id keys
const HOUSE = 'node:shared:presence:house'
const ARI = 'node:ari:presence:ari'
const M_EDGE = 'node:shared:concept:edge-anchored'   // edged to HOUSE (overview)
const M_SCOPE = 'node:ari:concept:scope-anchored'    // no overview edge, scope ari → ARI
const M_GLOBAL = 'node:zzz:concept:global-anchored'  // no edge, no scope match → global coarse
const D_MID = 'node:shared:event:detail-mid'         // edged to M_EDGE (midlevel)
const D_COARSE = 'node:shared:event:detail-coarse'   // edged to HOUSE (overview)

// ─── Pure-function contract ─────────────────────────────────────────────────

section('output emits only {x,y} numbers — never a graph field')
{
  const nodes = [mkNode(HOUSE, 'overview', 'shared'), mkNode(M_EDGE, 'midlevel', 'shared')]
  const edges = [mkEdge(HOUSE, M_EDGE)]
  const res = arrangeVisible(nodes, edges, emptyLayout())
  let ok = true
  for (const v of Object.values(res)) {
    const keys = Object.keys(v).sort().join(',')
    if (keys !== 'x,y') ok = false
    if (typeof v.x !== 'number' || typeof v.y !== 'number') ok = false
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) ok = false
  }
  assert(ok, 'every position is exactly {x:number, y:number}, finite')
}

section('deterministic — same visible set + same pins ⇒ identical output')
{
  const nodes = [
    mkNode(HOUSE, 'overview', 'shared'), mkNode(ARI, 'overview', 'ari'),
    mkNode(M_EDGE, 'midlevel', 'shared'), mkNode(M_SCOPE, 'midlevel', 'ari'),
    mkNode(D_MID, 'detail', 'shared'),
  ]
  const edges = [mkEdge(HOUSE, M_EDGE), mkEdge(HOUSE, ARI), mkEdge(M_EDGE, D_MID)]
  const a = JSON.stringify(arrangeVisible(nodes, edges, emptyLayout()))
  const b = JSON.stringify(arrangeVisible(nodes, edges, emptyLayout()))
  assert(a === b, 'two runs produce byte-identical output')
}

section('skips pinned nodes — pinned id never appears in output')
{
  const nodes = [mkNode(HOUSE, 'overview', 'shared'), mkNode(M_EDGE, 'midlevel', 'shared')]
  const edges = [mkEdge(HOUSE, M_EDGE)]
  const layout: RelationalMapLayoutData = {
    version: 1,
    nodes: { [M_EDGE]: { x: 42, y: 99, pinned: true } },
    clusters: [],
  }
  const res = arrangeVisible(nodes, edges, layout)
  assert(res[M_EDGE] === undefined, 'pinned node is not in the result (position untouched by caller)')
  assert(res[HOUSE] !== undefined, 'the unpinned node is still arranged')
}

section('visible-only — a node not passed in is never positioned')
{
  const nodes = [mkNode(HOUSE, 'overview', 'shared'), mkNode(M_EDGE, 'midlevel', 'shared')]
  const edges = [mkEdge(HOUSE, M_EDGE)]
  // A saved layout entry for a node that is NOT in the visible set:
  const layout: RelationalMapLayoutData = {
    version: 1,
    nodes: { 'node:shared:concept:hidden': { x: 1, y: 2, pinned: false } },
    clusters: [],
  }
  const res = arrangeVisible(nodes, edges, layout)
  assert(res['node:shared:concept:hidden'] === undefined, 'hidden (non-visible) node never appears in output')
  assert(Object.keys(res).length === 2, 'only the two visible nodes are positioned')
}

section('anchor fallback order: edge-coarse → presence-scope → global coarse')
{
  const nodes = [
    mkNode(HOUSE, 'overview', 'shared'),
    mkNode(ARI, 'overview', 'ari'),
    mkNode(M_EDGE, 'midlevel', 'shared'),   // tier 1: edged to HOUSE
    mkNode(M_SCOPE, 'midlevel', 'ari'),     // tier 2: no overview edge, scope ari → ARI
    mkNode(M_GLOBAL, 'midlevel', 'zzz'),    // tier 3: no edge, no scope match → global coarse
  ]
  // HOUSE has more overview-degree than ARI (so global coarse resolves to HOUSE).
  const edges = [mkEdge(HOUSE, M_EDGE), mkEdge(HOUSE, ARI)]
  const res = arrangeVisible(nodes, edges, emptyLayout())
  const house = res[HOUSE], ari = res[ARI]
  // tier 1: M_EDGE clusters around HOUSE (its edge neighbour), not ARI
  assert(dist(res[M_EDGE], house) < dist(res[M_EDGE], ari), 'edge-coarse: M_EDGE nearer HOUSE than ARI')
  // tier 2: M_SCOPE (scope ari, no overview edge) clusters around ARI
  assert(dist(res[M_SCOPE], ari) < dist(res[M_SCOPE], house), 'presence-scope: M_SCOPE nearer ARI than HOUSE')
  // tier 3: M_GLOBAL clusters around the global highest-degree overview (HOUSE)
  assert(dist(res[M_GLOBAL], house) < dist(res[M_GLOBAL], ari), 'global-coarse: M_GLOBAL nearer HOUSE than ARI')
}

section('detail prefers a midlevel anchor, else falls to coarse')
{
  const nodes = [
    mkNode(HOUSE, 'overview', 'shared'),
    mkNode(M_EDGE, 'midlevel', 'shared'),
    mkNode(D_MID, 'detail', 'shared'),      // edged to M_EDGE (midlevel)
    mkNode(D_COARSE, 'detail', 'shared'),   // edged to HOUSE (overview) only
  ]
  const edges = [mkEdge(HOUSE, M_EDGE), mkEdge(M_EDGE, D_MID), mkEdge(HOUSE, D_COARSE)]
  const res = arrangeVisible(nodes, edges, emptyLayout())
  // Detail satellites sit at DETAIL_BASE_RADIUS (110) from their anchor — assert
  // the radius to prove which node each detail is anchored to.
  assert(Math.abs(dist(res[D_MID], res[M_EDGE]) - 110) < 1, 'D_MID clusters around its midlevel neighbour (radius 110)')
  assert(Math.abs(dist(res[D_COARSE], res[HOUSE]) - 110) < 1, 'D_COARSE falls to the coarse anchor (radius 110 from HOUSE)')
}

section('pinned node acts as a FIXED anchor (used, not moved)')
{
  const nodes = [mkNode(HOUSE, 'overview', 'shared'), mkNode(M_EDGE, 'midlevel', 'shared')]
  const edges = [mkEdge(HOUSE, M_EDGE)]
  const layout: RelationalMapLayoutData = {
    version: 1,
    nodes: { [HOUSE]: { x: 1000, y: 1000, pinned: true } },
    clusters: [],
  }
  const res = arrangeVisible(nodes, edges, layout)
  assert(res[HOUSE] === undefined, 'pinned anchor is not repositioned')
  assert(dist(res[M_EDGE], { x: 1000, y: 1000 }) < 260, 'midlevel clusters around the PINNED anchor position')
}

section('overview ring has no duplicate coordinates')
{
  const nodes = ['a', 'b', 'c', 'd', 'e'].map(c => mkNode(`node:shared:presence:${c}`, 'overview', 'shared'))
  const res = arrangeVisible(nodes, [], emptyLayout())
  const seen = new Set<string>()
  let dup = false
  for (const v of Object.values(res)) {
    const k = `${v.x},${v.y}`
    if (seen.has(k)) dup = true
    seen.add(k)
  }
  assert(!dup && seen.size === 5, 'five overview nodes get five distinct coordinates')
}

section('empty input ⇒ empty output (no throw)')
{
  const res = arrangeVisible([], [], emptyLayout())
  assert(Object.keys(res).length === 0, 'no visible nodes ⇒ {}')
  const res2 = arrangeVisible([mkNode(HOUSE, 'overview', 'shared')], [], null)
  assert(res2[HOUSE] !== undefined, 'null layout tolerated (no pins)')
}

// ─── Source-scan: purity + no I/O inside arrangeVisible ─────────────────────

section('arrangeVisible.ts is pure — no Supabase/fetch/network/DB/scheduler import')
{
  const src = readFileSync('src/lib/graph/arrangeVisible.ts', 'utf8')
  const forbidden = ['supabase', 'createClient', 'fetch(', "from 'next", 'qstash', 'openai', '@anthropic', 'process.env']
  for (const f of forbidden) {
    assert(!src.includes(f), `no "${f}" in arrangeVisible.ts`)
  }
  // Only type-only imports (no runtime module require).
  const importLines = src.split('\n').filter(l => /^\s*import\b/.test(l))
  assert(importLines.every(l => l.includes('import type')), 'all imports are import type (no runtime deps)')
  // No randomness / no simulation (match the call form, not prose mentions).
  assert(!src.includes('Math.random('), 'no Math.random() call (deterministic)')
}

// ─── Source-scan: UI wiring (arrange-mode-only, layout-only save path) ──────

section('UI wiring — Arrange visible is Arrange-Mode-only and writes localLayout only')
{
  const bar = readFileSync('src/components/graph/RelationalMapWorkspaceBar.tsx', 'utf8')
  // The button is rendered inside an `arrangeMode &&` guard.
  const arrangeBlock = bar.slice(bar.indexOf('Arrange visible'))
  assert(bar.includes('{arrangeMode && (') && bar.includes('onArrangeVisible'), 'button wired to onArrangeVisible under arrangeMode guard')
  assert(arrangeBlock.includes('onClick={onArrangeVisible}'), 'button onClick calls onArrangeVisible')

  const page = readFileSync('src/app/(house)/relational-map/page.tsx', 'utf8')
  const handler = page.slice(page.indexOf('const handleArrangeVisible'), page.indexOf('const handleNodeDragStop'))
  assert(handler.includes('arrangeVisible(filteredNodes, filteredEdges, localLayout)'), 'handler arranges the VISIBLE set only')
  assert(handler.includes('setLocalLayout') && handler.includes('setIsDirty(true)'), 'handler writes localLayout + marks dirty')
  assert(!handler.includes('fetch(') && !handler.includes('PATCH'), 'handler performs NO network call (Save persists separately)')
  // Save still goes through the existing PATCH to the workspace route.
  assert(page.includes("method: 'PATCH'") && page.includes('/api/relational-map/workspaces/'), 'Save still uses the existing workspace PATCH')
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
