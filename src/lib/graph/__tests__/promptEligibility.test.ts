/**
 * Phase 37A — Prompt Eligibility Boundary Tests
 *
 * Run: npx tsx src/lib/graph/__tests__/promptEligibility.test.ts
 *
 * No Supabase calls, no data writes.
 */

import { canGraphItemEnterPrompt, getGraphPromptAuthorityLabel } from '../ontology'
import type { GraphAuthorityStatus } from '../types'

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

// ─── Hard blocks ────────────────────────────────────────────────────────────

section('workspace_only never enters prompt')

const contexts = [
  'presence_chat', 'lounge_chat', 'watchtower', 'reflection',
  'journal_prompt', 'memory_candidate_generation', 'graph_review',
] as const

for (const ctx of contexts) {
  assert(
    !canGraphItemEnterPrompt({
      authorityStatus: 'workspace_only',
      reviewStatus: 'workspace_only',
      presenceScope: 'shared',
      contextType: ctx,
      promptEligible: true,
      hasSourceReference: true,
    }),
    `workspace_only blocked from ${ctx}`
  )
}

section('rejected never enters prompt')

for (const ctx of contexts) {
  assert(
    !canGraphItemEnterPrompt({
      authorityStatus: 'rejected',
      reviewStatus: 'rejected',
      presenceScope: 'shared',
      contextType: ctx,
      promptEligible: true,
      hasSourceReference: true,
    }),
    `rejected blocked from ${ctx}`
  )
}

section('superseded blocked from runtime prompts (except graph_review)')

const runtimeContexts = [
  'presence_chat', 'lounge_chat', 'watchtower', 'reflection',
  'journal_prompt', 'memory_candidate_generation',
] as const

for (const ctx of runtimeContexts) {
  assert(
    !canGraphItemEnterPrompt({
      authorityStatus: 'superseded',
      reviewStatus: 'superseded',
      presenceScope: 'shared',
      contextType: ctx,
      promptEligible: true,
      hasSourceReference: true,
    }),
    `superseded blocked from ${ctx}`
  )
}

assert(
  canGraphItemEnterPrompt({
    authorityStatus: 'superseded',
    reviewStatus: 'superseded',
    presenceScope: 'shared',
    contextType: 'graph_review',
    promptEligible: true,
    hasSourceReference: true,
  }),
  'superseded allowed in graph_review'
)

// ─── Inferred — limited contexts ────────────────────────────────────────────

section('inferred allowed only in graph_review/watchtower/reflection')

assert(
  canGraphItemEnterPrompt({
    authorityStatus: 'inferred',
    reviewStatus: 'unreviewed',
    presenceScope: 'shared',
    contextType: 'watchtower',
    promptEligible: true,
    hasSourceReference: true,
  }),
  'inferred allowed in watchtower'
)

assert(
  canGraphItemEnterPrompt({
    authorityStatus: 'inferred',
    reviewStatus: 'unreviewed',
    presenceScope: 'shared',
    contextType: 'graph_review',
    promptEligible: true,
    hasSourceReference: true,
  }),
  'inferred allowed in graph_review'
)

assert(
  canGraphItemEnterPrompt({
    authorityStatus: 'inferred',
    reviewStatus: 'unreviewed',
    presenceScope: 'shared',
    contextType: 'reflection',
    promptEligible: true,
    hasSourceReference: true,
  }),
  'inferred allowed in reflection'
)

assert(
  !canGraphItemEnterPrompt({
    authorityStatus: 'inferred',
    reviewStatus: 'unreviewed',
    presenceScope: 'ari',
    targetPresence: 'ari',
    contextType: 'presence_chat',
    promptEligible: true,
    hasSourceReference: true,
  }),
  'inferred blocked from presence_chat'
)

// ─── Candidate — not in normal presence_chat ────────────────────────────────

section('candidate not allowed in normal presence_chat')

assert(
  !canGraphItemEnterPrompt({
    authorityStatus: 'candidate',
    reviewStatus: 'pending_review',
    presenceScope: 'ari',
    targetPresence: 'ari',
    contextType: 'presence_chat',
    promptEligible: true,
    hasSourceReference: true,
  }),
  'candidate blocked from presence_chat'
)

assert(
  canGraphItemEnterPrompt({
    authorityStatus: 'candidate',
    reviewStatus: 'pending_review',
    presenceScope: 'shared',
    contextType: 'memory_candidate_generation',
    promptEligible: true,
    hasSourceReference: true,
  }),
  'candidate allowed in memory_candidate_generation'
)

assert(
  canGraphItemEnterPrompt({
    authorityStatus: 'candidate',
    reviewStatus: 'pending_review',
    presenceScope: 'shared',
    contextType: 'graph_review',
    promptEligible: true,
    hasSourceReference: true,
  }),
  'candidate allowed in graph_review'
)

// ─── held_truth in presence_chat ────────────────────────────────────────────

section('held_truth presence_chat rules')

assert(
  canGraphItemEnterPrompt({
    authorityStatus: 'held_truth',
    reviewStatus: 'approved_graph',
    presenceScope: 'ari',
    targetPresence: 'ari',
    contextType: 'presence_chat',
    promptEligible: true,
    hasSourceReference: true,
  }),
  'held_truth allowed in ari presence_chat with matching scope'
)

assert(
  !canGraphItemEnterPrompt({
    authorityStatus: 'held_truth',
    reviewStatus: 'approved_graph',
    presenceScope: 'ari',
    targetPresence: 'ari',
    contextType: 'presence_chat',
    promptEligible: true,
    hasSourceReference: false,
  }),
  'held_truth blocked from presence_chat without source'
)

assert(
  !canGraphItemEnterPrompt({
    authorityStatus: 'held_truth',
    reviewStatus: 'approved_graph',
    presenceScope: 'ari',
    targetPresence: 'ari',
    contextType: 'presence_chat',
    promptEligible: false,
    hasSourceReference: true,
  }),
  'held_truth blocked when promptEligible=false'
)

// ─── canonical_supported in presence_chat ───────────────────────────────────

section('canonical_supported presence_chat rules')

assert(
  canGraphItemEnterPrompt({
    authorityStatus: 'canonical_supported',
    reviewStatus: 'approved_graph',
    presenceScope: 'eli',
    targetPresence: 'eli',
    contextType: 'presence_chat',
    promptEligible: true,
    hasSourceReference: true,
  }),
  'canonical_supported allowed in eli presence_chat with matching scope'
)

assert(
  !canGraphItemEnterPrompt({
    authorityStatus: 'canonical_supported',
    reviewStatus: 'approved_graph',
    presenceScope: 'eli',
    targetPresence: 'eli',
    contextType: 'presence_chat',
    promptEligible: true,
    hasSourceReference: false,
  }),
  'canonical_supported blocked without source'
)

// ─── Scope mismatch blocks ─────────────────────────────────────────────────

section('Scope mismatch blocks prompt entry')

assert(
  !canGraphItemEnterPrompt({
    authorityStatus: 'canonical_supported',
    reviewStatus: 'approved_graph',
    presenceScope: 'eli',
    targetPresence: 'ari',
    contextType: 'presence_chat',
    promptEligible: true,
    hasSourceReference: true,
  }),
  'eli-scoped blocked from ari presence_chat'
)

assert(
  !canGraphItemEnterPrompt({
    authorityStatus: 'canonical_supported',
    reviewStatus: 'approved_graph',
    presenceScope: 'ari',
    targetPresence: 'eli',
    contextType: 'presence_chat',
    promptEligible: true,
    hasSourceReference: true,
  }),
  'ari-scoped blocked from eli presence_chat'
)

assert(
  canGraphItemEnterPrompt({
    authorityStatus: 'canonical_supported',
    reviewStatus: 'approved_graph',
    presenceScope: 'shared',
    targetPresence: 'ari',
    contextType: 'presence_chat',
    promptEligible: true,
    hasSourceReference: true,
  }),
  'shared scope allowed in ari presence_chat'
)

assert(
  canGraphItemEnterPrompt({
    authorityStatus: 'canonical_supported',
    reviewStatus: 'approved_graph',
    presenceScope: 'house',
    targetPresence: 'eli',
    contextType: 'presence_chat',
    promptEligible: true,
    hasSourceReference: true,
  }),
  'house scope allowed in eli presence_chat'
)

// ─── Lounge chat scope rules ────────────────────────────────────────────────

section('Lounge chat scope rules')

assert(
  canGraphItemEnterPrompt({
    authorityStatus: 'canonical_supported',
    reviewStatus: 'approved_graph',
    presenceScope: 'shared',
    contextType: 'lounge_chat',
    promptEligible: true,
    hasSourceReference: true,
  }),
  'shared scope allowed in lounge_chat'
)

assert(
  !canGraphItemEnterPrompt({
    authorityStatus: 'canonical_supported',
    reviewStatus: 'approved_graph',
    presenceScope: 'ari',
    contextType: 'lounge_chat',
    promptEligible: true,
    hasSourceReference: true,
  }),
  'ari-scoped blocked from lounge_chat'
)

assert(
  canGraphItemEnterPrompt({
    authorityStatus: 'canonical_supported',
    reviewStatus: 'approved_graph',
    presenceScope: 'house',
    contextType: 'lounge_chat',
    promptEligible: true,
    hasSourceReference: true,
  }),
  'house scope allowed in lounge_chat'
)

// ─── Review status rejected blocks ─────────────────────────────────────────

section('Review status rejected blocks all contexts')

assert(
  !canGraphItemEnterPrompt({
    authorityStatus: 'canonical_supported',
    reviewStatus: 'rejected',
    presenceScope: 'shared',
    contextType: 'presence_chat',
    promptEligible: true,
    hasSourceReference: true,
  }),
  'review=rejected blocks even canonical_supported'
)

// ─── Authority label coverage ───────────────────────────────────────────────

section('Authority labels exist for all statuses')

const allStatuses: GraphAuthorityStatus[] = [
  'canonical_supported', 'candidate', 'held_truth', 'archive_supported',
  'library_reference', 'inferred', 'workspace_only', 'rejected', 'superseded',
]
for (const status of allStatuses) {
  const label = getGraphPromptAuthorityLabel(status)
  assert(typeof label === 'string' && label.length > 0, `authority label exists for "${status}"`)
}

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════`)
console.log(`  Phase 37A Prompt Eligibility Tests: ${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log(`\n  Failures:`)
  failures.forEach(f => console.log(`    - ${f}`))
}
console.log(`══════════════════════════════════════\n`)

process.exit(failed > 0 ? 1 : 0)
