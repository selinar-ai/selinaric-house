/**
 * Phase 41.12 — Helper Review Mutation route + migration static scans
 *
 * Run: npx tsx src/lib/helpers/__tests__/helperReviewMutationRoute.test.ts
 *
 * No DB, no Supabase, no network. Statically validates the route is Tara-only,
 * single-row, auth-first, atomic-via-RPC, touches no protected surface, and the
 * migration is append-only metadata that mutates only the workflow fields.
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

function readSrc(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, rel), 'utf-8')
}
function readRepo(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../../', rel), 'utf-8')
}

const ROUTE = '../../../app/api/helpers/outputs/[id]/review/route.ts'
const MIGRATION = 'supabase-migrations/077_helper_review_events.sql'

const PROTECTED_TABLES = [
  'archive_items', 'archive_memory_events', 'held_truths', 'graph_nodes', 'memory_nodes',
  'memory_edges', 'graph_edges', 'graph_proposals', 'graph_candidate_suggestions',
  'library_items', 'library_chunks', 'library_item_files',
]

// ═════════════════════════════════════════════════════════════════════════════
// A. Route is POST-only, Tara-auth-first, single-row
// ═════════════════════════════════════════════════════════════════════════════

section('A. Route shape')
{
  const route = readSrc(ROUTE)
  assert(/export async function POST/.test(route), 'route exports POST')
  for (const verb of ['GET', 'PATCH', 'PUT', 'DELETE']) {
    assert(!new RegExp(`export\\s+async\\s+function\\s+${verb}`).test(route), `route does NOT export ${verb}`)
  }
  // Auth is the first action, before any DB work.
  const authIdx = route.indexOf('requireHouseApiAuth(request)')
  const supabaseIdx = route.indexOf('const supabase = getSupabase()')
  assert(authIdx > 0, 'route calls requireHouseApiAuth')
  assert(supabaseIdx > authIdx, 'auth check precedes any Supabase client use')
  assert(route.includes('if (!auth.ok)'), 'route returns on failed auth before DB work')
  // Single id from the path only.
  assert(route.includes('await params') && route.includes('{ id }'), 'id comes from the path param')
  assert(route.includes('parseReviewRequestBody'), 'route rejects array/batch/multi-id bodies via parser')
}

// ═════════════════════════════════════════════════════════════════════════════
// B. Route mutates only via the atomic RPC, never direct table writes
// ═════════════════════════════════════════════════════════════════════════════

section('B. Route mutation path')
{
  const route = readSrc(ROUTE)
  assert(route.includes("rpc('helper_review_apply'"), 'route applies via the atomic helper_review_apply RPC')
  assert(route.includes('planHelperReviewMutation'), 'route uses the pure planner')
  // No direct table mutation calls in the route.
  for (const mut of ['.update(', '.insert(', '.delete(', '.upsert(']) {
    assert(!route.includes(mut), `route does not call ${mut} directly`)
  }
  // Read is workflow-fields only.
  assert(route.includes("select('id, review_state, deleted_at')"), 'route reads only id/review_state/deleted_at')
  // No protected-surface table names anywhere in the route.
  for (const t of PROTECTED_TABLES) {
    assert(!route.includes(`'${t}'`) && !route.includes(`from('${t}')`), `route does not reference ${t}`)
  }
  // Concurrency + error mapping present.
  assert(route.includes('REVIEW_STATE_CHANGED') && route.includes('409'), 'route maps concurrency to 409')
  assert(route.includes('HELPER_OUTPUT_DELETED') && route.includes('422'), 'route maps soft-deleted to 422')
  assert(route.includes('404'), 'route maps not-found to 404')
}

// ═════════════════════════════════════════════════════════════════════════════
// C. Route returns a single safe DTO, no prompt/authority exposure
// ═════════════════════════════════════════════════════════════════════════════

section('C. Route response')
{
  const route = readSrc(ROUTE)
  assert(route.includes('toDto') && route.includes('DTO_COLUMNS'), 'route projects a safe single-row DTO')
  // No prompt/content leakage in the DTO column set.
  for (const leak of ['suggestion_payload', 'source_refs']) {
    assert(!new RegExp(`DTO_COLUMNS[\\s\\S]*'${leak}'`).test(route), `DTO does not expose ${leak}`)
  }
  assert(!route.includes('prompt assembly') && !route.includes('sendToPrompt'), 'no prompt assembly')
}

// ═════════════════════════════════════════════════════════════════════════════
// D. Migration is append-only metadata + workflow-only update
// ═════════════════════════════════════════════════════════════════════════════

section('D. Migration 077')
{
  const sql = readRepo(MIGRATION).toLowerCase()
  // Comment-stripped code for negative scans (so the header's "No CASCADE / no
  // RENAME" prose, and the events-table CHECKs, can't false-positive).
  const code = sql.replace(/--.*$/gm, '')

  assert(sql.includes('create table helper_review_events'), 'creates helper_review_events')
  assert(sql.includes("actor = 'tara'"), 'events actor locked to tara')
  assert(sql.includes('hre_actor_tara'), 'actor CHECK present')
  assert(sql.includes('hre_action_vocab'), 'action vocab CHECK present')
  assert(sql.includes('not_prompt_authority = true'), 'events not_prompt_authority locked true')
  assert(sql.includes('authority_changed = false'), 'events authority_changed locked false')
  // Atomic apply function present.
  assert(sql.includes('create or replace function helper_review_apply'), 'helper_review_apply RPC present')
  assert(sql.includes('for update'), 'RPC locks the row (FOR UPDATE)')
  assert(sql.includes('review_state_changed'), 'RPC enforces optimistic concurrency')
  assert(sql.includes('insert into helper_review_events'), 'RPC appends one event')

  // Scope the "update only the workflow fields" check to the UPDATE statement.
  const upMatch = code.match(/update helper_outputs([\s\S]*?)returning \* into cur/)
  const updateBlock = upMatch ? upMatch[1] : ''
  assert(updateBlock.length > 0, 'found the RPC update statement')
  assert(updateBlock.includes('review_state = p_new_state'), 'update sets review_state')
  assert(updateBlock.includes('reviewed_by') && updateBlock.includes("'tara'"), "update sets reviewed_by = 'tara'")
  assert(updateBlock.includes('reviewed_at') && updateBlock.includes('now()'), 'update sets reviewed_at = now()')
  // The update must touch NOTHING else — no burden/authority/payload column appears.
  for (const col of ['not_memory', 'not_evidence', 'prompt_eligible', 'authority_changed', 'human_review_required', 'risk_class', 'review_priority', 'review_mode', 'batch_eligible', 'sample_required', 'escalation', 'source_refs', 'suggestion_payload', 'deleted_at', 'helper_type', 'created_by', 'presence_scope']) {
    assert(!updateBlock.includes(col), `RPC update does not touch ${col}`)
  }

  // Additive only; no protected-table touch (comment-stripped code).
  for (const bad of ['drop table', 'drop column', 'cascade', 'rename', 'truncate']) {
    assert(!code.includes(bad), `migration code has no ${bad}`)
  }
  for (const t of PROTECTED_TABLES) {
    assert(!code.includes(`from ${t}`) && !code.includes(`into ${t}`) && !code.includes(`update ${t}`), `migration does not touch ${t}`)
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// E. Migration 077 hardening (mapping guard, append-only, execute perms)
// ═════════════════════════════════════════════════════════════════════════════

section('E. Migration 077 hardening')
{
  const sql = readRepo(MIGRATION).toLowerCase()

  // (2) DB-level action → state mapping guard.
  assert(sql.includes('invalid_action_state_mapping'), 'RPC raises INVALID_ACTION_STATE_MAPPING on a bad pair')
  assert(sql.includes("p_action = 'mark_reviewed_no_action' and p_new_state = 'viewed'"), 'pair: mark_reviewed_no_action → viewed')
  assert(sql.includes("p_action = 'dismiss_not_useful'      and p_new_state = 'dismissed'") || sql.includes("p_action = 'dismiss_not_useful' and p_new_state = 'dismissed'"), 'pair: dismiss_not_useful → dismissed')
  assert(sql.includes("p_action = 'needs_followup'          and p_new_state = 'needs_action'") || sql.includes("p_action = 'needs_followup' and p_new_state = 'needs_action'"), 'pair: needs_followup → needs_action')

  // (3) Append-only enforcement — trigger blocks UPDATE/DELETE for all roles.
  assert(sql.includes('create or replace function helper_review_events_append_only'), 'append-only trigger function present')
  assert(sql.includes('before update or delete on helper_review_events'), 'trigger fires before UPDATE/DELETE on events')
  assert(sql.includes('is append-only'), 'append-only violation raises')

  // (3b) Deny-by-default RLS — no policy (incl. no open INSERT policy).
  assert(sql.includes('enable row level security'), 'events table has RLS enabled')
  assert(!sql.includes('for all using (true) with check (true)'), 'no open for-all RLS policy')
  assert(!sql.includes('for insert with check (true)'), 'no open INSERT policy (no forged audit rows)')
  assert(!/create policy[\s\S]*on helper_review_events/.test(sql), 'no RLS policy grants RLS-subject roles any access')

  // (3c) Table privileges revoked from public/anon/authenticated; minimum to service_role.
  assert(sql.includes('revoke all on table helper_review_events from public'), 'table privileges revoked from public')
  assert(sql.includes('revoke all on table helper_review_events from anon'), 'table privileges revoked from anon')
  assert(sql.includes('revoke all on table helper_review_events from authenticated'), 'table privileges revoked from authenticated')
  assert(sql.includes('revoke all on table helper_review_events from service_role'), 'default privileges stripped from service_role (strict minimum)')
  assert(sql.includes('grant insert on table helper_review_events to service_role'), 'service_role granted insert only (write-once)')
  assert(!sql.includes('grant update on table helper_review_events') && !sql.includes('grant delete on table helper_review_events') && !sql.includes('grant select on table helper_review_events'), 'no update/delete/select table grant')

  // (1) RPC execute permissions — service_role only.
  assert(sql.includes('revoke all on function helper_review_apply(uuid, text, text, text) from public'), 'execute revoked from public')
  assert(sql.includes('from anon') && sql.includes('from authenticated'), 'execute revoked from anon + authenticated')
  assert(sql.includes('grant execute on function helper_review_apply(uuid, text, text, text) to service_role'), 'execute granted to service_role only')
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
if (failures.length > 0) {
  console.log('\n  Failures:')
  for (const f of failures) console.log(`    ✗ ${f}`)
}
console.log('══════════════════════════════════════════\n')
process.exit(failed > 0 ? 1 : 0)
