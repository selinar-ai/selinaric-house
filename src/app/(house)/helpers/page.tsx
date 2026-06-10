'use client'

// Phase 41.4 — Helper Output Review Surface
// Read-only. Shows inert helper_outputs trace so Tara can inspect helper labour.
// Does NOT accept/reject/route/approve/promote anything. Does not run helpers.
// Does not mutate helper_outputs, library_items, library_item_files, or any
// authority surface. Does not feed helper outputs into prompts.
// Review visibility is not review approval.

import { useState, useEffect, useCallback } from 'react'
import {
  HELPER_REVIEW_TITLE,
  HELPER_REVIEW_SUBTITLE,
  HELPER_REVIEW_BOUNDARY_TEXT,
  HELPER_REVIEW_EMPTY_PRIMARY,
  HELPER_REVIEW_EMPTY_SECONDARY,
  SOFT_DELETED_LABEL,
  authorityFlags,
  renderedProvenance,
  provenanceSummary,
  isSoftDeleted,
  isLibraryMetadataHelper,
  asLibraryMetadataPayload,
  type HelperOutputRow,
} from '@/lib/helpers/helperReviewPresenter'

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

function HelperOutputCard({ row, labels }: { row: HelperOutputRow; labels: Record<string, string> }) {
  const deleted = isSoftDeleted(row)
  const provenance = renderedProvenance(row.source_refs, labels)
  const libView = isLibraryMetadataHelper(row) ? asLibraryMetadataPayload(row.suggestion_payload) : null

  return (
    <div className={`border rounded-lg px-4 py-3 ${deleted ? 'border-house-border/20 bg-house-bg/10 opacity-60' : 'border-house-border/40 bg-house-bg/30'}`}>
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
    </div>
  )
}

export default function HelperReviewPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [rows, setRows] = useState<HelperOutputRow[]>([])
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

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
            {rows.map((row) => (
              <HelperOutputCard key={row.id} row={row} labels={labels} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
