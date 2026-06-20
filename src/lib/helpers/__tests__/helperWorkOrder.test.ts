/**
 * Phase 42.2.1 — Delegated Extraction Retry Work Order tests
 *
 * Run: npx tsx src/lib/helpers/__tests__/helperWorkOrder.test.ts
 *
 *  A. Delegatability — only file_extraction_not_run; tags/title/other never
 *  B. Target resolution — exactly one library_item_file
 *  C. Work-order build — locked flags, approved, tier 3, test_owned param
 *  D. Snapshots — extraction STATE only, never the text content
 *  E. Action whitelist — only extraction fields writable; authority fields rejected
 *  F. Transitions — approved→applied/failed, applied→rolled_back, nothing else
 *  G. Migration 079 (helper_work_orders) static scan
 *  H. Migration 080 (helper_apply_events) static scan — append-only + RPC + read
 *  I. Delegate route static scan — auth, whitelist, no broad/authority writes
 *  J. Rollback route static scan
 *  K. Workshop UI static scan — only the extraction row gets the control
 *
 * A delegated apply is labour, not authority: the executor touches only one
 * file's extraction state, on Tara's click, under append-only audit, reversibly.
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  isDelegatableExtractionOutput,
  extractionFileTarget,
  buildRetryExtractionWorkOrder,
  buildExtractionSnapshot,
  buildExtractionRestore,
  assertOnlyExtractionFields,
  isAllowedTransition,
  RETRY_EXTRACTION,
  ALLOWED_EXTRACTION_WRITE_FIELDS,
  FORBIDDEN_WRITE_FIELDS,
} from '../helperWorkOrder'
import type { HelperOutputRow } from '../helperReviewPresenter'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, label: string) { if (c) { passed++; console.log(`  ✓ ${label}`) } else { failed++; failures.push(label); console.log(`  ✗ ${label}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function readSrc(rel: string): string { return fs.readFileSync(path.resolve(__dirname, rel), 'utf-8') }
function stripSql(s: string): string { return s.replace(/--.*$/gm, '') }

function row(over: Partial<HelperOutputRow> & Record<string, unknown>): HelperOutputRow {
  return {
    id: 'out-1', helper_type: 'library_metadata_helper', suggested_action: 'check_extraction_status',
    suggestion_payload: { issue_code: 'file_extraction_not_run' },
    source_refs: [{ source_surface: 'library_item_file', source_id: 'file-1' }, { source_surface: 'library_item', source_id: 'item-1' }],
    deleted_at: null, ...over,
  } as unknown as HelperOutputRow
}

// ═════════════════════════════════════════════════════════════════════════════
section('A. Delegatability')
{
  assert(isDelegatableExtractionOutput(row({})) === true, 'file_extraction_not_run + check_extraction_status + one file → delegatable')
  assert(isDelegatableExtractionOutput(row({ suggestion_payload: { issue_code: 'item_tags_missing' }, suggested_action: 'add_tags', source_refs: [{ source_surface: 'library_item', source_id: 'item-1' }] })) === false, 'item_tags_missing (add_tags) is NOT delegatable in this slice')
  assert(isDelegatableExtractionOutput(row({ suggestion_payload: { issue_code: 'file_extracted_but_empty' } })) === false, 'a different extraction issue is NOT delegatable')
  assert(isDelegatableExtractionOutput(row({ helper_type: 'other_helper' })) === false, 'non-library_metadata_helper is not delegatable')
  assert(isDelegatableExtractionOutput(row({ deleted_at: '2026-01-01' })) === false, 'soft-deleted output is not delegatable')
  assert(isDelegatableExtractionOutput(row({ source_refs: [{ source_surface: 'library_item', source_id: 'item-1' }] })) === false, 'no file ref → not delegatable')
}

section('B. Target resolution')
{
  assert(extractionFileTarget(row({})) === 'file-1', 'resolves the one library_item_file id')
  assert(extractionFileTarget(row({ source_refs: [{ source_surface: 'library_item_file', source_id: 'a' }, { source_surface: 'library_item_file', source_id: 'b' }] })) === null, 'two files → null (refuse ambiguity)')
  assert(extractionFileTarget(row({ source_refs: [] })) === null, 'no refs → null')
}

section('C. Work-order build')
{
  const wo = buildRetryExtractionWorkOrder(row({}), '2026-06-20T00:00:00Z', false)
  assert(wo.action_type === RETRY_EXTRACTION && wo.target_surface === 'library_item_file' && wo.target_id === 'file-1', 'targets retry_extraction on the one file')
  assert(wo.status === 'approved' && wo.approved_by === 'tara' && wo.tier === 3, 'born approved by tara, tier 3 (lazy creation at the click)')
  assert(wo.not_memory === true && wo.not_evidence === true && wo.prompt_eligible === false && wo.authority_changed === false, 'locked authority flags safe')
  assert(wo.test_owned === false && buildRetryExtractionWorkOrder(row({}), 'x', true).test_owned === true, 'test_owned comes from the param')
  let threw = false
  try { buildRetryExtractionWorkOrder(row({ suggested_action: 'add_tags', suggestion_payload: { issue_code: 'item_tags_missing' } }), 'x') } catch { threw = true }
  assert(threw, 'refuses to build a work order for a non-delegatable output')
}

section('D. Snapshots (state only, no text content)')
{
  const snap = buildExtractionSnapshot({ extraction_status: 'not_started', extracted_text: 'secret body text', extraction_char_count: 16, extraction_error: null })
  assert(snap.extraction_status === 'not_started', 'captures status')
  assert(snap.extracted_text_present === true && snap.extracted_text_length === 16, 'captures presence + length')
  assert(!('extracted_text' in snap), 'NEVER carries the extracted_text content itself')
  assert(buildExtractionSnapshot({ extracted_text: '' }).extracted_text_present === false, 'empty text → not present')
  // Captures the exact prior scalar metadata for bit-exact rollback.
  const full = buildExtractionSnapshot({ extraction_status: 'extracted', extracted_text: 'x', extraction_char_count: 9, extraction_method: 'text_parse', extraction_truncated: true, extracted_at: '2026-06-20T08:00:00Z', extraction_error: 'e' })
  assert(full.extraction_method === 'text_parse' && full.extraction_truncated === true && full.extracted_at === '2026-06-20T08:00:00Z', 'captures method + truncated + extracted_at')
  const notRun = buildExtractionSnapshot({ extraction_status: 'not_started' })
  assert(notRun.extraction_method === null && notRun.extraction_truncated === null && notRun.extracted_at === null && notRun.extraction_char_count === null, 'absent metadata → null (not coerced)')
}

section('D2. Bit-exact rollback restore (no rollback marker)')
{
  // Not-run precondition: every prior field is null → restore is exactly null,
  // never a 0 / false / now() / "rollback_restore" marker.
  const before = buildExtractionSnapshot({ extraction_status: 'not_started' })
  const restore = buildExtractionRestore(before)
  assert(restore.extraction_status === 'not_started' && restore.extracted_text === null, 'restores status + null text')
  assert(restore.extraction_char_count === null, 'char_count restored to null (not 0)')
  assert(restore.extraction_method === null, "method restored to null (not 'rollback_restore')")
  assert(restore.extraction_truncated === null, 'truncated restored to null (not false)')
  assert(restore.extracted_at === null, 'extracted_at restored to null (not now())')
  // Returns ONLY whitelisted extraction fields.
  let whitelistOk = true; try { assertOnlyExtractionFields(restore) } catch { whitelistOk = false }
  assert(whitelistOk, 'restore payload is whitelist-clean')
  // Refuses to fabricate a restore when prior text was present (audit stored none).
  let refused = false
  try { buildExtractionRestore(buildExtractionSnapshot({ extraction_status: 'extracted', extracted_text: 'prior body' })) } catch { refused = true }
  assert(refused, 'refuses bit-exact restore when prior extracted text was present')
}

section('E. Action whitelist')
{
  assert(!('library_items' in {}) && ALLOWED_EXTRACTION_WRITE_FIELDS.includes('extraction_status'), 'extraction fields are allowed')
  let ok = true; try { assertOnlyExtractionFields({ extraction_status: 'x', extracted_text: null, extraction_char_count: 0 }) } catch { ok = false }
  assert(ok, 'a pure extraction payload passes the whitelist')
  for (const bad of FORBIDDEN_WRITE_FIELDS) {
    let threw = false
    try { assertOnlyExtractionFields({ extraction_status: 'x', [bad]: 'evil' }) } catch { threw = true }
    assert(threw, `whitelist rejects forbidden field '${bad}'`)
  }
}

section('F. Transitions')
{
  assert(isAllowedTransition('approved', 'applied') && isAllowedTransition('approved', 'failed'), 'approved → applied/failed')
  assert(isAllowedTransition('applied', 'rolled_back'), 'applied → rolled_back')
  assert(!isAllowedTransition('approved', 'rolled_back'), 'approved → rolled_back forbidden')
  assert(!isAllowedTransition('applied', 'applied') && !isAllowedTransition('rolled_back', 'applied') && !isAllowedTransition('failed', 'applied'), 'no other transitions')
}

section('G. Migration 079 — helper_work_orders')
{
  const sql = stripSql(readSrc('../../../../supabase-migrations/079_helper_work_orders.sql')).toLowerCase()
  assert(sql.includes('create table helper_work_orders'), 'creates helper_work_orders')
  assert(sql.includes("action_type in ('retry_extraction')"), 'action_type vocab = retry_extraction only')
  assert(sql.includes("target_surface in ('library_item_file')"), 'target_surface vocab = library_item_file only')
  assert(/status in \('proposed', 'approved', 'applied', 'failed', 'rejected', 'rolled_back'\)/.test(sql), 'status vocab')
  assert(sql.includes("approved_by = 'tara'"), 'approved_by locked to tara')
  assert(sql.includes('not_memory = true') && sql.includes('prompt_eligible = false') && sql.includes('authority_changed = false'), 'locked-invariant CHECKs')
  assert(sql.includes('deleted_at'), 'soft-delete column (no hard delete)')
  assert(sql.includes('enable row level security') && sql.includes('revoke all on table helper_work_orders from anon'), 'RLS + strict grants (no anon)')
  assert(sql.includes('grant select, insert on table helper_work_orders to service_role'), 'service_role gets SELECT + INSERT only')
  assert(!sql.includes('insert, update on table helper_work_orders'), 'no broad UPDATE grant — status moves only through the governed RPC')
}

section('H. Migration 080 — helper_apply_events (append-only)')
{
  const sql = stripSql(readSrc('../../../../supabase-migrations/080_helper_apply_events.sql')).toLowerCase()
  assert(sql.includes('create table helper_apply_events'), 'creates helper_apply_events')
  assert(sql.includes('before update or delete on helper_apply_events'), 'append-only trigger (no update/delete)')
  assert(sql.includes('enable row level security'), 'RLS enabled')
  assert(!sql.includes('create policy'), 'no policies (deny-by-default)')
  assert(sql.includes('grant insert on table helper_apply_events to service_role') && !sql.includes('grant select on table helper_apply_events'), 'service_role INSERT-only, no table SELECT')
  // record RPC — atomic transition + append; definer; service_role execute only.
  assert(sql.includes('function public.helper_apply_record('), 'record RPC present')
  assert(sql.includes('returns public.helper_apply_events'), 'record RPC return type is schema-qualified')
  assert(sql.includes('security definer') && /set\s+search_path\s*=\s*pg_catalog,\s*pg_temp/.test(sql), 'definer + tight search_path')
  assert(sql.includes('invalid_work_order_transition'), 'record RPC guards transitions')
  // Drift guards — the apply event can never diverge from its work order.
  assert(sql.includes('p_action_type is distinct from cur.action_type') && sql.includes('apply_event_action_mismatch'), 'RPC rejects action mismatch')
  assert(sql.includes('p_target_surface is distinct from cur.target_surface') && sql.includes('apply_event_target_mismatch'), 'RPC rejects target surface mismatch')
  assert(sql.includes('p_target_id is distinct from cur.target_id'), 'RPC rejects target id mismatch')
  assert(sql.includes('p_result is distinct from p_new_status') && sql.includes('apply_event_result_status_mismatch'), 'RPC rejects result/status mismatch')
  assert(/grant execute on function public\.helper_apply_record[\s\S]*?to service_role/.test(sql), 'record RPC execute to service_role only')
  // narrow definer read.
  assert(sql.includes('function public.helper_apply_events_for_work_orders(p_work_order_ids uuid[])'), 'narrow definer read present')
  assert(sql.includes('cardinality(p_work_order_ids) >= 1') && sql.includes('= any (p_work_order_ids)'), 'read is null/empty-safe + scoped')
  assert(/grant execute on function public\.helper_apply_events_for_work_orders\(uuid\[\]\) to service_role/.test(sql), 'read execute to service_role only')
}

section('I. Delegate route static scan')
{
  const r = readSrc('../../../../src/app/api/helpers/outputs/[id]/delegate/retry-extraction/route.ts')
  // Auth call runs before any Supabase work (compare CALL sites, not imports).
  assert(r.indexOf('requireHouseApiAuth(request)') < r.indexOf('const supabase = getSupabase()'), 'auth call is first (before any DB work)')
  assert(r.includes('isDelegatableExtractionOutput(row)'), 'validates the output is delegatable')
  assert(r.includes("from('helper_work_orders')") && r.includes('.insert('), 'creates the work order')
  assert(!/from\('helper_work_orders'\)[\s\S]{0,80}\.update\(/.test(r), 'route never directly UPDATEs the work order (status only via the RPC)')
  assert(r.includes("rpc('helper_apply_record'"), 'records + transitions status via the atomic RPC')
  assert(r.includes('assertOnlyExtractionFields(update)'), 'executor write is whitelist-guarded')
  // Before-snapshot SELECT captures the metadata fields needed for bit-exact rollback.
  assert(r.includes('extraction_method') && r.includes('extraction_truncated') && r.includes('extracted_at'), 'before-snapshot reads method + truncated + extracted_at')
  assert(!r.includes("from('library_items')"), 'never touches library_items')
  for (const f of ['authority_status', 'derived_canonical_status', 'archive_item_id', "update({ tags", "update({ title"]) {
    assert(!r.includes(f), `never writes ${f}`)
  }
  // Scheduler check targets real APIs ("cron" appears only in the no-cron comment).
  for (const banned of ['graph_candidate_suggestions', 'memory_candidate', 'setInterval(', 'node-cron', 'CronJob', 'cron.schedule', 'qstash']) {
    assert(!r.includes(banned), `no ${banned}`)
  }
}

section('J. Rollback route static scan')
{
  const r = readSrc('../../../../src/app/api/helpers/work-orders/[id]/rollback/route.ts')
  assert(r.includes('requireHouseApiAuth(request)'), 'auth-gated')
  assert(r.includes("status !== 'applied'") || r.includes("wo.status !== 'applied'"), 'only an applied work order may roll back')
  assert(r.includes("rpc('helper_apply_events_for_work_orders'"), 'reads the before-snapshot via the narrow definer read')
  assert(r.includes('buildExtractionRestore(before)'), 'restore is built bit-exact from the before-snapshot')
  assert(r.includes('assertOnlyExtractionFields(restore)'), 'restore is whitelist-guarded')
  // Bit-exact: the restored Library row carries NO rollback marker / coercion.
  assert(!r.includes("'rollback_restore'"), "no rollback_restore marker written to the file")
  assert(!r.includes('?? 0'), 'no char_count coercion to 0')
  assert(!/extraction_truncated:\s*false/.test(r), 'no truncated coercion to false')
  assert(r.includes("p_new_status: 'rolled_back'") && r.includes("p_result: 'rolled_back'"), 'records a rolled_back audit event')
  assert(!/from\('helper_work_orders'\)[\s\S]{0,80}\.update\(/.test(r), 'route never directly UPDATEs the work order (status only via the RPC)')
  assert(!r.includes("from('library_items')"), 'never touches library_items')
}

section('K. Workshop UI static scan')
{
  const page = readSrc('../../../app/(house)/helpers/page.tsx')
  assert(page.includes('const canDelegate = !deleted && isDelegatableExtractionOutput(row)'), 'delegate control gated to the delegatable extraction issue only')
  assert(page.includes('WORKSHOP_DELEGATE_RETRY_LABEL') && page.includes('WORKSHOP_DELEGATE_CAPTION'), 'shows the approve control + boundary caption')
  assert(page.includes('WORKSHOP_APPLY_TRACE_TITLE'), 'separate Apply trace section (not merged into the review trace)')
  assert(page.includes('/api/helpers/outputs/${row.id}/delegate/retry-extraction'), 'posts to the output-scoped delegate route')
  assert(page.includes('/api/helpers/work-orders/${workOrderId}/rollback'), 'rollback posts to the work-order route')
  // The review trace stays separate (41.14) — apply trace is its own block.
  assert(page.includes('HELPER_REVIEW_TRACE_CAPTION') && page.includes('reviewTraceLine'), 'review trace untouched')
  // Exactly the expected two new POSTs + the existing review POST.
  assert((page.match(/method: 'POST'/g) ?? []).length === 3, 'three POSTs total: review + delegate + rollback')
}

console.log('\n══════════════════════════════════════════')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
if (failures.length) { console.log('\n  Failures:'); for (const f of failures) console.log(`    ✗ ${f}`) }
console.log('══════════════════════════════════════════\n')
process.exit(failed > 0 ? 1 : 0)
