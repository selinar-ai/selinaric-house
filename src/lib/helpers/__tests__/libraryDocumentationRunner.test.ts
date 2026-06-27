/**
 * Phase 41.17.1 — Library Documentation Runner tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/libraryDocumentationRunner.test.ts
 *
 * Pure-logic coverage for the runner core, plus a static scan of the CLI script.
 *  A. Arg validation — one item per run, explicit confirm, dry-run, real gating
 *  B. Dedupe key — deterministic, sensitive to version/item/issue (4-field key)
 *  C. Metadata stamping — adds provenance, preserves the draft
 *  D. Deposit plan — skip active duplicates, insert the rest
 *  E. Payload safety — locked flags, test_owned, no review/authority/deleted fields
 *  F. CLI static scan — reads only Library surfaces; INSERT only; dry-run writes
 *     nothing; no route / candidate read / update / delete / scheduler
 */

import * as fs from 'fs'
import * as path from 'path'

import { inspectLibraryDocumentation, type LibraryDocItemSnapshot } from '../libraryDocumentationHelper'
import { buildHelperOutputInsertPayload } from '../helperOutputStore'
import {
  parseRunnerArgs,
  computeDedupeKey,
  dedupeKeyForDraft,
  stampRunnerMetadata,
  stampedDedupeKey,
  planDeposit,
  LIBRARY_DOCUMENTATION_HELPER_VERSION,
  RUNNER_INVOKED_BY,
} from '../libraryDocumentationRunner'

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []
function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) } else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}
function section(name: string) { console.log(`\n── ${name} ──`) }
function readSrc(rel: string): string { return fs.readFileSync(path.resolve(__dirname, rel), 'utf-8') }

// An item that trips both checks → 2 drafts (phase metadata + no source material).
const FIXTURE: LibraryDocItemSnapshot = {
  id: 'item-1', collection: 'development_documentation', presence_scope: 'house',
  phase_code: null, phase_number: null, phase_label: null,
  file_path: null, source_url: null, content_text: null,
}
const DRAFTS = inspectLibraryDocumentation(FIXTURE, [])

// ═════════════════════════════════════════════════════════════════════════════
// A. Argument validation
// ═════════════════════════════════════════════════════════════════════════════

section('A. Arg validation')
{
  const ok = parseRunnerArgs(['--confirm-helper-run', '--library-item-id', 'item-1'])
  assert(ok.ok === true && ok.ok && ok.libraryItemId === 'item-1' && ok.depositReal === false && ok.dryRun === false && ok.runMode === 'test_owned', 'valid default args → test_owned (no dry-run, no real)')

  const dry = parseRunnerArgs(['--confirm-helper-run', '--library-item-id', 'item-1', '--dry-run'])
  assert(dry.ok && dry.dryRun === true && dry.depositReal === false && dry.runMode === 'dry_run', '--dry-run → run_mode dry_run, no deposit')

  const real = parseRunnerArgs(['--confirm-helper-run', '--library-item-id', 'item-1', '--deposit-real'])
  assert(real.ok && real.depositReal === true && real.runMode === 'real_deposit', 'real deposit requires --deposit-real → run_mode real_deposit')

  assert(parseRunnerArgs(['--confirm-helper-run', '--library-item-id', 'item-1', '--dry-run', '--deposit-real']).ok === false, '--dry-run and --deposit-real are mutually exclusive')
  assert(parseRunnerArgs(['--library-item-id', 'item-1']).ok === false, 'refuses without --confirm-helper-run')
  assert(parseRunnerArgs(['--confirm-helper-run']).ok === false, 'refuses without --library-item-id')
  assert(parseRunnerArgs(['--confirm-helper-run', '--library-item-id', 'all']).ok === false, 'refuses "all" item id')
  assert(parseRunnerArgs(['--confirm-helper-run', '--all', '--library-item-id', 'item-1']).ok === false, 'refuses --all mode')
  assert(parseRunnerArgs(['--confirm-helper-run', '--library-item-id', 'a', '--library-item-id', 'b']).ok === false, 'refuses multiple --library-item-id')
  assert(parseRunnerArgs(['--confirm-helper-run', '--library-item-id', 'a,b']).ok === false, 'refuses comma-separated ids')
  assert(parseRunnerArgs(['--confirm-helper-run', '--library-item-id', '--dry-run']).ok === false, 'refuses --library-item-id with no value')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Dedupe key (4-field: helper_type | helper_version | source_item_id | issue_code)
// ═════════════════════════════════════════════════════════════════════════════

section('B. Dedupe key')
{
  const k = computeDedupeKey('library_documentation_helper', '41.17.0', 'item-1', 'phase_doc_missing_phase_metadata')
  assert(/^[a-f0-9]{64}$/.test(k), 'dedupe key is a 64-char sha256 hex')
  assert(computeDedupeKey('library_documentation_helper', '41.17.0', 'item-1', 'phase_doc_missing_phase_metadata') === k, 'same inputs → same key (deterministic)')
  assert(computeDedupeKey('library_documentation_helper', '41.17.1', 'item-1', 'phase_doc_missing_phase_metadata') !== k, 'helper-version change → new key')
  assert(computeDedupeKey('library_documentation_helper', '41.17.0', 'item-2', 'phase_doc_missing_phase_metadata') !== k, 'different item → different key')
  assert(computeDedupeKey('library_documentation_helper', '41.17.0', 'item-1', 'item_no_source_material') !== k, 'different issue → different key')

  const keys = DRAFTS.map((d) => dedupeKeyForDraft(d))
  assert(new Set(keys).size === DRAFTS.length, 'each distinct issue on the item yields a distinct key')
  assert(dedupeKeyForDraft(DRAFTS[0]) !== dedupeKeyForDraft(DRAFTS[0], '99.0.0'), 'dedupeKeyForDraft honours helper version')
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Metadata stamping
// ═════════════════════════════════════════════════════════════════════════════

section('C. Metadata stamping')
{
  const d = DRAFTS[0]
  const key = dedupeKeyForDraft(d)
  const stamped = stampRunnerMetadata(d, { helperVersion: LIBRARY_DOCUMENTATION_HELPER_VERSION, dedupeKey: key, runId: 'run-x', runMode: 'test_owned' })
  const p = stamped.suggestion_payload as Record<string, unknown>
  assert(p.helper_version === LIBRARY_DOCUMENTATION_HELPER_VERSION, 'stamps helper_version')
  assert(p._dedupe_key === key, 'stamps _dedupe_key')
  assert(p.run_id === 'run-x', 'stamps run_id')
  assert(p.run_mode === 'test_owned', 'stamps run_mode')
  assert(p.runner_invoked_by === RUNNER_INVOKED_BY && RUNNER_INVOKED_BY === 'manual_cli', 'stamps runner_invoked_by = manual_cli')
  assert(p.issue_code === 'phase_doc_missing_phase_metadata', 'preserves the original issue payload')
  assert(stampedDedupeKey(stamped) === key, 'stampedDedupeKey reads the key back')
  assert(stamped.helper_type === 'library_documentation_helper', 'helper_type unchanged')
  assert(stamped.created_by === 'system_candidate', 'created_by stays system_candidate')
  assert((d.suggestion_payload as Record<string, unknown>)._dedupe_key === undefined, 'original draft not mutated')
}

// ═════════════════════════════════════════════════════════════════════════════
// D. Deposit plan (dedupe skip)
// ═════════════════════════════════════════════════════════════════════════════

section('D. Deposit plan')
{
  const stamped = DRAFTS.map((d) => stampRunnerMetadata(d, { helperVersion: LIBRARY_DOCUMENTATION_HELPER_VERSION, dedupeKey: dedupeKeyForDraft(d), runId: 'r', runMode: 'test_owned' }))
  const keys = stamped.map((s) => stampedDedupeKey(s) as string)

  const none = planDeposit(stamped, new Set())
  assert(none.toInsert.length === stamped.length && none.skipped.length === 0, 'no existing keys → insert all')

  const oneExisting = planDeposit(stamped, new Set([keys[0]]))
  assert(oneExisting.toInsert.length === stamped.length - 1 && oneExisting.skipped.length === 1, 'one active duplicate → skip that one, insert the rest')
  assert(oneExisting.skipped[0].dedupeKey === keys[0], 'the skipped key is the existing one')

  const allExisting = planDeposit(stamped, new Set(keys))
  assert(allExisting.toInsert.length === 0 && allExisting.skipped.length === stamped.length, 'all keys active → insert nothing')
}

// ═════════════════════════════════════════════════════════════════════════════
// E. Payload safety (through the sealed writer)
// ═════════════════════════════════════════════════════════════════════════════

section('E. Payload safety')
{
  const d = DRAFTS[0]
  const stamped = stampRunnerMetadata(d, { helperVersion: LIBRARY_DOCUMENTATION_HELPER_VERSION, dedupeKey: dedupeKeyForDraft(d), runId: 'r', runMode: 'test_owned' })

  const test = buildHelperOutputInsertPayload(stamped, { testOwned: true })
  assert(test.test_owned === true, 'test-owned run → test_owned true')
  const real = buildHelperOutputInsertPayload(stamped, { testOwned: false })
  assert(real.test_owned === false, 'real deposit → test_owned false')

  assert(test.not_memory === true && test.not_evidence === true, 'not_memory / not_evidence locked true')
  assert(test.prompt_eligible === false && test.authority_changed === false, 'prompt_eligible / authority_changed locked false')
  assert(test.human_review_required === true && test.review_routed === false, 'human_review_required true, review_routed false')
  assert(test.output_status === 'deterministic_check', 'inert pre-review status only')
  assert(test.helper_type === 'library_documentation_helper', 'helper type is the documentation helper (not widened)')
  assert(test.created_by === 'system_candidate', 'created_by system_candidate')

  for (const forbidden of ['reviewed_by', 'reviewed_at', 'deleted_at', 'review_state']) {
    assert(!(forbidden in (test as Record<string, unknown>)), `writer never sets ${forbidden}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// F. CLI static scan
// ═════════════════════════════════════════════════════════════════════════════

section('F. CLI static scan')
{
  const cli = readSrc('../../../../scripts/run-library-documentation-helper.ts')

  assert(cli.includes('parseRunnerArgs(process.argv.slice(2))'), 'CLI validates args via the pure parser')
  assert(cli.includes('--confirm-helper-run'), 'CLI documents the explicit confirm flag')

  // Reads ONLY Library surfaces; one named item.
  assert(cli.includes('library_items?id=eq.'), 'reads one library item by id (no scan, no all)')
  assert(cli.includes('library_item_files?library_item_id=eq.'), 'reads that item\'s files (for a count)')

  // INSERT only — no update / delete / upsert / PATCH / DELETE / PUT method.
  for (const mut of ['.update(', '.delete(', '.upsert(', "method: 'PATCH'", "method: 'DELETE'", "method: 'PUT'"]) {
    assert(!cli.includes(mut), `CLI performs no ${mut}`)
  }
  assert(cli.includes("method: 'POST'"), 'CLI inserts via POST (the only write)')

  // Dry-run writes nothing: there is an explicit dry-run early-exit branch.
  assert(cli.includes('if (dryRun)') && cli.includes('DRY RUN'), 'CLI has a dry-run preview branch that writes nothing')

  // Dedupe blocks across ALL review states: active-only filter, no state filter.
  assert(cli.includes('helper_outputs?deleted_at=is.null') && cli.includes('_dedupe_key=eq.'), 'dedupe query is active-only by _dedupe_key')
  assert(!cli.includes('review_state'), 'dedupe never filters by review_state (blocks across every state)')

  // Default test-owned; real only when explicitly flagged.
  assert(cli.includes('testOwned: !depositReal'), 'writer is test-owned unless --deposit-real')

  // No candidate / Memory / Graph reads; no route; no scheduler.
  for (const banned of ['graph_candidate_suggestions', 'graph-candidate-suggestions', 'candidate_type', 'memory_candidate', '/api/graph', 'NextRequest', 'export async function GET', 'export async function POST', 'setInterval(', 'node-cron', 'CronJob', 'cron.schedule', 'qstash']) {
    assert(!cli.includes(banned), `CLI does not reference ${banned}`)
  }
  // Reuses the sealed helper + writer (no helper-type widening, no new write path).
  assert(cli.includes('inspectLibraryDocumentation') && cli.includes('insertHelperOutputs'), 'reuses the sealed helper + writer unchanged')
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
if (failures.length > 0) { console.log('\n  Failures:'); for (const f of failures) console.log(`    ✗ ${f}`) }
console.log('══════════════════════════════════════════\n')
process.exit(failed > 0 ? 1 : 0)
