/**
 * Phase 37E — Production Smoke Test
 *
 * Layout is not ontology. Position is not relationship.
 * Dragging does not mutate graph semantics.
 *
 * Tests workspace API on production after deployment.
 * Usage: npx tsx scripts/smoke-37e-production.ts
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

async function countRows(table: string, filter?: string): Promise<number> {
  const path = filter ? `${table}?${filter}&select=id` : `${table}?select=id`
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
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

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log('  Phase 37E — Production Smoke Test')
  console.log('═══════════════════════════════════════════════════════════')

  // ── 1. Page loads ──
  console.log('\n  ── Page availability ──')
  const pageResp = await fetch(`${PROD_URL}/relational-map`)
  test('/relational-map returns 200', pageResp.status === 200)

  // ── 2. Workspace API available ──
  console.log('\n  ── Workspace API ──')
  const listResp = await fetch(`${PROD_URL}/api/relational-map/workspaces?status=active`)
  test('GET /api/relational-map/workspaces returns 200', listResp.status === 200)
  const listBody = await listResp.json().catch(() => null)
  test('response has workspaces array', Array.isArray(listBody?.workspaces))

  // ── 3. Graph data API still works ──
  console.log('\n  ── Graph data API unchanged ──')
  const graphResp = await fetch(`${PROD_URL}/api/relational-map`)
  test('GET /api/relational-map returns 200', graphResp.status === 200)
  const graphBody = await graphResp.json().catch(() => null)
  test('response has nodes array', Array.isArray(graphBody?.nodes))
  test('response has edges array', Array.isArray(graphBody?.edges))
  test('response has diagnostics', typeof graphBody?.diagnostics === 'object')

  // ── 4. Safety snapshot BEFORE ──
  console.log('\n  ── Safety snapshot BEFORE ──')
  const beforeProposals = await countRows('graph_proposals')
  const beforeSources = await countRows('graph_proposal_sources')
  const beforeEvents = await countRows('graph_proposal_events')
  const beforePromptTrue = await countRows('graph_proposals', 'prompt_eligible=eq.true')
  console.log(`    graph_proposals: ${beforeProposals}`)
  console.log(`    graph_proposal_sources: ${beforeSources}`)
  console.log(`    graph_proposal_events: ${beforeEvents}`)
  console.log(`    prompt_eligible=true: ${beforePromptTrue}`)

  // ── 5. Create workspace via production API ──
  console.log('\n  ── Create workspace (production API) ──')
  const createResp = await fetch(`${PROD_URL}/api/relational-map/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '37E Production Smoke Test',
      workspaceScope: 'tara_workspace',
      layoutData: {
        version: 1,
        nodes: {
          'node:house:concept:smoke-test': { x: 100, y: 200, pinned: true },
        },
        clusters: [],
      },
    }),
  })
  const createBody = await createResp.json().catch(() => null)
  test('POST workspace returns 201', createResp.status === 201)
  const wsId = createBody?.workspace?.id
  test('workspace has id', typeof wsId === 'string' && wsId.length > 10)
  test('workspace name stored', createBody?.workspace?.name === '37E Production Smoke Test')

  if (!wsId) {
    console.log('\n  ✗ Cannot continue — workspace creation failed')
    console.log(`\n  Results: ${passed} passed, ${failed} failed\n`)
    process.exit(1)
  }

  // ── 6. Read workspace ──
  console.log('\n  ── Read workspace ──')
  const readResp = await fetch(`${PROD_URL}/api/relational-map/workspaces/${wsId}`)
  const readBody = await readResp.json().catch(() => null)
  test('GET workspace returns 200', readResp.status === 200)
  test('layout_data preserved', readBody?.workspace?.layoutData?.version === 1)
  test('node position preserved', readBody?.workspace?.layoutData?.nodes?.['node:house:concept:smoke-test']?.pinned === true)

  // ── 7. Update workspace ──
  console.log('\n  ── Update workspace ──')
  const updateResp = await fetch(`${PROD_URL}/api/relational-map/workspaces/${wsId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '37E Production Smoke (Updated)',
      layoutData: {
        version: 1,
        nodes: {
          'node:house:concept:smoke-test': { x: 150, y: 250, pinned: false },
          'node:ari:person:ari': { x: 300, y: 300, pinned: true },
        },
        clusters: [{
          id: 'cluster-smoke',
          label: 'Smoke Cluster',
          x: 50, y: 50, width: 400, height: 300,
          nodeKeys: ['node:house:concept:smoke-test'],
        }],
      },
    }),
  })
  const updateBody = await updateResp.json().catch(() => null)
  test('PATCH workspace returns 200', updateResp.status === 200)
  test('name updated', updateBody?.workspace?.name === '37E Production Smoke (Updated)')
  test('layout now has 2 nodes', Object.keys(updateBody?.workspace?.layoutData?.nodes ?? {}).length === 2)
  test('layout has 1 cluster', updateBody?.workspace?.layoutData?.clusters?.length === 1)

  // ── 8. Archive workspace ──
  console.log('\n  ── Archive workspace ──')
  const archiveResp = await fetch(`${PROD_URL}/api/relational-map/workspaces/${wsId}`, {
    method: 'DELETE',
  })
  const archiveBody = await archiveResp.json().catch(() => null)
  test('DELETE workspace returns 200', archiveResp.status === 200)
  test('archive response success', archiveBody?.success === true)

  // Verify archived
  const afterArchiveResp = await fetch(`${PROD_URL}/api/relational-map/workspaces/${wsId}`)
  const afterArchiveBody = await afterArchiveResp.json().catch(() => null)
  test('workspace status is now archived', afterArchiveBody?.workspace?.status === 'archived')

  // ── 9. Validation: rejected payloads ──
  console.log('\n  ── Validation rejects bad payloads ──')
  const badScopeResp = await fetch(`${PROD_URL}/api/relational-map/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Bad',
      workspaceScope: 'ari', // graph scope, not workspace scope
      layoutData: { version: 1, nodes: {}, clusters: [] },
    }),
  })
  test('rejects invalid workspace scope (400)', badScopeResp.status === 400)

  const badLayoutResp = await fetch(`${PROD_URL}/api/relational-map/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Bad Layout',
      workspaceScope: 'tara_workspace',
      layoutData: {
        version: 1,
        nodes: { 'Just A Label': { x: 0, y: 0, pinned: false } },
        clusters: [],
      },
    }),
  })
  test('rejects non-runtime node key (400)', badLayoutResp.status === 400)

  const semanticResp = await fetch(`${PROD_URL}/api/relational-map/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Semantic',
      workspaceScope: 'tara_workspace',
      layoutData: {
        version: 1,
        nodes: {},
        clusters: [],
        promptEligible: true,
      },
    }),
  })
  test('rejects semantic field in layout (400)', semanticResp.status === 400)

  // ── 10. Safety snapshot AFTER ──
  console.log('\n  ── Safety snapshot AFTER ──')
  const afterProposals = await countRows('graph_proposals')
  const afterSources = await countRows('graph_proposal_sources')
  const afterEvents = await countRows('graph_proposal_events')
  const afterPromptTrue = await countRows('graph_proposals', 'prompt_eligible=eq.true')
  console.log(`    graph_proposals: ${afterProposals}`)
  console.log(`    graph_proposal_sources: ${afterSources}`)
  console.log(`    graph_proposal_events: ${afterEvents}`)
  console.log(`    prompt_eligible=true: ${afterPromptTrue}`)

  test('graph_proposals unchanged', beforeProposals === afterProposals)
  test('graph_proposal_sources unchanged', beforeSources === afterSources)
  test('graph_proposal_events unchanged', beforeEvents === afterEvents)
  test('prompt_eligible=true unchanged', beforePromptTrue === afterPromptTrue)

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
