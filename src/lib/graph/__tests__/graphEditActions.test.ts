/**
 * Phase 37G.0 — Graph Edit Action Contract Tests
 *
 * A graph edit action is never a graph edit.
 * It is a proposal to be reviewed.
 *
 * Usage: npx tsx src/lib/graph/__tests__/graphEditActions.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  GRAPH_EDIT_ACTION_TYPES,
  SUPPORTED_EDIT_ACTIONS,
  DEFERRED_EDIT_ACTIONS,
  isValidEditActionType,
  isSupportedEditAction,
  isDeferredEditAction,
  editActionToProposalType,
  validateEditActionPayload,
  generateEditActionDedupeKey,
  EDIT_ACTION_PROPOSAL_DEFAULTS,
} from '../graphEditActions'

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
// 37G.0.1 — Action Type Constants
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.0.1 Action type constants ──')

test('GRAPH_EDIT_ACTION_TYPES has 9 action types', () => {
  assert.equal(GRAPH_EDIT_ACTION_TYPES.length, 9)
})

test('SUPPORTED_EDIT_ACTIONS has suggest_node and suggest_edge', () => {
  assert.equal(SUPPORTED_EDIT_ACTIONS.length, 2)
  assert.ok(SUPPORTED_EDIT_ACTIONS.includes('suggest_node'))
  assert.ok(SUPPORTED_EDIT_ACTIONS.includes('suggest_edge'))
})

test('DEFERRED_EDIT_ACTIONS has 7 deferred actions', () => {
  assert.equal(DEFERRED_EDIT_ACTIONS.length, 7)
  assert.ok(DEFERRED_EDIT_ACTIONS.includes('suggest_alias'))
  assert.ok(DEFERRED_EDIT_ACTIONS.includes('suggest_merge'))
  assert.ok(DEFERRED_EDIT_ACTIONS.includes('suggest_split'))
  assert.ok(DEFERRED_EDIT_ACTIONS.includes('suggest_reclassify'))
  assert.ok(DEFERRED_EDIT_ACTIONS.includes('suggest_retire_or_supersede'))
})

test('supported + deferred = all action types', () => {
  const all = [...SUPPORTED_EDIT_ACTIONS, ...DEFERRED_EDIT_ACTIONS]
  assert.equal(all.length, GRAPH_EDIT_ACTION_TYPES.length)
  for (const a of GRAPH_EDIT_ACTION_TYPES) {
    assert.ok(all.includes(a), `${a} missing from supported/deferred`)
  }
})

test('isValidEditActionType accepts valid types', () => {
  assert.ok(isValidEditActionType('suggest_node'))
  assert.ok(isValidEditActionType('suggest_edge'))
  assert.ok(isValidEditActionType('suggest_alias'))
  assert.ok(isValidEditActionType('suggest_merge'))
})

test('isValidEditActionType rejects invalid types', () => {
  assert.ok(!isValidEditActionType(''))
  assert.ok(!isValidEditActionType('edit_node'))
  assert.ok(!isValidEditActionType('delete'))
  assert.ok(!isValidEditActionType('approve'))
})

test('isSupportedEditAction accepts only supported', () => {
  assert.ok(isSupportedEditAction('suggest_node'))
  assert.ok(isSupportedEditAction('suggest_edge'))
  assert.ok(!isSupportedEditAction('suggest_alias'))
  assert.ok(!isSupportedEditAction('suggest_merge'))
})

test('isDeferredEditAction correctly identifies deferred', () => {
  assert.ok(isDeferredEditAction('suggest_alias'))
  assert.ok(isDeferredEditAction('suggest_merge'))
  assert.ok(!isDeferredEditAction('suggest_node'))
  assert.ok(!isDeferredEditAction('suggest_edge'))
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.0.2 — Proposal Type Mapping
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.0.2 Proposal type mapping ──')

test('suggest_node maps to proposal_type=node', () => {
  assert.equal(editActionToProposalType('suggest_node'), 'node')
})

test('suggest_edge maps to proposal_type=edge', () => {
  assert.equal(editActionToProposalType('suggest_edge'), 'edge')
})

test('suggest_alias maps to proposal_type=node', () => {
  assert.equal(editActionToProposalType('suggest_alias'), 'node')
})

test('all deferred actions map to valid proposal_type', () => {
  for (const action of DEFERRED_EDIT_ACTIONS) {
    const pt = editActionToProposalType(action)
    assert.ok(pt === 'node' || pt === 'edge', `${action} maps to invalid type: ${pt}`)
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.0.3 — Source Type
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.0.3 Source type ──')

test('GRAPH_SOURCE_TYPES includes map_ui', () => {
  assert.ok(GRAPH_SOURCE_TYPES.includes('map_ui'))
})

test('original source types still present', () => {
  assert.ok(GRAPH_SOURCE_TYPES.includes('archive_item'))
  assert.ok(GRAPH_SOURCE_TYPES.includes('manual_tara'))
  assert.ok(GRAPH_SOURCE_TYPES.includes('graph_proposal'))
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.0.4 — Proposal Defaults
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.0.4 Proposal defaults ──')

test('defaults force pending_review', () => {
  assert.equal(EDIT_ACTION_PROPOSAL_DEFAULTS.status, 'pending_review')
})

test('defaults force prompt_eligible false', () => {
  assert.equal(EDIT_ACTION_PROPOSAL_DEFAULTS.prompt_eligible, false)
})

test('defaults force proposed_by tara', () => {
  assert.equal(EDIT_ACTION_PROPOSAL_DEFAULTS.proposed_by, 'tara')
})

test('defaults force map_ui source type', () => {
  assert.equal(EDIT_ACTION_PROPOSAL_DEFAULTS.primary_source_type, 'map_ui')
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.0.5 — Suggest Node Validation
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.0.5 Suggest node validation ──')

const VALID_NODE_PAYLOAD = {
  edit_action_type: 'suggest_node',
  edit_origin: 'relational_map',
  edit_origin_phase: '37G',
  grain_level: 'overview',
  detail_policy: 'review_required',
  requires_review: true,
  review_surface: 'ontology_lab',
  governance_note: 'Graph edit action proposal only.',
  label: 'Test Entity',
  node_type: 'concept',
  presence_scope: 'shared',
  aliases: [],
  canonical_label: 'Test Entity',
  rationale: 'User proposed from map UI.',
}

test('valid suggest_node payload passes', () => {
  const result = validateEditActionPayload(VALID_NODE_PAYLOAD)
  assert.ok(result.valid, result.errors.join('; '))
})

test('missing label fails', () => {
  const result = validateEditActionPayload({ ...VALID_NODE_PAYLOAD, label: '' })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('label')))
})

test('label too long fails', () => {
  const result = validateEditActionPayload({ ...VALID_NODE_PAYLOAD, label: 'A'.repeat(61) })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('too long')))
})

test('invalid node_type fails', () => {
  const result = validateEditActionPayload({ ...VALID_NODE_PAYLOAD, node_type: 'invalid_type' })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('node_type')))
})

test('invalid presence_scope fails', () => {
  const result = validateEditActionPayload({ ...VALID_NODE_PAYLOAD, presence_scope: 'wrong' })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('presence_scope')))
})

test('missing rationale fails', () => {
  const result = validateEditActionPayload({ ...VALID_NODE_PAYLOAD, rationale: '' })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('rationale')))
})

test('missing canonical_label fails', () => {
  const result = validateEditActionPayload({ ...VALID_NODE_PAYLOAD, canonical_label: '' })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('canonical_label')))
})

test('invalid grain_level fails', () => {
  const result = validateEditActionPayload({ ...VALID_NODE_PAYLOAD, grain_level: 'high' })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('grain_level')))
})

test('requires_review must be true', () => {
  const result = validateEditActionPayload({ ...VALID_NODE_PAYLOAD, requires_review: false })
  assert.ok(!result.valid)
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.0.6 — Suggest Edge Validation
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.0.6 Suggest edge validation ──')

const VALID_EDGE_PAYLOAD = {
  edit_action_type: 'suggest_edge',
  edit_origin: 'relational_map',
  edit_origin_phase: '37G',
  grain_level: 'overview',
  detail_policy: 'review_required',
  requires_review: true,
  review_surface: 'ontology_lab',
  governance_note: 'Graph edit action proposal only.',
  from: {
    label: 'Ari',
    nodeType: 'presence',
    presenceScope: 'ari',
    runtimeKey: 'node:ari:presence:ari',
  },
  to: {
    label: 'Selinaric House',
    nodeType: 'project',
    presenceScope: 'house',
    runtimeKey: 'node:house:project:selinaric house',
  },
  edge_type: 'belongs_to',
  canonical_label: 'Ari belongs to Selinaric House',
  rationale: 'Structural relationship.',
}

test('valid suggest_edge payload passes', () => {
  const result = validateEditActionPayload(VALID_EDGE_PAYLOAD)
  assert.ok(result.valid, result.errors.join('; '))
})

test('missing from endpoint fails', () => {
  const { from, ...rest } = VALID_EDGE_PAYLOAD
  const result = validateEditActionPayload(rest)
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('from')))
})

test('missing to endpoint fails', () => {
  const { to, ...rest } = VALID_EDGE_PAYLOAD
  const result = validateEditActionPayload(rest)
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('to')))
})

test('invalid edge_type fails', () => {
  const result = validateEditActionPayload({ ...VALID_EDGE_PAYLOAD, edge_type: 'invalid_edge' })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('edge_type')))
})

test('self-referencing edge fails', () => {
  const result = validateEditActionPayload({
    ...VALID_EDGE_PAYLOAD,
    from: { ...VALID_EDGE_PAYLOAD.from, runtimeKey: 'node:ari:presence:ari' },
    to: { ...VALID_EDGE_PAYLOAD.to, runtimeKey: 'node:ari:presence:ari', label: 'Ari', nodeType: 'presence', presenceScope: 'ari' },
  })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('different nodes')))
})

test('missing endpoint presenceScope fails', () => {
  const result = validateEditActionPayload({
    ...VALID_EDGE_PAYLOAD,
    from: { label: 'Ari', nodeType: 'presence', runtimeKey: 'node:ari:presence:ari' },
  })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('presenceScope')))
})

test('missing endpoint runtimeKey fails', () => {
  const result = validateEditActionPayload({
    ...VALID_EDGE_PAYLOAD,
    from: { label: 'Ari', nodeType: 'presence', presenceScope: 'ari' },
  })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('runtimeKey')))
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.0.7 — Deferred Action Rejection
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.0.7 Deferred action rejection ──')

test('deferred actions are rejected by validation', () => {
  for (const action of DEFERRED_EDIT_ACTIONS) {
    const result = validateEditActionPayload({
      ...VALID_NODE_PAYLOAD,
      edit_action_type: action,
    })
    assert.ok(!result.valid, `${action} should be rejected`)
    assert.ok(result.errors.some(e => e.includes('deferred')), `${action} error should mention deferred`)
  }
})

test('invalid action type is rejected', () => {
  const result = validateEditActionPayload({
    ...VALID_NODE_PAYLOAD,
    edit_action_type: 'delete_everything',
  })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('Invalid edit_action_type')))
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.0.8 — Dedupe Key Generation
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.0.8 Dedupe key generation ──')

test('node dedupe key format is correct', () => {
  const key = generateEditActionDedupeKey(VALID_NODE_PAYLOAD)
  assert.equal(key, 'node:map_ui:relational_map_ui:shared:test entity')
})

test('edge dedupe key format is correct', () => {
  const key = generateEditActionDedupeKey(VALID_EDGE_PAYLOAD)
  assert.equal(key, 'edge:map_ui:relational_map_ui:ari:belongs_to:ari:selinaric house')
})

test('dedupe key normalizes label case and whitespace', () => {
  const key = generateEditActionDedupeKey({ ...VALID_NODE_PAYLOAD, canonical_label: '  Test   ENTITY  ' })
  assert.equal(key, 'node:map_ui:relational_map_ui:shared:test entity')
})

test('different labels produce different dedupe keys', () => {
  const key1 = generateEditActionDedupeKey({ ...VALID_NODE_PAYLOAD, canonical_label: 'Alpha' })
  const key2 = generateEditActionDedupeKey({ ...VALID_NODE_PAYLOAD, canonical_label: 'Beta' })
  assert.notEqual(key1, key2)
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.0.9 — Safety Checks
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.0.9 Safety checks ──')

test('graphEditActions does not reference Memory tables', () => {
  const code = readFileSync(resolve(__dirname, '..', 'graphEditActions.ts'), 'utf-8')
  assert.ok(!code.includes("from('memory_nodes')"), 'must not reference memory_nodes')
  assert.ok(!code.includes("from('memory_edges')"), 'must not reference memory_edges')
  assert.ok(!code.includes('prompt_eligible: true'), 'must not set prompt_eligible: true')
  assert.ok(!code.includes('prompt_eligible = true'), 'must not set prompt_eligible = true')
})

test('graphEditActions does not reference Archive authority', () => {
  const code = readFileSync(resolve(__dirname, '..', 'graphEditActions.ts'), 'utf-8')
  assert.ok(!code.includes('canonical_status'), 'must not reference canonical_status')
  assert.ok(!code.includes("from('archive_items')"), 'must not write to archive_items')
})

test('graphEditActions enforces review_required and ontology_lab', () => {
  const code = readFileSync(resolve(__dirname, '..', 'graphEditActions.ts'), 'utf-8')
  assert.ok(code.includes("requires_review !== true"), 'must check requires_review')
  assert.ok(code.includes("review_surface !== 'ontology_lab'"), 'must check review_surface')
})

test('contract file contains governance law comments', () => {
  const code = readFileSync(resolve(__dirname, '..', 'graphEditActions.ts'), 'utf-8')
  assert.ok(code.includes('A graph edit action is never a graph edit'), 'must contain core law')
  assert.ok(code.includes('proposal to be reviewed'), 'must reference review requirement')
  assert.ok(code.includes('Ontology Lab governs'), 'must reference Ontology Lab')
})

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n═════════════════════════════════════════════════')
console.log(`  Phase 37G.0 Graph Edit Action Contract Tests: ${passed} passed, ${failed} failed`)
console.log('═════════════════════════════════════════════════\n')

if (failed > 0) process.exit(1)
