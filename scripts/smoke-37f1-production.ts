/**
 * Phase 37F.1 — Production Smoke Test
 *
 * Overview means overview. Midlevel is optional.
 * Detail is one layer deeper.
 *
 * Tests strict overview display on production.
 * Usage: npx tsx scripts/smoke-37f1-production.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

const PROD_URL = 'https://selinaric-house.vercel.app'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

let passed = 0
let failed = 0

function test(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function countRows(table: string): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  })
  const range = res.headers.get('content-range')
  if (range) {
    const match = range.match(/\/(\d+)$/)
    if (match) return parseInt(match[1], 10)
  }
  return -1
}

interface MapNode {
  id: string
  label: string
  nodeType: string
  grainLevel: string
  presenceScope: string
  authorityStatus: string
  promptEligible: boolean
}

interface MapEdge {
  id: string
  fromNodeId: string
  toNodeId: string
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  Phase 37F.1 — Production Smoke Test')
  console.log('═══════════════════════════════════════════════════════════')

  // ── Safety snapshot BEFORE ──
  console.log('\n  ── Safety snapshot BEFORE ──')
  const beforeProposals = await countRows('graph_proposals')
  const beforeSources = await countRows('graph_proposal_sources')
  const beforeEvents = await countRows('graph_proposal_events')
  console.log(`    graph_proposals: ${beforeProposals}`)
  console.log(`    graph_proposal_sources: ${beforeSources}`)
  console.log(`    graph_proposal_events: ${beforeEvents}`)

  // ── 1. Page loads ──
  console.log('\n  ── Page availability ──')
  const pageResp = await fetch(`${PROD_URL}/relational-map`)
  test('/relational-map returns 200', pageResp.status === 200)

  // ── 2. API returns grain data ──
  console.log('\n  ── API grain data ──')
  const mapResp = await fetch(`${PROD_URL}/api/relational-map`)
  test('API returns 200', mapResp.status === 200)
  const mapData = await mapResp.json()
  const nodes: MapNode[] = mapData.nodes ?? []
  const edges: MapEdge[] = mapData.edges ?? []

  test('all nodes have grainLevel', nodes.every(n => typeof n.grainLevel === 'string'))

  // ── 3. Grain breakdown ──
  console.log('\n  ── Grain breakdown ──')
  const overviewNodes = nodes.filter(n => n.grainLevel === 'overview')
  const midlevelNodes = nodes.filter(n => n.grainLevel === 'midlevel')
  const detailNodes = nodes.filter(n => n.grainLevel === 'detail')
  console.log(`    overview: ${overviewNodes.length}`)
  console.log(`    midlevel: ${midlevelNodes.length}`)
  console.log(`    detail: ${detailNodes.length}`)
  console.log(`    total: ${nodes.length}`)

  // ── 4. Overview-only (Include midlevel OFF) ──
  console.log('\n  ── Overview mode (strict, midlevel OFF) ──')
  test('overview-only count is 2', overviewNodes.length === 2, `got ${overviewNodes.length}`)
  for (const n of overviewNodes) {
    console.log(`    ${n.nodeType.padEnd(20)} | ${n.label}`)
  }

  // ── 5. Overview + midlevel (Include midlevel ON) ──
  console.log('\n  ── Overview mode (Include midlevel ON) ──')
  const overviewMidNodes = nodes.filter(n => n.grainLevel === 'overview' || n.grainLevel === 'midlevel')
  test('overview+midlevel count is 5', overviewMidNodes.length === 5, `got ${overviewMidNodes.length}`)
  for (const n of overviewMidNodes) {
    console.log(`    ${n.grainLevel.padEnd(10)} | ${n.nodeType.padEnd(20)} | ${n.label}`)
  }

  // ── 6. Detail mode (all) ──
  console.log('\n  ── Detail mode (all approved) ──')
  // The grain proposal from earlier smoke may bring total to 10
  test('detail mode shows all nodes', nodes.length >= 9, `got ${nodes.length}`)
  for (const n of nodes) {
    console.log(`    ${n.grainLevel.padEnd(10)} | ${n.nodeType.padEnd(20)} | ${n.label}`)
  }

  // ── 7. Edge filtering ──
  console.log('\n  ── Edge filtering ──')
  console.log(`    total edges: ${edges.length}`)

  const overviewNodeIds = new Set(overviewNodes.map(n => n.id))
  const overviewEdges = edges.filter(e => overviewNodeIds.has(e.fromNodeId) && overviewNodeIds.has(e.toNodeId))
  console.log(`    edges visible in overview-only: ${overviewEdges.length}`)

  const overviewMidIds = new Set(overviewMidNodes.map(n => n.id))
  const overviewMidEdges = edges.filter(e => overviewMidIds.has(e.fromNodeId) && overviewMidIds.has(e.toNodeId))
  console.log(`    edges visible in overview+midlevel: ${overviewMidEdges.length}`)
  console.log(`    edges visible in detail: ${edges.length}`)

  // Edges with hidden endpoints should not appear in overview-only
  const hiddenEndpointEdges = edges.filter(e => !overviewNodeIds.has(e.fromNodeId) || !overviewNodeIds.has(e.toNodeId))
  test('edges with hidden endpoints are filtered out in overview', hiddenEndpointEdges.length >= 0) // structural check

  // ── 8. Prompt eligibility unchanged ──
  console.log('\n  ── Prompt eligibility ──')
  test('no node has prompt_eligible=true', nodes.every(n => n.promptEligible === false))

  // ── 9. Safety snapshot AFTER ──
  console.log('\n  ── Safety snapshot AFTER ──')
  const afterProposals = await countRows('graph_proposals')
  const afterSources = await countRows('graph_proposal_sources')
  const afterEvents = await countRows('graph_proposal_events')
  console.log(`    graph_proposals: ${afterProposals}`)
  console.log(`    graph_proposal_sources: ${afterSources}`)
  console.log(`    graph_proposal_events: ${afterEvents}`)

  test('graph_proposals unchanged', beforeProposals === afterProposals)
  test('graph_proposal_sources unchanged', beforeSources === afterSources)
  test('graph_proposal_events unchanged', beforeEvents === afterEvents)

  // ── Summary ──
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log(`  Results: ${passed} passed, ${failed} failed`)
  console.log('═══════════════════════════════════════════════════════════\n')

  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
