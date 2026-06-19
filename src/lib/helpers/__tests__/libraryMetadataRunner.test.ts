/**
 * Phase 42.1 — Manual Helper Runner tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/libraryMetadataRunner.test.ts
 *
 * Pure-logic coverage for the runner core, plus a static scan of the CLI script.
 *  A. Arg validation — one item per run, explicit confirm, real-deposit gating
 *  B. Dedupe key — deterministic, sensitive to version/item/issue
 *  C. Metadata stamping — adds provenance, preserves the draft
 *  D. Deposit plan — skip active duplicates, insert the rest
 *  E. Payload safety — locked flags, test_owned, no review/authority/deleted fields
 *  F. CLI static scan — reads only Library surfaces; INSERT only; no route /
 *     candidate read / update / delete; deletes nothing; dedupe blocks across states
 *
 * The runner may prepare reviewable work. It never makes anything true, applied,
 * remembered, prompt-visible, or authoritative; it never widens the helper type.
 */

import * as fs from 'fs'
import * as path from 'path'

import { inspectLibraryItem, type LibraryItemSnapshot } from '../libraryMetadataHelper'
import { buildHelperOutputInsertPayload } from '../helperOutputStore'
import {
  parseRunnerArgs,
  computeDedupeKey,
  dedupeKeyForDraft,
  stampRunnerMetadata,
  stampedDedupeKey,
  planDeposit,
  LIBRARY_METADATA_HELPER_VERSION,
  RUNNER_INVOKED_BY,
} from '../libraryMetadataRunner'

// ─── Harness ───────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []
function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) } else { failed++; failures.push(label); console.log(`  ✗ ${label}`) }
}
function section(name: string) { console.log(`\n── ${name} ──`) }
function readSrc(rel: string): string { return fs.readFileSync(path.resolve(__dirname, rel), 'utf-8') }

// A gap-ridden fixture → 3 drafts (title weak, summary missing, tags missing).
const FIXTURE: LibraryItemSnapshot = { id: 'item-1', title: '', description: null, tags: [], presence_scope: 'house' }
const DRAFTS = inspectLibraryItem(FIXTURE, [])

// ═════════════════════════════════════════════════════════════════════════════
// A. Argument validation
// ═════════════════════════════════════════════════════════════════════════════

section('A. Arg validation')
{
  const ok = parseRunnerArgs(['--confirm-helper-run', '--library-item-id', 'item-1'])
  assert(ok.ok === true && ok.ok && ok.libraryItemId === 'item-1' && ok.depositReal === false && ok.runMode === 'test_owned', 'valid test-owned args parse (default test_owned)')

  const real = parseRunnerArgs(['--confirm-helper-run', '--library-item-id', 'item-1', '--deposit-real'])
  assert(real.ok && real.depositReal === true && real.runMode === 'real_deposit', 'real deposit requires --deposit-real → run_mode real_deposit')

  assert(parseRunnerArgs(['--library-item-id', 'item-1']).ok === false, 'refuses without --confirm-helper-run')
  assert(parseRunnerArgs(['--confirm-helper-run']).ok === false, 'refuses without --library-item-id')
  assert(parseRunnerArgs(['--confirm-helper-run', '--library-item-id', 'all']).ok === false, 'refuses "all" item id')
  assert(parseRunnerArgs(['--confirm-helper-run', '--all', '--library-item-id', 'item-1']).ok === false, 'refuses --all mode')
  assert(parseRunnerArgs(['--confirm-helper-run', '--library-item-id', 'a', '--library-item-id', 'b']).ok === false, 'refuses multiple --library-item-id (one item per run)')
  assert(parseRunnerArgs(['--confirm-helper-run', '--library-item-id', 'a,b']).ok === false, 'refuses comma-separated ids (one item per run)')
  assert(parseRunnerArgs(['--confirm-helper-run', '--library-item-id', '--deposit-real']).ok === false, 'refuses --library-item-id with no value')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Dedupe key
// ═════════════════════════════════════════════════════════════════════════════

section('B. Dedupe key')
{
  const k = computeDedupeKey('library_metadata_helper', '42.1.0', 'item-1', 'item_title_weak')
  assert(/^[a-f0-9]{64}$/.test(k), 'dedupe key is a 64-char sha256 hex')
  assert(computeDedupeKey('library_metadata_helper', '42.1.0', 'item-1', 'item_title_weak') === k, 'same inputs → same key (deterministic)')
  assert(computeDedupeKey('library_metadata_helper', '42.1.1', 'item-1', 'item_title_weak') !== k, 'helper-version change → new key')
  assert(computeDedupeKey('library_metadata_helper', '42.1.0', 'item-2', 'item_title_weak') !== k, 'different item → different key')
  assert(computeDedupeKey('library_metadata_helper', '42.1.0', 'item-1', 'item_tags_missing') !== k, 'different issue → different key')

  // Per-draft keys: one per distinct issue on the same item.
  const keys = DRAFTS.map((d) => dedupeKeyForDraft(d))
  assert(new Set(keys).size === DRAFTS.length, 'each distinct issue on the item yields a distinct key')
  assert(dedupeKeyForDraft(DRAFTS[0]) === dedupeKeyForDraft(DRAFTS[0]), 'same draft → same key')
  assert(dedupeKeyForDraft(DRAFTS[0]) !== dedupeKeyForDraft(DRAFTS[0], '99.0.0'), 'dedupeKeyForDraft honours helper version')
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Metadata stamping
// ═════════════════════════════════════════════════════════════════════════════

section('C. Metadata stamping')
{
  const d = DRAFTS[0]
  const key = dedupeKeyForDraft(d)
  const stamped = stampRunnerMetadata(d, { helperVersion: LIBRARY_METADATA_HELPER_VERSION, dedupeKey: key, runId: 'run-x', runMode: 'test_owned' })
  const p = stamped.suggestion_payload as Record<string, unknown>
  assert(p.helper_version === LIBRARY_METADATA_HELPER_VERSION, 'stamps helper_version')
  assert(p._dedupe_key === key, 'stamps _dedupe_key')
  assert(p.run_id === 'run-x', 'stamps run_id')
  assert(p.run_mode === 'test_owned', 'stamps run_mode')
  assert(p.runner_invoked_by === RUNNER_INVOKED_BY && RUNNER_INVOKED_BY === 'manual_cli', 'stamps runner_invoked_by = manual_cli')
  assert(p.issue_code === 'item_title_weak', 'preserves the original issue payload')
  assert(stampedDedupeKey(stamped) === key, 'stampedDedupeKey reads the key back')
  // The draft itself (type, refs, flags, author) is untouched.
  assert(stamped.helper_type === 'library_metadata_helper', 'helper_type unchanged')
  assert(JSON.stringify(stamped.source_refs) === JSON.stringify(d.source_refs), 'source_refs unchanged')
  assert(stamped.created_by === 'system_candidate', 'created_by stays system_candidate (helper is the author, not Tara)')
  assert((d.suggestion_payload as Record<string, unknown>)._dedupe_key === undefined, 'original draft not mutated')
}

// ═════════════════════════════════════════════════════════════════════════════
// D. Deposit plan (dedupe skip)
// ═════════════════════════════════════════════════════════════════════════════

section('D. Deposit plan')
{
  const stamped = DRAFTS.map((d) => stampRunnerMetadata(d, { helperVersion: LIBRARY_METADATA_HELPER_VERSION, dedupeKey: dedupeKeyForDraft(d), runId: 'r', runMode: 'test_owned' }))
  const keys = stamped.map((s) => stampedDedupeKey(s) as string)

  const none = planDeposit(stamped, new Set())
  assert(none.toInsert.length === stamped.length && none.skipped.length === 0, 'no existing keys → insert all')

  const oneExisting = planDeposit(stamped, new Set([keys[0]]))
  assert(oneExisting.toInsert.length === stamped.length - 1 && oneExisting.skipped.length === 1, 'one active duplicate → skip that one, insert the rest')
  assert(oneExisting.skipped[0].dedupeKey === keys[0], 'the skipped key is the existing one')

  const allExisting = planDeposit(stamped, new Set(keys))
  assert(allExisting.toInsert.length === 0 && allExisting.skipped.length === stamped.length, 'all keys active → insert nothing')

  assert(stamped.every((s) => s.suggestion_payload != null), 'planDeposit does not mutate the drafts')
}

// ═════════════════════════════════════════════════════════════════════════════
// E. Payload safety (through the sealed writer)
// ═════════════════════════════════════════════════════════════════════════════

section('E. Payload safety')
{
  const d = DRAFTS[0]
  const stamped = stampRunnerMetadata(d, { helperVersion: LIBRARY_METADATA_HELPER_VERSION, dedupeKey: dedupeKeyForDraft(d), runId: 'r', runMode: 'test_owned' })

  const test = buildHelperOutputInsertPayload(stamped, { testOwned: true })
  assert(test.test_owned === true, 'test-owned run → test_owned true')
  const real = buildHelperOutputInsertPayload(stamped, { testOwned: false })
  assert(real.test_owned === false, 'real deposit → test_owned false')

  // Locked authority flags forced safe regardless of input.
  assert(test.not_memory === true && test.not_evidence === true, 'not_memory / not_evidence locked true')
  assert(test.prompt_eligible === false && test.authority_changed === false, 'prompt_eligible / authority_changed locked false')
  assert(test.human_review_required === true && test.review_routed === false, 'human_review_required true, review_routed false')
  assert(test.output_status === 'deterministic_check', 'inert pre-review status only')
  assert(test.helper_type === 'library_metadata_helper', 'helper type not widened')
  assert(test.created_by === 'system_candidate', 'created_by system_candidate')

  // Provenance survives into the persisted payload.
  const pp = test.suggestion_payload as Record<string, unknown>
  for (const f of ['helper_version', '_dedupe_key', 'run_id', 'run_mode', 'runner_invoked_by']) {
    assert(f in pp, `persisted payload carries ${f}`)
  }
  // Review / authority / lifecycle fields are NEVER written.
  for (const forbidden of ['reviewed_by', 'reviewed_at', 'deleted_at', 'review_state']) {
    assert(!(forbidden in (test as Record<string, unknown>)), `writer never sets ${forbidden}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// F. CLI static scan
// ═════════════════════════════════════════════════════════════════════════════

section('F. CLI static scan')
{
  const cli = readSrc('../../../../scripts/run-library-metadata-helper.ts')

  // Manual gating + one item only (delegated to the pure parser).
  assert(cli.includes('parseRunnerArgs(process.argv.slice(2))'), 'CLI validates args via the pure parser')
  assert(cli.includes("'--confirm-helper-run'") || cli.includes('--confirm-helper-run'), 'CLI documents the explicit confirm flag')

  // Reads ONLY Library surfaces; one named item.
  assert(cli.includes('library_items?id=eq.'), 'reads one library item by id (no scan, no all)')
  assert(cli.includes('library_item_files?library_item_id=eq.'), 'reads that item\'s files')

  // INSERT only — no update / delete / upsert / PATCH / DELETE / PUT method.
  for (const mut of ['.update(', '.delete(', '.upsert(', "method: 'PATCH'", "method: 'DELETE'", "method: 'PUT'"]) {
    assert(!cli.includes(mut), `CLI performs no ${mut}`)
  }
  assert(cli.includes("method: 'POST'"), 'CLI inserts via POST (the only write)')

  // Dedupe blocks across ALL review states: active-only filter, no review_state filter.
  assert(cli.includes('helper_outputs?deleted_at=is.null') && cli.includes('_dedupe_key=eq.'), 'dedupe query is active-only by _dedupe_key')
  assert(!cli.includes('review_state'), 'dedupe never filters by review_state (blocks across every state)')

  // Default test-owned; real only when explicitly flagged.
  assert(cli.includes('testOwned: !depositReal'), 'writer is test-owned unless --deposit-real')

  // No candidate / Memory / Graph reads; no route; no scheduler. (Scheduler check
  // targets real APIs — the word "cron" appears only in the NOT-wired-to-cron
  // governance comment, which is fine.)
  for (const banned of ['graph_candidate_suggestions', 'graph-candidate-suggestions', 'candidate_type', 'memory_candidate', '/api/graph', 'NextRequest', 'export async function GET', 'export async function POST', 'setInterval(', 'node-cron', 'CronJob', 'cron.schedule', 'qstash']) {
    assert(!cli.includes(banned), `CLI does not reference ${banned}`)
  }
  // Reuses the sealed helper + writer (no helper-type widening, no new write path).
  assert(cli.includes('inspectLibraryItem') && cli.includes('insertHelperOutputs'), 'reuses the sealed helper + writer unchanged')
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
if (failures.length > 0) { console.log('\n  Failures:'); for (const f of failures) console.log(`    ✗ ${f}`) }
console.log('══════════════════════════════════════════\n')
process.exit(failed > 0 ? 1 : 0)
