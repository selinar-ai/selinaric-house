// Phase 37D — Relational Map Tests
//
// Tests the graph transform, API route safety, authority boundary,
// and read-only enforcement.
//
// Usage: npx tsx src/lib/graph/__tests__/relationalMap.test.ts

import { buildRelationalMap } from '../buildRelationalMap'
import { makeNodeKey, normalizeGraphLabel, getNodeColours } from '../graphDisplayUtils'
import type { GraphProposal, GraphProposalSource } from '../proposals'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ─── Test harness ──────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  ✗ ${label}`)
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`)
}

// ─── Helper: strip comments from file content ─────────────────────────────

function stripComments(content: string): string {
  return content
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

// ─── Helper: make test proposal ────────────────────────────────────────────

function makeNodeProposal(overrides: Partial<GraphProposal> = {}): GraphProposal {
  return {
    id: 'test-node-1',
    proposal_type: 'node',
    status: 'approved_graph',
    presence_scope: 'shared',
    authority_status: 'candidate',
    node_type: 'concept',
    edge_type: null,
    proposed_label: 'Test Concept',
    proposed_summary: 'A test concept for testing.',
    proposed_payload: {
      nodeType: 'concept',
      label: 'Test Concept',
      summary: 'A test concept.',
      suggestedAuthorityStatus: 'candidate',
      suggestedPresenceScope: 'shared',
    },
    confidence: 0.8,
    salience: 0.7,
    reason: 'Test proposal',
    safe_wording: 'May be a concept.',
    prompt_eligible: false,
    primary_source_type: 'archive_item',
    primary_source_id: 'source-1',
    dedupe_key: 'node:archive_item:source-1:shared:test concept',
    proposed_by: 'graph_pipeline',
    generation_model: null,
    generation_version: '37D-test',
    deleted_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as GraphProposal
}

function makeEdgeProposal(overrides: Partial<GraphProposal> = {}): GraphProposal {
  return {
    id: 'test-edge-1',
    proposal_type: 'edge',
    status: 'approved_graph',
    presence_scope: 'shared',
    authority_status: 'archive_supported',
    node_type: null,
    edge_type: 'deepens',
    proposed_label: 'A deepens B',
    proposed_summary: 'A deepens B.',
    proposed_payload: {
      edgeType: 'deepens',
      from: { label: 'Node A', nodeType: 'concept' },
      to: { label: 'Node B', nodeType: 'ritual' },
      summary: 'A deepens B.',
      directionRequired: true,
      suggestedAuthorityStatus: 'archive_supported',
      suggestedPresenceScope: 'shared',
    },
    confidence: 0.6,
    salience: 0.5,
    reason: 'Test edge',
    safe_wording: 'May deepen.',
    prompt_eligible: false,
    primary_source_type: 'archive_item',
    primary_source_id: 'source-2',
    dedupe_key: 'edge:archive_item:source-2:shared:deepens:node a:node b',
    proposed_by: 'graph_pipeline',
    generation_model: null,
    generation_version: '37D-test',
    deleted_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as GraphProposal
}

// ═══════════════════════════════════════════════════════════════════════════
// Graph Transform Tests
// ═══════════════════════════════════════════════════════════════════════════

section('Node proposal becomes runtime node')
{
  const result = buildRelationalMap({
    proposals: [makeNodeProposal()],
    sources: [],
    events: [],
  })
  assert(result.nodes.length === 1, 'One node created')
  assert(result.nodes[0].label === 'Test Concept', 'Node label correct')
  assert(result.nodes[0].nodeType === 'concept', 'Node type correct')
  assert(result.nodes[0].presenceScope === 'shared', 'Node scope correct')
  assert(result.nodes[0].derivedFromEdge === false, 'Not derived from edge')
  assert(result.nodes[0].promptEligible === false, 'prompt_eligible is false')
  assert(result.edges.length === 0, 'No edges')
  assert(result.diagnostics.skippedProposals === 0, 'No skipped proposals')
}

section('Edge proposal becomes runtime edge + implied nodes')
{
  const result = buildRelationalMap({
    proposals: [makeEdgeProposal()],
    sources: [],
    events: [],
  })
  assert(result.edges.length === 1, 'One edge created')
  assert(result.edges[0].edgeType === 'deepens', 'Edge type correct')
  assert(result.edges[0].fromNodeId !== result.edges[0].toNodeId, 'Different from/to')
  assert(result.nodes.length === 2, 'Two implied nodes created')

  const fromNode = result.nodes.find(n => n.id === result.edges[0].fromNodeId)
  const toNode = result.nodes.find(n => n.id === result.edges[0].toNodeId)
  assert(fromNode !== undefined, 'From node exists')
  assert(toNode !== undefined, 'To node exists')
  assert(fromNode?.derivedFromEdge === true, 'From node is derived from edge')
  assert(toNode?.derivedFromEdge === true, 'To node is derived from edge')
}

section('Matching node proposals merge with edge endpoint nodes')
{
  const nodeP = makeNodeProposal({
    id: 'node-a',
    proposed_label: 'Node A',
    node_type: 'concept',
    presence_scope: 'shared',
  })
  const edgeP = makeEdgeProposal({
    id: 'edge-ab',
    proposed_payload: {
      edgeType: 'deepens',
      from: { label: 'Node A', nodeType: 'concept' },
      to: { label: 'Node B', nodeType: 'ritual' },
    },
  })

  const result = buildRelationalMap({
    proposals: [nodeP, edgeP],
    sources: [],
    events: [],
  })

  // Node A should exist once (merged), Node B implied
  const nodeAKey = makeNodeKey('shared', 'concept', 'Node A')
  const nodeAInstances = result.nodes.filter(n => n.id === nodeAKey)
  assert(nodeAInstances.length === 1, 'Node A merged into one node')
  assert(nodeAInstances[0].derivedFromEdge === false, 'Merged node is NOT derived (has node proposal)')
  assert(nodeAInstances[0].proposalIds.length === 2, 'Merged node has both proposal IDs')
}

section('Nodes do not merge across different scopes')
{
  const sharedNode = makeNodeProposal({
    id: 'shared-1',
    proposed_label: 'Same Label',
    presence_scope: 'shared',
    node_type: 'concept',
  })
  const ariNode = makeNodeProposal({
    id: 'ari-1',
    proposed_label: 'Same Label',
    presence_scope: 'ari',
    node_type: 'concept',
  })

  const result = buildRelationalMap({
    proposals: [sharedNode, ariNode],
    sources: [],
    events: [],
  })

  assert(result.nodes.length === 2, 'Two separate nodes (different scopes)')
  const scopes = new Set(result.nodes.map(n => n.presenceScope))
  assert(scopes.has('shared'), 'Has shared node')
  assert(scopes.has('ari'), 'Has ari node')
}

section('Missing edge endpoint payload is skipped with warning')
{
  const badEdge = makeEdgeProposal({
    id: 'bad-edge',
    proposed_payload: {
      edgeType: 'deepens',
      from: { label: '' },  // Missing label
      to: { label: 'Node B', nodeType: 'concept' },
    },
  })

  const result = buildRelationalMap({
    proposals: [badEdge],
    sources: [],
    events: [],
  })

  assert(result.edges.length === 0, 'Bad edge skipped')
  assert(result.diagnostics.skippedProposals === 1, 'Counted as skipped')
  assert(
    result.diagnostics.warnings.some(w => w.includes('missing proposed_payload')),
    'Warning about missing payload'
  )
}

section('Direction is preserved (from → to)')
{
  const edgeP = makeEdgeProposal({
    proposed_payload: {
      edgeType: 'deepens',
      from: { label: 'Source Node', nodeType: 'concept' },
      to: { label: 'Target Node', nodeType: 'ritual' },
      directionRequired: true,
    },
  })

  const result = buildRelationalMap({
    proposals: [edgeP],
    sources: [],
    events: [],
  })

  const edge = result.edges[0]
  const fromKey = makeNodeKey('shared', 'concept', 'Source Node')
  const toKey = makeNodeKey('shared', 'ritual', 'Target Node')
  assert(edge.fromNodeId === fromKey, 'From node is Source Node')
  assert(edge.toNodeId === toKey, 'To node is Target Node')
}

section('prompt_eligible remains unchanged/read-only')
{
  const result = buildRelationalMap({
    proposals: [
      makeNodeProposal({ prompt_eligible: false }),
      makeEdgeProposal({ prompt_eligible: false }),
    ],
    sources: [],
    events: [],
  })

  for (const node of result.nodes) {
    assert(node.promptEligible === false, `Node "${node.label}" promptEligible is false`)
  }
  for (const edge of result.edges) {
    assert(edge.promptEligible === false, `Edge "${edge.label}" promptEligible is false`)
  }
}

section('Non-approved proposals are skipped')
{
  const pending = makeNodeProposal({ id: 'p1', status: 'pending_review' as any })
  const rejected = makeNodeProposal({ id: 'p2', status: 'rejected' as any })
  const approved = makeNodeProposal({ id: 'p3', status: 'approved_graph' })

  const result = buildRelationalMap({
    proposals: [pending, rejected, approved],
    sources: [],
    events: [],
  })

  assert(result.nodes.length === 1, 'Only approved proposal rendered')
  assert(result.diagnostics.skippedProposals === 2, 'Two skipped')
}

section('Invalid ontology values are skipped with warning')
{
  const badNodeType = makeNodeProposal({ id: 'bad-nt', node_type: 'fake_type' as any })
  const badScope = makeNodeProposal({ id: 'bad-sc', presence_scope: 'invalid_scope' as any })
  const badAuthority = makeNodeProposal({ id: 'bad-auth', authority_status: 'fake_status' as any })

  const result = buildRelationalMap({
    proposals: [badNodeType, badScope, badAuthority],
    sources: [],
    events: [],
  })

  assert(result.nodes.length === 0, 'All invalid proposals skipped')
  assert(result.diagnostics.skippedProposals === 3, 'Three skipped')
  assert(result.diagnostics.warnings.length >= 3, 'Warnings generated for each')
}

section('edge_type DB column preferred over payload.edgeType')
{
  const edgeP = makeEdgeProposal({
    id: 'disagree-edge',
    edge_type: 'supports' as any,
    proposed_payload: {
      edgeType: 'deepens',  // Disagrees with DB column
      from: { label: 'X', nodeType: 'concept' },
      to: { label: 'Y', nodeType: 'concept' },
      directionRequired: true,
    },
  })

  const result = buildRelationalMap({
    proposals: [edgeP],
    sources: [],
    events: [],
  })

  assert(result.edges.length === 1, 'Edge created')
  assert(result.edges[0].edgeType === 'supports', 'DB edge_type used, not payload')
  assert(
    result.diagnostics.warnings.some(w => w.includes('disagrees')),
    'Warning about disagreement'
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Display Utility Tests
// ═══════════════════════════════════════════════════════════════════════════

section('Label normalization')
{
  assert(normalizeGraphLabel('  Hello  World  ') === 'hello world', 'Trims and collapses')
  assert(normalizeGraphLabel('UPPER') === 'upper', 'Lowercases')
  assert(normalizeGraphLabel('already normal') === 'already normal', 'Already normalized')
}

section('Node key generation')
{
  const key = makeNodeKey('shared', 'concept', 'Test Node')
  assert(key === 'node:shared:concept:test node', 'Key format correct')

  const key2 = makeNodeKey('ari', 'ritual', '  Spaced  Out  ')
  assert(key2 === 'node:ari:ritual:spaced out', 'Key normalizes label')
}

section('Node colours exist for known types')
{
  const types = ['person', 'concept', 'room', 'system', 'ritual', 'project', 'archive_item']
  for (const t of types) {
    const colours = getNodeColours(t)
    assert(colours.bg.startsWith('#'), `${t} has bg colour`)
    assert(colours.border.startsWith('#'), `${t} has border colour`)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// API Route Safety Tests
// ═══════════════════════════════════════════════════════════════════════════

section('API route safety — read-only')
{
  const routeFile = readFileSync(
    resolve(__dirname, '../../../app/api/relational-map/route.ts'),
    'utf-8'
  )
  const stripped = stripComments(routeFile)

  assert(stripped.includes('export async function GET'), 'Has GET handler')
  assert(!stripped.includes('export async function POST'), 'No POST handler')
  assert(!stripped.includes('export async function PATCH'), 'No PATCH handler')
  assert(!stripped.includes('export async function DELETE'), 'No DELETE handler')
  assert(!stripped.includes('export async function PUT'), 'No PUT handler')
}

section('API route — approved_graph only')
{
  const routeFile = readFileSync(
    resolve(__dirname, '../../../app/api/relational-map/route.ts'),
    'utf-8'
  )
  const stripped = stripComments(routeFile)

  assert(stripped.includes("'approved_graph'"), 'Filters to approved_graph')
}

section('API route — no database writes')
{
  const routeFile = readFileSync(
    resolve(__dirname, '../../../app/api/relational-map/route.ts'),
    'utf-8'
  )
  const stripped = stripComments(routeFile)

  assert(!stripped.includes('.insert('), 'No .insert() calls')
  assert(!stripped.includes('.update('), 'No .update() calls')
  assert(!stripped.includes('.delete('), 'No .delete() calls')
  assert(!stripped.includes('.upsert('), 'No .upsert() calls')
}

section('API route — no memory/archive references')
{
  const routeFile = readFileSync(
    resolve(__dirname, '../../../app/api/relational-map/route.ts'),
    'utf-8'
  )
  const stripped = stripComments(routeFile)

  assert(!stripped.includes('memory_nodes'), 'No memory_nodes reference')
  assert(!stripped.includes('memory_edges'), 'No memory_edges reference')
  assert(!stripped.includes('archive_graph_nodes'), 'No archive_graph_nodes reference')
  assert(!stripped.includes('archive_graph_edges'), 'No archive_graph_edges reference')
  assert(!stripped.includes('canonical_status'), 'No canonical_status reference')
}

// ═══════════════════════════════════════════════════════════════════════════
// Transform Library Safety Tests
// ═══════════════════════════════════════════════════════════════════════════

section('Transform library safety — no DB writes')
{
  const transformFile = readFileSync(
    resolve(__dirname, '../buildRelationalMap.ts'),
    'utf-8'
  )
  const stripped = stripComments(transformFile)

  assert(!stripped.includes('supabase'), 'No supabase import/usage')
  assert(!stripped.includes('.insert('), 'No .insert() calls')
  assert(!stripped.includes('.update('), 'No .update() calls')
  assert(!stripped.includes('.delete('), 'No .delete() calls')
  // Check for Supabase .from() — exclude Array.from() which is a JS built-in
  const supabaseFromCalls = (stripped.match(/\.from\(\s*'/g) ?? []).length
  assert(supabaseFromCalls === 0, 'No Supabase .from() calls (no DB access)')
}

section('Transform library — no prompt_eligible mutation')
{
  const transformFile = readFileSync(
    resolve(__dirname, '../buildRelationalMap.ts'),
    'utf-8'
  )
  const stripped = stripComments(transformFile)

  // Should reference prompt_eligible only as a read (passthrough)
  assert(!stripped.includes('prompt_eligible = true'), 'Never sets prompt_eligible = true')
  assert(!stripped.includes('promptEligible = true'), 'Never sets promptEligible = true')
  assert(!stripped.includes("promptEligible: true"), 'Never assigns promptEligible: true')
}

// ═══════════════════════════════════════════════════════════════════════════
// Authority Boundary Tests
// ═══════════════════════════════════════════════════════════════════════════

section('Authority boundary — no writes to any table')
{
  const files = [
    { path: resolve(__dirname, '../buildRelationalMap.ts'), label: 'buildRelationalMap' },
    { path: resolve(__dirname, '../graphDisplayUtils.ts'), label: 'graphDisplayUtils' },
    { path: resolve(__dirname, '../relationalMapTypes.ts'), label: 'relationalMapTypes' },
    { path: resolve(__dirname, '../../../app/api/relational-map/route.ts'), label: 'API route' },
  ]

  for (const { path, label } of files) {
    const content = readFileSync(path, 'utf-8')
    const stripped = stripComments(content)

    assert(!stripped.includes('.insert('), `${label}: no .insert()`)
    assert(!stripped.includes('.update('), `${label}: no .update()`)
    assert(!stripped.includes('.delete('), `${label}: no .delete()`)
    assert(!stripped.includes('.upsert('), `${label}: no .upsert()`)
  }
}

section('Authority boundary — no final graph table creation')
{
  const files = [
    resolve(__dirname, '../buildRelationalMap.ts'),
    resolve(__dirname, '../../../app/api/relational-map/route.ts'),
  ]

  for (const path of files) {
    const content = readFileSync(path, 'utf-8')
    const stripped = stripComments(content)

    assert(!stripped.includes("'graph_nodes'"), `No graph_nodes reference in ${path.split('/').pop()}`)
    assert(!stripped.includes("'graph_edges'"), `No graph_edges reference in ${path.split('/').pop()}`)
    assert(!stripped.includes("'relational_map_nodes'"), `No relational_map_nodes`)
    assert(!stripped.includes("'relational_map_edges'"), `No relational_map_edges`)
    assert(!stripped.includes("'graph_layouts'"), `No graph_layouts`)
    assert(!stripped.includes("'map_layouts'"), `No map_layouts`)
  }
}

section('Authority boundary — no Memory/Archive mutation')
{
  const routeFile = readFileSync(
    resolve(__dirname, '../../../app/api/relational-map/route.ts'),
    'utf-8'
  )
  const stripped = stripComments(routeFile)

  // Only reads from approved graph proposal tables
  const fromCalls = stripped.match(/\.from\(\s*'([^']+)'\s*\)/g) ?? []
  const tables = fromCalls.map(m => {
    const match = m.match(/'([^']+)'/)
    return match ? match[1] : ''
  }).filter(Boolean)

  const allowedTables = ['graph_proposals', 'graph_proposal_sources', 'graph_proposal_events']
  for (const table of tables) {
    assert(
      allowedTables.includes(table),
      `API route accesses only allowed table: "${table}"`
    )
  }
}

section('No prompt_eligible set to true in any 37D file')
{
  const files = [
    resolve(__dirname, '../buildRelationalMap.ts'),
    resolve(__dirname, '../graphDisplayUtils.ts'),
    resolve(__dirname, '../relationalMapTypes.ts'),
    resolve(__dirname, '../../../app/api/relational-map/route.ts'),
  ]

  for (const path of files) {
    const content = readFileSync(path, 'utf-8')
    const stripped = stripComments(content)
    const filename = path.split(/[/\\]/).pop()

    assert(
      !stripped.includes('prompt_eligible = true') && !stripped.includes('promptEligible = true'),
      `${filename}: never sets prompt_eligible to true`
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n══════════════════════════════════════')
console.log(`  Phase 37D Relational Map Tests: ${passed} passed, ${failed} failed`)
console.log('══════════════════════════════════════')

if (failed > 0) {
  console.error('\nFailed tests:')
  for (const f of failures) {
    console.error(`  ✗ ${f}`)
  }
  process.exit(1)
}
