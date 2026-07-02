/**
 * Phase 42.4.2a — deterministic LLM post-gate (pure). One valid accept + every planted rejection.
 * Run: npx tsx src/lib/agents/__tests__/phase-42-4-2a-postgate.test.ts
 */

import { runPostGate, type PostGateContext, type ContextNode } from '../graph_proposals/llm_postgate'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }

function node(id: string, archive: string, approval: string, sources: string[]): ContextNode {
  return { id, archive_name: archive, approval_status: approval, source_item_ids: sources }
}
// aaaa < bbbb < cccc < dddd (string order → canonical from < to)
const nodes = new Map<string, ContextNode>([
  ['aaaa', node('aaaa', 'X', 'approved', ['s1', 's2'])],
  ['bbbb', node('bbbb', 'X', 'approved', ['s2', 's3'])],   // union(aaaa,bbbb) = s1,s2,s3
  ['cccc', node('cccc', 'X', 'pending', ['s1'])],
  ['dddd', node('dddd', 'Y', 'approved', ['s2'])],
])
function ctx(over: Partial<PostGateContext> = {}): PostGateContext {
  return { nodesById: nodes, existingEdges: [], pendingDedupeKeys: new Set(), ...over }
}
const VALID = { from_node_id: 'aaaa', to_node_id: 'bbbb', edge_type: 'contrasts_with', confidence: 0.8, rationale: 'they contrast', source_refs: ['s2'] }
// run one proposal, return its outcome ('ACCEPTED' or the reject reason)
function one(p: unknown, c: PostGateContext = ctx()): string {
  const r = runPostGate([p], c)
  return r.accepted.length === 1 ? 'ACCEPTED' : (r.rejected[0]?.reason ?? 'NONE')
}

console.log('\n── valid fixture accepts ──')
assert(one(VALID) === 'ACCEPTED', 'well-formed in-scope proposal → ACCEPTED')
{
  const r = runPostGate([VALID], ctx())
  assert(r.accepted[0].dedupe_key === 'archive_graph:aaaa:bbbb:contrasts_with', 'dedupe key = archive_graph:from:to:edge_type')
  assert(JSON.stringify(r.accepted[0].source_refs) === JSON.stringify(['s2']), 'source_refs preserved (in-scope)')
}

console.log('\n── planted hallucinations reject ──')
assert(runPostGate('{ not json', ctx()).rejected[0].reason === 'MALFORMED_JSON', 'malformed JSON string')
assert(runPostGate('{}', ctx()).rejected[0].reason === 'MALFORMED_JSON', 'non-array JSON → MALFORMED_JSON')
assert(one({ ...VALID, extra_field: true }) === 'UNKNOWN_FIELD', 'unknown field (authority/prompt claim) fails closed')
assert(one({ ...VALID, canonise: true }) === 'UNKNOWN_FIELD', 'canonise field → UNKNOWN_FIELD')
assert(one({ from_node_id: 'aaaa', to_node_id: 'bbbb', edge_type: 'contrasts_with', confidence: 0.8, rationale: 'x' }) === 'PARTIAL_OUTPUT', 'missing source_refs → PARTIAL_OUTPUT')
assert(one({ ...VALID, from_node_id: 'zzzz' }) === 'NODE_NOT_IN_CONTEXT', 'node not in context')
assert(one({ ...VALID, to_node_id: 'cccc' }) === 'NODE_NOT_APPROVED', 'non-approved node')
assert(one({ ...VALID, to_node_id: 'dddd' }) === 'ARCHIVE_MISMATCH', 'cross-archive pair')
assert(one({ ...VALID, to_node_id: 'aaaa' }) === 'SELF_LOOP', 'self-loop')
assert(one({ ...VALID, from_node_id: 'bbbb', to_node_id: 'aaaa' }) === 'NON_CANONICAL_PAIR', 'non-canonical pair')
assert(one({ ...VALID, edge_type: 'causes' }) === 'OFF_WHITELIST', 'off-whitelist edge (causes)')
assert(one({ ...VALID, edge_type: 'anchors' }) === 'OFF_WHITELIST', 'anchors excluded from v1 whitelist')
assert(one({ ...VALID, confidence: 1.4 }) === 'CONFIDENCE_INVALID', 'confidence out of range')
assert(one({ ...VALID, confidence: 0.5 }) === 'CONFIDENCE_TOO_LOW', 'confidence below 0.7')
assert(one({ ...VALID, rationale: '  ' }) === 'RATIONALE_REQUIRED', 'blank rationale')
assert(one({ ...VALID, source_refs: [] }) === 'SOURCE_REFS_REQUIRED', 'empty source_refs')
assert(one({ ...VALID, source_refs: ['s2', '  '] }) === 'SOURCE_REFS_REQUIRED', 'blank source ref in array')
assert(one({ ...VALID, source_refs: ['s2', null] }) === 'SOURCE_REFS_REQUIRED', 'null source ref in array')
assert(one({ ...VALID, source_refs: ['s9'] }) === 'SOURCE_REF_OUT_OF_SCOPE', 'source ref outside endpoint evidence')
assert(one({ ...VALID, edge_type: 'contrasts_with' }, ctx({ existingEdges: [{ from_node_id: 'bbbb', to_node_id: 'aaaa', edge_type: 'contrasts_with' }] })) === 'DUPLICATE_EXISTING_EDGE', 'duplicate existing edge (either direction)')
assert(one({ ...VALID, edge_type: 'precedes' }, ctx({ pendingDedupeKeys: new Set(['archive_graph:aaaa:bbbb:precedes']) })) === 'DUPLICATE_PENDING', 'duplicate active pending proposal')

console.log('\n── confidence never overrides deterministic gates ──')
assert(one({ ...VALID, edge_type: 'causes', confidence: 0.99 }) === 'OFF_WHITELIST', 'confident hallucination still rejected by whitelist gate')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
