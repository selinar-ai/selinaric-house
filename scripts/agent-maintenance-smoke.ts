/**
 * Phase 42.3.3b — Maintenance Room governed smoke (test-owned read/review verification)
 *
 * Run AFTER Tara applies migration 084, AFTER persisting a test-owned batch via the
 * 42.3.3a runner (which prints a run_id). This is the ONLY path that reads test-owned
 * rows (`p_include_test=true`), scoped to smoke — never reachable from the UI or routes.
 *
 *   1) npx tsx scripts/agent-archive-graph-persist-findings.ts --scope whole_graph   (prints run_id)
 *   2) npx tsx scripts/agent-maintenance-smoke.ts --run <run_id>                      (full governed smoke)
 *      npx tsx scripts/agent-maintenance-smoke.ts --cleanup <run_id>                  (cleanup only)
 *
 * Read + review-state only, via the governed RPCs. No House-surface write, no direct
 * table access, no real-finding persistence (the runner hardcodes test_owned=true).
 */

import { createClient } from '@supabase/supabase-js'

import { FINDINGS_RPC, SET_REVIEW_STATE_RPC, REVIEWED_BY, isValidReviewState } from '../src/lib/agents/maintenance/contract'
import { cleanupTestRun, type RpcClient } from '../src/lib/agents/persistence/ingest'

type Row = Record<string, unknown> & { id: string; last_seen_run_id: string; review_state: string }
type Sb = { rpc(fn: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> }

const REVIEW_FIELDS = new Set(['review_state', 'reviewed_by', 'reviewed_at', 'updated_at'])

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function listFindings(sb: Sb, includeTest: boolean): Promise<Row[]> {
  const { data, error } = await sb.rpc(FINDINGS_RPC, {
    p_domain: null, p_review_state: null, p_detection_status: null, p_include_test: includeTest,
  })
  if (error) throw new Error(`${FINDINGS_RPC}: ${error.message}`)
  return (data ?? []) as Row[]
}

async function setState(sb: Sb, id: string, state: string): Promise<Row> {
  if (!isValidReviewState(state)) throw new Error(`invalid state ${state}`)
  const { data, error } = await sb.rpc(SET_REVIEW_STATE_RPC, {
    p_finding_id: id, p_review_state: state, p_reviewed_by: REVIEWED_BY,
  })
  if (error) throw new Error(`${SET_REVIEW_STATE_RPC}: ${error.message}`)
  return (Array.isArray(data) ? data[0] : data) as Row
}

function changedKeys(before: Row, after: Row): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const out: string[] = []
  for (const k of keys) if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out.push(k)
  return out
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (RPC execute is service-role only).')
    process.exit(1)
    return
  }
  const sb = createClient(url, key) as unknown as Sb

  const cleanupOnly = arg('cleanup')
  if (cleanupOnly) {
    const res = await cleanupTestRun(sb as unknown as RpcClient, cleanupOnly)
    console.log(`cleanup: ${JSON.stringify(res)}`)
    return
  }

  const runId = arg('run')
  if (!runId) {
    console.error('Usage: --run <run_id>  (full governed smoke)   |   --cleanup <run_id>')
    process.exit(1)
    return
  }

  console.log('\n== Phase 42.3.3b governed smoke ==')

  // (3) findings visible through the smoke/test path
  const testAll = await listFindings(sb, true)
  const mine = testAll.filter((r) => r.last_seen_run_id === runId)
  console.log(`[3] test-owned findings (include_test=true): total ${testAll.length}, this run ${mine.length}`)

  // (4) normal production view excludes test-owned
  const realBefore = await listFindings(sb, false)
  console.log(`[4] production view (include_test=false) real findings: ${realBefore.length}  ${realBefore.length === 0 ? '(empty)' : '(NON-EMPTY!)'}`)

  if (mine.length < 3) throw new Error(`need >=3 findings in run ${runId} to exercise Acknowledge/Dismiss/Reopen; got ${mine.length}`)
  const [A, B, C] = mine
  const before = new Map(mine.map((r) => [r.id, r]))

  // (5) Acknowledge / Dismiss / Reopen
  const ack = await setState(sb, A.id, 'acknowledged')
  const dis = await setState(sb, B.id, 'dismissed')
  await setState(sb, C.id, 'acknowledged')            // C must be non-open before reopen
  const reopen = await setState(sb, C.id, 'open')
  console.log(`[5] Acknowledge ${A.id} -> ${ack.review_state} (by ${String(ack.reviewed_by)})`)
  console.log(`[5] Dismiss     ${B.id} -> ${dis.review_state} (by ${String(dis.reviewed_by)})`)
  console.log(`[5] Reopen      ${C.id} -> ${reopen.review_state} (by ${String(reopen.reviewed_by)})`)

  // (6) prove ONLY review fields changed
  const after = new Map((await listFindings(sb, true)).map((r) => [r.id, r]))
  let ok = true
  for (const t of [A, B, C]) {
    const ch = changedKeys(before.get(t.id) as Row, after.get(t.id) as Row)
    const onlyReview = ch.every((k) => REVIEW_FIELDS.has(k))
    console.log(`[6] ${t.id}: changed=[${ch.join(', ')}]  onlyReviewFields=${onlyReview ? 'yes' : 'NO'}`)
    if (!onlyReview) ok = false
  }
  if (!ok) throw new Error('A non-review field changed -- write-proof FAILED')

  // (8) cleanup test-owned rows
  const cleanup = await cleanupTestRun(sb as unknown as RpcClient, runId)
  console.log(`[8] cleanup: ${JSON.stringify(cleanup)}`)

  // (9) post-cleanup: active test-owned gone; real still empty
  const testAfter = await listFindings(sb, true)
  const realAfter = await listFindings(sb, false)
  console.log(`[9] active test-owned after cleanup: ${testAfter.length}  | real findings: ${realAfter.length}`)
  console.log('== smoke complete ==\n')
}

main().catch((err) => {
  console.error('maintenance smoke failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
