/**
 * Phase 41.5 — Helper Output Store / Writer
 *
 * The smallest safe write path from a deterministic helper draft into the
 * helper_outputs ledger. Two layers:
 *
 *   buildHelperOutputInsertPayload()  — PURE. Validates a draft against the 41.1
 *     contract, forces the invariant flags safe, restricts status to inert
 *     pre-review values, forces test_owned, strips review fields, and (for
 *     controlled runs) stamps a verification marker. No DB, no I/O.
 *
 *   insertHelperOutputs()             — thin insert using an INJECTED db client
 *     (dependency injection). This module imports no Supabase, no LLM, no
 *     prompt assembly, no Library retrieval, no embeddings, and no
 *     Memory/Archive/Graph/Reasoning modules. The caller supplies the client.
 *
 * ── What this writer must never do ───────────────────────────────────────────
 *   * run helpers itself / bulk-scan Library
 *   * update / delete helper outputs
 *   * set review_routed / reviewed_by / reviewed_at / any review-decision status
 *   * touch Library, Archive, Memory, Graph, Reasoning, Recall, prompts, or
 *     embeddings
 *   * create non-test_owned rows in Phase 41.5 (test_owned defaults true)
 *
 * Helper output is trace, not truth. A helper run is not approval. A seeded row
 * is not production meaning.
 */

import { validateHelperOutputDraft, type HelperOutputDraft } from './helperContract'

// ─────────────────────────────────────────────────────────────────────────────
// Inert statuses the writer may persist (pre-review only)
// ─────────────────────────────────────────────────────────────────────────────

/** Only inert, pre-review statuses may be written. No review/decision statuses. */
export const WRITABLE_HELPER_OUTPUT_STATUSES = ['draft_only', 'deterministic_check'] as const
export type WritableHelperOutputStatus = (typeof WRITABLE_HELPER_OUTPUT_STATUSES)[number]

function isWritableStatus(status: string): status is WritableHelperOutputStatus {
  return (WRITABLE_HELPER_OUTPUT_STATUSES as readonly string[]).includes(status)
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification run marker — stamped into suggestion_payload for cleanup/audit
// ─────────────────────────────────────────────────────────────────────────────

export type VerificationRunMarker = {
  verification_run: string
  run_id: string
  expected: string
}

export type BuildInsertOptions = {
  /** Default true. Controlled 41.5 runs are always test-owned. */
  testOwned?: boolean
  /** Optional verification marker merged into suggestion_payload as `_verification`. */
  runMarker?: VerificationRunMarker
}

// ─────────────────────────────────────────────────────────────────────────────
// Insert payload — exactly the columns the writer is allowed to set
// (NOTE: reviewed_by / reviewed_at / deleted_at are deliberately absent)
// ─────────────────────────────────────────────────────────────────────────────

export type HelperOutputInsertPayload = {
  helper_type: string
  output_status: WritableHelperOutputStatus
  suggested_action: string
  confidence_label: string
  presence_scope: string
  created_by: string
  source_refs: { source_surface: string; source_id: string }[]
  suggestion_payload: unknown
  not_memory: true
  not_evidence: true
  prompt_eligible: false
  authority_changed: false
  human_review_required: true
  review_routed: false
  test_owned: boolean
}

function mergeMarker(payload: unknown, marker: VerificationRunMarker): unknown {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return { ...(payload as Record<string, unknown>), _verification: marker }
  }
  return { value: payload, _verification: marker }
}

/**
 * Pure. Validate a draft and produce a safe helper_outputs insert payload.
 * Throws if the draft is not contract-valid or its status is not writable.
 * The four authority flags + human_review_required + review_routed are forced to
 * their safe values regardless of the draft, and test_owned defaults true.
 */
export function buildHelperOutputInsertPayload(
  draft: HelperOutputDraft,
  options: BuildInsertOptions = {},
): HelperOutputInsertPayload {
  // 1. Contract validation (non-empty provenance, readable surfaces, v1 helper,
  //    no helper_output provenance, allowed action, etc.).
  const result = validateHelperOutputDraft(draft)
  if (!result.valid) {
    throw new Error(`helperOutputStore: invalid draft — ${result.errors.join('; ')}`)
  }

  // 2. Only inert pre-review statuses may be written.
  if (!isWritableStatus(draft.output_status)) {
    throw new Error(
      `helperOutputStore: output_status '${draft.output_status}' is not writable ` +
        `(allowed: ${WRITABLE_HELPER_OUTPUT_STATUSES.join(', ')})`,
    )
  }

  const suggestion_payload = options.runMarker
    ? mergeMarker(draft.suggestion_payload, options.runMarker)
    : draft.suggestion_payload

  // 3. Force the safe shape. Review fields are never set.
  return {
    helper_type: draft.helper_type,
    output_status: draft.output_status,
    suggested_action: draft.suggested_action,
    confidence_label: draft.confidence_label,
    presence_scope: draft.presence_scope,
    created_by: draft.created_by,
    source_refs: draft.source_refs,
    suggestion_payload,
    not_memory: true,
    not_evidence: true,
    prompt_eligible: false,
    authority_changed: false,
    human_review_required: true,
    review_routed: false,
    test_owned: options.testOwned ?? true,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DB insert — injected client (no Supabase import in this module)
// ─────────────────────────────────────────────────────────────────────────────

export type InsertedHelperOutputRow = {
  id: string
  helper_type: string
  output_status: string
  test_owned: boolean
  created_at: string | null
}

export type HelperOutputInsertResult = {
  data: InsertedHelperOutputRow[] | null
  error: { message: string } | null
}

/** Minimal client shape the writer needs. Real Supabase client satisfies it. */
export type HelperOutputDbClient = {
  from(table: 'helper_outputs'): {
    insert(rows: HelperOutputInsertPayload[]): {
      select(columns: string): Promise<HelperOutputInsertResult>
    }
  }
}

const INSERTED_COLUMNS = 'id, helper_type, output_status, test_owned, created_at'

/**
 * Insert one or more drafts as inert helper_outputs rows via the injected
 * client. Builds + validates each payload first (throws before any insert if
 * any draft is invalid). Returns the inserted row metadata. INSERT only — never
 * updates, deletes, or touches any other table.
 */
export async function insertHelperOutputs(
  client: HelperOutputDbClient,
  drafts: HelperOutputDraft[],
  options: BuildInsertOptions = {},
): Promise<InsertedHelperOutputRow[]> {
  const payloads = drafts.map((d) => buildHelperOutputInsertPayload(d, options))
  const { data, error } = await client
    .from('helper_outputs')
    .insert(payloads)
    .select(INSERTED_COLUMNS)
  if (error) {
    throw new Error(`helperOutputStore: insert failed — ${error.message}`)
  }
  return data ?? []
}
