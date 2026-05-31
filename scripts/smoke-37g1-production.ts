/**
 * Phase 37G.1 — Production Smoke Test
 *
 * Tests suggest_node and suggest_edge endpoints.
 * Usage: npx tsx scripts/smoke-37g1-production.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

const PROD = 'https://selinaric-house.vercel.app'
const DB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const DB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const DB_H = { apikey: DB_KEY, Authorization: `Bearer ${DB_KEY}` }

let pass = 0, fail = 0

function test(name: string, ok: boolean, detail?: string) {
  if (ok) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

async function countRows(table: string): Promise<number> {
  const res = await fetch(`${DB_URL}/rest/v1/${table}?select=id`, {
    headers: { ...DB_H, Prefer: 'count=exact', Range: '0-0' },
  })
  const m = res.headers.get('content-range')?.match(/\/(\d+)$/)
  return m ? parseInt(m[1]) : -1
}

async function post(path: string, body: unknown) {
  return fetch(`${PROD}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function waitForDeploy() {
  console.log('Waiting for Vercel deploy...')
  for (let i = 0; i < 18; i++) {
    const r = await post('/api/graph-edit-proposals', {})
    if (r.status !== 404) { console.log('Deploy detected.\n'); return }
    await new Promise(r => setTimeout(r, 10000))
  }
  console.log('Deploy timeout — proceeding anyway')
}

async function main() {
  console.log('═══════════════════════════════════════')
  console.log('  Phase 37G.1 — Production Smoke Test')
  console.log('═══════════════════════════════════════')

  await waitForDeploy()

  const b1 = await countRows('graph_proposals')
  const b2 = await countRows('graph_proposal_sources')
  const b3 = await countRows('graph_proposal_events')
  console.log(`Before: proposals=${b1} sources=${b2} events=${b3}\n`)

  // 1. Reject deferred action
  const r1 = await post('/api/graph-edit-proposals', { edit_action_type: 'suggest_merge', label: 'X' })
  test('rejects deferred action (400)', r1.status === 400)

  // 2. Reject invalid payload
  const r2 = await post('/api/graph-edit-proposals', { edit_action_type: 'suggest_node', label: '', node_type: 'concept', presence_scope: 'house', grain_level: 'overview', aliases: [], canonical_label: '' })
  test('rejects empty label (400)', r2.status === 400)

  // 3. suggest_node — valid
  const r3 = await post('/api/graph-edit-proposals', {
    edit_action_type: 'suggest_node',
    label: 'Test Graph Concept 37G1',
    node_type: 'concept',
    presence_scope: 'house',
    grain_level: 'overview',
    aliases: [],
    canonical_label: 'Test Graph Concept 37G1',
    rationale: 'Production smoke test — 37G.1',
    selected_context: { mode: 'overview', include_midlevel: false, workspace_id: null },
  })
  const d3 = await r3.json()
  test('suggest_node returns 201', r3.status === 201, `got ${r3.status}`)
  const nodeId = d3.proposalId
  test('suggest_node returns proposalId', typeof nodeId === 'string')

  // 4. Duplicate node blocked
  const r4 = await post('/api/graph-edit-proposals', {
    edit_action_type: 'suggest_node',
    label: 'Test Graph Concept 37G1',
    node_type: 'concept',
    presence_scope: 'house',
    grain_level: 'overview',
    aliases: [],
    canonical_label: 'Test Graph Concept 37G1',
    rationale: 'duplicate attempt',
  })
  test('duplicate node blocked (409)', r4.status === 409)

  // 5. Invalid node_type rejected
  const r5 = await post('/api/graph-edit-proposals', {
    edit_action_type: 'suggest_node',
    label: 'BadType',
    node_type: 'invalid_type_xyz',
    presence_scope: 'house',
    grain_level: 'overview',
    aliases: [],
    canonical_label: 'BadType',
    rationale: 'test',
  })
  test('invalid node_type rejected (400)', r5.status === 400)

  // 6. suggest_edge — valid (Ari → The Lounge, both approved_graph)
  const r6 = await post('/api/graph-edit-proposals', {
    edit_action_type: 'suggest_edge',
    from: { label: 'Ari', nodeType: 'presence', presenceScope: 'ari', runtimeKey: 'node:ari:presence:ari' },
    to: { label: 'The Lounge', nodeType: 'room', presenceScope: 'shared', runtimeKey: 'node:shared:room:the lounge' },
    edge_type: 'relates_to',
    edge_grain: 'overview',
    canonical_label: 'Ari relates to The Lounge',
    grain_level: 'overview',
    rationale: 'Production smoke test edge — 37G.1',
    selected_context: { mode: 'overview', include_midlevel: false, workspace_id: null },
  })
  const d6 = await r6.json()
  test('suggest_edge returns 201', r6.status === 201, `got ${r6.status}`)
  const edgeId = d6.proposalId
  test('suggest_edge returns proposalId', typeof edgeId === 'string')

  // 7. Duplicate edge blocked
  const r7 = await post('/api/graph-edit-proposals', {
    edit_action_type: 'suggest_edge',
    from: { label: 'Ari', nodeType: 'presence', presenceScope: 'ari', runtimeKey: 'node:ari:presence:ari' },
    to: { label: 'The Lounge', nodeType: 'room', presenceScope: 'shared', runtimeKey: 'node:shared:room:the lounge' },
    edge_type: 'relates_to',
    canonical_label: 'Ari relates to The Lounge',
    grain_level: 'overview',
    rationale: 'duplicate edge attempt',
  })
  test('duplicate edge blocked (409)', r7.status === 409)

  // 8. Non-approved endpoint rejected
  const r8 = await post('/api/graph-edit-proposals', {
    edit_action_type: 'suggest_edge',
    from: { label: 'Nonexistent Node XYZ99', nodeType: 'concept', presenceScope: 'shared', runtimeKey: 'node:shared:concept:nonexistent node xyz99' },
    to: { label: 'Selinaric House', nodeType: 'project', presenceScope: 'house', runtimeKey: 'node:house:project:selinaric house' },
    edge_type: 'belongs_to',
    canonical_label: 'Nonexistent belongs to House',
    grain_level: 'overview',
    rationale: 'test',
  })
  test('non-approved endpoint rejected (422)', r8.status === 422)

  // 9. Missing presenceScope rejected
  const r9 = await post('/api/graph-edit-proposals', {
    edit_action_type: 'suggest_edge',
    from: { label: 'Ari', nodeType: 'presence', runtimeKey: 'node:ari:presence:ari' },
    to: { label: 'The Lounge', nodeType: 'room', presenceScope: 'shared', runtimeKey: 'node:shared:room:the lounge' },
    edge_type: 'relates_to',
    canonical_label: 'Ari relates to The Lounge 2',
    grain_level: 'overview',
    rationale: 'test',
  })
  test('missing presenceScope rejected (400)', r9.status === 400)

  // 10. Verify DB records for created proposals
  if (nodeId && edgeId) {
    console.log('\n  ── DB verification ──')
    const rows = await fetch(`${DB_URL}/rest/v1/graph_proposals?id=in.(${nodeId},${edgeId})&select=id,proposed_label,status,prompt_eligible,proposed_by,generation_version,proposed_payload`, { headers: DB_H }).then(r => r.json())
    for (const p of rows) {
      test(`${p.proposed_label}: pending_review`, p.status === 'pending_review')
      test(`${p.proposed_label}: prompt_eligible=false`, p.prompt_eligible === false)
      test(`${p.proposed_label}: proposed_by=tara`, p.proposed_by === 'tara')
      test(`${p.proposed_label}: generation_version=37G.1`, p.generation_version === '37G.1')
      const ea = p.proposed_payload?.edit_action_type
      test(`${p.proposed_label}: edit_action_type in payload`, typeof ea === 'string')
    }

    const srcs = await fetch(`${DB_URL}/rest/v1/graph_proposal_sources?proposal_id=in.(${nodeId},${edgeId})&select=proposal_id,source_type,source_id`, { headers: DB_H }).then(r => r.json())
    test('2 source rows created', srcs.length === 2)
    test('all source rows are map_ui', srcs.every((s: {source_type: string}) => s.source_type === 'map_ui'))

    const evts = await fetch(`${DB_URL}/rest/v1/graph_proposal_events?proposal_id=in.(${nodeId},${edgeId})&select=proposal_id,event_type,actor`, { headers: DB_H }).then(r => r.json())
    test('2 event rows created', evts.length === 2)
    test('all events: proposal_created', evts.every((e: {event_type: string}) => e.event_type === 'proposal_created'))
    test('all event actors: tara', evts.every((e: {actor: string}) => e.actor === 'tara'))
  }

  // 11. DB delta
  const a1 = await countRows('graph_proposals')
  const a2 = await countRows('graph_proposal_sources')
  const a3 = await countRows('graph_proposal_events')
  console.log(`\nAfter: proposals=${a1} (+${a1-b1}) sources=${a2} (+${a2-b2}) events=${a3} (+${a3-b3})`)
  test('+2 proposals', a1 - b1 === 2)
  test('+2 sources', a2 - b2 === 2)
  test('+2 events', a3 - b3 === 2)

  console.log('\n═══════════════════════════════════════')
  console.log(`  37G.1 Smoke: ${pass} passed, ${fail} failed`)
  console.log('═══════════════════════════════════════\n')
  if (fail > 0) process.exit(1)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
