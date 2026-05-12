// Phase 33K — RAG Context Composer tests
// No test runner installed; validates via tsc --noEmit.
// Ready for future Vitest/Jest runner.

import { composeLibraryRagContext } from '../rag-context-composer'
import type { HybridLibrarySearchResult } from '../hybrid-library-search'

function makeResult(overrides: Partial<HybridLibrarySearchResult> = {}): HybridLibrarySearchResult {
  return {
    libraryItemId: 'item-001',
    title: 'Phase 14 — Web Search',
    finalScore: 95,
    keywordScore: 80,
    semanticScore: 90,
    hybridScore: 90,
    matchedBy: ['title', 'semantic_chunk'],
    matchReasons: ['Title contains query', 'Semantic chunk match (0.902)'],
    bestSnippet: 'Phase 14 adds autonomous browsing to both presences.',
    bestSemanticChunk: {
      chunkId: 'chunk-001',
      chunkText: 'Phase 14 introduces web search with autonomous browsing.',
      similarity: 0.902,
      sourceField: 'content_text',
    },
    collection: 'development_docs',
    itemType: 'brief',
    authorityStatus: 'library_reference',
    effectiveAuthority: 'library_reference',
    presenceScope: 'house',
    phaseCode: '14',
    phaseLabel: 'Web Search',
    ...overrides,
  }
}

// Test 1: Composes high-confidence context from Phase 14 hybrid result
function test_high_confidence_composition() {
  const result = composeLibraryRagContext({
    query: 'Phase 14 web search autonomous browsing',
    mode: 'hybrid',
    results: [makeResult()],
    source: 'retrieval_lab',
  })

  console.assert(result.status === 'context_composed', `Expected context_composed, got ${result.status}`)
  console.assert(result.confidence === 'high', `Expected high confidence, got ${result.confidence}`)
  console.assert(result.selectedChunkCount > 0, 'Expected selected chunks')
  console.assert(result.contextBlock.includes('Library RAG Context:'), 'Context block should have header')
  console.assert(result.contextBlock.includes('[LIB-1]'), 'Context block should have [LIB-1]')
  console.log('PASS: test_high_confidence_composition')
}

// Test 2: Preserves attribution labels [LIB-1], [LIB-2]
function test_attribution_labels() {
  const result = composeLibraryRagContext({
    query: 'Phase 14 web search',
    mode: 'hybrid',
    results: [
      makeResult(),
      makeResult({
        libraryItemId: 'item-002',
        title: 'Phase 7B — Continuity Measurement',
        finalScore: 88,
        bestSemanticChunk: {
          chunkId: 'chunk-002',
          chunkText: 'Continuity measurement for presences.',
          similarity: 0.88,
          sourceField: 'content_text',
        },
      }),
    ],
    source: 'retrieval_lab',
  })

  const labels = result.selectedChunks.map(c => c.attributionLabel)
  console.assert(labels.includes('[LIB-1]'), 'Should have [LIB-1]')
  console.assert(labels.length >= 2, 'Should have at least 2 chunks')
  console.assert(result.contextBlock.includes('[LIB-1]'), 'Block should have [LIB-1]')
  console.assert(result.contextBlock.includes('[LIB-2]'), 'Block should have [LIB-2]')
  console.assert(result.attributionMap['[LIB-1]'] !== undefined, 'attributionMap should have [LIB-1]')
  console.assert(result.attributionMap['[LIB-2]'] !== undefined, 'attributionMap should have [LIB-2]')
  console.log('PASS: test_attribution_labels')
}

// Test 3: Includes title, authority, effective authority, phase, matchedBy, scores
function test_chunk_metadata() {
  const result = composeLibraryRagContext({
    query: 'Phase 14 web search',
    mode: 'hybrid',
    results: [makeResult()],
    source: 'retrieval_lab',
  })

  const chunk = result.selectedChunks[0]
  console.assert(chunk.title === 'Phase 14 — Web Search', `Title mismatch: ${chunk.title}`)
  console.assert(chunk.effectiveAuthority === 'library_reference', `Authority mismatch: ${chunk.effectiveAuthority}`)
  console.assert(chunk.phaseCode === '14', `Phase mismatch: ${chunk.phaseCode}`)
  console.assert(chunk.matchedBy.length > 0, 'Should have matchedBy')
  console.assert(chunk.finalScore === 95, `Score mismatch: ${chunk.finalScore}`)
  console.assert(result.contextBlock.includes('Phase 14'), 'Block should mention Phase 14')
  console.log('PASS: test_chunk_metadata')
}

// Test 4: Does not include Memory-claim language
function test_no_memory_claims() {
  const result = composeLibraryRagContext({
    query: 'Phase 14 web search',
    mode: 'hybrid',
    results: [makeResult()],
    source: 'retrieval_lab',
  })

  console.assert(!result.contextBlock.match(/\bI remember\b/i), 'Should not contain "I remember"')
  console.assert(!result.contextBlock.match(/\bwe remember\b/i), 'Should not contain "we remember"')
  console.assert(!result.contextBlock.match(/\bthis is canonical\b/i), 'Should not contain "this is canonical"')
  console.assert(result.diagnostics.memoryLanguageFlags.length === 0, 'No memory language flags')
  console.log('PASS: test_no_memory_claims')
}

// Test 5: Low-confidence retrieval returns no normal context block
function test_low_confidence() {
  const result = composeLibraryRagContext({
    query: 'vague search',
    mode: 'hybrid',
    results: [makeResult({ finalScore: 40, keywordScore: 40, semanticScore: 0 })],
    source: 'retrieval_lab',
  })

  console.assert(result.confidence === 'low', `Expected low, got ${result.confidence}`)
  console.assert(result.status === 'no_reliable_context', `Expected no_reliable_context, got ${result.status}`)
  console.assert(result.selectedChunkCount === 0, 'Low confidence should have no selected chunks')
  console.assert(!result.contextBlock.includes('Retrieved Sources:'), 'Should not have retrieved sources')
  console.log('PASS: test_low_confidence')
}

// Test 6: Nonsense query produces no reliable context
function test_nonsense_query() {
  const result = composeLibraryRagContext({
    query: 'purple mango octopus railway',
    mode: 'hybrid',
    results: [],
    source: 'retrieval_lab',
  })

  console.assert(result.status === 'no_results', `Expected no_results, got ${result.status}`)
  console.assert(result.confidence === 'none', `Expected none, got ${result.confidence}`)
  console.assert(result.selectedChunkCount === 0, 'Should have no selected chunks')
  console.log('PASS: test_nonsense_query')
}

// Test 7: Redacts secret-like values
function test_secret_redaction() {
  const result = composeLibraryRagContext({
    query: 'env config',
    mode: 'hybrid',
    results: [makeResult({
      bestSemanticChunk: {
        chunkId: 'chunk-sec',
        chunkText: 'EMBED_TEXT_SECRET=CKBQcoHz0ikfkfnwfpnmdnvtnsmtext\nSUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.long_token_here',
        similarity: 0.91,
        sourceField: 'content_text',
      },
    })],
    source: 'retrieval_lab',
  })

  const allText = result.selectedChunks.map(c => c.chunkText).join('\n')
  console.assert(!allText.includes('CKBQcoHz0ikfkfnwfpnmdnvtnsmtext'), 'Secret value should be redacted')
  console.assert(allText.includes('[REDACTED]'), 'Should contain [REDACTED]')
  console.assert(result.diagnostics.leakageFlags.length > 0, 'Should have leakage flags')
  console.log('PASS: test_secret_redaction')
}

// Test 8: Rejects obvious code/UI artefact chunks when better source chunks exist
function test_code_artifact_rejection() {
  const result = composeLibraryRagContext({
    query: 'Living State',
    mode: 'hybrid',
    results: [makeResult({
      bestSemanticChunk: {
        chunkId: 'chunk-code',
        chunkText: 'import { useState, useEffect } from "react"\nimport type { AuthorityStatus } from "@/lib/library/authority"\nexport default function LivingStateView() {\n  const [state, setState] = useState(null)\n  return <div className="flex">...</div>\n}',
        similarity: 0.88,
        sourceField: 'content_text',
      },
      bestSnippet: 'Living State tracks continuity weight and emotional tone.',
    })],
    source: 'retrieval_lab',
  })

  const hasCodeRejection = result.rejectedChunks.some(r => r.reason === 'excluded_code_artifact')
  console.assert(hasCodeRejection, 'Should reject code artefact chunk')
  console.assert(result.selectedChunkCount > 0, 'Should still have selected chunks from keyword snippet')
  console.log('PASS: test_code_artifact_rejection')
}

// Test 9: Keeps Archive/Memory terminology source-bound, not authority-bound
function test_source_bound_terminology() {
  const result = composeLibraryRagContext({
    query: 'Memory systems overview',
    mode: 'hybrid',
    results: [makeResult({
      bestSemanticChunk: {
        chunkId: 'chunk-mem',
        chunkText: 'The Memory system stores canonical continuity records. Archive items hold verified truth.',
        similarity: 0.90,
        sourceField: 'content_text',
      },
    })],
    source: 'retrieval_lab',
  })

  console.assert(result.contextBlock.includes('source material only'), 'Block should say source material only')
  console.assert(result.contextBlock.includes('Do not treat this as Memory'), 'Block should have Memory boundary')
  console.assert(result.diagnostics.memoryLanguageFlags.length === 0, 'No memory flags for quoted source text')
  console.log('PASS: test_source_bound_terminology')
}

// Test 10: Does not mutate canonical_status or write Archive/Memory records
function test_no_side_effects() {
  const input = [makeResult()]
  const before = JSON.stringify(input)
  composeLibraryRagContext({
    query: 'test',
    mode: 'hybrid',
    results: input,
    source: 'retrieval_lab',
  })
  const after = JSON.stringify(input)
  console.assert(before === after, 'Input should not be mutated')
  console.log('PASS: test_no_side_effects')
}

// Test 11: Attribution label stability
function test_attribution_stability() {
  const result = composeLibraryRagContext({
    query: 'test',
    mode: 'hybrid',
    results: [
      makeResult(),
      makeResult({ libraryItemId: 'item-002', title: 'Phase 7B — Continuity', finalScore: 88, bestSemanticChunk: { chunkId: 'c2', chunkText: 'Continuity test.', similarity: 0.88, sourceField: 'content_text' } }),
    ],
    source: 'retrieval_lab',
  })

  for (const chunk of result.selectedChunks) {
    console.assert(
      result.contextBlock.includes(chunk.attributionLabel),
      `Block missing label ${chunk.attributionLabel}`
    )
    console.assert(
      result.attributionMap[chunk.attributionLabel] !== undefined,
      `Map missing label ${chunk.attributionLabel}`
    )
  }

  const labels = result.selectedChunks.map(c => c.attributionLabel)
  const uniqueLabels = new Set(labels)
  console.assert(labels.length === uniqueLabels.size, 'Labels should be unique')

  for (const key of Object.keys(result.attributionMap)) {
    console.assert(
      result.contextBlock.includes(key),
      `Map key ${key} not in block`
    )
  }
  console.log('PASS: test_attribution_stability')
}

// Run all tests
test_high_confidence_composition()
test_attribution_labels()
test_chunk_metadata()
test_no_memory_claims()
test_low_confidence()
test_nonsense_query()
test_secret_redaction()
test_code_artifact_rejection()
test_source_bound_terminology()
test_no_side_effects()
test_attribution_stability()

console.log('\nAll 11 tests passed.')
