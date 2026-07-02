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
  reviewTraceForDisplay,
  reviewTraceLine,
  HELPER_REVIEW_TRACE_CAPTION,
  HELPER_REVIEW_TRACE_TOGGLE,
  HELPER_REVIEW_TRACE_EMPTY,
  type HelperOutputRow,
} from '@/lib/helpers/helperReviewPresenter'
import { buildReviewQueue, type ReviewQueueEntry, type ReviewQueue } from '@/lib/helpers/helperReviewQueue'
import { availableWorkflowActions, type HelperReviewWorkflowAction } from '@/lib/helpers/helperReviewMutation'
import {
  WORKSHOP_ATRIUM_LABEL,
  WORKSHOP_VIEW_LABELS,
  WORKSHOP_MAP_CAPTION,
  WORKSHOP_EMPTY_CLARIFICATION,
  WORKSHOP_COURIER_CAPTION,
  WORKSHOP_BACK_LABEL,
  WORKSHOP_ROOM_EMPTY,
  buildWorkshopMap,
  bucketInRoom,
  roomDef,
  isWorkshopViewMode,
  agentDisplayName,
  agentOutcomeSubline,
  WORKSHOP_AGENT_BOUNDARY,
  type WorkshopViewMode,
  type WorkshopRoomId,
  type WorkshopRoomTile,
  type WorkshopRoomState,
} from '@/lib/helpers/helperWorkshop'
import { motion, AnimatePresence } from 'motion/react'
import { useReducedMotion, WORKSHOP_MOTION } from '@/lib/helpers/workshopMotion'
import {
  isDelegatableExtractionOutput,
  WORKSHOP_DELEGATE_RETRY_LABEL,
  WORKSHOP_ROLLBACK_LABEL,
  WORKSHOP_APPLY_TRACE_TITLE,
  WORKSHOP_DELEGATE_CAPTION,
} from '@/lib/helpers/helperWorkOrder'

// Result of a delegated apply / rollback, shown in the row's Apply trace.
type DelegateResult = {
  workOrderId: string
  status: 'applied' | 'failed' | 'rolled_back'
  before?: unknown
  after?: unknown
  error?: string
}

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

function HelperOutputCard({ row, labels, entry, onAction, isActing, message, onDelegate, onRollback, delegateResult, isDelegating }: {
  row: HelperOutputRow
  labels: Record<string, string>
  entry?: ReviewQueueEntry
  onAction?: (row: HelperOutputRow, action: HelperReviewWorkflowAction) => void
  isActing?: boolean
  message?: RowMessage
  onDelegate?: (row: HelperOutputRow) => void
  onRollback?: (row: HelperOutputRow, workOrderId: string) => void
  delegateResult?: DelegateResult
  isDelegating?: boolean
}) {
  const deleted = isSoftDeleted(row)
  // Phase 42.2.1 — only the delegatable extraction-retry issue gets an apply control.
  const canDelegate = !deleted && isDelegatableExtractionOutput(row)
  const provenance = renderedProvenance(row.source_refs, labels)
  const libView = isLibraryMetadataHelper(row) ? asLibraryMetadataPayload(row.suggestion_payload) : null
  // Read-only review-event trace (Phase 41.14) — workflow history, oldest first.
  const trace = reviewTraceForDisplay(row)

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

      {/* Read-only review trace (Phase 41.14). Workflow history only — previous →
          new state, action, actor, when. Shows for every row, soft-deleted
          included; never a control, never authority. Native <details> keeps it
          keyboard-usable and reduced-motion-safe. */}
      <div className="mt-2.5 border-t border-house-border/15 pt-2">
        {trace.length > 0 ? (
          <details className="group">
            <summary className="font-body text-[10px] text-text-muted/55 cursor-pointer select-none hover:text-text-secondary/70">
              {HELPER_REVIEW_TRACE_TOGGLE} ({trace.length})
            </summary>
            <ol className="mt-1.5 space-y-0.5 list-none">
              {trace.map((ev) => (
                <li key={ev.id} className="font-mono text-[9px] text-text-secondary/60 break-words">
                  {reviewTraceLine(ev)}
                </li>
              ))}
            </ol>
          </details>
        ) : (
          <p className="font-body text-[9px] text-text-muted/40">{HELPER_REVIEW_TRACE_EMPTY}</p>
        )}
        <p className="font-body text-[9px] text-text-muted/35 mt-1 italic">{HELPER_REVIEW_TRACE_CAPTION}</p>
      </div>

      {/* Delegated apply (Phase 42.2.1) — ONLY the file_extraction_not_run issue.
          Approve authorises the helper to retry extraction for one file, under
          audit, reversible. Separate from the review trace: this is labour
          performed, not workflow movement. */}
      {canDelegate && (
        <div className="mt-2.5 border-t border-house-border/20 pt-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={!!isDelegating || delegateResult?.status === 'applied' || delegateResult?.status === 'rolled_back'}
              onClick={() => onDelegate?.(row)}
              className="font-body text-[10px] px-2.5 py-1 rounded border border-[#6FA8C9]/50 text-[#9fc6dd] hover:border-[#6FA8C9]/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {WORKSHOP_DELEGATE_RETRY_LABEL}
            </button>
            {isDelegating && <span className="font-mono text-[9px] text-text-muted/50">working…</span>}
          </div>
          <p className="font-body text-[9px] text-text-muted/40 mt-1.5 italic">{WORKSHOP_DELEGATE_CAPTION}</p>

          {delegateResult && (
            <div className="mt-2 border-t border-house-border/10 pt-2">
              <p className="font-body text-[10px] text-text-muted/60">{WORKSHOP_APPLY_TRACE_TITLE}</p>
              <p className="font-mono text-[9px] text-text-secondary/65 mt-1 break-words">
                retry_extraction · {delegateResult.status}{delegateResult.error ? ` · ${delegateResult.error}` : ''}
              </p>
              {(delegateResult.before != null || delegateResult.after != null) && (
                <pre className="font-mono text-[9px] text-text-muted/45 mt-1 whitespace-pre-wrap break-words">
                  before: {JSON.stringify(delegateResult.before)}{'\n'}after:  {JSON.stringify(delegateResult.after)}
                </pre>
              )}
              {delegateResult.status === 'applied' && (
                <button
                  type="button"
                  disabled={!!isDelegating}
                  onClick={() => onRollback?.(row, delegateResult.workOrderId)}
                  className="font-body text-[10px] px-2.5 py-1 mt-1.5 rounded border border-amber-300/40 text-amber-200/80 hover:border-amber-300/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {WORKSHOP_ROLLBACK_LABEL}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 41.15 — Workshop spatial surface (presentation only)
//
// A calm map of rooms (Level 1) and an in-room single-output review (Level 2).
// It reuses the exact same data, the exact same review handler, and the exact
// same trace as the list. It adds NO route, NO mutation, NO authority. Room glow
// is review state only; the courier is silent. Soft House velvet palette.
// ─────────────────────────────────────────────────────────────────────────────

const WORKSHOP_VIEW_STORAGE_KEY = 'selinaric_helper_view_mode'

// Slice 2 — transition variants (transform/opacity only; GPU-friendly).
// Entering a room reads as a soft corridor-zoom in; the map zooms gently out.
// Stepping prev/next cross-fades the presented output. All disabled under
// reduced motion (the page renders the plain switch instead).
const MAP_STAGE_ANIM = {
  initial: { opacity: 0, scale: 1.02 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 1.02 },
  transition: { duration: 0.26, ease: 'easeOut' as const },
}
const ROOM_STAGE_ANIM = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
  transition: { duration: 0.3, ease: 'easeOut' as const },
}
const CARD_STEP_ANIM = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.22, ease: 'easeOut' as const },
}

/**
 * Soft ambient styling per room state. Glow = review state, never authority.
 * `wash` is a faint, low-alpha radial tint behind the tile content (Slice 5) —
 * it enriches the room's interior glow while keeping text fully legible.
 */
function roomStateVisual(state: WorkshopRoomState): { dot: string; glow: string; wash: string; pulse: boolean; label: string } {
  switch (state) {
    case 'needs attention':
      return { dot: '#E6B25A', glow: '0 0 18px 1px rgba(230,178,90,0.35)', wash: 'radial-gradient(circle at 26% 28%, rgba(230,178,90,0.14), transparent 62%)', pulse: true, label: 'needs attention' }
    case 'follow-up needed':
      return { dot: '#C97AA8', glow: '0 0 14px 1px rgba(201,122,168,0.28)', wash: 'radial-gradient(circle at 26% 28%, rgba(201,122,168,0.12), transparent 62%)', pulse: false, label: 'follow-up needed' }
    case 'reviewed / trace visible':
      return { dot: '#6FA8C9', glow: '0 0 10px 1px rgba(111,168,201,0.22)', wash: 'radial-gradient(circle at 26% 28%, rgba(111,168,201,0.10), transparent 62%)', pulse: false, label: 'reviewed / trace visible' }
    case 'kept as trace':
      return { dot: '#8A5CCF', glow: '0 0 10px 1px rgba(138,92,207,0.22)', wash: 'radial-gradient(circle at 26% 28%, rgba(138,92,207,0.10), transparent 62%)', pulse: false, label: 'kept as trace' }
    case 'resting':
      return { dot: '#6E5A8A', glow: 'none', wash: 'none', pulse: false, label: 'resting' }
    default:
      return { dot: '#3A3450', glow: 'none', wash: 'none', pulse: false, label: 'empty' }
  }
}

/**
 * The silent courier sprite — head + two hands, ghost-like, no legs. Pure
 * decoration: aria-hidden, NO text, NO role, NO interactivity. It presents; it
 * never speaks. Motion is applied by AnimatedCourier; this is the still form.
 */
function WorkshopCourier() {
  return (
    <div aria-hidden="true" className="shrink-0 select-none">
      <svg width="64" height="80" viewBox="0 0 64 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="courierHalo" cx="50%" cy="44%" r="56%">
            <stop offset="0%" stopColor="#E6B25A" stopOpacity="0.5" />
            <stop offset="55%" stopColor="#C97AA8" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#8A5CCF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="courierBody" cx="50%" cy="28%" r="80%">
            <stop offset="0%" stopColor="#F4E3FB" />
            <stop offset="60%" stopColor="#D6ABE8" />
            <stop offset="100%" stopColor="#B488D2" />
          </radialGradient>
        </defs>
        {/* candle-gold halo */}
        <circle cx="32" cy="38" r="32" fill="url(#courierHalo)" />
        {/* ghostly body — no legs, scalloped hem */}
        <path d="M16 40 C12 52 12 60 14 66 C15.5 70 19 70 21 66 C23 62 27 62 29 66 C31 70 33 70 35 66 C37 62 41 62 43 66 C45 70 48.5 70 50 66 C52 60 52 52 48 40 Z" fill="url(#courierBody)" stroke="#F0D9A8" strokeOpacity="0.45" strokeWidth="0.8" />
        {/* head */}
        <circle cx="32" cy="24" r="16" fill="url(#courierBody)" stroke="#F0D9A8" strokeOpacity="0.45" strokeWidth="0.8" />
        {/* a gentle face — presence, never speech */}
        <circle cx="26" cy="22" r="2.1" fill="#2A2440" />
        <circle cx="38" cy="22" r="2.1" fill="#2A2440" />
        <path d="M26 29 Q32 34 38 29" fill="none" stroke="#2A2440" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" />
        {/* the page it carries */}
        <g transform="rotate(-7 32 54)">
          <rect x="22" y="46" width="20" height="16" rx="2" fill="#F3E7C9" stroke="#C9B68A" strokeWidth="0.8" />
          <line x1="25" y1="51" x2="39" y2="51" stroke="#C9B68A" strokeWidth="1.1" />
          <line x1="25" y1="55" x2="39" y2="55" stroke="#C9B68A" strokeWidth="1.1" />
        </g>
        {/* two hands holding the page */}
        <circle cx="15" cy="52" r="5" fill="#E0A6C8" />
        <circle cx="49" cy="52" r="5" fill="#E0A6C8" />
      </svg>
    </div>
  )
}

/**
 * Motion wrapper for the courier (Slice 1). It drifts in carrying the page,
 * settles into a slow idle bob, and — keyed by the presented item + its review
 * state — gently exits and re-enters whenever the presentation changes (a
 * successful 200 action, or stepping to another item). Still silent and
 * aria-hidden. Under prefers-reduced-motion it renders the still sprite with no
 * motion at all. `presentKey` changing is the only trigger; nothing here calls
 * the review route or reads data.
 */
function AnimatedCourier({ presentKey }: { presentKey: string }) {
  const reduce = useReducedMotion()
  if (reduce) return <WorkshopCourier />
  return (
    <div className="shrink-0" style={{ width: 64, minHeight: 80 }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={presentKey}
          initial={{ opacity: 0, x: -22 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 16 }}
          transition={{ duration: WORKSHOP_MOTION.courierTravel.duration, ease: WORKSHOP_MOTION.courierTravel.ease }}
        >
          <motion.div
            animate={{ y: [0, -WORKSHOP_MOTION.courierBob.distance, 0] }}
            transition={{ repeat: Infinity, duration: WORKSHOP_MOTION.courierBob.duration, ease: WORKSHOP_MOTION.courierBob.ease }}
          >
            <WorkshopCourier />
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/**
 * One room tile on the map. A button (keyboard-usable) that enters the room.
 * Slice 3: a gentle candle-glow PULSE on attention states (opacity only, tied to
 * the existing review-state visual), plus hover/tap micro-interactions. All
 * stilled under reduced motion. Glow is review state, never authority.
 */
function WorkshopRoomTileButton({ tile, onEnter }: { tile: WorkshopRoomTile; onEnter: (id: WorkshopRoomId) => void }) {
  const v = roomStateVisual(tile.state)
  const reduce = useReducedMotion()
  const pulsing = v.pulse && !reduce
  return (
    <motion.button
      type="button"
      onClick={() => onEnter(tile.id)}
      whileHover={reduce ? undefined : { y: -2 }}
      whileTap={reduce ? undefined : { scale: 0.99 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      style={{ boxShadow: pulsing ? 'none' : v.glow, backgroundImage: v.wash }}
      className="relative text-left rounded-xl border border-house-border/40 bg-house-bg/40 px-4 py-3.5 transition-colors hover:border-house-border/70 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#C97AA8]/60"
    >
      {pulsing && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-xl"
          style={{ boxShadow: v.glow }}
          animate={{ opacity: [WORKSHOP_MOTION.glowPulse.min, WORKSHOP_MOTION.glowPulse.max, WORKSHOP_MOTION.glowPulse.min] }}
          transition={{ repeat: Infinity, duration: WORKSHOP_MOTION.glowPulse.duration, ease: WORKSHOP_MOTION.glowPulse.ease }}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-[15px] font-light tracking-wide text-text-primary/90">{tile.name}</span>
        <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border border-house-border/40 text-text-secondary/75">
          {tile.count}
        </span>
      </div>
      <p className="font-body text-[10px] text-text-muted/55 mt-0.5">{tile.subtitle}</p>
      {/* Technical clarity — what kind of Agent work is present (display only). */}
      <p className="font-mono text-[9px] text-text-secondary/60 mt-1">{tile.agentSummary}</p>
      <div className="flex items-center gap-1.5 mt-2.5">
        <span style={{ backgroundColor: v.dot }} className="inline-block w-1.5 h-1.5 rounded-full" />
        <span className="font-mono text-[9px] text-text-muted/50">{v.label}</span>
      </div>
    </motion.button>
  )
}

/**
 * Atrium ambience (Slice 3) — a few subtle candle-dust motes drifting over the
 * map. Pure decoration: aria-hidden, pointer-events-none, behind the tiles.
 * Subtle by default and rendered ONLY when motion is allowed — fully off under
 * prefers-reduced-motion (no toggle in v1, per Ari).
 */
function WorkshopMotes() {
  const reduce = useReducedMotion()
  if (reduce) return null
  const motes = [
    { left: '16%', top: '6%', delay: 0.2 },
    { left: '44%', top: '18%', delay: 1.4 },
    { left: '72%', top: '9%', delay: 2.1 },
    { left: '86%', top: '28%', delay: 0.8 },
    { left: '28%', top: '36%', delay: 3.0 },
    { left: '62%', top: '42%', delay: 1.1 },
  ]
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {motes.map((m, i) => (
        <motion.span
          key={i}
          className="absolute w-1 h-1 rounded-full"
          style={{ left: m.left, top: m.top, backgroundColor: '#E6B25A' }}
          animate={{ opacity: [WORKSHOP_MOTION.motes.minOpacity, WORKSHOP_MOTION.motes.maxOpacity, WORKSHOP_MOTION.motes.minOpacity], y: [0, -6, 0] }}
          transition={{ repeat: Infinity, duration: WORKSHOP_MOTION.motes.duration, ease: WORKSHOP_MOTION.motes.ease, delay: m.delay }}
        />
      ))}
    </div>
  )
}

/** Level 1 — the workshop map: an Atrium and the room tiles. Read-only nav. */
function WorkshopMap({ tiles, onEnter }: { tiles: WorkshopRoomTile[]; onEnter: (id: WorkshopRoomId) => void }) {
  return (
    <div className="relative max-w-4xl mx-auto">
      <WorkshopMotes />
      <div className="relative z-10">
        <div className="text-center mb-5">
          <span className="font-display text-xs tracking-[0.3em] uppercase text-text-muted/50">{WORKSHOP_ATRIUM_LABEL}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {tiles.map((t) => (
            <WorkshopRoomTileButton key={t.id} tile={t} onEnter={onEnter} />
          ))}
        </div>
        <p className="font-body text-[10px] text-text-muted/45 italic mt-5 max-w-2xl mx-auto text-center">{WORKSHOP_MAP_CAPTION}</p>
      </div>
    </div>
  )
}

/**
 * Level 2 — the room: ONE helper output at a time via the SAME HelperOutputCard
 * (so controls call the SAME review handler and show the SAME trace). A silent
 * courier presents; optional prev/next walks the room. Back returns to the map.
 */
function WorkshopRoom({
  roomId, entries, rowById, labels, index, onBack, onStep, onAction, actingId, rowMessages,
  onDelegate, onRollback, delegateResults, delegatingId,
}: {
  roomId: WorkshopRoomId
  entries: ReviewQueueEntry[]
  rowById: Map<string, HelperOutputRow>
  labels: Record<string, string>
  index: number
  onBack: () => void
  onStep: (delta: number) => void
  onAction: (row: HelperOutputRow, action: HelperReviewWorkflowAction) => void
  actingId: string | null
  rowMessages: Record<string, RowMessage>
  onDelegate: (row: HelperOutputRow) => void
  onRollback: (row: HelperOutputRow, workOrderId: string) => void
  delegateResults: Record<string, DelegateResult>
  delegatingId: string | null
}) {
  const def = roomDef(roomId)
  const reduce = useReducedMotion()
  const safeIndex = entries.length === 0 ? 0 : Math.min(Math.max(0, index), entries.length - 1)
  const entry = entries[safeIndex]
  const row = entry ? rowById.get(entry.id) : undefined

  // The presented output: silent courier + Agent clarity + the SAME card + the
  // governance boundary. Keyed by entry.id so stepping prev/next cross-fades it,
  // while a successful action updates it in place (the courier re-presents).
  const presented = row ? (
    <>
      {/* The courier presents the page, then the page itself is the SAME card. */}
      <div className="flex items-start gap-3 mb-2">
        <AnimatedCourier presentKey={`${entry?.id ?? 'none'}:${reviewStateForDisplay(row)}`} />
        <div className="pt-1">
          {/* Agent clarity — what kind of work this is, and what it is preparing.
              Display language only; the courier itself stays silent. */}
          <p className="font-display text-[13px] font-light tracking-wide text-text-primary/85">{agentDisplayName(row.helper_type)}</p>
          <p className="font-body text-[10px] text-text-secondary/70 mt-0.5">{agentOutcomeSubline(row.helper_type)}</p>
          <p className="font-body text-[9px] text-text-muted/40 italic mt-1">{WORKSHOP_COURIER_CAPTION}</p>
        </div>
      </div>

      <HelperOutputCard
        row={row}
        labels={labels}
        entry={entry}
        onAction={onAction}
        isActing={actingId === entry?.id}
        message={entry ? rowMessages[entry.id] : undefined}
        onDelegate={onDelegate}
        onRollback={onRollback}
        delegateResult={entry ? delegateResults[entry.id] : undefined}
        isDelegating={delegatingId === entry?.id}
      />

      {/* Governance boundary — visible near the review controls. */}
      <p className="font-body text-[9px] text-text-muted/45 italic mt-2">{WORKSHOP_AGENT_BOUNDARY}</p>
    </>
  ) : null

  return (
    <div className="max-w-3xl mx-auto">
      {/* Room header — back + name + position */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <button
          type="button"
          onClick={onBack}
          className="font-body text-[11px] px-2.5 py-1 rounded border border-house-border/50 text-text-secondary/80 hover:border-house-border/80 hover:text-text-primary/90 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#C97AA8]/60 transition-colors"
        >
          ← {WORKSHOP_BACK_LABEL}
        </button>
        <div className="text-right">
          <div className="font-display text-base font-light tracking-wide text-text-primary/90">{def?.name}</div>
          <div className="font-body text-[10px] text-text-muted/50">{def?.subtitle}</div>
        </div>
      </div>

      {row ? (
        <div className="rounded-xl border border-house-border/30 bg-house-bg/20 p-3 md:p-4">
          {reduce ? presented : (
            <AnimatePresence mode="wait">
              <motion.div
                key={entry?.id ?? 'none'}
                initial={CARD_STEP_ANIM.initial}
                animate={CARD_STEP_ANIM.animate}
                exit={CARD_STEP_ANIM.exit}
                transition={CARD_STEP_ANIM.transition}
              >
                {presented}
              </motion.div>
            </AnimatePresence>
          )}

          {/* Walk the room — one piece of work at a time. */}
          {entries.length > 1 && (
            <div className="flex items-center justify-between gap-3 mt-3">
              <button
                type="button"
                onClick={() => onStep(-1)}
                disabled={safeIndex === 0}
                className="font-body text-[11px] px-2.5 py-1 rounded border border-house-border/50 text-text-secondary/80 hover:border-house-border/80 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-1 focus-visible:ring-[#C97AA8]/60 transition-colors"
              >
                ← Previous
              </button>
              <span className="font-mono text-[10px] text-text-muted/50">{safeIndex + 1} of {entries.length}</span>
              <button
                type="button"
                onClick={() => onStep(1)}
                disabled={safeIndex >= entries.length - 1}
                className="font-body text-[11px] px-2.5 py-1 rounded border border-house-border/50 text-text-secondary/80 hover:border-house-border/80 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-1 focus-visible:ring-[#C97AA8]/60 transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-house-border/30 bg-house-bg/15 px-6 py-10 text-center">
          <p className="font-body text-[12px] text-text-muted/60">{WORKSHOP_ROOM_EMPTY}</p>
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
  // Phase 42.2.1 — delegated apply (extraction retry) per-row state.
  const [delegateResults, setDelegateResults] = useState<Record<string, DelegateResult>>({})
  const [delegatingId, setDelegatingId] = useState<string | null>(null)
  const delegateInFlightRef = useRef(false)
  // Latest filters, readable from the (stable) review-action callback without
  // making it depend on filter state — used to re-read the trace post-action
  // with the user's current filters/toggles preserved. Synced in an effect so
  // render never writes the ref; callbacks only fire post-commit, so they
  // always see the synced value.
  const filtersRef = useRef(filters)
  useEffect(() => {
    filtersRef.current = filters
  }, [filters])

  // Phase 41.15 — spatial Workshop view state. View preference is SESSION-only
  // (never persisted to the database). Workshop is the default room Tara stands
  // in; List remains the fallback/safety view. selectedRoomId === null means the
  // map (Level 1); a room id means the in-room single-output view (Level 2).
  const [viewMode, setViewMode] = useState<WorkshopViewMode>('workshop')
  const [selectedRoomId, setSelectedRoomId] = useState<WorkshopRoomId | null>(null)
  const [roomItemIndex, setRoomItemIndex] = useState(0)

  // Read the session-only view preference after mount (avoids SSR/hydration
  // mismatch). Defaults to Workshop when absent or unrecognised.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(WORKSHOP_VIEW_STORAGE_KEY)
      if (isWorkshopViewMode(saved)) setViewMode(saved)
    } catch { /* sessionStorage unavailable — keep the Workshop default */ }
  }, [])

  const selectView = useCallback((mode: WorkshopViewMode) => {
    setViewMode(mode)
    try { sessionStorage.setItem(WORKSHOP_VIEW_STORAGE_KEY, mode) } catch { /* non-persistent is fine */ }
  }, [])

  const enterRoom = useCallback((id: WorkshopRoomId) => { setSelectedRoomId(id); setRoomItemIndex(0) }, [])
  const backToMap = useCallback(() => { setSelectedRoomId(null); setRoomItemIndex(0) }, [])
  const stepRoom = useCallback((delta: number) => { setRoomItemIndex((i) => i + delta) }, [])

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
        // The 41.12 mutation response carries the new review_state but NOT the
        // review_events trace. Re-read through the existing read-only 41.14 read
        // path (GET list, current filters preserved) and merge the fresh trace
        // into just the acted row, so the new event appears immediately without
        // a manual reload. Read-only: no new route, no new mutation, best-effort
        // (a failed re-read leaves the successful action intact, trace pending).
        try {
          const traceRes = await fetch(buildUrl(filtersRef.current))
          if (traceRes.ok) {
            const traceData = (await traceRes.json()) as ApiResponse
            const fresh = (traceData.rows ?? []).find((r) => r.id === row.id)
            if (fresh) {
              setRows((prev) => prev.map((r) => (r.id === row.id
                ? { ...r, review_events: fresh.review_events ?? [] }
                : r)))
            }
          }
        } catch { /* trace refresh is best-effort; the action already succeeded */ }
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

  // Phase 42.2.1 — approve the delegated extraction retry. One Tara click → the
  // governed output-scoped route creates+approves a work order, retries
  // extraction for the one file, and records the append-only apply audit. The
  // Apply trace (before/after) is shown from the response.
  const onDelegate = useCallback(async (row: HelperOutputRow) => {
    if (delegateInFlightRef.current) return
    delegateInFlightRef.current = true
    setDelegatingId(row.id)
    try {
      const res = await fetch(`/api/helpers/outputs/${row.id}/delegate/retry-extraction`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.status === 200 && data?.ok) {
        setDelegateResults((m) => ({ ...m, [row.id]: { workOrderId: data.work_order.id, status: 'applied', before: data.apply?.before, after: data.apply?.after } }))
      } else {
        setDelegateResults((m) => ({ ...m, [row.id]: { workOrderId: data?.work_order_id ?? '', status: 'failed', error: data?.reason ?? data?.error ?? `HTTP ${res.status}` } }))
      }
    } catch {
      setDelegateResults((m) => ({ ...m, [row.id]: { workOrderId: '', status: 'failed', error: 'Network error' } }))
    } finally {
      delegateInFlightRef.current = false
      setDelegatingId(null)
    }
  }, [])

  // Roll back an applied retry — restores the recorded before-snapshot and
  // appends a rolled_back apply event (the reversibility proof).
  const onRollback = useCallback(async (row: HelperOutputRow, workOrderId: string) => {
    if (delegateInFlightRef.current) return
    delegateInFlightRef.current = true
    setDelegatingId(row.id)
    try {
      const res = await fetch(`/api/helpers/work-orders/${workOrderId}/rollback`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      setDelegateResults((m) => {
        const prev = m[row.id] ?? { workOrderId, status: 'applied' as const }
        if (res.status === 200 && data?.ok) return { ...m, [row.id]: { ...prev, status: 'rolled_back', after: data.rollback?.restored } }
        return { ...m, [row.id]: { ...prev, error: data?.reason ?? data?.error ?? `HTTP ${res.status}` } }
      })
    } catch {
      setDelegateResults((m) => ({ ...m, [row.id]: { ...(m[row.id] ?? { workOrderId, status: 'applied' as const }), error: 'Network error' } }))
    } finally {
      delegateInFlightRef.current = false
      setDelegatingId(null)
    }
  }, [])

  // Read-only queue ordering via the Phase 41.10 model. includeInactive keeps
  // every fetched row visible (deleted only arrive when the toggle requests
  // them) — nothing is hidden; the model only orders by queue_rank and labels
  // the bucket. No mutation, no review execution.
  const queue: ReviewQueue = useMemo(() => buildReviewQueue(rows, { includeInactive: true }), [rows])
  const rowById = useMemo(() => {
    const m = new Map<string, HelperOutputRow>()
    for (const r of rows) m.set(r.id, r)
    return m
  }, [rows])

  // Phase 41.15 — workshop map tiles + the entries that belong to the open room.
  // Both derive purely from the SAME queue the list uses; the map can never
  // disagree with the list or invent counts.
  const workshopTiles = useMemo(() => buildWorkshopMap(queue, rows), [queue, rows])
  // Active helper outputs = non-soft-deleted rows. Drives the empty-state
  // boundary clarification (Phase 41.16) — read-only count, no new data source.
  const activeHelperCount = useMemo(() => rows.filter((r) => !isSoftDeleted(r)).length, [rows])
  const roomEntries = useMemo(
    () => (selectedRoomId ? queue.entries.filter((e) => bucketInRoom(e.queue_bucket, selectedRoomId)) : []),
    [queue, selectedRoomId],
  )

  // Slice 2 — page-level reduced-motion gate for the map ↔ room corridor-zoom.
  const reduceMotion = useReducedMotion()

  const workshopMapView = (
    <>
      <WorkshopMap tiles={workshopTiles} onEnter={enterRoom} />
      {/* Empty-state boundary clarification (Phase 41.16). Shows only when there
          are no active helper outputs. Explanatory text only — no link/route/
          bridge/import. */}
      {!loading && activeHelperCount === 0 && (
        <p className="font-body text-[10px] text-text-muted/55 italic mt-6 max-w-2xl mx-auto text-center border border-house-border/25 rounded-lg bg-house-bg/15 px-4 py-3">
          {WORKSHOP_EMPTY_CLARIFICATION}
        </p>
      )}
    </>
  )

  const workshopRoomView = selectedRoomId ? (
    <WorkshopRoom
      roomId={selectedRoomId}
      entries={roomEntries}
      rowById={rowById}
      labels={labels}
      index={roomItemIndex}
      onBack={backToMap}
      onStep={stepRoom}
      onAction={onReviewAction}
      actingId={actingId}
      rowMessages={rowMessages}
      onDelegate={onDelegate}
      onRollback={onRollback}
      delegateResults={delegateResults}
      delegatingId={delegatingId}
    />
  ) : null

  return (
    <div className="flex flex-col min-h-full">
      {/* ── Header + boundary ───────────────────────────────────────── */}
      <div className="border-b border-house-border bg-house-surface px-4 py-4 md:px-6 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-light tracking-[0.15em] text-text-primary">
              {HELPER_REVIEW_TITLE.toUpperCase()}
            </h1>
            <p className="font-body text-xs text-text-muted mt-1 italic">{HELPER_REVIEW_SUBTITLE}</p>
          </div>
          {/* View toggle — Workshop (default) / List (fallback). Session-only. */}
          <div role="group" aria-label="Review view" className="flex items-center gap-0.5 rounded-lg border border-house-border/40 bg-house-bg/30 p-0.5 shrink-0">
            {(['workshop', 'list'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                onClick={() => selectView(mode)}
                className={`font-body text-[11px] px-3 py-1 rounded-md transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[#C97AA8]/60 ${
                  viewMode === mode
                    ? 'bg-house-border/30 text-text-primary/90'
                    : 'text-text-muted/60 hover:text-text-secondary/80'
                }`}
              >
                {WORKSHOP_VIEW_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>
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

      {/* ── Body — Workshop (default) or List (fallback) ────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 md:px-6">
        <div className="font-body text-[10px] text-text-muted/50 uppercase tracking-widest mb-3">
          {loading ? 'Loading…' : `${total} helper output${total !== 1 ? 's' : ''}`}
        </div>

        {viewMode === 'workshop' ? (
          /* ── Workshop ─ map ↔ room corridor-zoom (Slice 2) ─────────── */
          reduceMotion ? (
            selectedRoomId === null ? workshopMapView : workshopRoomView
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              {selectedRoomId === null ? (
                <motion.div
                  key="ws-map"
                  initial={MAP_STAGE_ANIM.initial}
                  animate={MAP_STAGE_ANIM.animate}
                  exit={MAP_STAGE_ANIM.exit}
                  transition={MAP_STAGE_ANIM.transition}
                >
                  {workshopMapView}
                </motion.div>
              ) : (
                <motion.div
                  key={`ws-room:${selectedRoomId}`}
                  initial={ROOM_STAGE_ANIM.initial}
                  animate={ROOM_STAGE_ANIM.animate}
                  exit={ROOM_STAGE_ANIM.exit}
                  transition={ROOM_STAGE_ANIM.transition}
                >
                  {workshopRoomView}
                </motion.div>
              )}
            </AnimatePresence>
          )
        ) : (
          /* ── List (fallback / emergency staircase) ────────────────── */
          !loading && rows.length === 0 ? (
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
                    onDelegate={onDelegate}
                    onRollback={onRollback}
                    delegateResult={delegateResults[e.id]}
                    isDelegating={delegatingId === e.id}
                  />
                )
              })}
            </div>
          )
        )}
      </div>
    </div>
  )
}
