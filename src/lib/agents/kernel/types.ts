/**
 * Phase 42.3.1 — Governance Kernel: generic contracts (the "seams")
 *
 * Domain-agnostic types for the governed-labour kernel. A single Library tenant
 * is built on top of these in Phase 42.3.1, but NOTHING here is Library-specific:
 * a second domain pack (Ontology, Recall, …) plugs in by implementing `Inspector`
 * with its own payload type — no change to this file, no schema redesign.
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * PURE CONTRACTS. No I/O, no Supabase, no DB, no LLM, no fetch.
 *   * The envelope (AgentFinding) carries ONLY domain-agnostic fields. All
 *     domain-specific detail lives inside the typed `payload` — this is what
 *     keeps the seams generic (Acceptance Test A).
 *   * Ephemeral. The kernel describes a report produced at runtime and discarded.
 *     There is no durable table, no persistence, no authority here.
 */

/** Open domain identifier. A new pack picks any string; the kernel never gates on it. */
export type AgentDomain = string

export type IssueSeverity = 'info' | 'low' | 'medium' | 'high'
export type ReviewBurden = 'low' | 'medium' | 'high'

/** A reference to the row a finding is about. Table + id only — never row content. */
export type TargetRef = {
  table: string
  id: string
  label?: string
}

/**
 * The generic finding envelope (the seam). Domain-agnostic fields only; every
 * domain-specific detail goes in `payload`. A second domain reuses this verbatim.
 */
export type AgentFinding<TPayload = unknown> = {
  domain: AgentDomain
  capability_id: string
  issue_code: string
  target_ref: TargetRef
  /** Report-only ephemeral grouping label — NOT a durable helper-output field. */
  severity: IssueSeverity
  /** Report-only ephemeral grouping label — NOT a durable helper-output field. */
  review_burden: ReviewBurden
  summary: string
  payload: TPayload
}

/**
 * The generic inspector contract. A read-only detector for one domain: given a
 * domain input bundle, it returns findings. Pure and deterministic. `level` is
 * 'L1' (deterministic) in this slice — there is no LLM here.
 */
export type Inspector<TInput = unknown, TPayload = unknown> = {
  id: string
  domain: AgentDomain
  issue_codes: readonly string[]
  level: 'L1'
  tables_read: readonly string[]
  run(input: TInput): AgentFinding<TPayload>[]
}

/**
 * Invariant governance flags carried on every report. The report is a
 * non-authoritative review aid: not Memory, not evidence, never moves authority.
 */
export const KERNEL_GOVERNANCE_FLAGS = {
  not_memory: true,
  not_evidence: true,
  not_authority: true,
  authority_changed: false,
  prompt_eligible: false,
  review_required: true,
  read_only: true,
} as const

export type KernelGovernanceFlags = typeof KERNEL_GOVERNANCE_FLAGS

export type AgentReportScope = {
  type: string
  ref?: string
  resolved_count: number
  capped: boolean
  cap_reason?: string
}

export type AgentReportGroups = {
  by_issue_code: Record<string, number>
  by_severity: Record<string, number>
}

export type AgentReportCounts = {
  total: number
  by_severity: Record<string, number>
  affected_items: number
}

export type AgentReportExclusion = {
  target_ref: TargetRef
  reason: string
}

/** The ephemeral health report. Produced at runtime, returned, and discarded. */
export type AgentReport<TPayload = unknown> = {
  domain: AgentDomain
  run_type: 'health_report'
  scope: AgentReportScope
  /** Runtime display stamp only — never persisted. */
  generated_at: string
  governance: KernelGovernanceFlags
  findings: AgentFinding<TPayload>[]
  groups: AgentReportGroups
  counts: AgentReportCounts
  excluded: AgentReportExclusion[]
}
