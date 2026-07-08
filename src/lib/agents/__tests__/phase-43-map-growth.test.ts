/**
 * Phase 43 — Map Growth Queue (generalized promotion engine) — static guards.
 *
 * Proves the engine's boundaries: concept/ritual only ⇒ midlevel (never overview); exclude on-map +
 * pending; admitted-edge-only clustering with unadmitted types HELD (never coerced); WAVE_MAX refuse;
 * node-first then edge; pending_review + prompt_eligible false only; provenance; scope; no archive_graph
 * write; no agent/relational-map/new-engine. The live behaviour (--list clusters, preview writes nothing,
 * a confirmed promote creates pending_review, re-discovery excludes it) is the read-only + governed run.
 *
 * Run: npx tsx src/lib/agents/__tests__/phase-43-map-growth.test.ts
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

const MOD = 'src/lib/graph/mapGrowthPromotion.ts'
const CLI = 'scripts/promote-map-growth.ts'

section('vocabulary — extends admitted (Map Growth Queue); all 5 archive edge types valid')
for (const t of ['contrasts_with', 'shaped_by', 'precedes', 'anchors', 'extends']) {
  assert((GRAPH_EDGE_TYPES as readonly string[]).includes(t), `GRAPH_EDGE_TYPES admits ${t}`)
}

section('selection — concept/ritual only ⇒ MIDLEVEL, never overview')
{
  const s = read(MOD)
  assert(s.includes("new Set(['concept', 'ritual'])") && s.includes('ALLOWED_NODE_TYPES'), 'node types restricted to concept + ritual')
  assert(s.includes('ALLOWED_NODE_TYPES.has(n.node_type)'), 'pool enforces allowed node types')
  assert(NODE_TYPE_DEFAULT_GRAIN['concept'] === 'midlevel' && NODE_TYPE_DEFAULT_GRAIN['ritual'] === 'midlevel', 'concept + ritual both default to midlevel grain')
  for (const ov of ['person', 'presence', 'room', 'wing', 'project', 'architecture_law', 'thread', 'phase', 'rule_or_law']) {
    assert(!s.includes(`'${ov}'`), `${MOD}: does not reference deferred/overview type ${ov}`)
  }
}

section('exclude on-map + pending; approved-only')
{
  const s = read(MOD)
  assert(s.includes("in('status', ['approved_graph', 'pending_review'])") && s.includes('excluded.add'), 'excludes anything already approved on map OR pending')
  assert(s.includes("approval_status !== 'approved'") || s.includes("approval_status', 'approved'"), 'approved archive_graph nodes/edges only')
}

section('admitted-edge-only clustering; unadmitted HELD, never coerced')
{
  const s = read(MOD)
  assert(s.includes('ADMITTED_EDGE_TYPES = new Set<string>(GRAPH_EDGE_TYPES)'), 'admitted set derived from GRAPH_EDGE_TYPES')
  assert(s.includes('ADMITTED_EDGE_TYPES.has(raw.edge_type)') && s.includes('heldByNode'), 'unadmitted edge types are HELD (flagged), not promoted')
  assert(s.includes('heldEdgeTypes'), 'clusters surface held edge types')
}

section('clusters — connected components; stable id = hash of sorted node ids; ≥1 pool endpoint')
{
  const s = read(MOD)
  assert(s.includes("createHash('sha1').update([...nodeIds].sort().join('|'))"), 'stable cluster id = deterministic hash of sorted node ids')
  assert(s.includes("from.kind !== 'pool' && to.kind !== 'pool') continue"), 'edge requires ≥1 pool (eligible) endpoint')
}

section('caps — WAVE_MAX refuse (never truncate); one cluster per promote; preview-first')
{
  const s = read(MOD)
  assert(s.includes('WAVE_MAX = 20'), 'WAVE_MAX hard cap (≤20)')
  assert(s.includes('cluster.overCap') && s.includes("mode: 'refused'"), 'refuses over cap (no truncation)')
  assert(s.includes("if (!opts.confirm) return { mode: 'preview'"), 'preview-first (no write without confirm)')
  assert(s.includes('discoverEligibleClusters()).find((c) => c.id === clusterId)'), 'promote re-discovers ⇒ fresh dedup + single cluster only')
}

section('writes — node-first then edge; pending_review + prompt_eligible false; no approved_graph write')
{
  const s = read(MOD)
  const nodeIdx = s.indexOf('// NODE-first'); const edgeIdx = s.indexOf('// then EDGES')
  assert(nodeIdx >= 0 && edgeIdx > nodeIdx, 'nodes created before edges')
  assert(s.includes("proposalType: 'node'") && s.includes("proposalType: 'edge'"), 'creates node + edge proposals')
  const code = stripComments(s)
  const reads = code
    .replace(/\.in\('status',\s*\[[^\]]*\]\)/g, '')
    .replace(/\.eq\('status',\s*'approved_graph'\)/g, '')
    .replace(/===\s*'approved_graph'/g, '') // status read-comparison, not a write
  assert(!reads.includes('approved_graph'), 'never writes approved_graph (only read filters reference it)')
  assert(!code.includes('prompt_eligible'), 'never sets prompt_eligible (createProposal default false)')
  assert(code.includes('createProposal('), 'writes only through the shared createProposal primitive')
}

section('scope + per-endpoint scope in edge payload')
{
  const s = read(MOD)
  assert(s.includes("if (archiveName === 'violet') return 'eli'") && s.includes("if (archiveName === 'velvet') return 'ari'"), 'archive→scope remap')
  assert(s.includes("if (a === b && (a === 'ari' || a === 'eli')) return a") && s.includes("return 'shared'"), 'cross-presence relationship scope = shared')
  assert(s.includes('presenceScope: ed.from.scope') && s.includes('presenceScope: ed.to.scope'), 'per-endpoint scope in edge payload')
}

section('provenance — archive_graph_node/edge + source_item_ids + legacy_system')
{
  const s = read(MOD)
  assert(s.includes("primarySourceType: 'archive_graph_node'") && s.includes("primarySourceType: 'archive_graph_edge'"), 'provenance = archive_graph_node/edge')
  assert(s.includes("legacy_system: 'phase_29B'") && s.includes('source_item_ids: ed.sourceItemIds'), 'legacy tag + source_item_ids (trace to archive)')
}

section('CLI — --list / --cluster / --confirm; preview writes nothing')
{
  const c = read(CLI)
  assert(c.includes("has('list')") && c.includes("arg('cluster')") && c.includes("has('confirm')"), 'CLI supports --list / --cluster / --confirm')
  assert(c.includes('discoverEligibleClusters()') && c.includes('promoteCluster('), 'CLI uses the engine')
}

section('boundaries — no archive_graph write / no 51 / no relational-map / no new engine / no migration')
{
  // strip the crypto SHA1 hash (createHash(...).update(...).digest) so its .update() isn't read as a DB write
  const code = stripComments(read(MOD)).replace(/createHash[\s\S]*?\.digest\([^)]*\)/g, '')
  for (const bad of ['agent_graph_proposals', '.update(', '.upsert(', '.delete(', 'relational-map', 'canonical_status', 'held_truths', 'eligible_for_graph', 'eligible_for_recall']) {
    assert(!code.includes(bad), `${MOD}: no ${bad} in executable code`)
  }
  assert(!code.includes("from('archive_graph_nodes').insert") && !code.includes("from('archive_graph_edges').insert"), 'archive_graph is read-only')
  const migs = fs.readdirSync('supabase-migrations')
  assert(!migs.some((f) => /09[4-9]|1\d\d/.test(f) && /map.?growth|extend/i.test(f)), 'no migration added for Map Growth Queue')
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
