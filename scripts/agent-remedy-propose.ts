/**
 * Phase 43.C — Remedy-plan proposer (CLI, MANUAL ONLY; representation, never an apply)
 *
 *   Test-owned (default):
 *     npx tsx scripts/agent-remedy-propose.ts --action library_phase_label_backfill --confirm-remedy-propose --test-owned
 *   Real (per-run Tara authorisation; never unbounded):
 *     npx tsx scripts/agent-remedy-propose.ts --action library_phase_label_backfill --confirm-remedy-propose --max-plans 2
 *     npx tsx scripts/agent-remedy-propose.ts --action library_source_url_clear_non_url --confirm-remedy-propose --max-plans 1
 *
 * Reads REAL persisted findings (the durable store) for ONE named action's issue code,
 * reads the target library_items rows READ-ONLY, builds plans with the pure builders,
 * and records them through the governed `agent_remedy_plan_record` RPC — the DB boundary
 * re-verifies everything against live data. Plans are REPRESENTATION: nothing is approved,
 * nothing is applied, no House surface is written.
 *
 * Boundaries: explicit --action required (no whole-library default, no scan-without-action);
 * --confirm-remedy-propose required; --max-plans REQUIRED for real runs (candidates beyond
 * the cap are NOT recorded — the run refuses instead, so nothing is silently truncated);
 * no route, no scheduler, no LLM. Manual invocation only.
 */

import { createClient } from '@supabase/supabase-js'

import {
  REMEDY_ACTION_PHASE_LABEL_BACKFILL,
  REMEDY_ACTION_SOURCE_URL_CLEAR,
  buildPhaseLabelBackfillPlan,
  buildSourceUrlClearPlan,
} from '../src/lib/agents/packs/library/remedy'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
function hasFlag(name: string): boolean { return process.argv.includes(`--${name}`) }
function refuse(msg: string): never { console.error(`REFUSED: ${msg}`); process.exit(1) }

const ACTION_TO_ISSUE: Record<string, string> = {
  [REMEDY_ACTION_PHASE_LABEL_BACKFILL]: 'phase_doc_incomplete_phase_metadata',
  [REMEDY_ACTION_SOURCE_URL_CLEAR]: 'source_url_malformed',
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) refuse('requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')

  const action = arg('action')
  if (!action || !(action in ACTION_TO_ISSUE)) {
    refuse(`requires --action <${Object.keys(ACTION_TO_ISSUE).join(' | ')}> (one explicit action; no default)`)
  }
  if (!hasFlag('confirm-remedy-propose')) refuse('requires --confirm-remedy-propose')
  const testOwned = hasFlag('test-owned')
  const maxRaw = arg('max-plans')
  const maxPlans = maxRaw === undefined ? null : Number(maxRaw)
  if (maxPlans !== null && (!Number.isInteger(maxPlans) || maxPlans <= 0)) refuse('--max-plans requires a positive integer')
  if (!testOwned && maxPlans === null) refuse('a REAL run must declare --max-plans <n> — no real run may be unbounded')

  const sb = createClient(url, key)

  // 1. read the REAL findings for this action's issue code (durable store, read-only)
  const { data: findings, error: fErr } = await sb.rpc('agent_findings_list', {
    p_domain: 'library', p_review_state: null, p_detection_status: null, p_include_test: false,
  })
  if (fErr) refuse(`findings list failed: ${fErr.message}`)
  const eligible = (findings ?? []).filter((f: { issue_code: string }) => f.issue_code === ACTION_TO_ISSUE[action])
  console.log(`\n== remedy propose (${action}${testOwned ? ', TEST-OWNED' : ', REAL'}) ==`)
  console.log(`findings with issue_code=${ACTION_TO_ISSUE[action]}: ${eligible.length}`)

  // 2. build plans from the pure builders against READ-ONLY target rows
  const candidates: { findingId: string; targetId: string; plan: ReturnType<typeof buildPhaseLabelBackfillPlan> | ReturnType<typeof buildSourceUrlClearPlan> }[] = []
  for (const f of eligible) {
    const { data: rows, error } = await sb.from('library_items')
      .select('id, title, phase_label, source_url, collection, phase_code, phase_number')
      .eq('id', f.target_id).limit(1)
    if (error) refuse(`target read failed: ${error.message}`)
    const li = rows?.[0]
    if (!li) { console.log(`  skip ${f.target_id}: target row not found`); continue }
    const plan = action === REMEDY_ACTION_PHASE_LABEL_BACKFILL
      ? buildPhaseLabelBackfillPlan({
          findingId: f.id, targetId: li.id, collection: li.collection,
          phaseCode: li.phase_code, phaseNumber: li.phase_number,
          currentLabel: li.phase_label, title: li.title,
        })
      : buildSourceUrlClearPlan({ findingId: f.id, targetId: li.id, sourceUrl: li.source_url })
    if (plan === null) { console.log(`  skip ${f.target_id}: not eligible on live data (fail closed)`); continue }
    candidates.push({ findingId: f.id, targetId: li.id, plan })
  }
  console.log(`buildable candidates: ${candidates.length}`)

  // 3. cap check BEFORE recording anything — refuse rather than silently truncate
  if (maxPlans !== null && candidates.length > maxPlans) {
    refuse(`${candidates.length} candidates exceed --max-plans ${maxPlans} — nothing recorded; narrow or raise the declared cap`)
  }

  // 4. record through the governed RPC (the DB boundary re-verifies against live rows)
  let recorded = 0
  const failed: { targetId: string; error: string }[] = []
  for (const c of candidates) {
    const { error } = await sb.rpc('agent_remedy_plan_record', {
      p_finding_id: c.findingId,
      p_target_id: c.targetId,
      p_current_value: c.plan!.current_value === null ? null : c.plan!.current_value,
      p_proposed_value: c.plan!.proposed_value === null ? null : c.plan!.proposed_value,
      p_deterministic_reason: c.plan!.deterministic_reason,
      p_test_owned: testOwned,
    })
    if (error) failed.push({ targetId: c.targetId, error: error.message })
    else recorded++
  }
  console.log(`recorded ${recorded}  failed ${failed.length}  (test_owned=${testOwned})`)
  for (const f of failed) console.log(`  failed ${f.targetId}: ${f.error}`)
  console.log(testOwned
    ? '(cleanup: agent_remedy_plans_cleanup_test)'
    : '(REAL plans are representation only — approval and apply remain separate Tara acts)')
}

main().catch((err) => { console.error('remedy propose failed:', err instanceof Error ? err.message : err); process.exit(1) })
