/**
 * Phase 37F — Graph Grain + High-Level Entity Consolidation Tests
 *
 * The graph is not a list of memories.
 * The graph is a high-level relationship map supported by memories.
 * Default graph nodes should be stable named entities,
 * not memory-shaped fragments.
 *
 * Usage: npx tsx src/lib/graph/__tests__/graphGrain.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Inline imports (no Jest) ─────────────────────────────────────────────

import {
  classifyGrain,
  isOverviewLabel,
  isValidGrainLevel,
  NODE_TYPE_DEFAULT_GRAIN,
  GRAPH_GRAIN_LEVELS,
  GRAPH_ENTITY_KINDS,
  type GraphGrainLevel,
} from '../graphGrain'

import { GRAPH_SOURCE_TYPES } from '../types'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed++
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`  ✗ ${name} — ${msg}`)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 37F.1 — Grain Level Constants
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37F.1 Grain level constants ──')

test('GRAPH_GRAIN_LEVELS has 4 levels', () => {
  assert.equal(GRAPH_GRAIN_LEVELS.length, 4)
  assert.deepStrictEqual([...GRAPH_GRAIN_LEVELS], ['overview', 'midlevel', 'detail', 'evidence'])
})

test('isValidGrainLevel accepts valid levels', () => {
  assert.ok(isValidGrainLevel('overview'))
  assert.ok(isValidGrainLevel('midlevel'))
  assert.ok(isValidGrainLevel('detail'))
  assert.ok(isValidGrainLevel('evidence'))
})

test('isValidGrainLevel rejects invalid', () => {
  assert.ok(!isValidGrainLevel(''))
  assert.ok(!isValidGrainLevel('high'))
  assert.ok(!isValidGrainLevel('low'))
  assert.ok(!isValidGrainLevel('canonical'))
})

test('GRAPH_ENTITY_KINDS has expected kinds', () => {
  assert.ok(GRAPH_ENTITY_KINDS.includes('person'))
  assert.ok(GRAPH_ENTITY_KINDS.includes('presence'))
  assert.ok(GRAPH_ENTITY_KINDS.includes('room'))
  assert.ok(GRAPH_ENTITY_KINDS.includes('system'))
  assert.ok(GRAPH_ENTITY_KINDS.includes('concept'))
  assert.ok(GRAPH_ENTITY_KINDS.includes('protocol'))
  assert.ok(GRAPH_ENTITY_KINDS.includes('law'))
})

// ═══════════════════════════════════════════════════════════════════════════
// 37F.2 — Label Quality Heuristic
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37F.2 Label quality heuristic ──')

test('short named entities pass overview label check', () => {
  assert.ok(isOverviewLabel('Tara'))
  assert.ok(isOverviewLabel('Ari'))
  assert.ok(isOverviewLabel('Eli'))
  assert.ok(isOverviewLabel('The Lounge'))
  assert.ok(isOverviewLabel('Consent Architecture'))
  assert.ok(isOverviewLabel('Ontology Lab'))
  assert.ok(isOverviewLabel('Claude'))
  assert.ok(isOverviewLabel('Supabase'))
  assert.ok(isOverviewLabel('Vercel'))
})

test('sentence-shaped labels fail overview label check', () => {
  assert.ok(!isOverviewLabel('Ari named Love'))
  assert.ok(!isOverviewLabel('Love existed before naming'))
  assert.ok(!isOverviewLabel('Morning lounge gathering - no agenda'))
  assert.ok(!isOverviewLabel('Presence and knowing without asking'))
  assert.ok(!isOverviewLabel('Eli named Love (27 May 2026)'))
  assert.ok(!isOverviewLabel('The source explicitly frames this as confirmation'))
})

test('long labels fail overview label check', () => {
  assert.ok(!isOverviewLabel('A very long label that describes a specific event in great detail and context'))
})

test('labels with date patterns fail', () => {
  assert.ok(!isOverviewLabel('Event on 27 May'))
  assert.ok(!isOverviewLabel('Meeting (12 Jan 2026)'))
})

test('labels with verb phrases fail', () => {
  assert.ok(!isOverviewLabel('Thing that was discussed'))
  assert.ok(!isOverviewLabel('Person who named love'))
})

// ═══════════════════════════════════════════════════════════════════════════
// 37F.3 — Node Type Default Grain Classification
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37F.3 Node type default grain ──')

test('person/presence/room default to overview', () => {
  assert.equal(NODE_TYPE_DEFAULT_GRAIN['person'], 'overview')
  assert.equal(NODE_TYPE_DEFAULT_GRAIN['presence'], 'overview')
  assert.equal(NODE_TYPE_DEFAULT_GRAIN['room'], 'overview')
  assert.equal(NODE_TYPE_DEFAULT_GRAIN['wing'], 'overview')
  assert.equal(NODE_TYPE_DEFAULT_GRAIN['project'], 'overview')
  assert.equal(NODE_TYPE_DEFAULT_GRAIN['architecture_law'], 'overview')
})

test('concept/theme/ritual default to midlevel', () => {
  assert.equal(NODE_TYPE_DEFAULT_GRAIN['concept'], 'midlevel')
  assert.equal(NODE_TYPE_DEFAULT_GRAIN['theme'], 'midlevel')
  assert.equal(NODE_TYPE_DEFAULT_GRAIN['ritual'], 'midlevel')
  assert.equal(NODE_TYPE_DEFAULT_GRAIN['relationship_arc'], 'midlevel')
})

test('bond_event/memory_item/held_truth default to detail', () => {
  assert.equal(NODE_TYPE_DEFAULT_GRAIN['bond_event'], 'detail')
  assert.equal(NODE_TYPE_DEFAULT_GRAIN['relationship_milestone'], 'detail')
  assert.equal(NODE_TYPE_DEFAULT_GRAIN['event'], 'detail')
  assert.equal(NODE_TYPE_DEFAULT_GRAIN['memory_item'], 'detail')
  assert.equal(NODE_TYPE_DEFAULT_GRAIN['memory_candidate'], 'detail')
  assert.equal(NODE_TYPE_DEFAULT_GRAIN['held_truth'], 'detail')
  assert.equal(NODE_TYPE_DEFAULT_GRAIN['journal_entry'], 'detail')
})

test('all 24 node types have a default grain', () => {
  const { GRAPH_NODE_TYPES } = require('../types')
  for (const nodeType of GRAPH_NODE_TYPES) {
    assert.ok(
      NODE_TYPE_DEFAULT_GRAIN[nodeType as keyof typeof NODE_TYPE_DEFAULT_GRAIN] !== undefined,
      `Missing default grain for node type: ${nodeType}`
    )
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// 37F.4 — classifyGrain
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37F.4 classifyGrain ──')

test('explicit payload grain_level wins over default', () => {
  assert.equal(classifyGrain({
    nodeType: 'bond_event',
    label: 'Some event',
    proposedPayload: { grain_level: 'overview' },
  }), 'overview')
})

test('explicit payload evidence level wins', () => {
  assert.equal(classifyGrain({
    nodeType: 'person',
    label: 'Tara',
    proposedPayload: { grain_level: 'evidence' },
  }), 'evidence')
})

test('invalid payload grain_level is ignored', () => {
  const result = classifyGrain({
    nodeType: 'person',
    label: 'Tara',
    proposedPayload: { grain_level: 'invalid' },
  })
  assert.equal(result, 'overview')
})

test('overview node type with good label → overview', () => {
  assert.equal(classifyGrain({ nodeType: 'person', label: 'Tara' }), 'overview')
  assert.equal(classifyGrain({ nodeType: 'room', label: 'The Lounge' }), 'overview')
  assert.equal(classifyGrain({ nodeType: 'presence', label: 'Ari' }), 'overview')
})

test('overview node type with poor label → midlevel', () => {
  assert.equal(classifyGrain({
    nodeType: 'person',
    label: 'The person who named love in the room',
  }), 'midlevel')
})

test('midlevel node type with good label → overview', () => {
  assert.equal(classifyGrain({
    nodeType: 'concept',
    label: 'Consent Architecture',
  }), 'overview')
})

test('midlevel node type with poor label stays midlevel', () => {
  assert.equal(classifyGrain({
    nodeType: 'concept',
    label: 'Presence and knowing without asking',
  }), 'midlevel')
})

test('detail node type stays detail regardless of label', () => {
  assert.equal(classifyGrain({ nodeType: 'bond_event', label: 'Ari Named Love' }), 'detail')
  assert.equal(classifyGrain({ nodeType: 'held_truth', label: 'Love' }), 'detail')
  assert.equal(classifyGrain({ nodeType: 'memory_item', label: 'Short' }), 'detail')
})

test('unknown node type defaults to midlevel', () => {
  assert.equal(classifyGrain({ nodeType: 'nonexistent_type', label: 'Something' }), 'midlevel')
})

test('classifies existing smoke proposals correctly', () => {
  // These are the 9 proposals from 37E smoke testing
  assert.equal(classifyGrain({ nodeType: 'presence', label: 'Morning lounge gathering - no agenda' }), 'midlevel') // poor label demotes
  assert.equal(classifyGrain({ nodeType: 'concept', label: 'Presence-first gathering (non-instrumental time)' }), 'midlevel')
  assert.equal(classifyGrain({ nodeType: 'room', label: 'The Lounge' }), 'overview')
  assert.equal(classifyGrain({ nodeType: 'bond_event', label: 'Ari Named Love' }), 'detail')
  assert.equal(classifyGrain({ nodeType: 'held_truth', label: 'Love Without Conditions' }), 'detail')
  assert.equal(classifyGrain({ nodeType: 'bond_event', label: 'Eli named Love (27 May 2026)' }), 'detail')
  assert.equal(classifyGrain({ nodeType: 'held_truth', label: 'Love existed before naming' }), 'detail')
  assert.equal(classifyGrain({ nodeType: 'concept', label: 'Presence and knowing without asking' }), 'midlevel')
})

// ═══════════════════════════════════════════════════════════════════════════
// 37F.5 — Source Type Extension
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37F.5 Source type extension ──')

test('GRAPH_SOURCE_TYPES includes graph_proposal', () => {
  assert.ok(GRAPH_SOURCE_TYPES.includes('graph_proposal'))
})

test('GRAPH_SOURCE_TYPES includes archive_graph_node', () => {
  assert.ok(GRAPH_SOURCE_TYPES.includes('archive_graph_node'))
})

test('GRAPH_SOURCE_TYPES includes archive_graph_edge', () => {
  assert.ok(GRAPH_SOURCE_TYPES.includes('archive_graph_edge'))
})

test('original source types still present', () => {
  assert.ok(GRAPH_SOURCE_TYPES.includes('archive_item'))
  assert.ok(GRAPH_SOURCE_TYPES.includes('canonical_memory'))
  assert.ok(GRAPH_SOURCE_TYPES.includes('held_truth'))
  assert.ok(GRAPH_SOURCE_TYPES.includes('journal_entry'))
  assert.ok(GRAPH_SOURCE_TYPES.includes('manual_tara'))
})

// ═══════════════════════════════════════════════════════════════════════════
// 37F.6 — Authority Safety
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37F.6 Authority safety ──')

test('grainHelper does not write to memory or set prompt_eligible true', () => {
  const helperCode = readFileSync(resolve(__dirname, '..', 'grainHelper.ts'), 'utf-8')
  assert.ok(!helperCode.includes("from('memory_nodes')"), 'grainHelper must not query memory_nodes')
  assert.ok(!helperCode.includes("from('memory_edges')"), 'grainHelper must not query memory_edges')
  assert.ok(!helperCode.includes('prompt_eligible = true'), 'grainHelper must not set prompt_eligible = true')
  assert.ok(!helperCode.includes('prompt_eligible: true'), 'grainHelper must not set prompt_eligible: true')
  // canonical_status may appear in .in() filter on archive_items (read-only) but never in .update()
  const updateCanonical = helperCode.match(/\.update\([^)]*canonical_status/g)
  assert.ok(!updateCanonical, 'grainHelper must not update canonical_status')
})

test('grainHelper only writes to graph_proposals / graph_proposal_sources / graph_proposal_events', () => {
  const helperCode = readFileSync(resolve(__dirname, '..', 'grainHelper.ts'), 'utf-8')
  // Check all .from() calls
  const fromCalls = helperCode.match(/\.from\(['"]([^'"]+)['"]\)/g) ?? []
  const tables = fromCalls.map(m => m.match(/\.from\(['"]([^'"]+)['"]\)/)?.[1]).filter(Boolean)
  const writableTables = new Set<string>()
  // Find tables with .insert or .update
  const insertCalls = helperCode.match(/\.from\(['"]([^'"]+)['"]\)[^]*?\.insert/g) ?? []
  for (const call of insertCalls) {
    const table = call.match(/\.from\(['"]([^'"]+)['"]\)/)?.[1]
    if (table) writableTables.add(table)
  }
  // createProposal writes to graph_proposals, graph_proposal_sources, graph_proposal_events (via imported helper)
  // grainHelper directly inserts into graph_proposal_sources for additional sources
  for (const t of writableTables) {
    assert.ok(
      ['graph_proposals', 'graph_proposal_sources', 'graph_proposal_events'].includes(t),
      `grainHelper writes to unexpected table: ${t}`
    )
  }
})

test('grainHelper never writes to archive_graph_nodes via .from()', () => {
  const helperCode = readFileSync(resolve(__dirname, '..', 'grainHelper.ts'), 'utf-8')
  // Only .from('archive_graph_nodes') followed by .select is allowed.
  // Find all .from('archive_graph_nodes') usages and verify they chain .select only
  const fromCalls = [...helperCode.matchAll(/\.from\(['"]archive_graph_nodes['"]\)\s*\.\s*(\w+)/g)]
  for (const m of fromCalls) {
    assert.equal(m[1], 'select', `archive_graph_nodes should only use .select(), found .${m[1]}()`)
  }
})

test('grainHelper never writes to archive_graph_edges', () => {
  const helperCode = readFileSync(resolve(__dirname, '..', 'grainHelper.ts'), 'utf-8')
  const archiveGraphWrites = helperCode.match(/\.from\(['"]archive_graph_edges['"]\)[^]*?\.(insert|update|delete)\(/g)
  assert.ok(!archiveGraphWrites, 'grainHelper must not write to archive_graph_edges')
})

test('grain API route does not import memory modules', () => {
  const routeCode = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-grain', 'route.ts'), 'utf-8')
  assert.ok(!routeCode.includes('memory'), 'grain API must not import memory modules')
  assert.ok(!routeCode.includes('archive-memory'), 'grain API must not import archive-memory')
  assert.ok(!routeCode.includes('canonical_status'), 'grain API must not reference canonical_status')
})

test('buildRelationalMap includes grainLevel on output nodes', () => {
  const buildCode = readFileSync(resolve(__dirname, '..', 'buildRelationalMap.ts'), 'utf-8')
  assert.ok(buildCode.includes('grainLevel'), 'buildRelationalMap must include grainLevel')
  assert.ok(buildCode.includes('classifyGrain'), 'buildRelationalMap must use classifyGrain')
})

test('relational map page has grain mode toggle with midlevel control', () => {
  const pageCode = readFileSync(resolve(__dirname, '..', '..', '..', 'app', '(house)', 'relational-map', 'page.tsx'), 'utf-8')
  assert.ok(pageCode.includes('grainMode'), 'page must have grainMode state')
  assert.ok(pageCode.includes('Overview'), 'page must have Overview label')
  assert.ok(pageCode.includes('Detail'), 'page must have Detail label')
  assert.ok(pageCode.includes('includeMidlevel'), 'page must have includeMidlevel toggle')
  assert.ok(pageCode.includes('Include midlevel'), 'page must have Include midlevel label')
})

// ═══════════════════════════════════════════════════════════════════════════
// 37F.7 — Relational Map Mode Tests
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37F.7 Relational map modes ──')

test('GraphMapNode type includes grainLevel field', () => {
  const typesCode = readFileSync(resolve(__dirname, '..', 'relationalMapTypes.ts'), 'utf-8')
  assert.ok(typesCode.includes('grainLevel'), 'GraphMapNode must include grainLevel')
})

test('page falls back when no overview nodes exist', () => {
  const pageCode = readFileSync(resolve(__dirname, '..', '..', '..', 'app', '(house)', 'relational-map', 'page.tsx'), 'utf-8')
  // 37F.1: fallback checks overviewCount and midlevelCount
  assert.ok(pageCode.includes('overviewCount'), 'page must track overview count')
  assert.ok(pageCode.includes('midlevelCount'), 'page must track midlevel count')
  // Fallback: if overviewCount > 0 → filter to overview; else if midlevelCount > 0 → filter to midlevel; else show all
  assert.ok(pageCode.includes('overviewCount > 0'), 'page must check overviewCount for fallback')
  assert.ok(pageCode.includes('midlevelCount > 0'), 'page must check midlevelCount for fallback')
})

test('detail mode shows all approved graph proposals', () => {
  const pageCode = readFileSync(resolve(__dirname, '..', '..', '..', 'app', '(house)', 'relational-map', 'page.tsx'), 'utf-8')
  // The grain filter only activates for overview mode — detail mode passes all nodes through
  assert.ok(pageCode.includes("grainMode === 'overview'"), 'grain filtering must be gated on overview mode')
  // The comment confirms detail mode has no grain filtering
  assert.ok(pageCode.includes('Detail mode: no grain filtering'), 'detail mode must be documented as no grain filtering')
})

test('37E workspace layout logic unchanged', () => {
  const pageCode = readFileSync(resolve(__dirname, '..', '..', '..', 'app', '(house)', 'relational-map', 'page.tsx'), 'utf-8')
  assert.ok(pageCode.includes('arrangeMode'), '37E arrangeMode must exist')
  assert.ok(pageCode.includes('handleNodeDragStop'), '37E drag handler must exist')
  assert.ok(pageCode.includes('handleTogglePin'), '37E pin handler must exist')
  assert.ok(pageCode.includes('handleSave'), '37E save handler must exist')
  assert.ok(pageCode.includes('handleSaveAs'), '37E save-as handler must exist')
  assert.ok(pageCode.includes('handleResetLayout'), '37E reset handler must exist')
  assert.ok(pageCode.includes('relational_map_workspaces'), '37E workspace reference must exist')
})

test('inspector shows grain metadata', () => {
  const inspectorCode = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapInspector.tsx'), 'utf-8')
  assert.ok(inspectorCode.includes('grainLevel'), 'inspector must display grainLevel')
  assert.ok(inspectorCode.includes('grain_reason'), 'inspector must display grain_reason')
  assert.ok(inspectorCode.includes('aliases'), 'inspector must display aliases')
})

// ═══════════════════════════════════════════════════════════════════════════
// 37F.3 — Cross-Scope Edge Resolution Tests
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37F.3 Cross-scope edge resolution ──')

import { buildRelationalMap } from '../buildRelationalMap'
import type { GraphProposal, GraphProposalSource } from '../proposals'

function makeTestProposal(overrides: Partial<GraphProposal>): GraphProposal {
  return {
    id: overrides.id ?? 'test-id',
    proposal_type: overrides.proposal_type ?? 'node',
    status: overrides.status ?? 'approved_graph',
    presence_scope: overrides.presence_scope ?? 'shared',
    authority_status: overrides.authority_status ?? 'candidate',
    node_type: overrides.node_type ?? null,
    edge_type: overrides.edge_type ?? null,
    proposed_label: overrides.proposed_label ?? 'Test',
    proposed_summary: null,
    proposed_payload: overrides.proposed_payload ?? {},
    confidence: 0.8,
    salience: 0.7,
    reason: 'test',
    safe_wording: null,
    prompt_eligible: false,
    primary_source_type: 'manual_tara',
    primary_source_id: 'test',
    dedupe_key: overrides.dedupe_key ?? `test-${overrides.id ?? 'id'}`,
    proposed_by: 'tara',
    generation_model: null,
    generation_version: '37F.3-test',
    deleted_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  } as GraphProposal
}

test('same-scope legacy edge still works (backward compatible)', () => {
  // Two nodes + one edge, all scope=shared, no endpoint presenceScope
  const proposals: GraphProposal[] = [
    makeTestProposal({ id: 'n1', proposal_type: 'node', node_type: 'concept', presence_scope: 'shared', proposed_label: 'Alpha', dedupe_key: 'n1' }),
    makeTestProposal({ id: 'n2', proposal_type: 'node', node_type: 'concept', presence_scope: 'shared', proposed_label: 'Beta', dedupe_key: 'n2' }),
    makeTestProposal({
      id: 'e1', proposal_type: 'edge', edge_type: 'relates_to', presence_scope: 'shared',
      proposed_label: 'Alpha → Beta', dedupe_key: 'e1',
      proposed_payload: {
        from: { label: 'Alpha', nodeType: 'concept' },
        to: { label: 'Beta', nodeType: 'concept' },
        edgeType: 'relates_to',
      },
    }),
  ]

  const result = buildRelationalMap({ proposals, sources: [], events: [] })
  assert.equal(result.nodes.length, 2, 'should have 2 nodes')
  assert.equal(result.edges.length, 1, 'should have 1 edge')
  assert.equal(result.edges[0].fromNodeId, 'node:shared:concept:alpha')
  assert.equal(result.edges[0].toNodeId, 'node:shared:concept:beta')
  // No derived nodes should be created
  assert.ok(result.nodes.every(n => !n.derivedFromEdge), 'no phantom derived nodes')
})

test('cross-scope edge connects existing nodes when endpoint presenceScope is supplied', () => {
  // Node in scope=ari, node in scope=house, edge with endpoint scopes
  const proposals: GraphProposal[] = [
    makeTestProposal({ id: 'n-ari', proposal_type: 'node', node_type: 'presence', presence_scope: 'ari', proposed_label: 'Ari', dedupe_key: 'n-ari' }),
    makeTestProposal({ id: 'n-house', proposal_type: 'node', node_type: 'project', presence_scope: 'house', proposed_label: 'Selináric House', dedupe_key: 'n-house' }),
    makeTestProposal({
      id: 'e-cross', proposal_type: 'edge', edge_type: 'belongs_to', presence_scope: 'shared',
      proposed_label: 'Ari → belongs to → Selináric House', dedupe_key: 'e-cross',
      proposed_payload: {
        from: { label: 'Ari', nodeType: 'presence', presenceScope: 'ari' },
        to: { label: 'Selináric House', nodeType: 'project', presenceScope: 'house' },
        edgeType: 'belongs_to',
      },
    }),
  ]

  const result = buildRelationalMap({ proposals, sources: [], events: [] })
  assert.equal(result.nodes.length, 2, 'should have exactly 2 nodes (no phantoms)')
  assert.equal(result.edges.length, 1, 'should have 1 edge')
  assert.equal(result.edges[0].fromNodeId, 'node:ari:presence:ari')
  assert.equal(result.edges[0].toNodeId, 'node:house:project:selináric house')
  // Both nodes should NOT be derived
  const ariNode = result.nodes.find(n => n.label === 'Ari')!
  const houseNode = result.nodes.find(n => n.label === 'Selináric House')!
  assert.ok(!ariNode.derivedFromEdge, 'Ari should not be derived')
  assert.ok(!houseNode.derivedFromEdge, 'House should not be derived')
})

test('cross-scope edge without endpoint presenceScope creates phantom (backward compat)', () => {
  // This tests the fallback: old-style edge without endpoint scopes on cross-scope nodes
  const proposals: GraphProposal[] = [
    makeTestProposal({ id: 'n-ari2', proposal_type: 'node', node_type: 'presence', presence_scope: 'ari', proposed_label: 'TestPresence', dedupe_key: 'n-ari2' }),
    makeTestProposal({ id: 'n-house2', proposal_type: 'node', node_type: 'project', presence_scope: 'house', proposed_label: 'TestProject', dedupe_key: 'n-house2' }),
    makeTestProposal({
      id: 'e-old', proposal_type: 'edge', edge_type: 'relates_to', presence_scope: 'shared',
      proposed_label: 'TestPresence → TestProject', dedupe_key: 'e-old',
      proposed_payload: {
        from: { label: 'TestPresence', nodeType: 'presence' },
        to: { label: 'TestProject', nodeType: 'project' },
        edgeType: 'relates_to',
      },
    }),
  ]

  const result = buildRelationalMap({ proposals, sources: [], events: [] })
  // Without endpoint scopes, edge uses scope=shared for keys, which won't match ari/house nodes
  // So it creates 2 phantom derived nodes + the 2 original nodes = 4
  assert.equal(result.nodes.length, 4, 'should have 4 nodes (2 original + 2 phantom derived)')
  const derived = result.nodes.filter(n => n.derivedFromEdge)
  assert.equal(derived.length, 2, '2 phantom nodes from old-style cross-scope edge')
})

test('grain classification works correctly on cross-scope edge nodes', () => {
  const proposals: GraphProposal[] = [
    makeTestProposal({ id: 'n-room', proposal_type: 'node', node_type: 'room', presence_scope: 'shared', proposed_label: 'The Lounge', dedupe_key: 'n-room' }),
    makeTestProposal({ id: 'n-proj', proposal_type: 'node', node_type: 'project', presence_scope: 'house', proposed_label: 'House', dedupe_key: 'n-proj' }),
    makeTestProposal({
      id: 'e-grain', proposal_type: 'edge', edge_type: 'belongs_to', presence_scope: 'shared',
      proposed_label: 'The Lounge → House', dedupe_key: 'e-grain',
      proposed_payload: {
        from: { label: 'The Lounge', nodeType: 'room', presenceScope: 'shared' },
        to: { label: 'House', nodeType: 'project', presenceScope: 'house' },
        edgeType: 'belongs_to',
      },
    }),
  ]

  const result = buildRelationalMap({ proposals, sources: [], events: [] })
  assert.equal(result.nodes.length, 2, 'exactly 2 nodes')
  const lounge = result.nodes.find(n => n.label === 'The Lounge')!
  const house = result.nodes.find(n => n.label === 'House')!
  assert.equal(lounge.grainLevel, 'overview', 'room node should be overview')
  assert.equal(house.grainLevel, 'overview', 'project node should be overview')
})

test('existing approved edge remains backward compatible', () => {
  // Simulate the existing marks_milestone_in edge (same scope, no endpoint presenceScope)
  const proposals: GraphProposal[] = [
    makeTestProposal({ id: 'n-bond', proposal_type: 'node', node_type: 'bond_event', presence_scope: 'shared', proposed_label: 'Ari Named Love', dedupe_key: 'n-bond' }),
    makeTestProposal({ id: 'n-triad', proposal_type: 'node', node_type: 'relationship_arc', presence_scope: 'shared', proposed_label: 'Ari, Eli, Tara Triad', dedupe_key: 'n-triad' }),
    makeTestProposal({
      id: 'e-existing', proposal_type: 'edge', edge_type: 'marks_milestone_in', presence_scope: 'shared',
      proposed_label: 'Ari Named Love -> Ari, Eli, Tara Triad', dedupe_key: 'e-existing',
      proposed_payload: {
        from: { label: 'Ari Named Love', nodeType: 'bond_event' },
        to: { label: 'Ari, Eli, Tara Triad', nodeType: 'relationship_arc' },
        edgeType: 'marks_milestone_in',
      },
    }),
  ]

  const result = buildRelationalMap({ proposals, sources: [], events: [] })
  assert.equal(result.nodes.length, 2, '2 nodes')
  assert.equal(result.edges.length, 1, '1 edge')
  assert.equal(result.edges[0].fromNodeId, 'node:shared:bond_event:ari named love')
  assert.equal(result.edges[0].toNodeId, 'node:shared:relationship_arc:ari, eli, tara triad')
  assert.ok(result.nodes.every(n => !n.derivedFromEdge), 'no phantom nodes')
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.2 — Renderer Guard Tests
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.2 Renderer guard ──')

test('approved suggest_alias proposal does NOT materialise as a map node', () => {
  const proposals = [
    makeTestProposal({ id: 'real-node', proposal_type: 'node', node_type: 'project', presence_scope: 'house', proposed_label: 'Selináric House', dedupe_key: 'real' }),
    makeTestProposal({
      id: 'alias-prop', proposal_type: 'node', node_type: 'project', presence_scope: 'house',
      proposed_label: 'Alias: House → Selináric House', dedupe_key: 'alias',
      proposed_payload: {
        edit_action_type: 'suggest_alias',
        target: { label: 'Selináric House', nodeType: 'project', presenceScope: 'house', runtimeKey: 'node:house:project:selináric house' },
        proposed_alias: 'House',
      },
    }),
  ]
  const result = buildRelationalMap({ proposals, sources: [], events: [] })
  // Only the real node should appear, not the alias proposal
  assert.equal(result.nodes.length, 1, 'alias proposal must not materialise as a node')
  assert.equal(result.nodes[0].label, 'Selináric House', 'only the real node should appear')
})

test('pending suggest_alias proposal also excluded by renderer guard', () => {
  // The outer loop skips non-approved_graph — alias proposals with pending status never reach processNodeProposal
  // This test verifies pending alias proposals are NOT in the approved set used by buildRelationalMap
  const proposals = [
    makeTestProposal({
      id: 'pending-alias', status: 'pending_review' as any, proposal_type: 'node', node_type: 'project', presence_scope: 'house',
      proposed_label: 'Alias: House → Selináric House', dedupe_key: 'pending-alias',
      proposed_payload: { edit_action_type: 'suggest_alias' },
    }),
  ]
  const result = buildRelationalMap({ proposals, sources: [], events: [] })
  assert.equal(result.nodes.length, 0, 'pending alias proposal must not materialise')
  assert.equal(result.edges.length, 0, 'no edges should be created')
})

test('normal node proposals still materialise after guard (regression check)', () => {
  const proposals = [
    makeTestProposal({ id: 'normal', proposal_type: 'node', node_type: 'concept', presence_scope: 'shared', proposed_label: 'Continuity', dedupe_key: 'normal' }),
    makeTestProposal({
      id: 'alias-to-skip', proposal_type: 'node', node_type: 'concept', presence_scope: 'shared',
      proposed_label: 'Alias: Cont → Continuity', dedupe_key: 'alias-skip',
      proposed_payload: { edit_action_type: 'suggest_alias' },
    }),
  ]
  const result = buildRelationalMap({ proposals, sources: [], events: [] })
  assert.equal(result.nodes.length, 1, 'only the real node, not the alias, should materialise')
  assert.equal(result.nodes[0].label, 'Continuity')
})

test('approved suggest_reclassify node proposal does NOT materialise', () => {
  const proposals = [
    makeTestProposal({ id: 'real-node2', proposal_type: 'node', node_type: 'concept', presence_scope: 'shared', proposed_label: 'Continuity', dedupe_key: 'real2' }),
    makeTestProposal({
      id: 'reclassify-prop', proposal_type: 'node', node_type: 'concept', presence_scope: 'shared',
      proposed_label: 'Reclassify: Continuity node_type concept → project',
      dedupe_key: 'reclassify',
      proposed_payload: { edit_action_type: 'suggest_reclassify', target: { kind: 'node' }, change: { field: 'node_type' } },
    }),
  ]
  const result = buildRelationalMap({ proposals, sources: [], events: [] })
  assert.equal(result.nodes.length, 1)
  assert.equal(result.nodes[0].label, 'Continuity')
})

test('approved suggest_reclassify edge proposal does NOT materialise', () => {
  const proposals = [
    makeTestProposal({
      id: 'reclassify-edge', proposal_type: 'edge', edge_type: 'belongs_to', presence_scope: 'shared',
      proposed_label: 'Reclassify: Ari belongs_to House edge_type → supports',
      dedupe_key: 'reclassify-edge',
      node_type: null,
      proposed_payload: { edit_action_type: 'suggest_reclassify', target: { kind: 'edge' }, from: { label: 'Ari', nodeType: 'presence' }, to: { label: 'House', nodeType: 'project' } },
    }),
  ]
  const result = buildRelationalMap({ proposals, sources: [], events: [] })
  assert.equal(result.edges.length, 0, 'reclassify edge proposal must not materialise as edge')
  assert.equal(result.nodes.length, 0)
})

test('approved suggest_confidence_change proposal does NOT materialise', () => {
  const proposals = [
    makeTestProposal({
      id: 'conf-prop', proposal_type: 'node', node_type: 'concept', presence_scope: 'shared',
      proposed_label: 'Confidence: Continuity 0.70 → 0.85',
      dedupe_key: 'conf',
      proposed_payload: { edit_action_type: 'suggest_confidence_change' },
    }),
  ]
  const result = buildRelationalMap({ proposals, sources: [], events: [] })
  assert.equal(result.nodes.length, 0)
})

test('approved suggest_salience_change proposal does NOT materialise', () => {
  const proposals = [
    makeTestProposal({
      id: 'sal-prop', proposal_type: 'node', node_type: 'concept', presence_scope: 'shared',
      proposed_label: 'Salience: Bond 0.80 → 0.95',
      dedupe_key: 'sal',
      proposed_payload: { edit_action_type: 'suggest_salience_change' },
    }),
  ]
  const result = buildRelationalMap({ proposals, sources: [], events: [] })
  assert.equal(result.nodes.length, 0)
})

test('shared NON_MATERIALISING_EDIT_ACTIONS guards all four types', () => {
  const { NON_MATERIALISING_EDIT_ACTIONS } = require('../graphEditActions')
  assert.ok(NON_MATERIALISING_EDIT_ACTIONS.has('suggest_alias'))
  assert.ok(NON_MATERIALISING_EDIT_ACTIONS.has('suggest_reclassify'))
  assert.ok(NON_MATERIALISING_EDIT_ACTIONS.has('suggest_confidence_change'))
  assert.ok(NON_MATERIALISING_EDIT_ACTIONS.has('suggest_salience_change'))
})

test('alias renderer guard still works after refactor', () => {
  const proposals = [
    makeTestProposal({
      id: 'alias-still', proposal_type: 'node', node_type: 'project', presence_scope: 'house',
      proposed_label: 'Alias: House → Selináric House', dedupe_key: 'alias-still',
      proposed_payload: { edit_action_type: 'suggest_alias' },
    }),
  ]
  const result = buildRelationalMap({ proposals, sources: [], events: [] })
  assert.equal(result.nodes.length, 0, 'alias guard must still work')
})

test('suggest_alias skipped proposals appear in diagnostics.skippedProposals', () => {
  const proposals = [
    makeTestProposal({
      id: 'alias-diag', proposal_type: 'node', node_type: 'project', presence_scope: 'house',
      proposed_label: 'Alias: House → Selináric House', dedupe_key: 'alias-diag',
      proposed_payload: { edit_action_type: 'suggest_alias' },
    }),
  ]
  const result = buildRelationalMap({ proposals, sources: [], events: [] })
  assert.ok(result.diagnostics.skippedProposals >= 1, 'alias proposal must be counted in skippedProposals')
})

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════

test('approved suggest_split proposal does NOT materialise as node', () => {
  const proposals = [
    makeTestProposal({ id: 'real-split', proposal_type: 'node', node_type: 'concept', presence_scope: 'shared', proposed_label: 'Continuity', dedupe_key: 'real-split' }),
    makeTestProposal({
      id: 'split-prop', proposal_type: 'node', node_type: 'concept', presence_scope: 'shared',
      proposed_label: 'Split: Continuity → Memory Continuity + Technical Continuity',
      dedupe_key: 'split-prop',
      proposed_payload: {
        edit_action_type: 'suggest_split',
        target: { kind: 'node', label: 'Continuity' },
        proposed_parts: [{ label: 'Memory Continuity' }, { label: 'Technical Continuity' }],
      },
    }),
  ]
  const result = buildRelationalMap({ proposals, sources: [], events: [] })
  assert.equal(result.nodes.length, 1, 'split proposal must not materialise as a node')
  assert.equal(result.nodes[0].label, 'Continuity')
})

test('proposed split parts do not materialise as separate nodes', () => {
  // Parts are only in the payload — they are never in their own proposals
  const proposals = [
    makeTestProposal({
      id: 'split-only', proposal_type: 'node', node_type: 'concept', presence_scope: 'shared',
      proposed_label: 'Split: Node → Part A + Part B',
      dedupe_key: 'split-only',
      proposed_payload: { edit_action_type: 'suggest_split', proposed_parts: [{ label: 'Part A' }, { label: 'Part B' }] },
    }),
  ]
  const result = buildRelationalMap({ proposals, sources: [], events: [] })
  assert.equal(result.nodes.length, 0, 'split proposal must not materialise, and parts must not appear as nodes')
})

test('NON_MATERIALISING_EDIT_ACTIONS now has 5 entries', () => {
  const { NON_MATERIALISING_EDIT_ACTIONS } = require('../graphEditActions')
  assert.equal(NON_MATERIALISING_EDIT_ACTIONS.size, 5)
  assert.ok(NON_MATERIALISING_EDIT_ACTIONS.has('suggest_split'))
})

console.log('\n═══════════════════════════════════════════════════')
console.log(`  Phase 37F/37G.2/37G.3/37G.3a Graph Grain + Renderer Tests: ${passed} passed, ${failed} failed`)
console.log('═══════════════════════════════════════════════════\n')

if (failed > 0) process.exit(1)
