/**
 * Phase 43 Option C — Unified Graph Review surface (static guards).
 *
 * The Ontology Lab (map lane) now also SHOWS the kernel lane read-only, labelled
 * "not on the map yet / structural suggestions / triage only". Proves the surface is
 * additive and read-only: no new write path, Ontology Lab approval unchanged, agent lane
 * read-only/triage-only, no new API route. Live behaviour (both lanes render, 51 labelled,
 * no approve control on the kernel lane) is the authed browser smoke in the ship report.
 *
 * Run: npx tsx src/lib/agents/__tests__/phase-43-graph-review-surface.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }
// strip // line-comments and /* */ block-comments (incl JSX {/* */}) so that a file's own
// explanatory prose ("no approve, no promote") never trips an executable-code scan.
function stripComments(s: string): string { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '') }

const PAGE = 'src/app/(house)/ontology-lab/page.tsx'
const PANEL = 'src/components/graph/AgentGraphSuggestionsPanel.tsx'

section('page fetches BOTH lanes via the existing GET routes')
{
  const s = read(PAGE)
  assert(s.includes("fetch(`/api/graph-proposals?"), `${PAGE}: map lane still fetched (GET /api/graph-proposals)`)
  assert(s.includes("fetch('/api/agents/graph-proposals')"), `${PAGE}: kernel lane fetched (GET /api/agents/graph-proposals)`)
  assert(s.includes('AgentGraphSuggestionsPanel'), `${PAGE}: kernel panel rendered`)
}

section('P1 — the kernel panel has NO write/mutation path')
{
  const s = read(PANEL)
  for (const tok of ["method: 'POST'", "method: 'PATCH'", "method: 'PUT'", "method: 'DELETE'", '.rpc(', 'bulk-status', 'review-state', 'fetch(']) {
    assert(!s.includes(tok), `${PANEL}: panel contains no ${tok} (read-only by construction)`)
  }
  // the only navigation it offers is a link to /agents for triage
  assert(s.includes('href="/agents"'), `${PANEL}: links to /agents for triage`)
}

section('P2 — Ontology Lab approval path unchanged (map lane untouched)')
{
  const s = read(PAGE)
  assert(s.includes("fetch('/api/graph-proposals/bulk-status'"), `${PAGE}: map-lane approve endpoint unchanged`)
  assert(s.includes('handleBulkAction') && s.includes('GraphProposalBulkToolbar'), `${PAGE}: map-lane approve wiring intact`)
  assert(s.includes('GraphProposalInspector') && s.includes('GraphProposalTable'), `${PAGE}: map-lane table + inspector intact`)
}

section('P3 — kernel lane is read-only / triage-only + carries the required labels')
{
  const s = read(PAGE)
  // page only GETs the agent endpoint — never POST/PATCH/DELETE to it
  assert(!/agents\/graph-proposals'[^)]*method:\s*'(POST|PATCH|PUT|DELETE)'/.test(s.replace(/\s+/g, ' ')), `${PAGE}: no mutating call to the agent endpoint`)
  const p = read(PANEL)
  assert(p.includes('not on the map yet') && p.includes('structural suggestions') && p.includes('triage only'), `${PANEL}: required labels present`)
}

section('P3b — provenance fields shown on the kernel lane')
{
  const p = read(PANEL)
  assert(p.includes('s.edge_type'), `${PANEL}: shows relation (edge_type)`)
  assert(p.includes('nodeLabels[s.from_node_id]') && p.includes('nodeLabels[s.to_node_id]'), `${PANEL}: shows from→to node labels`)
  assert(p.includes('s.rule_id') && p.includes('s.review_state'), `${PANEL}: shows rule_id + review_state`)
  assert(p.includes('source_item_ids?.length') && p.includes('archive source'), `${PANEL}: shows archive source count (provenance)`)
}

section('P4 — kernel lane never writes archive_graph / graph_proposals / agent triage')
{
  // Neither file may write graph truth or trigger agent triage from the kernel lane.
  for (const rel of [PAGE, PANEL]) {
    const s = read(rel)
    for (const tok of ['agent_graph_proposal_record', 'agent_graph_proposal_set_review_state', "from('archive_graph"]) {
      assert(!s.includes(tok), `${rel}: no ${tok} (kernel lane cannot write graph truth)`)
    }
  }
  // The PANEL (kernel lane) has no approve/apply/promote in executable code (comments stripped).
  const panelCode = stripComments(read(PANEL))
  for (const tok of ['approve', 'apply', 'promote']) {
    assert(!panelCode.includes(tok), `${PANEL}: kernel-lane panel has no ${tok} control (read-only)`)
  }
  // The PAGE legitimately approves the MAP lane (that is the point) — but it must NOT mutate the
  // AGENT endpoint. The only POST in the page is the pre-existing map-lane bulk-status.
  const pageCode = stripComments(read(PAGE))
  const posts = (pageCode.match(/method:\s*'(POST|PATCH|PUT|DELETE)'/g) ?? []).length
  assert(posts === 1, `${PAGE}: exactly one mutating call (the pre-existing map-lane bulk-status), none added`)
  assert(!/agents\/graph-proposals'[^)]*method:/.test(pageCode.replace(/\s+/g, ' ')), `${PAGE}: no mutating call targets the agent endpoint`)
}

section('P5 — deny-list untouched by this change')
{
  // The PANEL is new code — it must carry ZERO deny-list references.
  const panel = stripComments(read(PANEL))
  for (const tok of ['canonical_status', 'prompt_eligible', 'held_truths', 'eligible_for_graph', 'eligible_for_recall']) {
    assert(!panel.includes(tok), `${PANEL}: no reference to ${tok}`)
  }
  // The PAGE must not gain any deny-list reference from this change. canonical_status / held_truths /
  // eligible_* were never present and are not added. prompt_eligible is PRE-EXISTING display-only on
  // the map-lane Proposal type (page:37, always false per graph law) — assert it stays a single
  // display field and nothing new touches it.
  const page = stripComments(read(PAGE))
  for (const tok of ['canonical_status', 'held_truths', 'eligible_for_graph', 'eligible_for_recall']) {
    assert(!page.includes(tok), `${PAGE}: no reference to ${tok}`)
  }
  assert((page.match(/prompt_eligible/g) ?? []).length === 1, `${PAGE}: prompt_eligible remains the single pre-existing display field (not newly written)`)
}

section('no new API route created (surface reuses existing GETs)')
{
  // the only agents/graph-proposals routes are the pre-existing ones (route + review-state)
  const dir = 'src/app/api/agents/graph-proposals'
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  assert(entries.includes('route.ts') && entries.includes('[id]') && entries.includes('review-state'), 'agent GET route + triage routes exist (pre-existing)')
  // no new route file was added under a "graph-review" surface
  assert(!fs.existsSync('src/app/api/graph-review'), 'no new /api/graph-review route created')
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
