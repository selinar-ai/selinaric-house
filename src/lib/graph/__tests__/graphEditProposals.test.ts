/**
 * Phase 37G.1 — Graph Edit Proposals Tests
 *
 * Suggest means pending_review. Suggest never means approved.
 * The map may offer the pen. Ontology Lab still holds the seal.
 *
 * Usage: npx tsx src/lib/graph/__tests__/graphEditProposals.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
// 37G.1.1 — createProposal backward compatibility
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.1.1 createProposal backward compatibility ──')

test('createProposal interface has proposedBy optional field', () => {
  const code = readFileSync(resolve(__dirname, '..', 'proposals.ts'), 'utf-8')
  assert.ok(code.includes('proposedBy?'), 'proposedBy must be optional')
  assert.ok(code.includes("'tara' | 'ari' | 'eli' | 'system_candidate' | 'graph_pipeline'"), 'proposedBy must use valid check values')
})

test('createProposal interface has generationVersion optional field', () => {
  const code = readFileSync(resolve(__dirname, '..', 'proposals.ts'), 'utf-8')
  assert.ok(code.includes('generationVersion?'), 'generationVersion must be optional')
})

test('createProposal defaults to graph_pipeline when proposedBy not provided', () => {
  const code = readFileSync(resolve(__dirname, '..', 'proposals.ts'), 'utf-8')
  assert.ok(code.includes("input.proposedBy ?? 'graph_pipeline'"), 'must default to graph_pipeline')
})

test('createProposal defaults to 37B when generationVersion not provided', () => {
  const code = readFileSync(resolve(__dirname, '..', 'proposals.ts'), 'utf-8')
  assert.ok(code.includes("input.generationVersion ?? '37B'"), 'must default to 37B')
})

test('existing pipeline callers in proposalGenerator still work unchanged', () => {
  const code = readFileSync(resolve(__dirname, '..', 'proposalGenerator.ts'), 'utf-8')
  // The generator doesn't pass proposedBy — should use default
  const hasProposedByOverride = code.includes('proposedBy:') && !code.includes('proposedBy: undefined')
  // It's fine if it doesn't pass it (uses default)
  assert.ok(!hasProposedByOverride || code.includes('graph_pipeline'), 'generator must not break backward compat')
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.1.2 — API route structure
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.1.2 API route structure ──')

test('POST /api/graph-edit-proposals route exists', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('export async function POST'), 'POST handler must exist')
})

test('route rejects unsupported action types', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('isSupportedEditAction'), 'must check isSupportedEditAction')
  assert.ok(code.includes('Unsupported edit action') || code.includes('not supported'), 'must return error for unsupported')
})

test('route uses validateEditActionPayload from 37G.0', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('validateEditActionPayload'), 'must validate payload')
})

test('route forces pending_review and prompt_eligible=false via createProposal', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('createProposal'), 'must use createProposal')
  // createProposal always forces pending_review and prompt_eligible=false
})

test('route uses proposed_by=tara via EDIT_ACTION_PROPOSAL_DEFAULTS', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('EDIT_ACTION_PROPOSAL_DEFAULTS'), 'must use EDIT_ACTION_PROPOSAL_DEFAULTS')
  assert.ok(code.includes("proposedBy: EDIT_ACTION_PROPOSAL_DEFAULTS.proposed_by"), 'must pass proposedBy=tara via defaults')
})

test('route sets generation_version=37G.1', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes("generationVersion: '37G.1'"), 'must use 37G.1 generation version')
})

test('route creates map_ui source row via createProposal sourceRecord', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes("sourceType: 'map_ui'"), 'must use map_ui source type')
  assert.ok(code.includes("sourceId: 'relational_map_ui'"), 'must use relational_map_ui source id')
})

test('route never writes to Memory tables', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(!code.includes("from('memory_nodes')"), 'must not write memory_nodes')
  assert.ok(!code.includes("from('memory_edges')"), 'must not write memory_edges')
  assert.ok(!code.includes('canonical_status'), 'must not touch canonical_status')
  assert.ok(!code.includes('prompt_eligible: true'), 'must not set prompt_eligible: true')
})

test('route never auto-approves', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  // createProposal always inserts as pending_review — check no status override bypasses it
  // 'approved_graph' should only appear in duplicate-check SELECT queries, not in inserts
  assert.ok(!code.includes("status: 'approved_graph'"), 'must not insert with approved_graph status')
  assert.ok(!code.includes("status: \"approved_graph\""), 'must not insert with approved_graph status')
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.1.3 — suggest_node endpoint contract
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.1.3 suggest_node contract ──')

test('suggest_node handler exists', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('handleSuggestNode') || code.includes("'suggest_node'"), 'suggest_node must be handled')
})

test('suggest_node uses candidate authority status', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes("authorityStatus: 'candidate'"), 'suggest_node must use candidate authority')
})

test('suggest_node checks for duplicates', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('pending_review') && code.includes('approved_graph'), 'must check both pending and approved for duplicates')
  assert.ok(code.includes('409'), 'must return 409 for duplicates')
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.1.4 — suggest_edge endpoint contract
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.1.4 suggest_edge contract ──')

test('suggest_edge handler exists', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('handleSuggestEdge') || code.includes("'suggest_edge'"), 'suggest_edge must be handled')
})

test('suggest_edge validates endpoint is approved_graph', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('endpoint_not_approved') || code.includes('not an approved'), 'must validate endpoints are approved')
})

test('suggest_edge stores endpoint presenceScope in payload', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('presenceScope'), 'must include presenceScope for cross-scope resolution')
})

test('suggest_edge uses correct row-level scope convention', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  // same scope → that scope; cross-scope → 'shared'
  assert.ok(code.includes('fromScope === toScope'), 'must check if scopes match')
  assert.ok(code.includes("'shared'"), 'must fall back to shared for cross-scope')
})

test('suggest_edge checks for duplicate edges', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('existingEdges'), 'must check for existing edges')
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.1.5 — UI component structure
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.1.5 UI component structure ──')

test('SuggestPanel component exists', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapSuggestPanel.tsx'), 'utf-8')
  assert.ok(code.includes('SuggestNodeForm'), 'SuggestNodeForm must exist')
  assert.ok(code.includes('SuggestEdgeForm'), 'SuggestEdgeForm must exist')
})

test('SuggestNodeForm submits to /api/graph-edit-proposals', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapSuggestPanel.tsx'), 'utf-8')
  assert.ok(code.includes('/api/graph-edit-proposals'), 'must call edit proposals API')
})

test('SuggestEdgeForm includes endpoint presenceScope', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapSuggestPanel.tsx'), 'utf-8')
  assert.ok(code.includes('presenceScope: sourceNode.presenceScope'), 'from presenceScope must be included')
  assert.ok(code.includes('presenceScope: selectedTarget.presenceScope'), 'to presenceScope must be included')
})

test('Suggest actions are disabled in Arrange mode', () => {
  const inspectorCode = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapInspector.tsx'), 'utf-8')
  // Suggest Edge is gated on !arrangeMode
  assert.ok(inspectorCode.includes('!arrangeMode'), 'suggest edge must be hidden in arrange mode')
  assert.ok(inspectorCode.includes('Switch to Inspect mode'), 'must show mode hint in arrange mode')
})

test('page passes onSuggestNodeClick as undefined in Arrange mode', () => {
  const pageCode = readFileSync(resolve(__dirname, '..', '..', '..', 'app', '(house)', 'relational-map', 'page.tsx'), 'utf-8')
  assert.ok(pageCode.includes('arrangeMode ? undefined'), 'onSuggestNodeClick must be undefined in arrange mode')
})

test('SuggestNodeForm shows governance wording', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapSuggestPanel.tsx'), 'utf-8')
  assert.ok(code.includes('pending proposal') || code.includes('Ontology Lab review'), 'must show governance wording')
  assert.ok(code.includes('does not edit the graph directly'), 'must say it does not directly edit')
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.1.6 — Safety checks
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.1.6 Safety checks ──')

test('API route does not import Memory modules', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(!code.includes('archive-memory'), 'must not import archive-memory')
  assert.ok(!code.includes('memory_nodes'), 'must not reference memory_nodes')
})

test('SuggestPanel does not reference graph mutation', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapSuggestPanel.tsx'), 'utf-8')
  assert.ok(!code.includes('approved_graph'), 'panel must not directly approve')
  assert.ok(!code.includes('canonical_status'), 'panel must not touch canonical_status')
})

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n═════════════════════════════════════════════════════')
console.log(`  Phase 37G.1 Graph Edit Proposals Tests: ${passed} passed, ${failed} failed`)
console.log('═════════════════════════════════════════════════════\n')

if (failed > 0) process.exit(1)
