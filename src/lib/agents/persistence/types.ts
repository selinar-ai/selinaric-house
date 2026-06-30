/**
 * Phase 42.3.3a — persistence contracts (durable operational record)
 *
 * Types for the persistence path that records the read-only packs' findings into
 * the durable `agent_runs` / `agent_findings` store via the governed ingest RPC.
 * Outside `kernel/**` — the kernel is not modified.
 *
 * A persisted finding is a durable operational record / review record — not
 * Memory, not evidence, not authority, not a proposal, not a helper output, not
 * queued work.
 */

export type PersistDomain = 'library' | 'archive_graph'

/** The run row sent to the ingest RPC (`agent_runs`). */
export type AgentRunInput = {
  domain: PersistDomain
  run_type: 'health_report'
  scope_type: string
  scope_ref: string | null
  scope_fingerprint: string
  capped: boolean
  cap_reason: string | null
  resolved_count: number
  finding_count: number
  requested_by: 'tara' | 'system'
  test_owned: boolean
}

/** One finding row sent to the ingest RPC (`agent_findings`). */
export type AgentFindingInput = {
  capability_id: string
  issue_code: string
  target_table: string
  target_id: string
  target_label: string | null
  severity: string
  review_burden: string
  summary: string
  payload: Record<string, unknown>
  dedupe_key: string
}

export type PersistResult = { run_id: string; finding_count: number; reconciled: number }
export type CleanupResult = { findings_cleaned: number; run_cleaned: number }

/** Scope descriptor inputs the fingerprint function understands. */
export type ScopeForFingerprint = {
  scope_type: string
  scope_ref?: string | null
  item_ids?: string[]
}
