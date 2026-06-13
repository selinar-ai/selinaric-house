/**
 * Phase 41.5 — Helper Output Store / Writer tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/helperOutputStore.test.ts
 *
 * No real DB, no Supabase, no LLM, no network. The insert path is exercised
 * with a fake injected client.
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  buildHelperOutputInsertPayload,
  insertHelperOutputs,
  WRITABLE_HELPER_OUTPUT_STATUSES,
  type HelperOutputInsertPayload,
  type HelperOutputDbClient,
  type HelperOutputInsertResult,
} from '../helperOutputStore'

import { inspectLibraryItem, type LibraryItemSnapshot } from '../libraryMetadataHelper'
import type { HelperOutputDraft } from '../helperContract'
import {
  asLibraryMetadataPayload,
  authorityFlags,
  type HelperOutputRow,
} from '../helperReviewPresenter'

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}

function section(name: string) { console.log(`\n── ${name} ──`) }

function threw(fn: () => unknown): boolean {
  try { fn(); return false } catch { return true }
}

async function threwAsync(fn: () => Promise<unknown>): Promise<boolean> {
  try { await fn(); return false } catch { return true }
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

function validDraft(o: Partial<HelperOutputDraft> = {}): HelperOutputDraft {
  return {
    helper_type: 'library_metadata_helper',
    source_refs: [{ source_surface: 'library_item', source_id: 'item-1' }],
    presence_scope: 'house',
    output_status: 'deterministic_check',
    suggested_action: 'add_summary',
    suggestion_payload: { issue_code: 'item_summary_missing', checked_fields: ['description'] },
    confidence_label: 'structural',
    human_review_required: true,
    not_memory: true,
    not_evidence: true,
    prompt_eligible: false,
    authority_changed: false,
    review_routed: false,
    created_by: 'system_candidate',
    ...o,
  }
}

/** A fake DB client that records what it was asked to insert. */
function makeFakeClient(): {
  client: HelperOutputDbClient
  calls: { table: string; rows: HelperOutputInsertPayload[]; columns: string }[]
} {
  const calls: { table: string; rows: HelperOutputInsertPayload[]; columns: string }[] = []
  const client: HelperOutputDbClient = {
    from(table) {
      return {
        insert(rows) {
          return {
            async select(columns): Promise<HelperOutputInsertResult> {
              calls.push({ table, rows, columns })
              return {
                data: rows.map((r, i) => ({
                  id: `inserted-${i}`,
                  helper_type: r.helper_type,
                  output_status: r.output_status,
                  test_owned: r.test_owned,
                  created_at: '2026-06-10T00:00:00Z',
                })),
                error: null,
              }
            },
          }
        },
      }
    },
  }
  return { client, calls }
}

// ═════════════════════════════════════════════════════════════════════════════
// A. Valid draft → safe insert payload
// ═════════════════════════════════════════════════════════════════════════════

section('A. Valid draft → safe payload')
{
  const p = buildHelperOutputInsertPayload(validDraft())
  assert(p.helper_type === 'library_metadata_helper', 'helper_type preserved')
  assert(p.not_memory === true, 'not_memory forced true')
  assert(p.not_evidence === true, 'not_evidence forced true')
  assert(p.prompt_eligible === false, 'prompt_eligible forced false')
  assert(p.authority_changed === false, 'authority_changed forced false')
  assert(p.human_review_required === true, 'human_review_required forced true')
  assert(p.review_routed === false, 'review_routed forced false')
  assert(p.test_owned === true, 'test_owned defaults true')
  assert(p.source_refs.length === 1, 'non-empty source_refs preserved')
  // Review fields are never set.
  assert(!('reviewed_by' in p), 'reviewed_by not set')
  assert(!('reviewed_at' in p), 'reviewed_at not set')
  assert(!('deleted_at' in p), 'deleted_at not set')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Invalid drafts rejected
// ═════════════════════════════════════════════════════════════════════════════

section('B. Invalid drafts rejected')
{
  assert(threw(() => buildHelperOutputInsertPayload(validDraft({ source_refs: [] }))), 'empty provenance rejected')
  assert(threw(() => buildHelperOutputInsertPayload(validDraft({ source_refs: [{ source_surface: 'helper_output' as never, source_id: 'h' }] }))), 'helper_output provenance rejected')
  assert(threw(() => buildHelperOutputInsertPayload(validDraft({ helper_type: 'retrieval_gap_helper' as never }))), 'non-v1 helper rejected')
  assert(threw(() => buildHelperOutputInsertPayload(validDraft({ suggested_action: 'promote_to_memory' as never }))), 'forbidden action rejected')
  assert(threw(() => buildHelperOutputInsertPayload(validDraft({ prompt_eligible: true as never }))), 'prompt_eligible:true draft rejected')
  assert(threw(() => buildHelperOutputInsertPayload(validDraft({ authority_changed: true as never }))), 'authority_changed:true draft rejected')
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Only inert statuses are writable
// ═════════════════════════════════════════════════════════════════════════════

section('C. Writable status guard')
{
  assert(WRITABLE_HELPER_OUTPUT_STATUSES.length === 2, 'exactly two writable statuses')
  for (const s of ['draft_only', 'deterministic_check']) {
    assert(!threw(() => buildHelperOutputInsertPayload(validDraft({ output_status: s as never }))), `${s} is writable`)
  }
  for (const s of ['queued_for_review', 'needs_human_review', 'accepted_by_human', 'rejected_by_human', 'superseded']) {
    assert(threw(() => buildHelperOutputInsertPayload(validDraft({ output_status: s as never }))), `${s} is rejected (review/decision status)`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// D. test_owned default + run marker
// ═════════════════════════════════════════════════════════════════════════════

section('D. test_owned default and verification marker')
{
  assert(buildHelperOutputInsertPayload(validDraft()).test_owned === true, 'test_owned true by default')
  const marker = { verification_run: 'phase_41_5_controlled_seed', run_id: 'run-xyz', expected: 'visible_in_helper_review_surface' }
  const p = buildHelperOutputInsertPayload(validDraft(), { runMarker: marker })
  const sp = p.suggestion_payload as Record<string, unknown>
  assert(!!sp._verification, 'verification marker stamped into suggestion_payload')
  assert((sp._verification as Record<string, unknown>).run_id === 'run-xyz', 'marker run_id present')
  // Original payload fields survive the merge.
  assert(sp.issue_code === 'item_summary_missing', 'original payload preserved alongside marker')
}

// ═════════════════════════════════════════════════════════════════════════════
// E. Determinism
// ═════════════════════════════════════════════════════════════════════════════

section('E. Determinism')
{
  const a = buildHelperOutputInsertPayload(validDraft())
  const b = buildHelperOutputInsertPayload(validDraft())
  assert(JSON.stringify(a) === JSON.stringify(b), 'same draft → identical payload')
}

// ═════════════════════════════════════════════════════════════════════════════
// F + G. Insert via injected fake client (async — run inside main())
// ═════════════════════════════════════════════════════════════════════════════

async function asyncSections() {
  // F. Insert via injected client (no real DB)
  section('F. Insert via injected client')
  {
    const item: LibraryItemSnapshot = { id: 'lib-1', title: '', description: null, tags: [], presence_scope: 'house' }
    const drafts = inspectLibraryItem(item) // real helper output
    const { client, calls } = makeFakeClient()
    const inserted = await insertHelperOutputs(client, drafts, {
      runMarker: { verification_run: 'phase_41_5_controlled_seed', run_id: 'run-1', expected: 'visible_in_helper_review_surface' },
    })
    assert(inserted.length === drafts.length, 'returns one row per draft')
    assert(calls.length === 1, 'single insert call')
    assert(calls[0].table === 'helper_outputs', 'writes only to helper_outputs')
    assert(calls[0].rows.every((r) => r.test_owned === true), 'all inserted rows test_owned')
    assert(calls[0].rows.every((r) => r.not_memory && r.not_evidence && !r.prompt_eligible && !r.authority_changed && r.human_review_required && !r.review_routed), 'all inserted rows have safe invariant flags')
    assert(inserted.every((r) => r.test_owned === true), 'returned rows are test_owned')
  }

  // G. Invalid draft blocks the whole insert (no partial writes)
  section('G. Invalid draft blocks insert')
  {
    const { client, calls } = makeFakeClient()
    const good = validDraft()
    const bad = validDraft({ source_refs: [] })
    const blocked = await threwAsync(() => insertHelperOutputs(client, [good, bad]))
    assert(blocked, 'insert throws if any draft is invalid')
    assert(calls.length === 0, 'no insert call made when a draft is invalid')
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// H. Seeded output renders in the Helper Review presenter
// ═════════════════════════════════════════════════════════════════════════════

section('H. Seeded output renders in presenter')
{
  const item: LibraryItemSnapshot = { id: 'lib-9', title: '', description: null, tags: [], presence_scope: 'house' }
  const draft = inspectLibraryItem(item).find((d) => d.suggested_action === 'add_summary')!
  const payload = buildHelperOutputInsertPayload(draft, {
    runMarker: { verification_run: 'phase_41_5_controlled_seed', run_id: 'run-2', expected: 'visible_in_helper_review_surface' },
  })
  // Shape it like a DB row the API would return.
  const row: HelperOutputRow = {
    id: 'seed-1', created_at: '2026-06-10T00:00:00Z', reviewed_by: null, reviewed_at: null, deleted_at: null,
    helper_type: payload.helper_type, output_status: payload.output_status, suggested_action: payload.suggested_action,
    confidence_label: payload.confidence_label, presence_scope: payload.presence_scope, created_by: payload.created_by,
    not_memory: payload.not_memory, not_evidence: payload.not_evidence, prompt_eligible: payload.prompt_eligible,
    authority_changed: payload.authority_changed, human_review_required: payload.human_review_required,
    review_routed: payload.review_routed, source_refs: payload.source_refs, suggestion_payload: payload.suggestion_payload,
  }
  const view = asLibraryMetadataPayload(row.suggestion_payload)
  assert(!!view && view.checked_fields_labelled.includes('Description / summary'), 'seeded row renders summary label')
  assert(authorityFlags(row).every((f) => f.safe), 'seeded row renders all-safe flags')
}

// ═════════════════════════════════════════════════════════════════════════════
// I. Source purity — writer imports no DB / LLM / prompt / retrieval modules
// ═════════════════════════════════════════════════════════════════════════════

section('I. Source purity (static scan)')
{
  const src = fs.readFileSync(path.resolve(__dirname, '../helperOutputStore.ts'), 'utf-8')
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  // NOTE: bare 'prompt' is intentionally NOT banned — prompt_eligible is a
  // legitimate flag the writer must set. We ban prompt *assembly/injection*.
  const banned = [
    'supabase', 'createClient', '@anthropic', 'anthropic', 'openai', 'fetch(',
    'library_chunks', 'embedding', 'promptBlocks', 'buildPrompt', 'inject',
    'archive', 'memory_nodes', 'chat-library-search', 'reasoning',
  ]
  for (const term of banned) {
    assert(!code.includes(term), `writer code does not reference '${term}'`)
  }
  // The only import is the helper contract.
  assert(code.includes("from './helperContract'"), 'writer imports only the helper contract')
}

// ─── Run async sections, then summary ─────────────────────────────────────────

asyncSections().then(() => {
  console.log('\n══════════════════════════════════════════')
  console.log(`  Passed: ${passed}`)
  console.log(`  Failed: ${failed}`)
  if (failures.length > 0) {
    console.log('\n  Failures:')
    for (const f of failures) console.log(`    ✗ ${f}`)
  }
  console.log('══════════════════════════════════════════\n')
  process.exit(failed > 0 ? 1 : 0)
})
