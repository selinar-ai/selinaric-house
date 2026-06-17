'use client'

// Phase 41.4 — Helper Output Review Surface (Phase 41.13 — row-local controls)
// Shows inert helper_outputs trace so Tara can inspect helper labour, and
// provides row-local WORKFLOW review controls (Mark reviewed / Dismiss / Needs
// follow-up) that call the governed Phase 41.12 route to change review_state
// only — one row, one action per click.
// Does NOT accept/approve/apply/promote/route anything, run helpers, mutate
// burden fields, payload, source refs, authority flags, library_items,
// library_item_files, or any authority surface, or feed helper outputs into
// prompts. Review action changes workflow state only — it is not approval.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  HELPER_REVIEW_TITLE,
  HELPER_REVIEW_SUBTITLE,
  HELPER_REVIEW_BOUNDARY_TEXT,
  HELPER_REVIEW_EMPTY_PRIMARY,
  HELPER_REVIEW_EMPTY_SECONDARY,
  HELPER_QUEUE_CAPTION,
  HELPER_REVIEW_CONTROLS_CAPTION,
  SOFT_DELETED_LABEL,
  authorityFlags,
  renderedProvenance,
  provenanceSummary,
  isSoftDeleted,
  isLibraryMetadataHelper,
  asLibraryMetadataPayload,
  reviewStateForDisplay,
  reviewBurdenForDisplay,
  type HelperOutputRow,
} from '@/lib/helpers/helperReviewPresenter'
import { buildReviewQueue, type ReviewQueueEntry } from '@/lib/helpers/helperReviewQueue'
import { availableWorkflowActions, type HelperReviewWorkflowAction } from '@/lib/helpers/helperReviewMutation'

// UI-facing labels for the three Phase 41.12 workflow actions. Raw action enum
// values are NEVER shown to Tara.
const WORKFLOW_ACTION_LABELS: Record<HelperReviewWorkflowAction, string> = {
  mark_reviewed_no_action: 'Mark reviewed',
  dismiss_not_useful: 'Dismiss',
  needs_followup: 'Needs follow-up',
}

type RowMessage = { kind: 'error' | 'conflict'; text: string }

type ApiResponse = {
  rows: HelperOutputRow[]
  labels: Record<string, string>
  total: number
}

const HELPER_TYPE_OPTIONS = ['', 'library_metadata_helper']
const OUTPUT_STATUS_OPTIONS = ['', 'draft_only', 'deterministic_check', 'queued_for_review', 'needs_human_review', 'accepted_by_human', 'rejected_by_human', 'superseded']
const SUGGESTED_ACTION_OPTIONS = ['', 'review_metadata', 'normalise_title', 'add_summary', 'add_tags', 'check_extraction_status', 'flag_missing_attachment_text', 'flag_stale_document', 'compare_sources', 'prepare_review_note', 'no_action']
const CONFIDENCE_OPTIONS = ['', 'structural', 'low', 'medium', 'high', 'not_applicable']
const CREATED_BY_OPTIONS = ['', 'helper_contract', 'system_candidate', 'tara', 'test']
const REVIEW_ROUTED_OPTIONS = ['', 'true', 'false']

type Filters = {
  helperType: string
  outputStatus: string
  suggestedAction: string
  confidenceLabel: string
  createdBy: string
  reviewRouted: string
  includeDeleted: boolean
}

const DEFAULT_FILTERS: Filters = {
  helperType: '',
  outputStatus: '',
  suggestedAction: '',
  confidenceLabel: '',
  createdBy: '',
  reviewRouted: '',
  includeDeleted: false,
}

function buildUrl(f: Filters): string {
  const p = new URLSearchParams()
  if (f.helperType) p.set('helperType', f.helperType)
  if (f.outputStatus) p.set('outputStatus', f.outputStatus)
  if (f.suggestedAction) p.set('suggestedAction', f.suggestedAction)
  if (f.confidenceLabel) p.set('confidenceLabel', f.confidenceLabel)
  if (f.createdBy) p.set('createdBy', f.createdBy)
  if (f.reviewRouted) p.set('reviewRouted', f.reviewRouted)
  if (f.includeDeleted) p.set('includeDeleted', 'true')
  p.set('limit', '100')
  return `/api/helper-outputs?${p.toString()}`
}

function FilterSelect({ label, value, options, onChange }: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-body text-[9px] text-text-muted/50 uppercase tracking-wider">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-[10px] text-text-secondary/80 bg-house-bg border border-house-border/40 rounded px-2 py-1 outline-none focus:border-house-border/70"
      >
        {options.map((o) => (
          <option key={o || '_all'} value={o}>{o === '' ? 'All' : o}</option>
        ))}
      </select>
    </label>
  )
}

function FlagPill({ label, value, safe }: { label: string; value: boolean; safe: boolean }) {
  return (
    <span
      className={`font-mono text-[9px] px-2 py-0.5 rounded border ${
        safe
          ? 'text-emerald-300/70 bg-emerald-300/5 border-emerald-300/20'
          : 'text-red-300/80 bg-red-300/10 border-red-300/30'
      }`}
      title={safe ? 'Within the helper boundary' : 'Unexpected — outside the helper boundary'}
    >
      {label}: {String(value)}
    </span>
  )
}

function HelperOutputCard({ row, labels, entry, onAction, isActing, message }: {
  row: HelperOutputRow
  labels: Record<string, string>
  entry?: ReviewQueueEntry
  onAction?: (row: HelperOutputRow, action: HelperReviewWorkflowAction) => void
  isActing?: boolean
  message?: RowMessage
}) {
  const deleted = isSoftDeleted(row)
  const provenance = renderedProvenance(row.source_refs, labels)
  const libView = isLibraryMetadataHelper(row) ? asLibraryMetadataPayload(row.suggestion_payload) : null

  // Row-local review controls (Phase 41.13). Shown only for an active, non-
  // soft-deleted, non-terminal row that has at least one allowed transition.
  const actions = availableWorkflowActions(reviewStateForDisplay(row))
  const showControls = !deleted && (entry?.is_active ?? false) && actions.length > 0

  return (
    <div className={`border rounded-lg px-4 py-3 ${deleted ? 'border-house-border/20 bg-house-bg/10 opacity-60' : 'border-house-border/40 bg-house-bg/30'}`}>
      {/* Queue line — read-only rank + bucket (Phase 41.11). Not authority. */}
      {entry && (
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <span className="font-mono text-[9px] px-2 py-0.5 rounded border border-house-border/40 text-text-secondary/70">
            #{entry.queue_rank}
          </span>
          <span className="font-mono text-[9px] px-2 py-0.5 rounded border border-house-border/40 text-text-secondary/70">
            {entry.queue_bucket}
          </span>
        </div>
      )}

      {/* Header line */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[10px] text-text-primary/80">{row.helper_type}</span>
        <span className="font-mono text-[9px] text-text-muted/50">·</span>
        <span className="font-mono text-[9px] px-2 py-0.5 rounded border border-house-border/30 text-text-secondary/70">{row.output_status}</span>
        <span className="font-mono text-[9px] px-2 py-0.5 rounded border border-house-border/30 text-text-secondary/70">{row.suggested_action}</span>
        <span className="font-mono text-[9px] text-text-muted/50">confidence: {row.confidence_label}</span>
        {deleted && (
          <span className="font-mono text-[9px] px-2 py-0.5 rounded border border-amber-300/30 text-amber-300/70 bg-amber-300/5">
            {SOFT_DELETED_LABEL}
          </span>
        )}
      </div>

      {/* Meta line */}
      <div className="flex items-center gap-3 flex-wrap mt-1.5 font-mono text-[9px] text-text-muted/45">
        <span>created: {row.created_at ?? '—'}</span>
        <span>by: {row.created_by}</span>
        <span>scope: {row.presence_scope}</span>
        <span>review_state: {reviewStateForDisplay(row)}</span>
        <span>human_review_required: {String(row.human_review_required)}</span>
        <span>reviewed_by: {row.reviewed_by ?? '—'}</span>
        <span>reviewed_at: {row.reviewed_at ?? '—'}</span>
      </div>

      {/* Authority flags — the boundary, made visible */}
      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        {authorityFlags(row).map((f) => (
          <FlagPill key={f.key} label={f.label} value={f.value} safe={f.safe} />
        ))}
      </div>

      {/* Review burden — read-only triage metadata (Phase 41.9). Renders only
          when the row carries persisted burden; no controls. */}
      {(() => {
        const burden = reviewBurdenForDisplay(row)
        if (!burden) return null
        return (
          <div className="flex items-center gap-3 flex-wrap mt-1.5 font-mono text-[9px] text-text-muted/45">
            <span>risk: {burden.risk_class}</span>
            <span>priority: {burden.review_priority}</span>
            <span>mode: {burden.review_mode}</span>
            <span>batch_eligible: {String(burden.batch_eligible)}</span>
            <span>sample_required: {String(burden.sample_required)}</span>
            <span>escalation_required: {String(burden.escalation_required)}</span>
            {burden.escalation_reasons.length > 0 && (
              <span>reasons: {burden.escalation_reasons.join(', ')}</span>
            )}
          </div>
        )
      })()}

      {/* Provenance — multi-ref, never collapsed */}
      <div className="mt-2.5 border-t border-house-border/20 pt-2">
        <p className="font-body text-[9px] text-text-muted/50 uppercase tracking-wider mb-1">
          Source: {provenanceSummary(row.source_refs)}
        </p>
        <ul className="space-y-0.5">
          {provenance.map((p, i) => (
            <li key={`${p.surface}-${p.id}-${i}`} className="font-mono text-[9px] text-text-secondary/65">
              {p.surfaceLabel}: {p.label ?? p.id}
              {p.label && <span className="text-text-muted/35"> ({p.id})</span>}
            </li>
          ))}
        </ul>
      </div>

      {/* Library metadata payload (description shown as "Description / summary") */}
      {libView && (
        <div className="mt-2.5 border-t border-house-border/20 pt-2">
          <p className="font-body text-[10px] text-text-primary/70">{libView.issue_label ?? libView.issue_code}</p>
          {libView.issue_code && (
            <p className="font-mono text-[9px] text-text-muted/45 mt-0.5">issue: {libView.issue_code}</p>
          )}
          {libView.suggested_next_step && (
            <p className="font-body text-[10px] text-text-secondary/70 mt-1">Next step: {libView.suggested_next_step}</p>
          )}
          {libView.deterministic_reason && (
            <p className="font-body text-[9px] text-text-muted/50 italic mt-0.5">Reason: {libView.deterministic_reason}</p>
          )}
          {libView.checked_fields_labelled.length > 0 && (
            <p className="font-mono text-[9px] text-text-muted/50 mt-1">
              Checked: {libView.checked_fields_labelled.join(', ')}
            </p>
          )}
          {libView.observed_state && (
            <pre className="font-mono text-[9px] text-text-muted/45 mt-1 whitespace-pre-wrap break-words">
              {JSON.stringify(libView.observed_state, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Raw payload fallback for non-library helper types */}
      {!libView && row.suggestion_payload != null && (
        <div className="mt-2.5 border-t border-house-border/20 pt-2">
          <pre className="font-mono text-[9px] text-text-muted/45 whitespace-pre-wrap break-words">
            {JSON.stringify(row.suggestion_payload, null, 2)}
          </pre>
        </div>
      )}

      {/* Row-local review controls (Phase 41.13). Workflow state only — one row,
          one action per click. Soft-deleted / terminal rows show no controls. */}
      {showControls && (
        <div className="mt-3 border-t border-house-border/20 pt-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            {actions.map((action) => (
              <button
                key={action}
                type="button"
                disabled={!!isActing}
                onClick={() => onAction?.(row, action)}
                className="font-body text-[10px] px-2.5 py-1 rounded border border-house-border/50 text-text-secondary/80 hover:border-house-border/80 hover:text-text-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {WORKFLOW_ACTION_LABELS[action]}
              </button>
            ))}
            {isActing && <span className="font-mono text-[9px] text-text-muted/50">working…</span>}
          </div>
          {message && (
            <p className={`font-body text-[10px] mt-1.5 ${message.kind === 'conflict' ? 'text-amber-300/80' : 'text-red-300/80'}`}>
              {message.text}
            </p>
          )}
          <p className="font-body text-[9px] text-text-muted/40 mt-1.5 italic">{HELPER_REVIEW_CONTROLS_CAPTION}</p>
        </div>
      )}
    </div>
  )
}

export default function HelperReviewPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [rows, setRows] = useState<HelperOutputRow[]>([])
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  // Phase 41.13 — row-local review-action state.
  const [actingId, setActingId] = useState<string | null>(null)
  const [rowMessages, setRowMessages] = useState<Record<string, RowMessage>>({})
  const inFlightRef = useRef(false)

  const fetchRows = useCallback(async (f: Filters) => {
    setLoading(true)
    try {
      const res = await fetch(buildUrl(f))
      if (!res.ok) throw new Error('Failed to fetch')
      const data = (await res.json()) as ApiResponse
      setRows(data.rows ?? [])
      setLabels(data.labels ?? {})
      setTotal(data.total ?? 0)
    } catch {
      setRows([])
      setLabels({})
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRows(filters)
  }, [filters, fetchRows])

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  // Phase 41.13 — perform one workflow review action on exactly one row via the
  // existing Phase 41.12 route. Single in-flight (double-click safe); optimistic
  // concurrency via expectedReviewState; row-local success/error; updates only
  // the acted row. No batch, no authority movement, no helper execution.
  const onReviewAction = useCallback(async (row: HelperOutputRow, action: HelperReviewWorkflowAction) => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setActingId(row.id)
    setRowMessages((m) => { const n = { ...m }; delete n[row.id]; return n })
    try {
      const res = await fetch(`/api/helpers/outputs/${row.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, expectedReviewState: reviewStateForDisplay(row) }),
      })
      if (res.status === 200) {
        const data = await res.json()
        const updated = data?.row as Partial<HelperOutputRow> | undefined
        if (updated && updated.id) {
          setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...updated } : r)))
        }
        return
      }
      if (res.status === 409) {
        setRowMessages((m) => ({ ...m, [row.id]: { kind: 'conflict', text: 'This helper output changed since the queue loaded. Refresh and review the latest state.' } }))
        return
      }
      const text = res.status === 401 ? 'Session expired — please sign in again. No change was made.'
        : res.status === 404 ? 'This helper output was not found. No change was made.'
        : res.status === 422 ? 'That action is not valid for this row’s current state. No change was made.'
        : res.status === 400 ? 'Invalid request. No change was made.'
        : 'Something went wrong — no change was made.'
      setRowMessages((m) => ({ ...m, [row.id]: { kind: 'error', text } }))
    } catch {
      setRowMessages((m) => ({ ...m, [row.id]: { kind: 'error', text: 'Network error — no change was made.' } }))
    } finally {
      inFlightRef.current = false
      setActingId(null)
    }
  }, [])

  // Read-only queue ordering via the Phase 41.10 model. includeInactive keeps
  // every fetched row visible (deleted only arrive when the toggle requests
  // them) — nothing is hidden; the model only orders by queue_rank and labels
  // the bucket. No mutation, no review execution.
  const queue = useMemo(() => buildReviewQueue(rows, { includeInactive: true }), [rows])
  const rowById = useMemo(() => {
    const m = new Map<string, HelperOutputRow>()
    for (const r of rows) m.set(r.id, r)
    return m
  }, [rows])

  return (
    <div className="flex flex-col min-h-full">
      {/* ── Header + boundary ───────────────────────────────────────── */}
      <div className="border-b border-house-border bg-house-surface px-4 py-4 md:px-6 shrink-0">
        <h1 className="font-display text-xl font-light tracking-[0.15em] text-text-primary">
          {HELPER_REVIEW_TITLE.toUpperCase()}
        </h1>
        <p className="font-body text-xs text-text-muted mt-1 italic">{HELPER_REVIEW_SUBTITLE}</p>
        <p className="font-body text-[11px] text-text-muted/70 mt-2 max-w-3xl border border-house-border/30 rounded bg-house-bg/20 px-3 py-2">
          {HELPER_REVIEW_BOUNDARY_TEXT}
        </p>
        <p className="font-body text-[10px] text-text-muted/50 mt-1.5 italic">{HELPER_QUEUE_CAPTION}</p>
        <p className="font-body text-[10px] text-text-muted/50 mt-1 italic">{HELPER_REVIEW_CONTROLS_CAPTION}</p>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="border-b border-house-border bg-house-bg px-4 py-3 md:px-6 shrink-0">
        <div className="flex gap-3 flex-wrap items-end">
          <FilterSelect label="Helper type" value={filters.helperType} options={HELPER_TYPE_OPTIONS} onChange={(v) => set('helperType', v)} />
          <FilterSelect label="Output status" value={filters.outputStatus} options={OUTPUT_STATUS_OPTIONS} onChange={(v) => set('outputStatus', v)} />
          <FilterSelect label="Suggested action" value={filters.suggestedAction} options={SUGGESTED_ACTION_OPTIONS} onChange={(v) => set('suggestedAction', v)} />
          <FilterSelect label="Confidence" value={filters.confidenceLabel} options={CONFIDENCE_OPTIONS} onChange={(v) => set('confidenceLabel', v)} />
          <FilterSelect label="Created by" value={filters.createdBy} options={CREATED_BY_OPTIONS} onChange={(v) => set('createdBy', v)} />
          <FilterSelect label="Review routed" value={filters.reviewRouted} options={REVIEW_ROUTED_OPTIONS} onChange={(v) => set('reviewRouted', v)} />
          <label className="flex items-center gap-2 font-body text-[10px] text-text-muted/60 pb-1">
            <input
              type="checkbox"
              checked={filters.includeDeleted}
              onChange={(e) => set('includeDeleted', e.target.checked)}
            />
            Show soft-deleted trace
          </label>
        </div>
      </div>

      {/* ── List ────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 md:px-6">
        <div className="font-body text-[10px] text-text-muted/50 uppercase tracking-widest mb-3">
          {loading ? 'Loading…' : `${total} helper output${total !== 1 ? 's' : ''}`}
        </div>

        {!loading && rows.length === 0 ? (
          <div className="border border-house-border/30 rounded-lg bg-house-bg/15 px-6 py-10 text-center max-w-xl mx-auto">
            <p className="font-display text-base font-light text-text-primary/70">{HELPER_REVIEW_EMPTY_PRIMARY}</p>
            <p className="font-body text-[11px] text-text-muted/60 mt-2">{HELPER_REVIEW_EMPTY_SECONDARY}</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-4xl">
            {queue.entries.map((e) => {
              const row = rowById.get(e.id)
              if (!row) return null
              return (
                <HelperOutputCard
                  key={e.id}
                  row={row}
                  labels={labels}
                  entry={e}
                  onAction={onReviewAction}
                  isActing={actingId === e.id}
                  message={rowMessages[e.id]}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
