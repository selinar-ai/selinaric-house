/**
 * Phase 38.4.1 — LLM Reasoning Feedback Boundary Tests
 *
 * Run: npx tsx src/lib/graph/__tests__/llmReasoningFeedback.test.ts
 *
 * No Supabase calls, no data writes.
 * Structural tests: feedback type enum, endpoint safety, no-authority boundary,
 * no-evidence boundary, no-mutation boundary.
 */

import * as fs from 'fs'
import * as path from 'path'

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}

function section(name: string) { console.log(`\n── ${name} ──`) }

// ─── Tests ─────────────────────────────────────────────────────────────────

section('Feedback type enum')

{
  // Import the feedback type validator directly by reading the route file
  // (can't import directly due to Supabase chain — structural check instead)
  const routePath = path.resolve(__dirname, '../../../app/api/llm-reasoning-feedback/route.ts')
  const content = fs.readFileSync(routePath, 'utf-8')

  const expectedTypes = ['useful', 'not_useful', 'needs_evidence', 'misread', 'candidate_signal']
  for (const t of expectedTypes) {
    assert(content.includes(`'${t}'`), `feedback type '${t}' defined in route`)
  }
  assert(!content.includes("'potential_candidate'"), 'potential_candidate NOT in enum (uses candidate_signal)')
  assert(!content.includes("'approved'"), 'approved not a feedback type')
  assert(!content.includes("'promoted'"), 'promoted not a feedback type')
}

section('Route — auth, writes, and governance fields')

{
  const routePath = path.resolve(__dirname, '../../../app/api/llm-reasoning-feedback/route.ts')
  const content = fs.readFileSync(routePath, 'utf-8')

  // Auth must be first
  assert(content.includes('requireHouseApiAuth'), 'route imports requireHouseApiAuth')
  const authIdx = content.indexOf('auth.ok')
  const insertIdx = content.indexOf('.insert(')
  assert(authIdx > 0 && insertIdx > 0 && authIdx < insertIdx,
    'auth check appears before insert')

  // Only one allowed table
  const fromMatches = content.match(/\.from\(['"]([^'"]+)['"]\)/g) ?? []
  const tables = fromMatches.map(m => m.match(/\.from\(['"]([^'"]+)['"]\)/)?.[1]).filter(Boolean)
  const allowedTables = ['llm_reasoning_feedback_events', 'graph_candidate_suggestions']
  const forbidden = tables.filter(t => !allowedTables.includes(t as string))
  assert(forbidden.length === 0,
    `route only queries allowed tables (found: ${[...new Set(tables)].join(', ')})`)

  // Only INSERT on the feedback table — graph_candidate_suggestions is SELECT only
  assert(!content.includes('.update('), 'route has no .update()')
  assert(!content.includes('.delete('), 'route has no .delete()')
  assert(!content.includes('.upsert('), 'route has no .upsert()')

  // No Anthropic
  assert(!content.includes('anthropic'), 'route does not import anthropic')
  assert(!content.includes('generateText'), 'route does not call generateText')

  // Server-owned governance fields
  assert(content.includes("authority_changed: false"), 'route sets authority_changed: false')
  assert(content.includes("not_evidence: true"), 'route sets not_evidence: true')
  assert(content.includes("prompt_eligible: false"), 'route sets prompt_eligible: false')
  assert(content.includes("review_routed: false"), 'route sets review_routed: false')
  assert(content.includes("created_by: 'tara'"), 'route sets created_by: tara')

  // No override paths for governance fields
  assert(!content.includes('body.authority_changed'), 'route ignores client authority_changed')
  assert(!content.includes('body.not_evidence'), 'route ignores client not_evidence')
  assert(!content.includes('body.prompt_eligible'), 'route ignores client prompt_eligible')
  assert(!content.includes('body.review_routed'), 'route ignores client review_routed')
  assert(!content.includes('body.created_by'), 'route ignores client created_by')
}

section('Route — no forbidden authority mutations')

{
  const routePath = path.resolve(__dirname, '../../../app/api/llm-reasoning-feedback/route.ts')
  const content = fs.readFileSync(routePath, 'utf-8')

  // Never mutates authority tables
  assert(!content.includes("'archive_items'"), 'route does not touch archive_items')
  assert(!content.includes("'held_truths'"), 'route does not touch held_truths')
  assert(!content.includes("'graph_proposals'"), 'route does not touch graph_proposals')
  assert(!content.includes("'archive_memory_events'"), 'route does not touch archive_memory_events')
  assert(!content.includes("'graph_candidate_suggestions'") ||
    content.includes("select('status, candidate_type')"), 'graph_candidate_suggestions is read-only')

  // No candidate creation
  assert(!content.includes('confirm_memory'), 'route has no confirm_memory')
  assert(!content.includes('promoteToHeldTruth'), 'route has no promoteToHeldTruth')

  // No draft storage
  assert(!content.includes('evidence_summary'), 'route does not store draft evidence_summary')
  assert(!content.includes('directly_supported'), 'route does not store draft sections')
  assert(!content.includes('draft_hash'), 'draft_hash not stored in 38.4.1 (deferred)')

  // No streaming
  assert(!content.includes('ReadableStream'), 'route has no streaming')
  assert(!content.includes('.stream('), 'route has no streaming')
}

section('Migration — table structure')

{
  const migPath = path.resolve(__dirname, '../../../../supabase-migrations/071_llm_reasoning_feedback_events.sql')
  const content = fs.readFileSync(migPath, 'utf-8')

  // Table exists
  assert(content.includes('create table llm_reasoning_feedback_events'), 'table created')

  // Feedback type enum
  assert(content.includes("'useful'"), "enum has 'useful'")
  assert(content.includes("'not_useful'"), "enum has 'not_useful'")
  assert(content.includes("'needs_evidence'"), "enum has 'needs_evidence'")
  assert(content.includes("'misread'"), "enum has 'misread'")
  assert(content.includes("'candidate_signal'"), "enum has 'candidate_signal'")
  assert(!content.includes("'potential_candidate'"), "enum does not have 'potential_candidate'")

  // Governance constraints present
  assert(content.includes('lrfe_authority_never_changes'), 'authority_changed constraint present')
  assert(content.includes('lrfe_not_evidence_always_true'), 'not_evidence constraint present')
  assert(content.includes('lrfe_not_prompt_eligible'), 'prompt_eligible constraint present')
  assert(content.includes('lrfe_not_review_routed'), 'review_routed constraint present')
  assert(content.includes('lrfe_note_length_check'), 'note length constraint present')

  // FK to graph_candidate_suggestions with RESTRICT
  assert(content.includes('references graph_candidate_suggestions(id) on delete restrict'),
    'FK to graph_candidate_suggestions with RESTRICT')

  // NOT linked to authority tables
  assert(!content.includes('references archive_items'), 'not linked to archive_items')
  assert(!content.includes('references held_truths'), 'not linked to held_truths')
  assert(!content.includes('references graph_proposals'), 'not linked to graph_proposals')

  // Draft body never stored
  assert(!content.includes('evidence_summary'), 'draft evidence_summary not in schema')
  assert(!content.includes('directly_supported'), 'draft sections not in schema')
  assert(!content.includes('raw_prompt'), 'raw_prompt not in schema')
  assert(!content.includes('draft_hash'), 'draft_hash not in schema (deferred)')

  // RLS enabled
  assert(content.includes('enable row level security'), 'RLS enabled')
  assert(content.includes('Allow all access to llm_reasoning_feedback_events'), 'open RLS policy')
}

section('Route — feedback is not evidence guard')

{
  // Verify the feedback table and route are not referenced in evidence paths
  const evidencePaths = [
    path.resolve(__dirname, '../candidateSuggestionService.ts'),
    path.resolve(__dirname, '../llmReasoningContract.ts'),
    path.resolve(__dirname, '../reasoningBaseline.ts'),
  ]

  for (const p of evidencePaths) {
    const content = fs.readFileSync(p, 'utf-8')
    assert(
      !content.includes('llm_reasoning_feedback_events'),
      `${path.basename(p)} does not reference feedback table (not evidence)`
    )
  }
}

section('38.3.3 regression — prior phases intact')

{
  const llmRoute = path.resolve(__dirname, '../../../app/api/graph-candidate-suggestions/[id]/llm-reasoning-draft/route.ts')
  const content = fs.readFileSync(llmRoute, 'utf-8')
  assert(content.includes('requireHouseApiAuth'), 'LLM draft route still has auth')

  const panel = path.resolve(__dirname, '../../../components/graph/LLMReasoningDraftPanel.tsx')
  const panelContent = fs.readFileSync(panel, 'utf-8')
  assert(!panelContent.includes('llm_reasoning_feedback_events'), 'LLM draft panel does not reference feedback table yet (no UI in 38.4.1)')
  assert(panelContent.includes("credentials: 'same-origin'"), 'panel still uses same-origin credentials')
}

// ─── Summary ───────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
if (failures.length > 0) {
  console.log('\n  Failures:')
  for (const f of failures) console.log(`    ✗ ${f}`)
}
console.log('══════════════════════════════════════════\n')
process.exit(failed > 0 ? 1 : 0)
