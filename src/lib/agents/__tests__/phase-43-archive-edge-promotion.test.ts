/**
 * Phase 43 Option A — curated archive_graph → map edge promotion (static guards).
 *
 * Proves the vocabulary expansion + the bounded, provenance-preserving, pending-only promotion.
 * The live behaviour (preview shows the 2 edges; confirmed run creates 2 pending_review with
 * provenance; Tara approves in the Ontology Lab) is the read-only preview + governed run in the
 * ship report.
 *
 * Run: npx tsx src/lib/agents/__tests__/phase-43-archive-edge-promotion.test.ts
 */

import * as fs from 'fs'
import { GRAPH_EDGE_TYPES } from '../../../lib/graph/types'
// NOTE: archiveEdgePromotion.ts is not imported here — it pulls in the supabase client at import
// time (needs env). This is a STATIC test; the module's constants are asserted by source scan.

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }
function stripComments(s: string): string { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '') }

const MOD = 'src/lib/graph/archiveEdgePromotion.ts'

section('Decision 1 — vocabulary expansion (shaped_by + precedes admitted)')
{
  assert((GRAPH_EDGE_TYPES as readonly string[]).includes('shaped_by'), 'GRAPH_EDGE_TYPES admits shaped_by')
  assert((GRAPH_EDGE_TYPES as readonly string[]).includes('precedes'), 'GRAPH_EDGE_TYPES admits precedes')
  // it is a TS const change (no DB migration) — assert no new migration file added for this
  const migs = fs.readdirSync('supabase-migrations')
  assert(!migs.some(f => /09[3-9]|1\d\d/.test(f) && f.includes('edge')), 'no edge-type migration added (open-text column)')
}

section('curated scope — allowlist of exactly the 5 coarse entities')
{
  const s = read(MOD)
  const m = s.match(/PROMOTION_ALLOWLIST[^=]*=\s*\[([^\]]*)\]/)
  const listed = (m?.[1] ?? '').match(/'([^']+)'/g)?.map(x => x.replace(/'/g, '')) ?? []
  assert(JSON.stringify([...listed].sort()) === JSON.stringify(['ari','eli','tara','the lounge','velvet archives']), 'PROMOTION_ALLOWLIST is exactly the 5 (normalized)')
}

section('edges only, pending_review only, prompt_eligible false, no approve')
{
  const s = read(MOD)
  assert(s.includes("proposalType: 'edge'"), `${MOD}: promotes edges only`)
  assert(!s.includes('proposalType: \'node\'') && !s.includes("proposalType: 'node'"), `${MOD}: never promotes nodes`)
  const code = stripComments(s)
  // 'approved_graph' legitimately appears ONLY in READ filters (approved map nodes; dedup vs
  // existing edges). The promotion never WRITES it — createProposal defaults to pending_review.
  const reads = code
    .replace(/\.eq\('status',\s*'approved_graph'\)/g, '')
    .replace(/\.in\('status',\s*\[[^\]]*\]\)/g, '')
  assert(!reads.includes('approved_graph'), `${MOD}: never writes approved_graph (only read filters reference it)`)
  assert(!code.includes('prompt_eligible'), `${MOD}: never sets prompt_eligible (createProposal default false)`)
}

section('scope rule — cross-presence → shared; per-endpoint scope carried')
{
  const s = read(MOD)
  assert(s.includes("if (a === b && (a === 'ari' || a === 'eli')) return a") && s.includes("return 'shared'"), `${MOD}: mixed/cross-presence relationship scope = shared`)
  // each endpoint keeps its OWN map-node scope so buildRelationalMap links to the real node
  assert(s.includes('presenceScope: c.from.scope') && s.includes('presenceScope: c.to.scope'), `${MOD}: per-endpoint scope in payload (links to real map nodes, not dupes)`)
}

section('coarse-grain + endpoint-exists + dedup guards')
{
  const s = read(MOD)
  assert(s.includes('PROMOTION_ALLOWLIST.includes(normFrom) || !PROMOTION_ALLOWLIST.includes(normTo)'), `${MOD}: BOTH endpoints must be allowlist entities (no fine concepts)`)
  assert(s.includes('if (!fromNode || !toNode) continue'), `${MOD}: both endpoints must resolve to existing map nodes (no node auto-creation)`)
  assert(s.includes('existingSig.has('), `${MOD}: dedup vs existing map proposals`)
  assert(s.includes("approval_status', 'approved'") || s.includes(".eq('approval_status', 'approved')"), `${MOD}: only APPROVED archive_graph edges are promotable`)
}

section('no-bulk — hard cap that refuses (never truncates)')
{
  const s = read(MOD)
  const capM = s.match(/MAX_PROMOTE\s*=\s*(\d+)/)
  const cap = capM ? Number(capM[1]) : NaN
  assert(cap > 0 && cap <= 5, `MAX_PROMOTE is a small cap (${cap})`)
  assert(s.includes('candidates.length > MAX_PROMOTE') && s.includes("mode: 'refused'"), `${MOD}: refuses when over cap (no silent truncation)`)
  assert(s.includes('if (!opts.confirm) return { mode: \'preview\''), `${MOD}: preview-first (no write without confirm)`)
}

section('provenance — archive_graph_edge + source_item_ids + legacy_system')
{
  const s = read(MOD)
  assert(s.includes("primarySourceType: 'archive_graph_edge'"), `${MOD}: primary source = archive_graph_edge`)
  assert(s.includes("sourceTable: 'archive_graph_edges'") && s.includes('primarySourceId: c.edgeId'), `${MOD}: provenance points at the archive_graph_edge`)
  assert(s.includes("legacy_system: 'phase_29B'") && s.includes('source_item_ids: c.sourceItemIds'), `${MOD}: carries source_item_ids + legacy tag (trace to archive)`)
}

section('display/meaning (Decision 3) — description carried; precedes framed as sequence')
{
  const s = read(MOD)
  assert(s.includes('c.description') && s.includes('summary'), `${MOD}: archive edge description carried into summary`)
  assert(s.includes('not an authority claim'), `${MOD}: framed as proposed relationship, not authority`)
  assert(s.includes('chronological/relational sequence, not superiority'), `${MOD}: precedes framed as sequence, not ranking`)
}

section('boundaries — no archive_graph write / no 51 / no relational-map / no new engine')
{
  const s = read(MOD)
  const code = stripComments(s) // exclude the header comment's own boundary prose
  for (const bad of ['agent_graph_proposals', 'agent_graph_proposal', '.update(', '.upsert(', '.delete(', 'relational-map', 'canonical_status', 'held_truths', 'eligible_for_graph', 'eligible_for_recall']) {
    assert(!code.includes(bad), `${MOD}: no ${bad} in executable code`)
  }
  // writes ONLY via createProposal (which targets graph_proposals/_sources/_events) — no raw archive_graph write
  assert(!s.includes("from('archive_graph_edges').insert") && !s.includes("from('archive_graph_edges').update"), `${MOD}: archive_graph is read-only here`)
  assert(s.includes('createProposal('), `${MOD}: writes only through the shared createProposal primitive`)
  // relational-map route untouched
  assert(!fs.existsSync('src/app/api/graph-review'), 'no new engine/route added')
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
