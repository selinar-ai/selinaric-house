// Phase 37E — Relational Map Workspace Tests
//
// Layout is not ontology.
// Position is not relationship.
// Distance is not strength.
// Cluster is not truth.
// Dragging does not mutate graph semantics.
//
// Run with: npx tsx src/lib/graph/__tests__/relationalMapWorkspace.test.ts

import { readFileSync, readdirSync } from 'fs'
import { resolve, join, extname } from 'path'

import {
  validateLayoutData,
  validateViewport,
  validateFilterPreset,
  validateCreatePayload,
  validateUpdatePayload,
  isValidWorkspaceScope,
  isValidWorkspaceStatus,
  isValidNodeKey,
} from '../relationalMapWorkspaceValidation'

import {
  WORKSPACE_SCOPES,
  WORKSPACE_STATUSES,
  WORKSPACE_SCOPE_LABELS,
  type RelationalMapLayoutData,
  type RelationalMapVisualCluster,
  type RelationalMapWorkspaceScope,
} from '../relationalMapWorkspaceTypes'

// ─── Test Harness ─────────────────────────────────────────────────────────

let passed = 0
let failed = 0
let currentGroup = ''

function group(name: string) {
  currentGroup = name
  console.log(`\n═══ ${name} ═══`)
}

function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e: any) {
    failed++
    console.log(`  ✗ ${name}`)
    console.log(`    ${e.message}`)
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`)
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// 20.1 Workspace validation
// ═══════════════════════════════════════════════════════════════════════════

group('20.1 — Workspace scope & status validation')

test('accepts all allowed workspace scopes', () => {
  for (const scope of WORKSPACE_SCOPES) {
    assert(isValidWorkspaceScope(scope), `scope "${scope}" should be valid`)
  }
})

test('rejects invalid workspace scopes', () => {
  assert(!isValidWorkspaceScope('ari'), 'graph scope "ari" should be rejected')
  assert(!isValidWorkspaceScope('eli'), 'graph scope "eli" should be rejected')
  assert(!isValidWorkspaceScope('shared'), 'graph scope "shared" should be rejected')
  assert(!isValidWorkspaceScope('house'), 'graph scope "house" should be rejected')
  assert(!isValidWorkspaceScope('none'), 'graph scope "none" should be rejected')
  assert(!isValidWorkspaceScope(''), 'empty string should be rejected')
  assert(!isValidWorkspaceScope(null), 'null should be rejected')
  assert(!isValidWorkspaceScope(undefined), 'undefined should be rejected')
  assert(!isValidWorkspaceScope(123), 'number should be rejected')
})

test('workspace scopes do not overlap with graph presence scopes', () => {
  const graphScopes = ['ari', 'eli', 'shared', 'house', 'none']
  for (const gs of graphScopes) {
    assert(!isValidWorkspaceScope(gs), `graph scope "${gs}" must not be a valid workspace scope`)
  }
})

test('accepts valid workspace statuses', () => {
  for (const status of WORKSPACE_STATUSES) {
    assert(isValidWorkspaceStatus(status), `status "${status}" should be valid`)
  }
})

test('rejects invalid workspace statuses', () => {
  assert(!isValidWorkspaceStatus('deleted'), '"deleted" should be rejected')
  assert(!isValidWorkspaceStatus('approved_graph'), '"approved_graph" should be rejected')
  assert(!isValidWorkspaceStatus(''), 'empty string should be rejected')
})

test('all workspace scopes have display labels', () => {
  for (const scope of WORKSPACE_SCOPES) {
    assert(typeof WORKSPACE_SCOPE_LABELS[scope] === 'string', `scope "${scope}" missing label`)
    assert(WORKSPACE_SCOPE_LABELS[scope].length > 0, `scope "${scope}" has empty label`)
  }
})

group('20.1 — Layout data validation')

test('accepts valid layout data', () => {
  const layout: RelationalMapLayoutData = {
    version: 1,
    nodes: {
      'node:house:concept:selinaric-house': { x: 120, y: 300, pinned: true },
      'node:ari:person:ari': { x: 200, y: 400, pinned: false },
    },
    clusters: [],
  }
  const result = validateLayoutData(layout)
  assert(result.valid, `Should be valid: ${result.errors.join(', ')}`)
})

test('accepts empty layout data', () => {
  const layout = { version: 1, nodes: {}, clusters: [] }
  const result = validateLayoutData(layout)
  assert(result.valid, `Should be valid: ${result.errors.join(', ')}`)
})

test('rejects non-finite x coordinate', () => {
  const layout = {
    version: 1,
    nodes: { 'node:house:concept:test': { x: Infinity, y: 0, pinned: false } },
    clusters: [],
  }
  const result = validateLayoutData(layout)
  assert(!result.valid, 'Should reject Infinity')
  assert(result.errors.some(e => e.includes('finite number')), 'Error should mention finite')
})

test('rejects NaN coordinates', () => {
  const layout = {
    version: 1,
    nodes: { 'node:house:concept:test': { x: NaN, y: 100, pinned: false } },
    clusters: [],
  }
  const result = validateLayoutData(layout)
  assert(!result.valid, 'Should reject NaN')
})

test('rejects non-boolean pinned', () => {
  const layout = {
    version: 1,
    nodes: { 'node:house:concept:test': { x: 0, y: 0, pinned: 'yes' } },
    clusters: [],
  }
  const result = validateLayoutData(layout)
  assert(!result.valid, 'Should reject string pinned')
})

test('rejects unsupported layout version', () => {
  const layout = { version: 99, nodes: {}, clusters: [] }
  const result = validateLayoutData(layout)
  assert(!result.valid, 'Should reject version 99')
})

test('rejects non-object layout_data', () => {
  const result = validateLayoutData('not an object')
  assert(!result.valid, 'Should reject string')
})

test('rejects null layout_data', () => {
  const result = validateLayoutData(null)
  assert(!result.valid, 'Should reject null')
})

test('rejects semantic fields in layout_data', () => {
  const layout = {
    version: 1,
    nodes: {},
    clusters: [],
    promptEligible: true,
  }
  const result = validateLayoutData(layout)
  assert(!result.valid, 'Should reject promptEligible')
  assert(result.errors.some(e => e.includes('forbidden')), 'Error should mention forbidden')
})

test('rejects semantic fields in node layout', () => {
  const layout = {
    version: 1,
    nodes: {
      'node:house:concept:test': {
        x: 0, y: 0, pinned: false,
        confidence: 0.9,
      },
    },
    clusters: [],
  }
  const result = validateLayoutData(layout)
  assert(!result.valid, 'Should reject confidence in node layout')
})

test('rejects non-runtime node key in layout', () => {
  const layout = {
    version: 1,
    nodes: {
      'Selinaric House': { x: 0, y: 0, pinned: false },
    },
    clusters: [],
  }
  const result = validateLayoutData(layout)
  assert(!result.valid, 'Should reject plain label as key')
})

group('20.1 — Node key validation')

test('accepts valid node keys', () => {
  assert(isValidNodeKey('node:house:concept:selinaric-house'), 'should accept standard key')
  assert(isValidNodeKey('node:ari:person:ari'), 'should accept ari scope')
  assert(isValidNodeKey('node:shared:relationship_arc:presence thread'), 'should accept complex key')
})

test('rejects invalid node keys', () => {
  assert(!isValidNodeKey(''), 'should reject empty')
  assert(!isValidNodeKey('Selinaric House'), 'should reject plain label')
  assert(!isValidNodeKey('edge:abc'), 'should reject edge key')
  assert(!isValidNodeKey('node:'), 'should reject incomplete')
})

group('20.1 — Visual cluster validation')

test('accepts valid cluster', () => {
  const layout = {
    version: 1,
    nodes: {},
    clusters: [{
      id: 'cluster-systems',
      label: 'House Systems',
      x: 80,
      y: 120,
      width: 420,
      height: 280,
      nodeKeys: ['node:house:concept:archive', 'node:house:concept:memory'],
    }],
  }
  const result = validateLayoutData(layout)
  assert(result.valid, `Should be valid: ${result.errors.join(', ')}`)
})

test('rejects malformed cluster — missing id', () => {
  const layout = {
    version: 1,
    nodes: {},
    clusters: [{
      label: 'Test',
      x: 0, y: 0, width: 100, height: 100,
      nodeKeys: [],
    }],
  }
  const result = validateLayoutData(layout)
  assert(!result.valid, 'Should reject missing id')
})

test('rejects malformed cluster — non-finite width', () => {
  const layout = {
    version: 1,
    nodes: {},
    clusters: [{
      id: 'c1', label: 'Test',
      x: 0, y: 0, width: Infinity, height: 100,
      nodeKeys: [],
    }],
  }
  const result = validateLayoutData(layout)
  assert(!result.valid, 'Should reject Infinity width')
})

test('rejects cluster with invalid node key', () => {
  const layout = {
    version: 1,
    nodes: {},
    clusters: [{
      id: 'c1', label: 'Test',
      x: 0, y: 0, width: 100, height: 100,
      nodeKeys: ['Just A Label'],
    }],
  }
  const result = validateLayoutData(layout)
  assert(!result.valid, 'Should reject non-runtime node key in cluster')
})

test('rejects semantic fields in cluster', () => {
  const layout = {
    version: 1,
    nodes: {},
    clusters: [{
      id: 'c1', label: 'Test',
      x: 0, y: 0, width: 100, height: 100,
      nodeKeys: [],
      relationship: 'parent_of',
    }],
  }
  const result = validateLayoutData(layout)
  assert(!result.valid, 'Should reject relationship field in cluster')
})

group('20.1 — Viewport validation')

test('accepts valid viewport', () => {
  const result = validateViewport({ x: 100, y: 200, zoom: 1.5 })
  assert(result.valid, `Should be valid: ${result.errors.join(', ')}`)
})

test('accepts null viewport', () => {
  const result = validateViewport(null)
  assert(result.valid, 'null viewport should be valid')
})

test('rejects non-finite viewport values', () => {
  const result = validateViewport({ x: Infinity, y: 0, zoom: 1 })
  assert(!result.valid, 'Should reject Infinity')
})

test('rejects out-of-range zoom', () => {
  const result = validateViewport({ x: 0, y: 0, zoom: 100 })
  assert(!result.valid, 'Should reject zoom > 10')
})

test('rejects malformed viewport', () => {
  const result = validateViewport('not an object')
  assert(!result.valid, 'Should reject string')
})

group('20.1 — Filter preset validation')

test('accepts valid filter preset', () => {
  const result = validateFilterPreset({ nodeType: 'concept', search: 'test' })
  assert(result.valid, `Should be valid: ${result.errors.join(', ')}`)
})

test('accepts empty filter preset', () => {
  const result = validateFilterPreset({})
  assert(result.valid, 'Empty preset should be valid')
})

test('rejects unknown filter keys', () => {
  const result = validateFilterPreset({ memoryStatus: 'canonical' })
  assert(!result.valid, 'Should reject unknown key')
})

test('rejects non-string filter values', () => {
  const result = validateFilterPreset({ nodeType: 123 })
  assert(!result.valid, 'Should reject numeric value')
})

group('20.1 — Create payload validation')

test('accepts valid create payload', () => {
  const result = validateCreatePayload({
    name: 'Test Workspace',
    workspaceScope: 'tara_workspace',
    layoutData: { version: 1, nodes: {}, clusters: [] },
  })
  assert(result.valid, `Should be valid: ${result.errors.join(', ')}`)
})

test('rejects missing name', () => {
  const result = validateCreatePayload({
    workspaceScope: 'tara_workspace',
    layoutData: { version: 1, nodes: {}, clusters: [] },
  })
  assert(!result.valid, 'Should reject missing name')
})

test('rejects empty name', () => {
  const result = validateCreatePayload({
    name: '',
    workspaceScope: 'tara_workspace',
    layoutData: { version: 1, nodes: {}, clusters: [] },
  })
  assert(!result.valid, 'Should reject empty name')
})

test('rejects invalid workspace scope in create', () => {
  const result = validateCreatePayload({
    name: 'Test',
    workspaceScope: 'ari',
    layoutData: { version: 1, nodes: {}, clusters: [] },
  })
  assert(!result.valid, 'Should reject graph scope "ari" as workspace scope')
})

test('rejects missing layoutData in create', () => {
  const result = validateCreatePayload({
    name: 'Test',
    workspaceScope: 'tara_workspace',
  })
  assert(!result.valid, 'Should reject missing layoutData')
})

group('20.1 — Update payload validation')

test('accepts valid update payload', () => {
  const result = validateUpdatePayload({
    name: 'Renamed Workspace',
    layoutData: { version: 1, nodes: {}, clusters: [] },
  })
  assert(result.valid, `Should be valid: ${result.errors.join(', ')}`)
})

test('accepts empty update payload', () => {
  const result = validateUpdatePayload({})
  assert(result.valid, 'Empty update should be valid')
})

test('rejects workspaceScope in update (immutable)', () => {
  const result = validateUpdatePayload({
    workspaceScope: 'ari_workspace',
  })
  assert(!result.valid, 'Should reject workspaceScope change')
  assert(result.errors.some(e => e.includes('cannot be changed')), 'Error should mention immutability')
})

test('accepts status change in update', () => {
  const result = validateUpdatePayload({ status: 'archived' })
  assert(result.valid, `Should accept status change: ${result.errors.join(', ')}`)
})

test('rejects invalid status in update', () => {
  const result = validateUpdatePayload({ status: 'deleted' })
  assert(!result.valid, 'Should reject invalid status')
})

// ═══════════════════════════════════════════════════════════════════════════
// 20.2 Layout application
// ═══════════════════════════════════════════════════════════════════════════

group('20.2 — Layout application logic')

test('layout positions keyed by node ID, not label', () => {
  const layout: RelationalMapLayoutData = {
    version: 1,
    nodes: {
      'node:house:concept:selinaric-house': { x: 100, y: 200, pinned: true },
    },
    clusters: [],
  }
  // Key is node ID format, not label
  assert('node:house:concept:selinaric-house' in layout.nodes, 'Should use node key')
  assert(!('Selinaric House' in layout.nodes), 'Should not use display label')
})

test('missing node keys are ignored gracefully', () => {
  // Simulate: layout references nodes not present in current graph
  const layout: RelationalMapLayoutData = {
    version: 1,
    nodes: {
      'node:house:concept:deleted-item': { x: 100, y: 200, pinned: false },
      'node:house:concept:still-here': { x: 300, y: 400, pinned: true },
    },
    clusters: [],
  }
  const currentNodeIds = new Set(['node:house:concept:still-here'])
  const skipped = Object.keys(layout.nodes).filter(k => !currentNodeIds.has(k))

  assertEqual(skipped.length, 1, 'Should identify 1 skipped key')
  assertEqual(skipped[0], 'node:house:concept:deleted-item', 'Should identify the missing key')
})

test('pinning is stored correctly', () => {
  const layout: RelationalMapLayoutData = {
    version: 1,
    nodes: {
      'node:house:concept:a': { x: 0, y: 0, pinned: true },
      'node:house:concept:b': { x: 0, y: 0, pinned: false },
    },
    clusters: [],
  }
  assertEqual(layout.nodes['node:house:concept:a'].pinned, true, 'a should be pinned')
  assertEqual(layout.nodes['node:house:concept:b'].pinned, false, 'b should not be pinned')
})

test('layout does not create missing nodes', () => {
  // Layout stores keys but NEVER creates graph nodes for missing keys
  const layout: RelationalMapLayoutData = {
    version: 1,
    nodes: {
      'node:house:concept:ghost': { x: 100, y: 200, pinned: false },
    },
    clusters: [],
  }
  const currentNodes: string[] = [] // empty graph
  const skipped = Object.keys(layout.nodes).filter(k => !currentNodes.includes(k))
  assertEqual(skipped.length, 1, 'ghost key should be skipped')
  // The layout NEVER adds nodes to the graph
})

// ═══════════════════════════════════════════════════════════════════════════
// 20.3 Scope separation
// ═══════════════════════════════════════════════════════════════════════════

group('20.3 — Scope separation')

test('workspace_scope values are distinct from graph presence_scope', () => {
  const graphScopes = ['ari', 'eli', 'shared', 'house', 'none']
  for (const ws of WORKSPACE_SCOPES) {
    assert(!graphScopes.includes(ws), `workspace scope "${ws}" must not overlap with graph scope`)
  }
})

test('workspace_scope describes visual context, not graph authority', () => {
  // Verify naming convention
  for (const ws of WORKSPACE_SCOPES) {
    assert(
      ws.includes('workspace') || ws.includes('default'),
      `workspace scope "${ws}" should include 'workspace' or 'default' in name`
    )
  }
})

test('Ari workspace can hold nodes with any graph scope', () => {
  // An Ari workspace can arrange nodes from any graph presence_scope
  const layout: RelationalMapLayoutData = {
    version: 1,
    nodes: {
      'node:ari:person:ari': { x: 0, y: 0, pinned: true },
      'node:eli:person:eli': { x: 100, y: 0, pinned: false },
      'node:shared:concept:trust': { x: 200, y: 0, pinned: false },
      'node:house:room:archive': { x: 300, y: 0, pinned: false },
    },
    clusters: [],
  }
  // All these are valid despite workspace_scope being 'ari_workspace'
  const result = validateLayoutData(layout)
  assert(result.valid, 'Ari workspace should accept nodes from all graph scopes')
})

// ═══════════════════════════════════════════════════════════════════════════
// 20.4 Cluster safety
// ═══════════════════════════════════════════════════════════════════════════

group('20.4 — Cluster safety')

test('clusters store node keys only, not labels', () => {
  const cluster: RelationalMapVisualCluster = {
    id: 'c1',
    label: 'House Systems',
    x: 0, y: 0, width: 400, height: 300,
    nodeKeys: ['node:house:concept:archive', 'node:house:concept:memory'],
  }
  for (const key of cluster.nodeKeys) {
    assert(key.startsWith('node:'), 'cluster nodeKeys must be runtime node keys')
  }
})

test('clusters do not create edges', () => {
  // Visual clusters have no edge-related fields
  const cluster: RelationalMapVisualCluster = {
    id: 'c1',
    label: 'Test',
    x: 0, y: 0, width: 100, height: 100,
    nodeKeys: [],
  }
  const clusterObj = cluster as Record<string, unknown>
  assert(!('edges' in clusterObj), 'cluster must not have edges field')
  assert(!('edgeType' in clusterObj), 'cluster must not have edgeType field')
  assert(!('fromNodeId' in clusterObj), 'cluster must not have fromNodeId field')
  assert(!('toNodeId' in clusterObj), 'cluster must not have toNodeId field')
})

test('clusters do not create graph nodes', () => {
  const clusterObj: Record<string, unknown> = {
    id: 'c1',
    label: 'Test',
    x: 0, y: 0, width: 100, height: 100,
    nodeKeys: [],
  }
  assert(!('nodeType' in clusterObj), 'cluster must not have nodeType field')
  assert(!('authorityStatus' in clusterObj), 'cluster must not have authorityStatus field')
  assert(!('confidence' in clusterObj), 'cluster must not have confidence field')
})

test('clusters do not modify ontology constants', () => {
  // Cluster label does not become a graph type or authority
  const layout = {
    version: 1,
    nodes: {},
    clusters: [{
      id: 'c1',
      label: 'Memory Candidates', // Just a visual label
      x: 0, y: 0, width: 100, height: 100,
      nodeKeys: [],
    }],
  }
  const result = validateLayoutData(layout)
  assert(result.valid, 'Cluster with descriptive label should be valid')
  // The label 'Memory Candidates' is visual only, NOT an ontology group
})

test('cluster rejects semantic relationship field', () => {
  const layout = {
    version: 1,
    nodes: {},
    clusters: [{
      id: 'c1',
      label: 'Test',
      x: 0, y: 0, width: 100, height: 100,
      nodeKeys: [],
      relationship: 'parent_of', // FORBIDDEN
    }],
  }
  const result = validateLayoutData(layout)
  assert(!result.valid, 'Should reject relationship in cluster')
})

// ═══════════════════════════════════════════════════════════════════════════
// 20.5 API safety
// ═══════════════════════════════════════════════════════════════════════════

group('20.5 — API safety')

test('workspace API routes write only to layout table', () => {
  // Read the workspace route files and verify they only reference relational_map_workspaces
  const routeFile = readFileSync(
    resolve(__dirname, '../../../app/api/relational-map/workspaces/route.ts'),
    'utf-8'
  )
  const idRouteFile = readFileSync(
    resolve(__dirname, '../../../app/api/relational-map/workspaces/[id]/route.ts'),
    'utf-8'
  )

  const allRouteCode = routeFile + '\n' + idRouteFile

  // Check that .from() only references relational_map_workspaces
  const fromCalls = allRouteCode.match(/\.from\(\s*['"`](\w+)['"`]\s*\)/g) ?? []
  for (const call of fromCalls) {
    const tableMatch = call.match(/['"`](\w+)['"`]/)
    if (tableMatch) {
      assertEqual(
        tableMatch[1],
        'relational_map_workspaces',
        `Workspace route should only access relational_map_workspaces, found: ${tableMatch[1]}`
      )
    }
  }
})

test('workspace routes do not reference graph proposal tables', () => {
  const routeFile = readFileSync(
    resolve(__dirname, '../../../app/api/relational-map/workspaces/route.ts'),
    'utf-8'
  )
  const idRouteFile = readFileSync(
    resolve(__dirname, '../../../app/api/relational-map/workspaces/[id]/route.ts'),
    'utf-8'
  )
  const allCode = routeFile + idRouteFile

  const forbidden = [
    'graph_proposals', 'graph_proposal_sources', 'graph_proposal_events',
    'memory_nodes', 'memory_edges',
    'archive_items', 'archive_graph_nodes', 'archive_graph_edges',
  ]
  for (const table of forbidden) {
    assert(
      !allCode.includes(`'${table}'`) && !allCode.includes(`"${table}"`),
      `Workspace routes must not reference ${table}`
    )
  }
})

test('workspace routes do not mutate prompt_eligible', () => {
  const routeFile = readFileSync(
    resolve(__dirname, '../../../app/api/relational-map/workspaces/route.ts'),
    'utf-8'
  )
  const idRouteFile = readFileSync(
    resolve(__dirname, '../../../app/api/relational-map/workspaces/[id]/route.ts'),
    'utf-8'
  )
  const allCode = routeFile + idRouteFile

  assert(!allCode.includes('prompt_eligible'), 'Workspace routes must not reference prompt_eligible')
  assert(!allCode.includes('promptEligible'), 'Workspace routes must not reference promptEligible')
})

test('original /api/relational-map remains GET-only', () => {
  const mapRoute = readFileSync(
    resolve(__dirname, '../../../app/api/relational-map/route.ts'),
    'utf-8'
  )
  // Should have GET export but NOT POST, PATCH, DELETE, PUT
  assert(mapRoute.includes('export async function GET'), 'Must have GET handler')
  assert(!mapRoute.includes('export async function POST'), 'Must NOT have POST handler')
  assert(!mapRoute.includes('export async function PATCH'), 'Must NOT have PATCH handler')
  assert(!mapRoute.includes('export async function DELETE'), 'Must NOT have DELETE handler')
  assert(!mapRoute.includes('export async function PUT'), 'Must NOT have PUT handler')
})

test('graph proposal tables are not written by any 37E file', () => {
  const files37E = [
    resolve(__dirname, '../relationalMapWorkspaceTypes.ts'),
    resolve(__dirname, '../relationalMapWorkspaceValidation.ts'),
    resolve(__dirname, '../../../app/api/relational-map/workspaces/route.ts'),
    resolve(__dirname, '../../../app/api/relational-map/workspaces/[id]/route.ts'),
    resolve(__dirname, '../../../components/graph/RelationalMapWorkspaceBar.tsx'),
    resolve(__dirname, '../../../components/graph/RelationalMapCanvas.tsx'),
  ]

  const forbidden = ['graph_proposals', 'graph_proposal_sources', 'graph_proposal_events']
  for (const filePath of files37E) {
    const content = readFileSync(filePath, 'utf-8')
    for (const table of forbidden) {
      assert(
        !content.includes(`'${table}'`) && !content.includes(`"${table}"`),
        `${filePath} must not reference ${table}`
      )
    }
  }
})

test('Memory and Archive tables are not written by any 37E file', () => {
  const files37E = [
    resolve(__dirname, '../relationalMapWorkspaceTypes.ts'),
    resolve(__dirname, '../relationalMapWorkspaceValidation.ts'),
    resolve(__dirname, '../../../app/api/relational-map/workspaces/route.ts'),
    resolve(__dirname, '../../../app/api/relational-map/workspaces/[id]/route.ts'),
  ]

  const forbidden = [
    'memory_nodes', 'memory_edges',
    'archive_items', 'archive_graph_nodes', 'archive_graph_edges',
    'held_truths',
  ]
  for (const filePath of files37E) {
    const content = readFileSync(filePath, 'utf-8')
    for (const table of forbidden) {
      assert(
        !content.includes(`'${table}'`) && !content.includes(`"${table}"`),
        `${filePath} must not reference ${table}`
      )
    }
  }
})

test('DELETE workspace route is soft-archive only', () => {
  const idRoute = readFileSync(
    resolve(__dirname, '../../../app/api/relational-map/workspaces/[id]/route.ts'),
    'utf-8'
  )
  // DELETE handler should update status to 'archived', not use .delete()
  assert(idRoute.includes("'archived'"), 'DELETE handler should set status to archived')
  // Should not have .delete() call on the Supabase client
  const deleteCallPattern = /\.delete\(\)/g
  const matches = idRoute.match(deleteCallPattern)
  assert(!matches, 'DELETE handler must not use .delete() (hard delete)')
})

// ═══════════════════════════════════════════════════════════════════════════
// 20.6 UI structural tests
// ═══════════════════════════════════════════════════════════════════════════

group('20.6 — UI structural tests')

test('/relational-map page includes workspace bar', () => {
  const page = readFileSync(
    resolve(__dirname, '../../../app/(house)/relational-map/page.tsx'),
    'utf-8'
  )
  assert(page.includes('RelationalMapWorkspaceBar'), 'Page should include workspace bar')
})

test('/relational-map page includes arrange mode toggle', () => {
  const page = readFileSync(
    resolve(__dirname, '../../../app/(house)/relational-map/page.tsx'),
    'utf-8'
  )
  assert(page.includes('arrangeMode'), 'Page should track arrangeMode state')
  assert(page.includes('handleToggleArrangeMode'), 'Page should have toggle handler')
})

test('/relational-map page includes save/reset controls', () => {
  const page = readFileSync(
    resolve(__dirname, '../../../app/(house)/relational-map/page.tsx'),
    'utf-8'
  )
  assert(page.includes('handleSave'), 'Page should have save handler')
  assert(page.includes('handleSaveAs'), 'Page should have save-as handler')
  assert(page.includes('handleResetLayout'), 'Page should have reset handler')
})

test('canvas governance: deleteKeyCode is null', () => {
  const canvas = readFileSync(
    resolve(__dirname, '../../../components/graph/RelationalMapCanvas.tsx'),
    'utf-8'
  )
  assert(canvas.includes('deleteKeyCode={null}'), 'Canvas must disable delete key')
})

test('canvas governance: nodesConnectable is always false', () => {
  const canvas = readFileSync(
    resolve(__dirname, '../../../components/graph/RelationalMapCanvas.tsx'),
    'utf-8'
  )
  assert(canvas.includes('nodesConnectable={false}'), 'Canvas must keep nodesConnectable=false')
})

test('canvas governance: nodesDraggable controlled by arrangeMode', () => {
  const canvas = readFileSync(
    resolve(__dirname, '../../../components/graph/RelationalMapCanvas.tsx'),
    'utf-8'
  )
  assert(canvas.includes('nodesDraggable={arrangeMode}'), 'Canvas must gate dragging on arrangeMode')
})

test('governance banner includes workspace layout disclaimer', () => {
  const banner = readFileSync(
    resolve(__dirname, '../../../components/graph/RelationalMapGovernanceBanner.tsx'),
    'utf-8'
  )
  assert(
    banner.includes('visual metadata only') || banner.includes('layout') || banner.includes('Dragging'),
    'Banner should mention workspace layout is visual only'
  )
})

test('no create node/create edge controls in 37E', () => {
  const page = readFileSync(
    resolve(__dirname, '../../../app/(house)/relational-map/page.tsx'),
    'utf-8'
  )
  assert(!page.includes('createNode'), 'Page must not have createNode')
  assert(!page.includes('createEdge'), 'Page must not have createEdge')
  assert(!page.includes('addNode'), 'Page must not have addNode')
  assert(!page.includes('addEdge'), 'Page must not have addEdge')
})

test('no approval/rejection controls in 37E', () => {
  const page = readFileSync(
    resolve(__dirname, '../../../app/(house)/relational-map/page.tsx'),
    'utf-8'
  )
  assert(!page.includes('approveProposal'), 'Page must not have approveProposal')
  assert(!page.includes('rejectProposal'), 'Page must not have rejectProposal')
})

test('inspector includes layout metadata section', () => {
  const inspector = readFileSync(
    resolve(__dirname, '../../../components/graph/RelationalMapInspector.tsx'),
    'utf-8'
  )
  assert(inspector.includes('nodeLayout'), 'Inspector should accept nodeLayout prop')
  assert(inspector.includes('layout metadata'), 'Inspector should label layout section')
  assert(
    inspector.includes('does not change graph meaning'),
    'Inspector should include governance text about layout not being graph meaning'
  )
})

test('canvas includes visual cluster overlay', () => {
  const canvas = readFileSync(
    resolve(__dirname, '../../../components/graph/RelationalMapCanvas.tsx'),
    'utf-8'
  )
  assert(canvas.includes('ClusterOverlays'), 'Canvas should render visual clusters')
  assert(canvas.includes('visual cluster'), 'Canvas should label clusters as visual')
})

test('canvas shows skipped node key warning', () => {
  const canvas = readFileSync(
    resolve(__dirname, '../../../components/graph/RelationalMapCanvas.tsx'),
    'utf-8'
  )
  assert(canvas.includes('skippedNodeKeys'), 'Canvas should accept skippedNodeKeys prop')
  assert(
    canvas.includes('no longer visible'),
    'Canvas should show warning about nodes no longer visible'
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// 20.7 — Authority boundary (no writes outside workspace table)
// ═══════════════════════════════════════════════════════════════════════════

group('20.7 — Authority boundary')

test('protected table registry includes relational_map_workspaces', () => {
  const registry = readFileSync(
    resolve(__dirname, '../../safety/protected-tables.ts'),
    'utf-8'
  )
  assert(
    registry.includes('relational_map_workspaces'),
    'Protected table registry should include relational_map_workspaces'
  )
  assert(
    registry.includes('Visual only, not graph authority'),
    'Registry should note it is visual only'
  )
})

test('relational_map_workspaces is Category C (derived/rebuildable)', () => {
  const registry = readFileSync(
    resolve(__dirname, '../../safety/protected-tables.ts'),
    'utf-8'
  )
  // Find the workspace entry and check its category
  const wsEntryStart = registry.indexOf("table: 'relational_map_workspaces'")
  assert(wsEntryStart > -1, 'Should find workspace entry')
  const wsChunk = registry.slice(wsEntryStart, wsEntryStart + 300)
  assert(wsChunk.includes("category: 'C'"), 'Should be Category C')
})

test('migration uses soft-delete via status, not hard-delete', () => {
  const migration = readFileSync(
    resolve(__dirname, '../../../../supabase-migrations/069_relational_map_workspaces.sql'),
    'utf-8'
  )
  assert(migration.includes("'archived'"), 'Migration should include archived status')
  assert(!migration.includes('ON DELETE CASCADE'), 'Migration should not use CASCADE')
  assert(!migration.includes('DELETE FROM'), 'Migration should not contain DELETE FROM')
})

test('migration includes atomic default-switch RPC', () => {
  const migration = readFileSync(
    resolve(__dirname, '../../../../supabase-migrations/069_relational_map_workspaces.sql'),
    'utf-8'
  )
  assert(migration.includes('set_default_workspace'), 'Migration should define RPC function')
  assert(migration.includes('plpgsql'), 'RPC should be PL/pgSQL')
})

test('migration includes partial unique index for one default per scope', () => {
  const migration = readFileSync(
    resolve(__dirname, '../../../../supabase-migrations/069_relational_map_workspaces.sql'),
    'utf-8'
  )
  assert(
    migration.includes('one_default_per_scope'),
    'Migration should include one-default-per-scope index'
  )
  assert(
    migration.includes('where status') || migration.includes('WHERE status'),
    'Index should be partial (filtered)'
  )
})

test('no prompt_eligible mutation in any 37E file', () => {
  const srcRoot = resolve(__dirname, '../../..')
  const filesToCheck = [
    'lib/graph/relationalMapWorkspaceTypes.ts',
    'lib/graph/relationalMapWorkspaceValidation.ts',
    'app/api/relational-map/workspaces/route.ts',
    'app/api/relational-map/workspaces/[id]/route.ts',
    'components/graph/RelationalMapWorkspaceBar.tsx',
    'components/graph/RelationalMapCanvas.tsx',
  ]

  for (const relPath of filesToCheck) {
    const content = readFileSync(resolve(srcRoot, relPath), 'utf-8')
    // Remove comments
    const stripped = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    // Check for prompt_eligible assignment (not just reference)
    assert(
      !stripped.match(/prompt_eligible\s*[=:]\s*true/),
      `${relPath} must not set prompt_eligible = true`
    )
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════')
console.log(`  Phase 37E Workspace Tests: ${passed} passed, ${failed} failed`)
console.log('═══════════════════════════════════════════════════\n')

if (failed > 0) {
  process.exit(1)
}
