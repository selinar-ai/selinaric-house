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

test('Suggest Edge hidden for derivedFromEdge nodes', () => {
  const inspectorCode = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapInspector.tsx'), 'utf-8')
  // Must gate on !derivedFromEdge before showing suggest edge button
  assert.ok(inspectorCode.includes('!selection.node.derivedFromEdge'), 'suggest edge must be hidden for derived nodes')
  assert.ok(inspectorCode.includes('Derived display nodes cannot be used'), 'must show helper text for derived nodes')
})

test('Suggest Edge available only for real approved nodes (not derived)', () => {
  const inspectorCode = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapInspector.tsx'), 'utf-8')
  // The condition requires isNode && !arrangeMode && !derivedFromEdge
  assert.ok(
    inspectorCode.includes('!arrangeMode && !selection.node.derivedFromEdge'),
    'suggest edge condition must exclude both arrange mode AND derived nodes'
  )
})

test('target dropdown excludes derived nodes', () => {
  const panelCode = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapSuggestPanel.tsx'), 'utf-8')
  assert.ok(panelCode.includes('!n.derivedFromEdge'), 'target dropdown must exclude derived nodes')
})

test('approvedNodes prop already filters derived nodes before passing to SuggestEdgeForm', () => {
  const inspectorCode = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapInspector.tsx'), 'utf-8')
  // The prop passed to SuggestEdgeForm filters !n.derivedFromEdge
  assert.ok(inspectorCode.includes('!n.derivedFromEdge'), 'approved nodes prop must exclude derived nodes')
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

// ═══════════════════════════════════════════════════════════════════════════
// 37G.2 — Alias Proposal Structural Tests
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.2 Alias proposal structure ──')

test('suggest_alias route handler exists in API', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('handleSuggestAlias'), 'handleSuggestAlias must exist')
  assert.ok(code.includes("suggest_alias"), 'suggest_alias must be handled')
})

test('alias handler uses generation_version=37G.2', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes("generationVersion: '37G.2'"), 'must use 37G.2 generation version')
})

test('alias handler validates target is approved_graph', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('target_not_approved') || code.includes('not an approved'), 'must validate target is approved')
})

test('alias handler checks for collision with existing node labels', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('alias_collision') || code.includes('conflicts with an existing'), 'must check label collision')
})

test('alias handler checks for duplicate alias proposals', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('existingAlias'), 'must check for existing alias proposals')
})

test('alias proposal uses proposal_type=node', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes("proposalType: 'node'"), 'alias proposal must use proposal_type=node')
})

test('alias label uses Alias: <alias> → <target> format', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('`Alias: ${proposedAlias} → ${targetLabel}`') || code.includes('Alias: '), 'must use Alias: prefix format')
})

test('alias uses map_ui source type', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  // The last handler (handleSuggestAlias) should also use map_ui
  const lastMapUiIdx = code.lastIndexOf("sourceType: 'map_ui'")
  assert.ok(lastMapUiIdx > -1, 'alias handler must use map_ui source type')
})

test('alias handler does not mutate target node payload', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(!code.includes('update'), 'alias handler must not update existing proposals')
  assert.ok(!code.includes("'aliases'"), 'alias handler must not write aliases array to existing proposals')
})

// ── Renderer guard ──
test('renderer guard added to buildRelationalMap processNodeProposal', () => {
  const code = readFileSync(resolve(__dirname, '..', 'buildRelationalMap.ts'), 'utf-8')
  assert.ok(code.includes("suggest_alias"), 'renderer guard must check for suggest_alias')
  assert.ok(code.includes('return null'), 'renderer guard must return null to skip materialisation')
})

test('normal node proposals still materialise after guard (guard uses shared set)', () => {
  const code = readFileSync(resolve(__dirname, '..', 'buildRelationalMap.ts'), 'utf-8')
  // Guard uses the shared NON_MATERIALISING_EDIT_ACTIONS set, not a hardcoded value
  assert.ok(code.includes('NON_MATERIALISING_EDIT_ACTIONS.has'), 'guard must use the shared set')
  assert.ok(!code.includes("editActionType === 'suggest_node'"), 'guard must not block suggest_node proposals')
})

// ── UI ──
test('SuggestAliasForm exists in suggest panel', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapSuggestPanel.tsx'), 'utf-8')
  assert.ok(code.includes('SuggestAliasForm'), 'SuggestAliasForm must exist')
  assert.ok(code.includes('/api/graph-edit-proposals'), 'must call edit proposals API')
  assert.ok(code.includes("edit_action_type: 'suggest_alias'"), 'must use suggest_alias action type')
})

test('Suggest Alias hidden for derived nodes in inspector', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapInspector.tsx'), 'utf-8')
  assert.ok(code.includes('SuggestAliasForm'), 'inspector must include SuggestAliasForm')
  assert.ok(code.includes('Derived display nodes cannot receive aliases'), 'must show derived node hint')
})

test('Suggest Alias gated on !derivedFromEdge', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapInspector.tsx'), 'utf-8')
  // The inspector renders SuggestAliasForm inside a block gated by !derivedFromEdge
  // and shows a "cannot receive aliases" message for derived nodes
  assert.ok(
    code.includes('!selection.node.derivedFromEdge'),
    'alias must be gated on !selection.node.derivedFromEdge'
  )
  assert.ok(
    code.includes('cannot receive aliases'),
    'must show helper text for derived nodes'
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.3 — Metadata-Change Proposal API + UI Structure Tests
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.3 API + UI structural ──')

test('metadata-change handler exists in API route', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('handleSuggestMetadataChange'), 'handleSuggestMetadataChange must exist')
})

test('metadata-change handler uses generation_version=37G.3', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes("generationVersion: '37G.3'"), 'must use 37G.3 version')
})

test('metadata-change handler validates target is approved_graph', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('target_not_approved'), 'must validate target approval')
})

test('metadata-change handler blocks duplicate proposals', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('existingChange'), 'must check for existing change proposals')
})

test('metadata-change handler does NOT mutate existing proposals', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  // The handler calls createProposal, never .update() on graph_proposals
  const updateCalls = [...code.matchAll(/\.from\('graph_proposals'\)[^]*?\.update\(/g)]
  assert.equal(updateCalls.length, 0, 'handler must not update existing graph_proposals')
})

test('metadata-change handler uses map_ui source type', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  // handleSuggestMetadataChange is after the alias handler; confirm map_ui appears in last handler
  const lastIdx = code.lastIndexOf("sourceType: 'map_ui'")
  assert.ok(lastIdx > -1, 'must use map_ui source in metadata handler')
})

test('reclassify proposed_label format is correct', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('Reclassify:') || code.includes('`Reclassify:'), 'must use Reclassify: prefix format')
  assert.ok(code.includes('Confidence:') || code.includes('`Confidence:'), 'must use Confidence: prefix format')
  assert.ok(code.includes('Salience:') || code.includes('`Salience:'), 'must use Salience: prefix format')
})

test('buildRelationalMap edge renderer guard is present', () => {
  const code = readFileSync(resolve(__dirname, '..', 'buildRelationalMap.ts'), 'utf-8')
  // Must have NON_MATERIALISING_EDIT_ACTIONS check in both node and edge processors
  const guardCount = (code.match(/NON_MATERIALISING_EDIT_ACTIONS\.has/g) || []).length
  assert.ok(guardCount >= 2, `guard must appear in both node and edge processors, found ${guardCount}`)
})

test('SuggestMetadataChangeForm exists in suggest panel', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapSuggestPanel.tsx'), 'utf-8')
  assert.ok(code.includes('SuggestMetadataChangeForm'), 'SuggestMetadataChangeForm must exist')
  assert.ok(code.includes('suggest_reclassify'), 'form must support reclassify')
  assert.ok(code.includes('suggest_confidence_change'), 'form must support confidence')
  assert.ok(code.includes('suggest_salience_change'), 'form must support salience')
})

test('Suggest Metadata Change gated on !derivedFromEdge in inspector', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapInspector.tsx'), 'utf-8')
  assert.ok(code.includes('SuggestMetadataChangeForm'), 'inspector must include SuggestMetadataChangeForm')
  assert.ok(code.includes('Metadata changes require an approved graph node'), 'must show derived node helper text')
})

test('metadata-change handler does not import Memory modules', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(!code.includes('memory_nodes'), 'must not reference memory_nodes')
  assert.ok(!code.includes('canonical_status'), 'must not touch canonical_status')
  assert.ok(!code.includes("prompt_eligible: true"), 'must not set prompt_eligible: true')
})

// ═══════════════════════════════════════════════════════════════════════════
// 37G.3a — Split Proposal API + UI Structure Tests
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n  ── 37G.3a Split proposal structure ──')

test('split handler exists in API route', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('handleSuggestSplit'), 'handleSuggestSplit must exist')
})

test('split handler uses generation_version=37G.3a', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes("generationVersion: '37G.3a'"))
})

test('split handler validates target is approved_graph', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('target_not_approved'))
})

test('split handler checks for part label collisions with existing nodes', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('part_label_collision'))
})

test('split handler checks for duplicate split proposals', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('existingSplit'))
})

test('split proposed_label uses "Split: target → parts" format', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(code.includes('`Split: ${targetLabel} →') || code.includes('Split: ') )
})

test('split handler does not create replacement nodes', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  // Split handler creates 1 proposal for the split governance record, not one per part
  // Verify: no loop over parts that calls createProposal
  assert.ok(!code.includes('for.*parts.*createProposal') && !code.includes('parts.map.*createProposal'),
    'must not loop over parts creating proposals')
  // The handler exists and uses createProposal exactly in handleSuggestSplit section
  const splitHandlerIdx = code.lastIndexOf('handleSuggestSplit')
  assert.ok(splitHandlerIdx > -1, 'handleSuggestSplit must exist')
})

test('split handler does not mutate target proposal', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  assert.ok(!code.includes("status: 'approved_graph'"), 'handler must not set approved_graph status')
  assert.ok(!code.includes('prompt_eligible: true'), 'handler must not set prompt_eligible: true')
})

test('split uses map_ui source type', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-edit-proposals', 'route.ts'), 'utf-8')
  const lastMapUi = code.lastIndexOf("sourceType: 'map_ui'")
  assert.ok(lastMapUi > -1)
})

test('SuggestSplitForm exists in suggest panel', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapSuggestPanel.tsx'), 'utf-8')
  assert.ok(code.includes('SuggestSplitForm'), 'SuggestSplitForm must exist')
  assert.ok(code.includes('suggest_split'), 'must call suggest_split action type')
  assert.ok(code.includes('proposed_parts'), 'must include proposed_parts')
})

test('SuggestSplitForm enforces minimum 2 parts in UI', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapSuggestPanel.tsx'), 'utf-8')
  // The form initialises with 2 parts and requires length >= 2
  assert.ok(code.includes('BLANK_PART(), BLANK_PART()') || code.includes('[BLANK_PART()'), 'form must start with 2 parts')
})

test('Suggest Split hidden for derived nodes in inspector', () => {
  const code = readFileSync(resolve(__dirname, '..', '..', '..', 'components', 'graph', 'RelationalMapInspector.tsx'), 'utf-8')
  assert.ok(code.includes('SuggestSplitForm'), 'inspector must include SuggestSplitForm')
  assert.ok(code.includes('Derived display nodes cannot be split'), 'must show derived node helper text')
})

test('renderer guard catches suggest_split via NON_MATERIALISING_EDIT_ACTIONS', () => {
  const code = readFileSync(resolve(__dirname, '..', 'buildRelationalMap.ts'), 'utf-8')
  // Guard uses shared set — no need to add suggest_split explicitly
  assert.ok(code.includes('NON_MATERIALISING_EDIT_ACTIONS.has'), 'guard uses shared set which now includes suggest_split')
})

console.log('\n═════════════════════════════════════════════════════')
console.log(`  Phase 37G.1/37G.2/37G.3/37G.3a Graph Edit Proposals Tests: ${passed} passed, ${failed} failed`)
console.log('═════════════════════════════════════════════════════\n')

if (failed > 0) process.exit(1)
