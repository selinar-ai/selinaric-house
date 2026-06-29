/**
 * Phase 41.17.2 — Manual Documentation Completeness Helper Runner (pure logic)
 *
 * The deterministic, testable core of the manual CLI runner for the v1
 * `documentation_completeness_helper`. PURE: no I/O, no DB, no Supabase, no fetch,
 * no Anthropic/OpenAI. The CLI (`scripts/run-documentation-completeness-helper.ts`)
 * supplies all I/O and calls into here for argument validation, dedupe-key
 * derivation, metadata stamping, and the deposit plan.
 *
 * Mirrors the Phase 42.1 metadata runner exactly, with one addition: an explicit
 * `--dry-run` mode that previews findings and writes NOTHING (not even test-owned
 * rows). The dedupe key uses the same 4-field pattern:
 *   sha256( helper_type | helper_version | source_item_id | issue_code )
 *
 * ── Law ──────────────────────────────────────────────────────────────────────
 *   The helper may prepare work. The Workshop may show work. Tara may review
 *   workflow state. Nothing here makes anything true, applied, remembered,
 *   prompt-visible, or authoritative. This module never widens the helper type,
 *   never reads candidate/Memory/Graph surfaces, and never mutates anything.
 *
 * Dedupe rule (Ari): a candidate is skipped when an ACTIVE (non-soft-deleted)
 * helper_outputs row already exists with the same `_dedupe_key` — across ALL
 * review states. Soft-deleted rows do NOT block. A helper-version change yields a
 * new key.
 */

import { createHash } from 'crypto'
import type { HelperOutputDraft } from './helperContract'

/** Bumping this changes every dedupe key (so a logic change can re-find gaps). */
export const DOCUMENTATION_COMPLETENESS_HELPER_VERSION = '41.17.2'

export const RUNNER_INVOKED_BY = 'manual_cli' as const

export type RunMode = 'dry_run' | 'test_owned' | 'real_deposit'

// ─────────────────────────────────────────────────────────────────────────────
// Argument validation — one named item per run; explicit confirm; real gated;
// dry-run previews and writes nothing.
// ─────────────────────────────────────────────────────────────────────────────

export type RunnerArgs =
  | { ok: true; libraryItemId: string; dryRun: boolean; depositReal: boolean; runMode: RunMode }
  | { ok: false; reason: string }

/**
 * Validate CLI args. Requires `--confirm-helper-run` and exactly one
 * `--library-item-id <id>`. Refuses missing id, "all", `--all`, multiple ids, or
 * comma-separated ids. `--dry-run` previews and writes nothing; `--deposit-real`
 * writes non-test rows; the two are mutually exclusive; the default (neither) is
 * a test-owned deposit.
 */
export function parseRunnerArgs(argv: readonly string[]): RunnerArgs {
  if (!argv.includes('--confirm-helper-run')) {
    return { ok: false, reason: 'missing --confirm-helper-run (manual confirmation required)' }
  }
  if (argv.includes('--all') || argv.includes('--all-items')) {
    return { ok: false, reason: 'no all-items mode — one named library item per run only' }
  }

  const dryRun = argv.includes('--dry-run')
  const depositReal = argv.includes('--deposit-real')
  if (dryRun && depositReal) {
    return { ok: false, reason: '--dry-run and --deposit-real are mutually exclusive' }
  }

  const ids: string[] = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--library-item-id') {
      const v = argv[i + 1]
      if (!v || v.startsWith('--')) return { ok: false, reason: '--library-item-id requires a value' }
      ids.push(v)
    }
  }
  if (ids.length === 0) return { ok: false, reason: 'missing --library-item-id <id>' }
  if (ids.length > 1) return { ok: false, reason: 'one item per run only (multiple --library-item-id given)' }

  const id = ids[0].trim()
  if (id.length === 0) return { ok: false, reason: 'empty --library-item-id' }
  if (id.toLowerCase() === 'all') return { ok: false, reason: '"all" is not a valid item id' }
  if (id.includes(',')) return { ok: false, reason: 'one item per run only (comma-separated ids not allowed)' }

  const runMode: RunMode = dryRun ? 'dry_run' : depositReal ? 'real_deposit' : 'test_owned'
  return { ok: true, libraryItemId: id, dryRun, depositReal, runMode }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dedupe key — sha256(helper_type | helper_version | source_item_id | issue_code)
// ─────────────────────────────────────────────────────────────────────────────

/** The primary `library_item` source id of a draft (the item being inspected). */
export function libraryItemSourceId(draft: HelperOutputDraft): string | null {
  const ref = (draft.source_refs ?? []).find((r) => r.source_surface === 'library_item')
  return ref ? ref.source_id : null
}

/** The deterministic issue code from a draft's suggestion_payload. */
export function issueCodeOf(draft: HelperOutputDraft): string {
  const p = draft.suggestion_payload
  if (p && typeof p === 'object' && !Array.isArray(p)) {
    const code = (p as Record<string, unknown>).issue_code
    if (typeof code === 'string' && code.length > 0) return code
  }
  return 'unknown'
}

export function computeDedupeKey(
  helperType: string,
  helperVersion: string,
  sourceItemId: string,
  issueCode: string,
): string {
  return createHash('sha256').update([helperType, helperVersion, sourceItemId, issueCode].join('|')).digest('hex')
}

/** Derive the dedupe key for a freshly-produced draft (pre-stamp). */
export function dedupeKeyForDraft(
  draft: HelperOutputDraft,
  helperVersion: string = DOCUMENTATION_COMPLETENESS_HELPER_VERSION,
): string {
  const itemId = libraryItemSourceId(draft) ?? 'no-item'
  return computeDedupeKey(draft.helper_type, helperVersion, itemId, issueCodeOf(draft))
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata stamping — manual-invocation provenance inside suggestion_payload
// ─────────────────────────────────────────────────────────────────────────────

export type RunnerMeta = {
  helperVersion: string
  dedupeKey: string
  runId: string
  runMode: RunMode
}

/**
 * Return a copy of the draft with manual-invocation metadata merged into
 * suggestion_payload. Never changes helper_type, source_refs, the locked flags,
 * created_by, or any review field — only annotates the payload.
 */
export function stampRunnerMetadata(draft: HelperOutputDraft, meta: RunnerMeta): HelperOutputDraft {
  const base =
    draft.suggestion_payload && typeof draft.suggestion_payload === 'object' && !Array.isArray(draft.suggestion_payload)
      ? (draft.suggestion_payload as Record<string, unknown>)
      : { value: draft.suggestion_payload }
  return {
    ...draft,
    suggestion_payload: {
      ...base,
      helper_version: meta.helperVersion,
      _dedupe_key: meta.dedupeKey,
      run_id: meta.runId,
      run_mode: meta.runMode,
      runner_invoked_by: RUNNER_INVOKED_BY,
    },
  }
}

/** Read back the stamped dedupe key from a stamped draft. */
export function stampedDedupeKey(draft: HelperOutputDraft): string | null {
  const p = draft.suggestion_payload
  if (p && typeof p === 'object' && !Array.isArray(p)) {
    const k = (p as Record<string, unknown>)._dedupe_key
    if (typeof k === 'string' && k.length > 0) return k
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Deposit plan — skip candidates already present among ACTIVE rows
// ─────────────────────────────────────────────────────────────────────────────

export type DepositPlan = {
  toInsert: HelperOutputDraft[]
  skipped: { dedupeKey: string }[]
}

/**
 * Partition stamped drafts: skip any whose dedupe key is already present among
 * the active (non-soft-deleted) rows. `existingActiveKeys` is supplied by the
 * CLI from a `deleted_at is null` query with NO review-state filter, so the skip
 * blocks across every review state. Pure; never mutates input.
 */
export function planDeposit(
  stampedDrafts: readonly HelperOutputDraft[],
  existingActiveKeys: ReadonlySet<string>,
): DepositPlan {
  const toInsert: HelperOutputDraft[] = []
  const skipped: { dedupeKey: string }[] = []
  for (const d of stampedDrafts) {
    const key = stampedDedupeKey(d) ?? ''
    if (key && existingActiveKeys.has(key)) skipped.push({ dedupeKey: key })
    else toInsert.push(d)
  }
  return { toInsert, skipped }
}
