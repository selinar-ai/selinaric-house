// Phase 37C — Proposal Status Transition Tests
//
// Tests the status transition helper, API route safety,
// authority boundary, and bulk action constraints.
//
// Usage: npx tsx src/lib/graph/__tests__/proposalStatus.test.ts

import {
  canTransitionGraphProposalStatus,
  getInvalidGraphProposalTransitionReason,
  getAllowedTransitionsFrom,
  getEventTypeForStatusChange,
} from '../proposalStatus'

import { readFileSync } from 'fs'
import { resolve } from 'path'

// ─── Test harness ──────────────────────────────────────────────────────────

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

// ─── Read source files for safety inspection ───────────────────────────────

const graphDir = resolve(__dirname, '..')
const reviewFile = readFileSync(resolve(graphDir, 'proposalReview.ts'), 'utf-8')
const statusFile = readFileSync(resolve(graphDir, 'proposalStatus.ts'), 'utf-8')

const apiDir = resolve(__dirname, '..', '..', '..', 'app', 'api', 'graph-proposals')
const statusRouteFile = readFileSync(resolve(apiDir, '[id]', 'status', 'route.ts'), 'utf-8')
const bulkRouteFile = readFileSync(resolve(apiDir, 'bulk-status', 'route.ts'), 'utf-8')

// ═══════════════════════════════════════════════════════════════════════════

// 1. Status transition helper — allowed transitions

section('Allowed transitions from pending_review')
assert(canTransitionGraphProposalStatus({ from: 'pending_review', to: 'approved_graph' }), 'pending_review → approved_graph')
assert(canTransitionGraphProposalStatus({ from: 'pending_review', to: 'rejected' }), 'pending_review → rejected')
assert(canTransitionGraphProposalStatus({ from: 'pending_review', to: 'needs_more_evidence' }), 'pending_review → needs_more_evidence')
assert(canTransitionGraphProposalStatus({ from: 'pending_review', to: 'workspace_only' }), 'pending_review → workspace_only')

section('Allowed transitions from needs_more_evidence')
assert(canTransitionGraphProposalStatus({ from: 'needs_more_evidence', to: 'approved_graph' }), 'needs_more_evidence → approved_graph')
assert(canTransitionGraphProposalStatus({ from: 'needs_more_evidence', to: 'rejected' }), 'needs_more_evidence → rejected')
assert(canTransitionGraphProposalStatus({ from: 'needs_more_evidence', to: 'workspace_only' }), 'needs_more_evidence → workspace_only')

section('Allowed transitions from workspace_only')
assert(canTransitionGraphProposalStatus({ from: 'workspace_only', to: 'pending_review' }), 'workspace_only → pending_review')
assert(canTransitionGraphProposalStatus({ from: 'workspace_only', to: 'rejected' }), 'workspace_only → rejected')

section('Allowed transitions from approved_graph')
assert(canTransitionGraphProposalStatus({ from: 'approved_graph', to: 'superseded' }), 'approved_graph → superseded')

section('Allowed transitions from rejected')
assert(canTransitionGraphProposalStatus({ from: 'rejected', to: 'pending_review' }), 'rejected → pending_review')

section('Allowed transitions from superseded')
assert(canTransitionGraphProposalStatus({ from: 'superseded', to: 'pending_review' }), 'superseded → pending_review')

// 2. Blocked transitions

section('Invalid transitions blocked')
assert(!canTransitionGraphProposalStatus({ from: 'pending_review', to: 'superseded' }), 'pending_review → superseded blocked')
assert(!canTransitionGraphProposalStatus({ from: 'pending_review', to: 'pending_review' }), 'pending_review → pending_review blocked (same status)')
assert(!canTransitionGraphProposalStatus({ from: 'approved_graph', to: 'pending_review' }), 'approved_graph → pending_review blocked')
assert(!canTransitionGraphProposalStatus({ from: 'approved_graph', to: 'rejected' }), 'approved_graph → rejected blocked')
assert(!canTransitionGraphProposalStatus({ from: 'approved_graph', to: 'needs_more_evidence' }), 'approved_graph → needs_more_evidence blocked')
assert(!canTransitionGraphProposalStatus({ from: 'rejected', to: 'approved_graph' }), 'rejected → approved_graph blocked (must go through pending)')
assert(!canTransitionGraphProposalStatus({ from: 'superseded', to: 'approved_graph' }), 'superseded → approved_graph blocked')
assert(!canTransitionGraphProposalStatus({ from: 'workspace_only', to: 'approved_graph' }), 'workspace_only → approved_graph blocked (must go through pending)')

section('Unknown status blocked')
assert(!canTransitionGraphProposalStatus({ from: 'nonexistent', to: 'approved_graph' }), 'unknown from status blocked')
assert(!canTransitionGraphProposalStatus({ from: 'pending_review', to: 'nonexistent' }), 'unknown to status blocked')

// 3. Transition reason messages

section('Invalid transition reason messages')
assert(
  getInvalidGraphProposalTransitionReason({ from: 'pending_review', to: 'pending_review' }).includes('already'),
  'Same-status reason includes "already"'
)
assert(
  getInvalidGraphProposalTransitionReason({ from: 'nonexistent', to: 'approved_graph' }).includes('Unknown'),
  'Unknown from-status reason includes "Unknown"'
)
assert(
  getInvalidGraphProposalTransitionReason({ from: 'pending_review', to: 'superseded' }).includes('not allowed'),
  'Blocked transition reason includes "not allowed"'
)
assert(
  getInvalidGraphProposalTransitionReason({ from: 'pending_review', to: 'approved_graph' }) === '',
  'Valid transition returns empty string'
)

// 4. getAllowedTransitionsFrom

section('getAllowedTransitionsFrom')
assert(getAllowedTransitionsFrom('pending_review').length === 4, 'pending_review has 4 allowed transitions')
assert(getAllowedTransitionsFrom('approved_graph').length === 1, 'approved_graph has 1 allowed transition')
assert(getAllowedTransitionsFrom('nonexistent').length === 0, 'unknown status has 0 transitions')

// 5. Event type mapping

section('Event type mapping')
assert(getEventTypeForStatusChange('approved_graph') === 'approved_graph', 'approved_graph event type')
assert(getEventTypeForStatusChange('rejected') === 'rejected', 'rejected event type')
assert(getEventTypeForStatusChange('needs_more_evidence') === 'marked_needs_more_evidence', 'needs_more_evidence event type')
assert(getEventTypeForStatusChange('workspace_only') === 'marked_workspace_only', 'workspace_only event type')
assert(getEventTypeForStatusChange('superseded') === 'superseded', 'superseded event type')
assert(getEventTypeForStatusChange('pending_review') === 'restored', 'pending_review (restore) event type')

// 6. Event types match DB CHECK constraint

section('Event types match DB CHECK constraint')
const migrationFile = readFileSync(resolve(__dirname, '..', '..', '..', '..', 'supabase-migrations', '068_graph_proposals.sql'), 'utf-8')
const allowedEventTypes = [
  'proposal_created', 'status_changed', 'marked_needs_more_evidence',
  'marked_workspace_only', 'approved_graph', 'rejected', 'superseded', 'restored'
]
for (const eventType of allowedEventTypes) {
  assert(migrationFile.includes(`'${eventType}'`), `Event type "${eventType}" in DB CHECK constraint`)
}

// All event types from getEventTypeForStatusChange are in DB
const allStatuses = ['approved_graph', 'rejected', 'needs_more_evidence', 'workspace_only', 'superseded', 'pending_review']
for (const status of allStatuses) {
  const eventType = getEventTypeForStatusChange(status)
  assert(allowedEventTypes.includes(eventType), `Event type "${eventType}" for status "${status}" is in DB CHECK`)
}

// 7. API route safety — single status

// Strip comments for code-only safety checks
function stripComments(code: string): string {
  return code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

const statusRouteCode = stripComments(statusRouteFile)
const bulkRouteCode = stripComments(bulkRouteFile)

section('Single status API safety')
assert(statusRouteFile.includes("'PATCH'") || statusRouteFile.includes('PATCH'), 'Status route uses PATCH method')
assert(statusRouteFile.includes('GRAPH_REVIEW_STATUSES'), 'Status route validates against GRAPH_REVIEW_STATUSES')
assert(!statusRouteCode.includes('prompt_eligible'), 'Status route does not modify prompt_eligible')
assert(!statusRouteCode.includes('memory_nodes'), 'Status route does not reference memory_nodes')
assert(!statusRouteCode.includes('memory_edges'), 'Status route does not reference memory_edges')
assert(!statusRouteCode.includes('archive_graph'), 'Status route does not reference archive_graph tables')
assert(!statusRouteCode.includes('canonical_status'), 'Status route does not reference canonical_status')

// 8. API route safety — bulk status

section('Bulk status API safety')
assert(bulkRouteFile.includes('proposalIds'), 'Bulk route requires explicit proposalIds')
assert(bulkRouteFile.includes('100'), 'Bulk route has max 100 limit')
assert(bulkRouteFile.includes('GRAPH_REVIEW_STATUSES'), 'Bulk route validates against GRAPH_REVIEW_STATUSES')
assert(!bulkRouteCode.includes('prompt_eligible'), 'Bulk route does not modify prompt_eligible')
assert(!bulkRouteCode.includes('memory_nodes'), 'Bulk route does not reference memory_nodes')
assert(!bulkRouteCode.includes('memory_edges'), 'Bulk route does not reference memory_edges')
assert(!bulkRouteCode.includes('archive_graph'), 'Bulk route does not reference archive_graph tables')
assert(!bulkRouteCode.includes('canonical_status'), 'Bulk route does not reference canonical_status')

// 9. Review library safety

section('Review library safety')
assert(reviewFile.includes("actor: 'tara'"), 'Review library sets actor to tara')
assert(!reviewFile.includes('prompt_eligible: true'), 'Review library never sets prompt_eligible true')
assert(!reviewFile.includes('memory_nodes'), 'Review library does not reference memory_nodes')
assert(!reviewFile.includes('memory_edges'), 'Review library does not reference memory_edges')
assert(!reviewFile.includes('archive_graph'), 'Review library does not reference archive_graph tables')
assert(!reviewFile.includes('canonical_status'), 'Review library does not reference canonical_status')

// Review writes only to allowed tables
const reviewFromCalls = reviewFile.match(/\.from\(['"]([^'"]+)['"]\)/g) ?? []
const allowedTables = ['graph_proposals', 'graph_proposal_events']
for (const call of reviewFromCalls) {
  const table = call.match(/\.from\(['"]([^'"]+)['"]\)/)?.[1] ?? ''
  assert(allowedTables.includes(table), `Review library accesses only allowed table: "${table}"`)
}

// 10. Authority boundary — approved_graph does not escalate

section('Authority boundary')
assert(!reviewFile.includes('authority_status'), 'Review library does not modify authority_status')
assert(!statusRouteFile.includes('authority_status'), 'Status API does not modify authority_status')
assert(!bulkRouteFile.includes('authority_status'), 'Bulk API does not modify authority_status')

// 11. No writes to existing graph systems

section('No writes to existing graph systems')
const allReviewCode = reviewFile + statusRouteFile + bulkRouteFile
assert(!allReviewCode.includes('memory_nodes'), 'No memory_nodes writes in review code')
assert(!allReviewCode.includes('memory_edges'), 'No memory_edges writes in review code')
assert(!allReviewCode.includes('archive_graph_nodes'), 'No archive_graph_nodes writes in review code')
assert(!allReviewCode.includes('archive_graph_edges'), 'No archive_graph_edges writes in review code')

// 12. Actor is server-derived, not client

section('Actor is server-derived')
assert(!statusRouteFile.includes('body.actor') && !statusRouteFile.includes('actor'), 'Status API does not accept actor from body')
assert(!bulkRouteFile.includes('body.actor') && !bulkRouteFile.includes('actor'), 'Bulk API does not accept actor from body')
assert(reviewFile.includes("actor: 'tara'"), 'Review library hardcodes actor to tara')

// 13. Bulk API rejects empty and oversized

section('Bulk API validation')
assert(bulkRouteFile.includes('proposalIds.length === 0') || bulkRouteFile.includes('proposalIds.length === 0'), 'Bulk rejects empty array')
assert(bulkRouteFile.includes('proposalIds.length > 100'), 'Bulk rejects > 100 IDs')
assert(bulkRouteFile.includes("'unreviewed'"), 'Bulk rejects unreviewed status')

// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(38))
console.log(`  Phase 37C Status/Review Tests: ${passed} passed, ${failed} failed`)
console.log('═'.repeat(38))

if (failures.length > 0) {
  console.log('\nFailed:')
  for (const f of failures) {
    console.log(`  ✗ ${f}`)
  }
}

process.exit(failed > 0 ? 1 : 0)
