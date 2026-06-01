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
  NON_MATERIALISING_EDIT_ACTIONS,
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

test('SUPPORTED_EDIT_ACTIONS has 9 actions through 37G.3c (all actions supported)', () => {
  assert.equal(SUPPORTED_EDIT_ACTIONS.length, 9)
  assert.ok(SUPPORTED_EDIT_ACTIONS.includes('suggest_node'))
  assert.ok(SUPPORTED_EDIT_ACTIONS.includes('suggest_edge'))
  assert.ok(SUPPORTED_EDIT_ACTIONS.includes('suggest_alias'))
  assert.ok(SUPPORTED_EDIT_ACTIONS.includes('suggest_reclassify'))
  assert.ok(SUPPORTED_EDIT_ACTIONS.includes('suggest_confidence_change'))
  assert.ok(SUPPORTED_EDIT_ACTIONS.includes('suggest_salience_change'))
})

test('DEFERRED_EDIT_ACTIONS is now empty (all 37G actions implemented through 37G.3c)', () => {
  assert.equal(DEFERRED_EDIT_ACTIONS.length, 0)
  assert.ok(!DEFERRED_EDIT_ACTIONS.includes('suggest_reclassify'), 'suggest_reclassify now supported')
  assert.ok(!DEFERRED_EDIT_ACTIONS.includes('suggest_confidence_change'), 'suggest_confidence_change now supported')
  assert.ok(!DEFERRED_EDIT_ACTIONS.includes('suggest_salience_change'), 'suggest_salience_change now supported')
  assert.ok(!DEFERRED_EDIT_ACTIONS.includes('suggest_split'), 'suggest_split now supported in 37G.3a')
  assert.ok(!DEFERRED_EDIT_ACTIONS.includes('suggest_merge'), 'suggest_merge now supported in 37G.3b')
  assert.ok(!DEFERRED_EDIT_ACTIONS.includes('suggest_retire_or_supersede'), 'suggest_retire_or_supersede now supported in 37G.3c')
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

test('isSupportedEditAction accepts all supported actions', () => {
  assert.ok(isSupportedEditAction('suggest_node'))
  assert.ok(isSupportedEditAction('suggest_edge'))
  assert.ok(isSupportedEditAction('suggest_alias'))
  assert.ok(isSupportedEditAction('suggest_reclassify'))
  assert.ok(isSupportedEditAction('suggest_confidence_change'))
  assert.ok(isSupportedEditAction('suggest_salience_change'))
  assert.ok(isSupportedEditAction('suggest_split'), 'suggest_split now supported in 37G.3a')
  assert.ok(isSupportedEditAction('suggest_merge'), 'suggest_merge now supported in 37G.3b')
  assert.ok(isSupportedEditAction('suggest_retire_or_supersede'), 'suggest_retire_or_supersede now supported in 37G.3c')
})

test('isDeferredEditAction — no actions deferred after 37G.3c', () => {
  assert.ok(!isDeferredEditAction('suggest_alias'), 'suggest_alias promoted to supported')
  assert.ok(!isDeferredEditAction('suggest_merge'), 'suggest_merge promoted in 37G.3b')
  assert.ok(!isDeferredEditAction('suggest_retire_or_supersede'), 'suggest_retire_or_supersede promoted in 37G.3c')
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

// ═══════════════════════════════════════════════════════════════════════════
// 37G.2 — Alias Action Contract Tests
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.2 Alias action contract ──')

test('suggest_alias is now in SUPPORTED_EDIT_ACTIONS', () => {
  assert.ok(SUPPORTED_EDIT_ACTIONS.includes('suggest_alias'))
})

test('suggest_alias is no longer in DEFERRED_EDIT_ACTIONS', () => {
  assert.ok(!DEFERRED_EDIT_ACTIONS.includes('suggest_alias'))
})

test('SUPPORTED_EDIT_ACTIONS now has 9 actions (all 37G actions supported through 37G.3c)', () => {
  assert.equal(SUPPORTED_EDIT_ACTIONS.length, 9)
  assert.ok(SUPPORTED_EDIT_ACTIONS.includes('suggest_retire_or_supersede'))
})

test('no deferred actions remain after 37G.3c — suggest_retire_or_supersede now passes gate', () => {
  // suggest_retire_or_supersede is now supported — the gate should pass it
  // (it may fail validation for other reasons, but not the deferred gate)
  assert.ok(isSupportedEditAction('suggest_retire_or_supersede'), 'must be supported')
  assert.ok(!isDeferredEditAction('suggest_retire_or_supersede'), 'must not be deferred')
})

const VALID_ALIAS_PAYLOAD = {
  edit_action_type: 'suggest_alias',
  edit_origin: 'relational_map',
  edit_origin_phase: '37G.2',
  grain_level: 'overview',
  detail_policy: 'review_required',
  requires_review: true,
  review_surface: 'ontology_lab',
  governance_note: 'Alias proposal only.',
  target: {
    label: 'Selináric House',
    nodeType: 'project',
    presenceScope: 'house',
    runtimeKey: 'node:house:project:selináric house',
    proposalId: '08a72feb-b37d-46c3-99b8-ee0c00ec5357',
  },
  proposed_alias: 'House',
  canonical_label: 'Alias: House → Selináric House',
  rationale: 'Common shorthand.',
}

test('valid alias payload passes', () => {
  const result = validateEditActionPayload(VALID_ALIAS_PAYLOAD)
  assert.ok(result.valid, result.errors.join('; '))
})

test('alias payload rejects missing target', () => {
  const { target, ...rest } = VALID_ALIAS_PAYLOAD
  const result = validateEditActionPayload(rest)
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('target')))
})

test('alias payload rejects missing target presenceScope', () => {
  const result = validateEditActionPayload({
    ...VALID_ALIAS_PAYLOAD,
    target: { label: 'House', nodeType: 'project', runtimeKey: 'node:...' },
  })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('presenceScope')))
})

test('alias payload rejects empty alias', () => {
  const result = validateEditActionPayload({ ...VALID_ALIAS_PAYLOAD, proposed_alias: '' })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('proposed_alias')))
})

test('alias payload rejects alias equal to target label', () => {
  const result = validateEditActionPayload({ ...VALID_ALIAS_PAYLOAD, proposed_alias: 'Selináric House' })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('same as the target')))
})

test('alias payload rejects alias too long', () => {
  const result = validateEditActionPayload({ ...VALID_ALIAS_PAYLOAD, proposed_alias: 'A'.repeat(61) })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('too long')))
})

test('alias dedupe key has correct format', () => {
  const key = generateEditActionDedupeKey(VALID_ALIAS_PAYLOAD)
  assert.ok(key.startsWith('alias:map_ui:relational_map_ui:'), `key was: ${key}`)
  assert.ok(key.includes(':house'), `key should contain normalised target runtimeKey`)
  assert.ok(key.endsWith(':house'), `key should end with normalised alias`)
})

test('alias dedupe key differs from node and edge keys', () => {
  const aliasKey = generateEditActionDedupeKey(VALID_ALIAS_PAYLOAD)
  const nodeKey = generateEditActionDedupeKey({ ...VALID_ALIAS_PAYLOAD, edit_action_type: 'suggest_node', label: 'House', presence_scope: 'house', canonical_label: 'House' })
  assert.notEqual(aliasKey, nodeKey)
  assert.ok(aliasKey.startsWith('alias:'))
  assert.ok(nodeKey.startsWith('node:'))
})

// ── Renderer guard ──
test('buildRelationalMap uses shared NON_MATERIALISING_EDIT_ACTIONS guard', () => {
  const code = readFileSync(resolve(__dirname, '..', 'buildRelationalMap.ts'), 'utf-8')
  assert.ok(code.includes('NON_MATERIALISING_EDIT_ACTIONS'), 'renderer guard must use shared set')
  assert.ok(code.includes('NON_MATERIALISING_EDIT_ACTIONS.has'), 'guard must use .has() check')
  assert.ok(code.includes('must not materialise'), 'must have governance warning text')
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.3 — Metadata-Change Contract Tests
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.3 Metadata-change contract ──')

test('NON_MATERIALISING_EDIT_ACTIONS set contains all six non-materialising types', () => {
  assert.ok(NON_MATERIALISING_EDIT_ACTIONS.has('suggest_alias'))
  assert.ok(NON_MATERIALISING_EDIT_ACTIONS.has('suggest_reclassify'))
  assert.ok(NON_MATERIALISING_EDIT_ACTIONS.has('suggest_confidence_change'))
  assert.ok(NON_MATERIALISING_EDIT_ACTIONS.has('suggest_salience_change'))
  assert.ok(NON_MATERIALISING_EDIT_ACTIONS.has('suggest_split'), 'suggest_split must be non-materialising')
  assert.ok(NON_MATERIALISING_EDIT_ACTIONS.has('suggest_merge'), 'suggest_merge must be non-materialising')
  assert.equal(NON_MATERIALISING_EDIT_ACTIONS.size, 7)
})

test('no actions remain deferred after 37G.3c — deferred array empty', () => {
  assert.equal(DEFERRED_EDIT_ACTIONS.length, 0, 'DEFERRED_EDIT_ACTIONS must be empty')
})

const VALID_META_TARGET_NODE = {
  kind: 'node' as const,
  label: 'Continuity',
  nodeType: 'concept',
  presenceScope: 'shared',
  runtimeKey: 'node:shared:concept:continuity',
  proposalId: '07480668-11cd-4176-8dcb-73fd34187645',
}

const VALID_RECLASSIFY_PAYLOAD = {
  edit_action_type: 'suggest_reclassify',
  edit_origin: 'relational_map',
  edit_origin_phase: '37G.3',
  grain_level: 'overview',
  detail_policy: 'review_required',
  requires_review: true,
  review_surface: 'ontology_lab',
  governance_note: 'Metadata-change proposal only.',
  target: VALID_META_TARGET_NODE,
  field: 'node_type',
  current_value: 'concept',
  proposed_value: 'project',
  rationale: 'Continuity acts more like a project arc.',
}

test('valid reclassify payload passes', () => {
  const result = validateEditActionPayload(VALID_RECLASSIFY_PAYLOAD)
  assert.ok(result.valid, result.errors.join('; '))
})

test('reclassify rejects invalid field', () => {
  const result = validateEditActionPayload({ ...VALID_RECLASSIFY_PAYLOAD, field: 'authority_status' })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('not supported')))
})

test('reclassify rejects invalid proposed node_type', () => {
  const result = validateEditActionPayload({ ...VALID_RECLASSIFY_PAYLOAD, proposed_value: 'invalid_xyz' })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('not a valid node type')))
})

test('reclassify rejects no-op (same value)', () => {
  const result = validateEditActionPayload({ ...VALID_RECLASSIFY_PAYLOAD, proposed_value: 'concept' })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('same as current_value')))
})

test('reclassify grain_level validates correctly', () => {
  const result = validateEditActionPayload({ ...VALID_RECLASSIFY_PAYLOAD, field: 'grain_level', current_value: 'midlevel', proposed_value: 'overview' })
  assert.ok(result.valid, result.errors.join('; '))
})

const VALID_CONFIDENCE_PAYLOAD = {
  edit_action_type: 'suggest_confidence_change',
  edit_origin: 'relational_map',
  edit_origin_phase: '37G.3',
  grain_level: 'overview',
  detail_policy: 'review_required',
  requires_review: true,
  review_surface: 'ontology_lab',
  governance_note: 'Metadata-change proposal only.',
  target: VALID_META_TARGET_NODE,
  current_confidence: 0.70,
  proposed_confidence: 0.85,
  rationale: 'Multiple supporting edges.',
}

test('valid confidence payload passes', () => {
  const result = validateEditActionPayload(VALID_CONFIDENCE_PAYLOAD)
  assert.ok(result.valid, result.errors.join('; '))
})

test('confidence rejects out-of-range', () => {
  assert.ok(!validateEditActionPayload({ ...VALID_CONFIDENCE_PAYLOAD, proposed_confidence: 1.5 }).valid)
  assert.ok(!validateEditActionPayload({ ...VALID_CONFIDENCE_PAYLOAD, proposed_confidence: -0.1 }).valid)
})

test('confidence rejects no-op', () => {
  const result = validateEditActionPayload({ ...VALID_CONFIDENCE_PAYLOAD, proposed_confidence: 0.70 })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('same as current')))
})

test('confidence rejects non-number', () => {
  const result = validateEditActionPayload({ ...VALID_CONFIDENCE_PAYLOAD, proposed_confidence: '0.85' })
  assert.ok(!result.valid)
})

const VALID_SALIENCE_PAYLOAD = {
  edit_action_type: 'suggest_salience_change',
  edit_origin: 'relational_map',
  edit_origin_phase: '37G.3',
  grain_level: 'overview',
  detail_policy: 'review_required',
  requires_review: true,
  review_surface: 'ontology_lab',
  governance_note: 'Metadata-change proposal only.',
  target: VALID_META_TARGET_NODE,
  current_salience: 0.80,
  proposed_salience: 0.95,
  rationale: 'Central concept.',
}

test('valid salience payload passes', () => {
  const result = validateEditActionPayload(VALID_SALIENCE_PAYLOAD)
  assert.ok(result.valid, result.errors.join('; '))
})

test('salience rejects out-of-range', () => {
  assert.ok(!validateEditActionPayload({ ...VALID_SALIENCE_PAYLOAD, proposed_salience: 1.2 }).valid)
})

test('salience rejects no-op', () => {
  const result = validateEditActionPayload({ ...VALID_SALIENCE_PAYLOAD, proposed_salience: 0.80 })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('same as current')))
})

test('metadata dedupe key has correct prefix', () => {
  const key = generateEditActionDedupeKey(VALID_RECLASSIFY_PAYLOAD)
  assert.ok(key.startsWith('metadata:map_ui:relational_map_ui:suggest_reclassify:'), `key: ${key}`)
  assert.ok(key.includes(':node_type:'), `key should include field`)
})

test('confidence dedupe key includes change field and value', () => {
  const key = generateEditActionDedupeKey(VALID_CONFIDENCE_PAYLOAD)
  assert.ok(key.startsWith('metadata:map_ui:relational_map_ui:suggest_confidence_change:'))
  assert.ok(key.endsWith(':confidence:0.85'))
})

test('reclassify edge payload with edge target passes', () => {
  const result = validateEditActionPayload({
    ...VALID_RECLASSIFY_PAYLOAD,
    target: { kind: 'edge', label: 'Ari belongs to House', edgeType: 'belongs_to', presenceScope: 'shared', runtimeKey: 'edge:123' },
    field: 'edge_type',
    current_value: 'belongs_to',
    proposed_value: 'supports',
  })
  assert.ok(result.valid, result.errors.join('; '))
})

test('node reclassify field rejects edge fields', () => {
  const result = validateEditActionPayload({ ...VALID_RECLASSIFY_PAYLOAD, field: 'edge_type' })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('not supported')))
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.3a — Split Contract Tests
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.3a Split action contract ──')

test('suggest_split is now in SUPPORTED_EDIT_ACTIONS', () => {
  assert.ok(SUPPORTED_EDIT_ACTIONS.includes('suggest_split'))
})

test('suggest_split is no longer in DEFERRED_EDIT_ACTIONS', () => {
  assert.ok(!DEFERRED_EDIT_ACTIONS.includes('suggest_split'))
})

test('suggest_retire_or_supersede now supported in 37G.3c', () => {
  assert.ok(!isDeferredEditAction('suggest_merge'), 'suggest_merge is now supported')
  assert.ok(!isDeferredEditAction('suggest_retire_or_supersede'), 'suggest_retire_or_supersede now supported')
  assert.ok(!isDeferredEditAction('suggest_split'))
})

const VALID_SPLIT_PAYLOAD = {
  edit_action_type: 'suggest_split',
  edit_origin: 'relational_map',
  edit_origin_phase: '37G.3a',
  grain_level: 'overview',
  detail_policy: 'review_required',
  requires_review: true,
  review_surface: 'ontology_lab',
  governance_note: 'Split proposal only.',
  target: {
    kind: 'node' as const,
    label: 'Continuity',
    nodeType: 'concept',
    presenceScope: 'shared',
    runtimeKey: 'node:shared:concept:continuity',
    proposalId: '07480668-11cd-4176-8dcb-73fd34187645',
    derivedFromEdge: false,
  },
  proposed_parts: [
    { label: 'Memory Continuity', nodeType: 'concept', presenceScope: 'shared', grainLevel: 'overview' },
    { label: 'Technical Continuity', nodeType: 'concept', presenceScope: 'house', grainLevel: 'overview' },
  ],
  split_rationale: 'Continuity blends two distinct concerns.',
  canonical_label: 'Split: Continuity → Memory Continuity + Technical Continuity',
}

test('valid split payload passes', () => {
  const result = validateEditActionPayload(VALID_SPLIT_PAYLOAD)
  assert.ok(result.valid, result.errors.join('; '))
})

test('split rejects missing target', () => {
  const { target, ...rest } = VALID_SPLIT_PAYLOAD
  const result = validateEditActionPayload(rest)
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('target')))
})

test('split rejects non-node target', () => {
  const result = validateEditActionPayload({ ...VALID_SPLIT_PAYLOAD, target: { ...VALID_SPLIT_PAYLOAD.target, kind: 'edge' as any } })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('kind must be "node"')))
})

test('split rejects derived target', () => {
  const result = validateEditActionPayload({ ...VALID_SPLIT_PAYLOAD, target: { ...VALID_SPLIT_PAYLOAD.target, derivedFromEdge: true } })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('Derived')))
})

test('split rejects fewer than 2 parts', () => {
  const result = validateEditActionPayload({ ...VALID_SPLIT_PAYLOAD, proposed_parts: [{ label: 'X', nodeType: 'concept', presenceScope: 'shared' }] })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('At least 2')))
})

test('split rejects more than 5 parts', () => {
  const sixParts = Array(6).fill(null).map((_, i) => ({ label: `Part ${i}`, nodeType: 'concept', presenceScope: 'shared' }))
  const result = validateEditActionPayload({ ...VALID_SPLIT_PAYLOAD, proposed_parts: sixParts })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('Maximum 5')))
})

test('split rejects duplicate part labels', () => {
  const result = validateEditActionPayload({
    ...VALID_SPLIT_PAYLOAD,
    proposed_parts: [
      { label: 'Memory Continuity', nodeType: 'concept', presenceScope: 'shared' },
      { label: 'Memory Continuity', nodeType: 'concept', presenceScope: 'house' },
    ],
  })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('duplicates another part')))
})

test('split rejects part label equal to target label', () => {
  const result = validateEditActionPayload({
    ...VALID_SPLIT_PAYLOAD,
    proposed_parts: [
      { label: 'Continuity', nodeType: 'concept', presenceScope: 'shared' },
      { label: 'Technical Continuity', nodeType: 'concept', presenceScope: 'house' },
    ],
  })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('same as the target')))
})

test('split rejects invalid part nodeType', () => {
  const result = validateEditActionPayload({
    ...VALID_SPLIT_PAYLOAD,
    proposed_parts: [
      { label: 'Part A', nodeType: 'invalid_xyz', presenceScope: 'shared' },
      { label: 'Part B', nodeType: 'concept', presenceScope: 'shared' },
    ],
  })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('invalid nodeType')))
})

test('split rejects invalid part presenceScope', () => {
  const result = validateEditActionPayload({
    ...VALID_SPLIT_PAYLOAD,
    proposed_parts: [
      { label: 'Part A', nodeType: 'concept', presenceScope: 'invalid_scope' },
      { label: 'Part B', nodeType: 'concept', presenceScope: 'shared' },
    ],
  })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('invalid presenceScope')))
})

test('split allows 3-5 parts', () => {
  const fiveParts = ['Part A', 'Part B', 'Part C', 'Part D', 'Part E'].map(l => ({ label: l, nodeType: 'concept', presenceScope: 'shared' }))
  const result = validateEditActionPayload({ ...VALID_SPLIT_PAYLOAD, proposed_parts: fiveParts })
  assert.ok(result.valid, result.errors.join('; '))
})

test('split dedupe key is order-insensitive (sorted parts)', () => {
  const key1 = generateEditActionDedupeKey({
    ...VALID_SPLIT_PAYLOAD,
    proposed_parts: [
      { label: 'Memory Continuity', nodeType: 'concept', presenceScope: 'shared' },
      { label: 'Technical Continuity', nodeType: 'concept', presenceScope: 'house' },
    ],
  })
  const key2 = generateEditActionDedupeKey({
    ...VALID_SPLIT_PAYLOAD,
    proposed_parts: [
      { label: 'Technical Continuity', nodeType: 'concept', presenceScope: 'house' },
      { label: 'Memory Continuity', nodeType: 'concept', presenceScope: 'shared' },
    ],
  })
  assert.equal(key1, key2, 'dedupe key must be same regardless of part order')
  assert.ok(key1.startsWith('split:map_ui:relational_map_ui:'), `key: ${key1}`)
})

test('split dedupe key contains normalised part labels', () => {
  const key = generateEditActionDedupeKey(VALID_SPLIT_PAYLOAD)
  assert.ok(key.includes('memory continuity'), `key: ${key}`)
  assert.ok(key.includes('technical continuity'), `key: ${key}`)
})

test('suggest_split maps to proposal_type=node', () => {
  assert.equal(editActionToProposalType('suggest_split'), 'node')
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.3b — Merge Contract Tests
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.3b Merge action contract ──')

test('suggest_merge is now in SUPPORTED_EDIT_ACTIONS', () => {
  assert.ok(SUPPORTED_EDIT_ACTIONS.includes('suggest_merge'))
})

test('suggest_merge is no longer in DEFERRED_EDIT_ACTIONS', () => {
  assert.ok(!DEFERRED_EDIT_ACTIONS.includes('suggest_merge'))
})

test('DEFERRED_EDIT_ACTIONS is empty (37G.3c promoted last action)', () => {
  assert.equal(DEFERRED_EDIT_ACTIONS.length, 0)
  assert.ok(!DEFERRED_EDIT_ACTIONS.includes('suggest_retire_or_supersede'), 'all actions now supported')
})
  assert.equal(NON_MATERIALISING_EDIT_ACTIONS.size, 7)
test('NON_MATERIALISING_EDIT_ACTIONS now includes suggest_merge (7 total after 37G.3c)', () => {
  assert.ok(NON_MATERIALISING_EDIT_ACTIONS.has('suggest_merge'))
  assert.equal(NON_MATERIALISING_EDIT_ACTIONS.size, 7)
})

const VALID_MERGE_PAYLOAD = {
  edit_action_type: 'suggest_merge',
  edit_origin: 'relational_map',
  edit_origin_phase: '37G.3b',
  grain_level: 'overview',
  detail_policy: 'review_required',
  requires_review: true,
  review_surface: 'ontology_lab',
  governance_note: 'Merge proposal only.',
  source_node: {
    kind: 'node' as const,
    label: 'The Bond',
    nodeType: 'relationship_arc',
    presenceScope: 'shared',
    runtimeKey: 'node:shared:relationship_arc:the bond',
    proposalId: 'aed2488c-f132-450b-aba6-2a8871b150c9',
    derivedFromEdge: false,
  },
  target_node: {
    kind: 'node' as const,
    label: 'Selináric Bond',
    nodeType: 'relationship_arc',
    presenceScope: 'shared',
    runtimeKey: 'node:shared:relationship_arc:selináric bond',
    proposalId: 'aed2488c-1234-0000-0000-000000000000',
    derivedFromEdge: false,
  },
  preferred_canonical_label: 'Selináric Bond',
  merge_rationale: 'These nodes appear to represent the same relational structure.',
}

test('valid merge payload passes', () => {
  const result = validateEditActionPayload(VALID_MERGE_PAYLOAD)
  assert.ok(result.valid, result.errors.join('; '))
})

test('merge rejects missing source_node', () => {
  const { source_node, ...rest } = VALID_MERGE_PAYLOAD
  const result = validateEditActionPayload(rest)
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('source_node')))
})

test('merge rejects missing target_node', () => {
  const { target_node, ...rest } = VALID_MERGE_PAYLOAD
  const result = validateEditActionPayload(rest)
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('target_node')))
})

test('merge rejects same source and target runtime key', () => {
  const result = validateEditActionPayload({
    ...VALID_MERGE_PAYLOAD,
    target_node: { ...VALID_MERGE_PAYLOAD.source_node },
  })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('same runtimeKey')))
})

test('merge rejects derived source node', () => {
  const result = validateEditActionPayload({
    ...VALID_MERGE_PAYLOAD,
    source_node: { ...VALID_MERGE_PAYLOAD.source_node, derivedFromEdge: true },
  })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('derived display node')))
})

test('merge rejects invalid source nodeType', () => {
  const result = validateEditActionPayload({
    ...VALID_MERGE_PAYLOAD,
    source_node: { ...VALID_MERGE_PAYLOAD.source_node, nodeType: 'invalid_xyz' },
  })
  assert.ok(!result.valid)
})

test('merge rejects preferred_canonical_label that is neither source nor target label', () => {
  const result = validateEditActionPayload({
    ...VALID_MERGE_PAYLOAD,
    preferred_canonical_label: 'A Completely Different Label',
  })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('source node label or the target node label')))
})

test('merge accepts preferred_canonical_label equal to source label', () => {
  const result = validateEditActionPayload({
    ...VALID_MERGE_PAYLOAD,
    preferred_canonical_label: 'The Bond',
  })
  assert.ok(result.valid, result.errors.join('; '))
})

test('merge rejects empty preferred_canonical_label', () => {
  const result = validateEditActionPayload({ ...VALID_MERGE_PAYLOAD, preferred_canonical_label: '' })
  assert.ok(!result.valid)
})

test('merge dedupe key is order-insensitive', () => {
  const key1 = generateEditActionDedupeKey(VALID_MERGE_PAYLOAD)
  const key2 = generateEditActionDedupeKey({
    ...VALID_MERGE_PAYLOAD,
    source_node: VALID_MERGE_PAYLOAD.target_node,
    target_node: VALID_MERGE_PAYLOAD.source_node,
  })
  assert.equal(key1, key2, 'A+B and B+A must produce the same dedupe key')
  assert.ok(key1.startsWith('merge:map_ui:relational_map_ui:'), `key: ${key1}`)
})

test('merge dedupe key includes preferred canonical label', () => {
  const key = generateEditActionDedupeKey(VALID_MERGE_PAYLOAD)
  assert.ok(key.includes('selináric bond') || key.includes('selinaric bond') || key.endsWith(':selináric bond'))
})

test('merge maps to proposal_type=node', () => {
  assert.equal(editActionToProposalType('suggest_merge'), 'node')
})

test('cross-type merge passes validation (types preserved in payload)', () => {
  const result = validateEditActionPayload({
    ...VALID_MERGE_PAYLOAD,
    source_node: { ...VALID_MERGE_PAYLOAD.source_node, nodeType: 'concept' },
    target_node: { ...VALID_MERGE_PAYLOAD.target_node, nodeType: 'project' },
    preferred_canonical_label: 'The Bond',
  })
  assert.ok(result.valid, 'cross-type merge must be allowed, not rejected')
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.3c — Lifecycle (Retire/Supersede) Contract Tests
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.3c Lifecycle action contract ──')

test('suggest_retire_or_supersede is now in SUPPORTED_EDIT_ACTIONS', () => {
  assert.ok(SUPPORTED_EDIT_ACTIONS.includes('suggest_retire_or_supersede'))
  assert.equal(SUPPORTED_EDIT_ACTIONS.length, 9) // all 9 actions supported
})

test('DEFERRED_EDIT_ACTIONS is empty — all 37G actions implemented', () => {
  assert.equal(DEFERRED_EDIT_ACTIONS.length, 0)
})

test('NON_MATERIALISING_EDIT_ACTIONS now includes suggest_retire_or_supersede (7 total)', () => {
  assert.ok(NON_MATERIALISING_EDIT_ACTIONS.has('suggest_retire_or_supersede'))
  assert.equal(NON_MATERIALISING_EDIT_ACTIONS.size, 7)
})

const VALID_RETIRE_PAYLOAD = {
  edit_action_type: 'suggest_retire_or_supersede',
  edit_origin: 'relational_map',
  edit_origin_phase: '37G.3c',
  grain_level: 'overview',
  detail_policy: 'review_required',
  requires_review: true,
  review_surface: 'ontology_lab',
  governance_note: 'Lifecycle proposal only.',
  lifecycle_mode: 'retire' as const,
  target_node: {
    kind: 'node' as const,
    label: 'Temporary Test Concept',
    nodeType: 'concept',
    presenceScope: 'house',
    runtimeKey: 'node:house:concept:temporary test concept',
    proposalId: '08a72feb-b37d-46c3-99b8-ee0c00ec5357',
    derivedFromEdge: false,
  },
  lifecycle_rationale: 'Created for smoke testing and should be retired.',
}

const VALID_SUPERSEDE_PAYLOAD = {
  ...VALID_RETIRE_PAYLOAD,
  lifecycle_mode: 'supersede' as const,
  target_node: {
    kind: 'node' as const,
    label: 'Ari Archives',
    nodeType: 'concept',
    presenceScope: 'ari',
    runtimeKey: 'node:ari:concept:ari archives',
    proposalId: '79284094-b888-4309-847f-808f5316da45',
    derivedFromEdge: false,
  },
  successor_node: {
    kind: 'node' as const,
    label: 'Velvet Archives',
    nodeType: 'room',
    presenceScope: 'ari',
    runtimeKey: 'node:ari:room:velvet archives',
    proposalId: 'b25938a4-6827-4c29-9181-870935f15a8e',
    derivedFromEdge: false,
  },
  lifecycle_rationale: 'Velvet Archives is the preferred canonical archive node for Ari.',
}

test('valid retire payload passes', () => {
  const result = validateEditActionPayload(VALID_RETIRE_PAYLOAD)
  assert.ok(result.valid, result.errors.join('; '))
})

test('valid supersede payload passes', () => {
  const result = validateEditActionPayload(VALID_SUPERSEDE_PAYLOAD)
  assert.ok(result.valid, result.errors.join('; '))
})

test('missing lifecycle_mode rejected', () => {
  const { lifecycle_mode, ...rest } = VALID_RETIRE_PAYLOAD
  const result = validateEditActionPayload(rest)
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('lifecycle_mode')))
})

test('invalid lifecycle_mode rejected', () => {
  const result = validateEditActionPayload({ ...VALID_RETIRE_PAYLOAD, lifecycle_mode: 'delete' as any })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('lifecycle_mode')))
})

test('missing target_node rejected', () => {
  const { target_node, ...rest } = VALID_RETIRE_PAYLOAD
  const result = validateEditActionPayload(rest)
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('target_node')))
})

test('derived target rejected', () => {
  const result = validateEditActionPayload({
    ...VALID_RETIRE_PAYLOAD,
    target_node: { ...VALID_RETIRE_PAYLOAD.target_node, derivedFromEdge: true },
  })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('derived display node')))
})

test('retire rejects successor_node when supplied', () => {
  const result = validateEditActionPayload({
    ...VALID_RETIRE_PAYLOAD,
    successor_node: VALID_SUPERSEDE_PAYLOAD.successor_node,
  })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('Retire proposals must not include a successor_node')))
})

test('supersede requires successor_node', () => {
  const { successor_node, ...rest } = VALID_SUPERSEDE_PAYLOAD
  const result = validateEditActionPayload(rest)
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('successor_node')))
})

test('supersede rejects same target and successor runtimeKey', () => {
  const result = validateEditActionPayload({
    ...VALID_SUPERSEDE_PAYLOAD,
    successor_node: { ...VALID_SUPERSEDE_PAYLOAD.target_node },
  })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('same runtimeKey')))
})

test('rationale too short rejected', () => {
  const result = validateEditActionPayload({ ...VALID_RETIRE_PAYLOAD, lifecycle_rationale: 'short' })
  assert.ok(!result.valid)
  assert.ok(result.errors.some(e => e.includes('10 characters')))
})

test('retire dedupe key format', () => {
  const key = generateEditActionDedupeKey(VALID_RETIRE_PAYLOAD)
  assert.ok(key.startsWith('lifecycle:map_ui:relational_map_ui:retire:'), `key: ${key}`)
  assert.ok(key.includes('temporary test concept'), `key: ${key}`)
})

test('supersede dedupe key format', () => {
  const key = generateEditActionDedupeKey(VALID_SUPERSEDE_PAYLOAD)
  assert.ok(key.startsWith('lifecycle:map_ui:relational_map_ui:supersede:'), `key: ${key}`)
  assert.ok(key.includes(':'), 'must contain target and successor keys')
})

test('supersede dedupe is directional (A→B ≠ B→A)', () => {
  const keyAB = generateEditActionDedupeKey(VALID_SUPERSEDE_PAYLOAD)
  const keyBA = generateEditActionDedupeKey({
    ...VALID_SUPERSEDE_PAYLOAD,
    target_node: VALID_SUPERSEDE_PAYLOAD.successor_node,
    successor_node: VALID_SUPERSEDE_PAYLOAD.target_node,
  })
  assert.notEqual(keyAB, keyBA, 'supersede A→B and B→A must produce different dedupe keys')
})

test('suggest_retire_or_supersede maps to proposal_type=node', () => {
  assert.equal(editActionToProposalType('suggest_retire_or_supersede'), 'node')
})

console.log('\n═════════════════════════════════════════════════')
console.log(`  Phase 37G.0/37G.2/37G.3/37G.3a/37G.3b/37G.3c Contract Tests: ${passed} passed, ${failed} failed`)
console.log('═════════════════════════════════════════════════\n')

if (failed > 0) process.exit(1)
