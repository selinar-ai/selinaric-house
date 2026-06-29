/**
 * Phase 42.3.1 — Governance Kernel: generic report builder (a seam)
 *
 * Runs a set of inspectors over a domain input bundle and assembles an ephemeral
 * AgentReport: it collects findings, derives grouping/counts, and stamps the
 * invariant governance flags. PURE and DETERMINISTIC — `generatedAt` is supplied
 * by the caller (the kernel never reads the clock), so the same input always
 * yields the same report.
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * PURE. No I/O, no Supabase, no DB, no LLM, no clock, no randomness.
 *   * EPHEMERAL. Returns an object. Stores nothing. Reads no helper output.
 *   * GENERIC. No domain-specific logic — a second domain reuses this verbatim.
 */

import type {
  AgentDomain,
  AgentFinding,
  AgentReport,
  AgentReportExclusion,
  AgentReportScope,
  Inspector,
} from './types'
import { KERNEL_GOVERNANCE_FLAGS } from './types'

export type BuildReportArgs<TInput, TPayload> = {
  domain: AgentDomain
  scope: AgentReportScope
  /** Runtime display stamp, supplied by the caller (kernel stays clock-free). */
  generatedAt: string
  inspectors: Inspector<TInput, TPayload>[]
  input: TInput
  /** Optional do-not-touch / out-of-scope notes for the report (default none). */
  excluded?: AgentReportExclusion[]
}

export function buildReport<TInput, TPayload>(
  args: BuildReportArgs<TInput, TPayload>,
): AgentReport<TPayload> {
  const findings: AgentFinding<TPayload>[] = []
  for (const inspector of args.inspectors) {
    for (const finding of inspector.run(args.input)) {
      findings.push(finding)
    }
  }

  const byIssueCode: Record<string, number> = {}
  const bySeverity: Record<string, number> = {}
  const affected = new Set<string>()

  for (const f of findings) {
    byIssueCode[f.issue_code] = (byIssueCode[f.issue_code] ?? 0) + 1
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1
    affected.add(`${f.target_ref.table}:${f.target_ref.id}`)
  }

  return {
    domain: args.domain,
    run_type: 'health_report',
    scope: args.scope,
    generated_at: args.generatedAt,
    governance: KERNEL_GOVERNANCE_FLAGS,
    findings,
    groups: { by_issue_code: byIssueCode, by_severity: bySeverity },
    counts: {
      total: findings.length,
      by_severity: bySeverity,
      affected_items: affected.size,
    },
    excluded: args.excluded ?? [],
  }
}
