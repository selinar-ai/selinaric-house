/**
 * Phase 42.3.3a — persistence ingestion. Maps an ephemeral AgentReport into the
 * ingest-RPC payload and calls the governed RPC. The RPC is the ONLY write path;
 * this module never performs direct table DML.
 *
 * Outside `kernel/**`. Reads nothing from the House; writes nothing directly —
 * it only hands the report to `agent_record_findings` (and `agent_findings_cleanup_test_run`).
 */

import type { AgentReport } from '../kernel/types'
import { computeDedupeKey } from './dedupe'
import { computeScopeFingerprint } from './fingerprint'
import { reconcileAllowed } from './reconcile'
import type {
  AgentFindingInput,
  AgentRunInput,
  CleanupResult,
  PersistDomain,
  PersistResult,
  ScopeForFingerprint,
} from './types'

export const INGEST_RPC = 'agent_record_findings'
export const CLEANUP_RPC = 'agent_findings_cleanup_test_run'

/** Minimal RPC-only client surface — no `.from(...)`, so no direct table DML is possible here. */
export interface RpcClient {
  rpc(fn: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

/** Build the ingest payload from a report. Pure. Computes dedupe keys + scope fingerprint. */
export function buildPersistInputs(
  report: AgentReport<Record<string, unknown>>,
  opts: { requestedBy: 'tara' | 'system'; testOwned: boolean; scope: ScopeForFingerprint },
): { run: AgentRunInput; findings: AgentFindingInput[] } {
  const domain = report.domain as PersistDomain
  const findings: AgentFindingInput[] = report.findings.map((f) => ({
    capability_id: f.capability_id,
    issue_code: f.issue_code,
    target_table: f.target_ref.table,
    target_id: f.target_ref.id,
    target_label: f.target_ref.label ?? null,
    severity: f.severity,
    review_burden: f.review_burden,
    summary: f.summary,
    payload: f.payload,
    dedupe_key: computeDedupeKey(
      domain,
      f.capability_id,
      f.issue_code,
      f.target_ref.table,
      f.target_ref.id,
    ),
  }))

  const run: AgentRunInput = {
    domain,
    run_type: 'health_report',
    scope_type: report.scope.type,
    scope_ref: report.scope.ref ?? null,
    scope_fingerprint: computeScopeFingerprint(opts.scope),
    capped: report.scope.capped,
    cap_reason: report.scope.cap_reason ?? null,
    resolved_count: report.scope.resolved_count,
    finding_count: report.findings.length,
    requested_by: opts.requestedBy,
    test_owned: opts.testOwned,
  }

  return { run, findings }
}

/** Persist a report through the ingest RPC. The RPC inserts the run, upserts findings, and reconciles. */
export async function persistReport(
  client: RpcClient,
  inputs: { run: AgentRunInput; findings: AgentFindingInput[] },
): Promise<PersistResult> {
  const reconcile = reconcileAllowed({
    scope_type: inputs.run.scope_type,
    scope_fingerprint: inputs.run.scope_fingerprint,
    capped: inputs.run.capped,
  })
  const { data, error } = await client.rpc(INGEST_RPC, {
    p_run: inputs.run,
    p_findings: inputs.findings,
    p_reconcile: reconcile,
  })
  if (error) throw new Error(`${INGEST_RPC} failed: ${error.message}`)
  return data as PersistResult
}

/** Soft-clean a test-owned run and its test-owned findings via the governed cleanup RPC. */
export async function cleanupTestRun(client: RpcClient, runId: string): Promise<CleanupResult> {
  const { data, error } = await client.rpc(CLEANUP_RPC, { p_run_id: runId })
  if (error) throw new Error(`${CLEANUP_RPC} failed: ${error.message}`)
  return data as CleanupResult
}
