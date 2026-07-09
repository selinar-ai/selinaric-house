/**
 * Phase 43 — Candidate Disposition View (READ-ONLY). Proves the pure re-verification verdict for every
 * blocking case + eligible, and that the module + runner WRITE NOTHING (no promote, no flip, no write RPC).
 *
 * Run: npx tsx src/lib/agents/graph_proposals/__tests__/phase-43-candidate-disposition.test.ts
 */

import { readFileSync } from 'fs'
import {
  reverifyCandidate, archiveEdgeKey, dedupeKey, annotateDirection,
  type DispositionCandidate, type ArchiveNodeSnapshot, type DispositionContext, type DirectionInput,
} from '../candidate_disposition'
import { LLM_EDGE_WHITELIST, edgeSymmetry, EDGE_TYPE_SYMMETRY } from '../contract'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }

const NA = '00000000-0000-0000-0000-00000000000a' // NA < NB lexicographically → canonical from=NA to=NB
const NB = '00000000-0000-0000-0000-00000000000b'

function node(id: string, over: Partial<ArchiveNodeSnapshot> = {}): ArchiveNodeSnapshot {
  return { id, label: `n:${id.slice(-1)}`, archiveName: 'velvet', approvalStatus: 'approved', sourceItemIds: ['s1', 's2'], ...over }
}
function ctxWith(nodes: ArchiveNodeSnapshot[], edges: string[] = [], real: string[] = []): DispositionContext {
  return { nodesById: new Map(nodes.map((n) => [n.id, n])), existingArchiveEdgeKeys: new Set(edges), realDedupeKeys: new Set(real) }
}
const good: DispositionCandidate = { id: 'c1', runId: 'r1', edgeType: 'extends', fromNodeId: NA, toNodeId: NB, sourceRefs: ['s1'], confidence: 0.8 }

section('eligible when every check passes')
{
  const v = reverifyCandidate(good, ctxWith([node(NA), node(NB)]))
  assert(v.eligible && v.blockingReason === null, 'canonical, approved, same-archive, in-scope, no dupe ⇒ ELIGIBLE')
}

section('drift-sensitive blocks')
{
  // endpoint un-approved / missing
  assert(reverifyCandidate(good, ctxWith([node(NA, { approvalStatus: 'pending' }), node(NB)])).blockingReason === 'ENDPOINT_NO_LONGER_APPROVED', 'un-approved endpoint ⇒ ENDPOINT_NO_LONGER_APPROVED')
  assert(reverifyCandidate(good, ctxWith([node(NA)])).blockingReason === 'ENDPOINT_NO_LONGER_APPROVED', 'missing endpoint ⇒ ENDPOINT_NO_LONGER_APPROVED')
  // archive mismatch
  assert(reverifyCandidate(good, ctxWith([node(NA), node(NB, { archiveName: 'violet' })])).blockingReason === 'ARCHIVE_MISMATCH', 'different archive ⇒ ARCHIVE_MISMATCH')
  // source refs out of scope (node source_item_ids no longer cover the ref)
  assert(reverifyCandidate(good, ctxWith([node(NA, { sourceItemIds: ['x'] }), node(NB, { sourceItemIds: ['y'] })])).blockingReason === 'SOURCE_REFS_OUT_OF_SCOPE', 'ref not in endpoint union ⇒ SOURCE_REFS_OUT_OF_SCOPE')
  // existing archive edge duplicate
  assert(reverifyCandidate(good, ctxWith([node(NA), node(NB)], [archiveEdgeKey(NA, NB, 'extends')])).blockingReason === 'EXISTING_ARCHIVE_EDGE_DUPLICATE', 'archive edge already exists ⇒ EXISTING_ARCHIVE_EDGE_DUPLICATE')
  assert(reverifyCandidate(good, ctxWith([node(NA), node(NB)], [archiveEdgeKey(NB, NA, 'extends')])).blockingReason === 'EXISTING_ARCHIVE_EDGE_DUPLICATE', 'existing edge detected either direction')
  // duplicate real proposal
  assert(reverifyCandidate(good, ctxWith([node(NA), node(NB)], [], [dedupeKey(NA, NB, 'extends')])).blockingReason === 'DUPLICATE_REAL_PROPOSAL', 'real proposal already exists ⇒ DUPLICATE_REAL_PROPOSAL')
}

section('intrinsic blocks')
{
  assert(reverifyCandidate({ ...good, fromNodeId: NB, toNodeId: NA }, ctxWith([node(NA), node(NB)])).blockingReason === 'NON_CANONICAL_PAIR', 'from > to ⇒ NON_CANONICAL_PAIR')
  assert(reverifyCandidate({ ...good, toNodeId: NA }, ctxWith([node(NA)])).blockingReason === 'SELF_LOOP', 'from === to ⇒ SELF_LOOP')
  assert(reverifyCandidate({ ...good, edgeType: 'shaped_by' }, ctxWith([node(NA), node(NB)])).blockingReason === 'OFF_WHITELIST', 'non-whitelist edge ⇒ OFF_WHITELIST')
  assert(reverifyCandidate({ ...good, confidence: 0.5 }, ctxWith([node(NA), node(NB)])).blockingReason === 'CONFIDENCE_BELOW_FLOOR', 'confidence < 0.7 ⇒ CONFIDENCE_BELOW_FLOOR')
  assert(reverifyCandidate({ ...good, sourceRefs: [] }, ctxWith([node(NA), node(NB)])).blockingReason === 'SOURCE_REFS_MISSING', 'no source refs ⇒ SOURCE_REFS_MISSING')
}

section('the module is PURE — no I/O, no DB, no SDK, no writes')
{
  const m = readFileSync('src/lib/agents/graph_proposals/candidate_disposition.ts', 'utf8')
  for (const tok of ['@supabase', 'createClient', '.from(', '.rpc(', 'process.env', 'readFileSync', '@anthropic', '.insert(', '.update(', '.delete(']) {
    assert(!m.includes(tok), `candidate_disposition.ts: no "${tok}"`)
  }
  const importLines = m.split('\n').filter((l) => /^\s*import\b/.test(l))
  assert(importLines.every((l) => l.includes("from './contract'")), 'only imports contract constants (no runtime deps)')
}

section('the runner is READ-ONLY — LIST RPC + table reads only, no writes/promote/flip')
{
  const r = readFileSync('scripts/agent-graph-candidate-disposition.ts', 'utf8')
  for (const tok of ['.insert(', '.update(', '.delete(', '.upsert(']) assert(!r.includes(tok), `runner: no "${tok}"`)
  // the ONLY rpc used is the read LIST RPC (scan code with comments stripped so prose "promote" doesn't trip it)
  const rCode = r.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  const rpcCalls = rCode.match(/\.rpc\(\s*([A-Za-z_]+)/g) ?? []
  assert(rpcCalls.length > 0 && rpcCalls.every((c) => c.includes('GRAPH_PROPOSALS_LIST_RPC')), 'every .rpc() call is the read LIST RPC')
  assert(!rCode.includes('RECORD_RPC') && !rCode.includes('CLEANUP') && !rCode.includes('SET_REVIEW'), 'no record/cleanup/set-review (write) RPC referenced in code')
  assert(r.includes("from('archive_graph_nodes').select") && r.includes("from('archive_graph_edges').select"), 'reads archive_graph nodes/edges read-only (.select)')
  assert(!/@anthropic|qstash|scheduler|autonomy|cron/i.test(r), 'no Anthropic / scheduler / autonomy')
  assert(r.includes('reverifyCandidate'), 'runner reports read-only re-verification verdicts')
}

section('Phase 43 — edge-type symmetry registry (fail-closed)')
{
  // every whitelisted edge_type has a symmetry declaration
  for (const t of LLM_EDGE_WHITELIST) assert(edgeSymmetry(t) !== null, `whitelisted "${t}" has a symmetry declaration`)
  assert(edgeSymmetry('contrasts_with') === 'symmetric', 'contrasts_with = symmetric')
  assert(edgeSymmetry('precedes') === 'asymmetric', 'precedes = asymmetric')
  assert(edgeSymmetry('extends') === 'asymmetric', 'extends = asymmetric')
  // undeclared edge_type fails closed
  assert(edgeSymmetry('shaped_by') === null, 'undeclared edge_type ⇒ null (fail-closed)')
  assert(edgeSymmetry('') === null, 'empty edge_type ⇒ null (fail-closed)')
  assert(edgeSymmetry('toString') === null, 'inherited-proto key ⇒ null (own-property check)')
  assert(Object.keys(EDGE_TYPE_SYMMETRY).length === LLM_EDGE_WHITELIST.length, 'registry covers exactly the whitelist size')
}

section('Phase 43 — direction annotation (advisory, conservative, never guessed)')
{
  function di(over: Partial<DirectionInput>): DirectionInput {
    return {
      edgeType: 'extends', canonicalFromId: NA, canonicalToId: NB,
      canonicalFromLabel: 'Alpha', canonicalToLabel: 'Beta', rationale: '', ...over,
    }
  }

  // symmetric type ⇒ symmetric, no direction, NOT pending
  {
    const a = annotateDirection(di({ edgeType: 'contrasts_with', rationale: 'Alpha and Beta contrast.' }))
    assert(a.status === 'symmetric' && a.symmetry === 'symmetric', 'contrasts_with ⇒ status symmetric')
    assert(a.directionPending === false, 'symmetric ⇒ not direction_pending')
    assert(a.semanticFromId === null && a.semanticToId === null, 'symmetric ⇒ no semantic endpoints')
  }

  // asymmetric types REQUIRE direction ⇒ always pending, and advisory
  {
    const e = annotateDirection(di({ edgeType: 'extends', rationale: 'Beta extends Alpha.' }))
    const p = annotateDirection(di({ edgeType: 'precedes', rationale: 'Alpha leads to Beta.' }))
    assert(e.directionPending === true && p.directionPending === true, 'extends & precedes ⇒ direction_pending (human confirm required)')
    assert(e.advisory === true && p.advisory === true, 'inferred direction is advisory')
  }

  // undeclared type ⇒ fail closed (undeclared status, pending)
  {
    const u = annotateDirection(di({ edgeType: 'shaped_by', rationale: 'Beta shaped_by Alpha.' }))
    assert(u.status === 'undeclared' && u.symmetry === 'undeclared' && u.directionPending === true, 'undeclared edge_type ⇒ undeclared + pending (fail-closed)')
  }

  // object AFTER the verb == canonical TO ⇒ forward; == canonical FROM ⇒ reverse
  {
    const fwd = annotateDirection(di({ rationale: 'Alpha extends Beta into a wider frame.' })) // object Beta(to) ⇒ forward
    assert(fwd.status === 'inferred-forward', 'object == canonical TO ⇒ inferred-forward')
    const rev = annotateDirection(di({ rationale: 'Beta extends Alpha into a wider frame.' })) // object Alpha(from) ⇒ reverse
    assert(rev.status === 'inferred-reverse', 'object == canonical FROM ⇒ inferred-reverse')
  }

  // derived semantic endpoints come ONLY from canonical pair + inferred direction
  {
    const fwd = annotateDirection(di({ rationale: 'Alpha extends Beta.' }))
    assert(fwd.semanticFromId === NA && fwd.semanticToId === NB, 'forward ⇒ semantic (from=a, to=b)')
    assert(fwd.semanticFromLabel === 'Alpha' && fwd.semanticToLabel === 'Beta', 'forward ⇒ semantic labels (a, b)')
    const rev = annotateDirection(di({ rationale: 'Beta extends Alpha.' }))
    assert(rev.semanticFromId === NB && rev.semanticToId === NA, 'reverse ⇒ semantic (from=b, to=a)')
    assert(rev.semanticFromLabel === 'Beta' && rev.semanticToLabel === 'Alpha', 'reverse ⇒ semantic labels (b, a)')
  }

  // ambiguous / contradictory rationales ⇒ ambiguous, NEVER guessed (endpoints stay null)
  {
    const contra = annotateDirection(di({ rationale: 'Beta extends or is a subset of Alpha.' }))
    assert(contra.status === 'ambiguous' && contra.reason === 'CONTRADICTORY_POLARITY', 'extends+subset ⇒ ambiguous (contradictory)')
    assert(contra.semanticFromId === null && contra.semanticToId === null, 'ambiguous ⇒ no guessed endpoints')
    const noverb = annotateDirection(di({ rationale: 'Alpha and Beta share a source item.' }))
    assert(noverb.status === 'ambiguous' && noverb.reason === 'NO_DIRECTIONAL_VERB', 'no directional verb ⇒ ambiguous')
    const noobj = annotateDirection(di({ rationale: 'Something extends it into a rule.' }))
    assert(noobj.status === 'ambiguous' && noobj.reason === 'OBJECT_NOT_IDENTIFIED', 'object (pronoun) not identifiable ⇒ ambiguous')
    const both = annotateDirection(di({ rationale: 'X extends Alpha and Beta together.' }))
    assert(both.status === 'ambiguous' && both.reason === 'BOTH_ENDPOINTS_AFTER_VERB', 'both endpoints after verb ⇒ ambiguous')
  }

  // canonical pair is never altered by annotation (helper reads only)
  {
    const a = annotateDirection(di({ rationale: 'Beta extends Alpha.' }))
    assert(a.edgeType === 'extends', 'annotation preserves edge_type; canonical inputs untouched')
  }
}

section('Phase 43 — module still PURE + runner still READ-ONLY with the new helper')
{
  const m = readFileSync('src/lib/agents/graph_proposals/candidate_disposition.ts', 'utf8')
  for (const tok of ['@supabase', 'createClient', '.from(', '.rpc(', 'process.env', 'readFileSync', '@anthropic', '.insert(', '.update(', '.delete(']) {
    assert(!m.includes(tok), `candidate_disposition.ts (with annotateDirection): no "${tok}"`)
  }
  const r = readFileSync('scripts/agent-graph-candidate-disposition.ts', 'utf8')
  for (const tok of ['.insert(', '.update(', '.delete(', '.upsert(']) assert(!r.includes(tok), `runner (with direction display): no "${tok}"`)
  assert(r.includes('annotateDirection'), 'runner surfaces the read-only direction annotation')
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
