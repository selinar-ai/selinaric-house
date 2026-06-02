'use client'

// Phase 38.3.3 — Manual LLM-Assisted Reasoning Draft Panel
//
// Reasoning explains evidence. Reasoning does not create authority.
// A reasoning-supported candidate is still only a candidate.
//
// Read-only. Manual generation only. No storage. No audit. No routing.
// No approve/promote. No Memory. No Held Truth. No prompt injection.
// No provider calls from client — server handles all LLM interaction.

import { useState } from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────

interface LLMDraft {
  evidence_summary: string
  directly_supported: string[]
  graph_supported: string[]
  inferred_only: string[]
  missing_or_weak: string[]
  authority_boundary: string
  possible_review_route: null
  do_not_conclude: string[]
  uncertainty_note: string | null
}

interface DraftMeta {
  stored: false
  evidence: false
  authority_changed: false
  possible_review_route: null
  model?: string
}

type DraftState =
  | { phase: 'idle' }
  | { phase: 'generating' }
  | { phase: 'success'; draft: LLMDraft; meta: DraftMeta }
  | { phase: 'error'; code: string; message: string }

interface Props {
  suggestionId: string
  suggestionStatus: string
}

// ─── Exported pure functions (testable without DOM) ────────────────────────

export function mapFailureMessage(code: string | undefined): string {
  switch (code) {
    case 'UNAUTHENTICATED':
      return 'Authentication required. Please log back into the House and try again.'
    case 'INSUFFICIENT_PACKET':
      return 'Insufficient evidence packet — reasoning draft not available.'
    case 'LLM_UNAVAILABLE':
      return 'LLM reasoning draft is temporarily unavailable.'
    case 'LLM_OUTPUT_PARSE_FAILED':
      return 'The model response could not be parsed safely. No draft was shown.'
    case 'LLM_OUTPUT_VALIDATION_FAILED':
      return 'The generated draft failed safety validation. No draft was shown.'
    case 'HYDRATION_FAILED':
      return 'Suggestion could not be found or hydrated.'
    case 'CLIENT_SAFETY_FAILED':
      return 'The reasoning draft response failed client safety checks. No draft was shown.'
    default:
      return 'Reasoning draft could not be generated safely.'
  }
}

export function clientSafetyGuard(
  data: unknown
): { ok: boolean; reason?: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'response is not an object' }
  }
  const d = data as Record<string, unknown>

  if (d.ok !== true) return { ok: false, reason: 'ok is not true' }
  if (!d.draft || typeof d.draft !== 'object' || Array.isArray(d.draft)) {
    return { ok: false, reason: 'draft missing or invalid' }
  }
  if (!d.meta || typeof d.meta !== 'object' || Array.isArray(d.meta)) {
    return { ok: false, reason: 'meta missing or invalid' }
  }

  const draft = d.draft as Record<string, unknown>
  const meta = d.meta as Record<string, unknown>

  if (draft.possible_review_route !== null) {
    return { ok: false, reason: 'possible_review_route is not null' }
  }
  if (meta.stored !== false) {
    return { ok: false, reason: 'meta.stored is not false' }
  }
  if (meta.evidence !== false) {
    return { ok: false, reason: 'meta.evidence is not false' }
  }
  if (meta.authority_changed !== false) {
    return { ok: false, reason: 'meta.authority_changed is not false' }
  }
  if (typeof draft.authority_boundary !== 'string' || !draft.authority_boundary.trim()) {
    return { ok: false, reason: 'authority_boundary missing' }
  }
  if (!draft.authority_boundary.includes('Does not change authority')) {
    return { ok: false, reason: 'authority_boundary missing mandatory text' }
  }

  return { ok: true }
}

// ─── Section helpers ───────────────────────────────────────────────────────

function DraftList({ items, emptyText }: { items: string[]; emptyText?: string }) {
  if (items.length === 0) {
    if (!emptyText) return null
    return <div className="text-[9px] text-text-muted/40 italic">{emptyText}</div>
  }
  return (
    <ul className="space-y-0.5 pl-0">
      {items.map((item, i) => (
        <li key={i} className="text-[9px] text-text-muted/60 font-body">
          — {item}
        </li>
      ))}
    </ul>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[8px] text-text-muted/40 font-mono uppercase tracking-wider mb-0.5">
      {children}
    </div>
  )
}

// ─── Panel ─────────────────────────────────────────────────────────────────

export default function LLMReasoningDraftPanel({ suggestionId, suggestionStatus }: Props) {
  const [state, setState] = useState<DraftState>({ phase: 'idle' })
  const isDismissed = suggestionStatus === 'dismissed'

  async function handleGenerate() {
    setState({ phase: 'generating' })
    try {
      const res = await fetch(
        `/api/graph-candidate-suggestions/${suggestionId}/llm-reasoning-draft`,
        { method: 'POST', credentials: 'same-origin' }
      )

      let data: unknown
      try {
        data = await res.json()
      } catch {
        setState({ phase: 'error', code: 'PARSE_ERROR', message: mapFailureMessage('LLM_OUTPUT_PARSE_FAILED') })
        return
      }

      if (res.status === 401) {
        setState({ phase: 'error', code: 'UNAUTHENTICATED', message: mapFailureMessage('UNAUTHENTICATED') })
        return
      }

      if (!res.ok) {
        const d = data as Record<string, unknown> | null
        const code = typeof d?.code === 'string' ? d.code : undefined
        setState({ phase: 'error', code: code ?? 'UNKNOWN', message: mapFailureMessage(code) })
        return
      }

      const guard = clientSafetyGuard(data)
      if (!guard.ok) {
        setState({ phase: 'error', code: 'CLIENT_SAFETY_FAILED', message: mapFailureMessage('CLIENT_SAFETY_FAILED') })
        return
      }

      const d = data as { draft: LLMDraft; meta: DraftMeta }
      setState({ phase: 'success', draft: d.draft, meta: d.meta })
    } catch {
      setState({ phase: 'error', code: 'FETCH_FAILED', message: mapFailureMessage(undefined) })
    }
  }

  return (
    <div className="border border-house-border/25 rounded bg-house-bg/15 text-[10px] font-body">
      {/* Panel header */}
      <div className="px-2.5 py-2 border-b border-house-border/20">
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-3 bg-text-muted/20 rounded-full" />
          <span className="font-mono text-[9px] text-text-muted/50 uppercase tracking-wider">
            LLM-Assisted Reasoning Draft
          </span>
        </div>
        <div className="text-[9px] text-text-muted/35 italic mt-0.5">
          Optional draft explanation generated from the governed evidence packet.
        </div>
      </div>

      {/* Mandatory boundary — always visible */}
      <div className="px-2.5 py-1.5 border-b border-house-border/15 text-[9px] text-amber-300/45 italic">
        Draft explanation only. Not Memory. Not Held Truth. Not prompt eligible. Does not change authority.
      </div>

      <div className="px-2.5 py-2 space-y-2">
        {/* Dismissed note */}
        {isDismissed && (
          <div className="text-[9px] text-gray-400/60 italic border-l border-gray-600/20 pl-2">
            This suggestion is dismissed. Any generated draft is historical/contextual only and does not reopen review.
          </div>
        )}

        {/* Idle / ready state */}
        {state.phase === 'idle' && (
          <button
            onClick={handleGenerate}
            className="font-body text-[10px] px-2.5 py-1 border border-house-border/40 text-text-muted/60 hover:text-text-muted hover:border-house-border/70 rounded transition-all"
          >
            Generate draft
          </button>
        )}

        {/* Generating */}
        {state.phase === 'generating' && (
          <div className="flex items-center gap-1.5">
            <div className="inline-flex gap-0.5">
              <span className="w-1 h-1 bg-text-muted/30 rounded-full animate-pulse" />
              <span className="w-1 h-1 bg-text-muted/30 rounded-full animate-pulse [animation-delay:150ms]" />
              <span className="w-1 h-1 bg-text-muted/30 rounded-full animate-pulse [animation-delay:300ms]" />
            </div>
            <span className="text-[9px] text-text-muted/40">Generating draft…</span>
          </div>
        )}

        {/* Error state */}
        {state.phase === 'error' && (
          <div className="space-y-1.5">
            <div className="text-[9px] text-red-300/50 font-body border-l border-red-700/20 pl-2">
              {state.message}
            </div>
            <button
              onClick={handleGenerate}
              className="font-body text-[9px] px-2 py-0.5 border border-house-border/30 text-text-muted/40 hover:text-text-muted/60 rounded transition-all"
            >
              Try again
            </button>
          </div>
        )}

        {/* Success — validated draft sections */}
        {state.phase === 'success' && (
          <div className="space-y-2">
            {/* Evidence Summary */}
            {state.draft.evidence_summary && (
              <div>
                <SectionLabel>Evidence summary</SectionLabel>
                <div className="text-[9px] text-text-muted/60 leading-relaxed">
                  {state.draft.evidence_summary}
                </div>
              </div>
            )}

            {/* Directly Supported */}
            {(state.draft.directly_supported.length > 0) && (
              <div>
                <SectionLabel>Directly supported</SectionLabel>
                <DraftList items={state.draft.directly_supported} emptyText="No direct support listed in the generated draft." />
              </div>
            )}
            {state.draft.directly_supported.length === 0 && (
              <div>
                <SectionLabel>Directly supported</SectionLabel>
                <div className="text-[9px] text-text-muted/40 italic">No direct support listed in the generated draft.</div>
              </div>
            )}

            {/* Graph-Supported */}
            {state.draft.graph_supported.length > 0 && (
              <div>
                <SectionLabel>Graph-supported</SectionLabel>
                <DraftList items={state.draft.graph_supported} />
                <div className="text-[8px] text-text-muted/30 italic mt-0.5">
                  Graph support describes structure only. It is not Memory or Held Truth authority.
                </div>
              </div>
            )}

            {/* Inferred Only */}
            {state.draft.inferred_only.length > 0 && (
              <div>
                <SectionLabel>Inferred only</SectionLabel>
                <DraftList items={state.draft.inferred_only} />
                <div className="text-[8px] text-text-muted/30 italic mt-0.5">
                  Inference is not confirmed evidence.
                </div>
              </div>
            )}

            {/* Missing or Weak */}
            {state.draft.missing_or_weak.length > 0 && (
              <div>
                <SectionLabel>Missing or weak evidence</SectionLabel>
                <DraftList items={state.draft.missing_or_weak} />
              </div>
            )}

            {/* Authority Boundary — always shown */}
            <div>
              <SectionLabel>Authority boundary</SectionLabel>
              <div className="text-[9px] text-amber-300/50 italic">
                {state.draft.authority_boundary}
              </div>
            </div>

            {/* Do Not Conclude — collapsible */}
            {state.draft.do_not_conclude.length > 0 && (
              <details>
                <summary className="text-[8px] text-text-muted/40 font-mono uppercase tracking-wider cursor-pointer hover:text-text-muted/60 transition-colors">
                  Do not conclude ({state.draft.do_not_conclude.length})
                </summary>
                <div className="mt-0.5 space-y-0.5 pl-1">
                  {state.draft.do_not_conclude.map((item, i) => (
                    <div key={i} className="text-[9px] text-text-muted/40">{item}</div>
                  ))}
                </div>
              </details>
            )}

            {/* Uncertainty Note — only if present */}
            {state.draft.uncertainty_note && (
              <div>
                <SectionLabel>Uncertainty note</SectionLabel>
                <div className="text-[9px] text-amber-300/40 italic">
                  {state.draft.uncertainty_note}
                </div>
              </div>
            )}

            {/* Model attribution + regenerate */}
            <div className="flex items-center justify-between pt-1">
              {state.meta.model && (
                <div className="text-[8px] text-text-muted/25">
                  {state.meta.model}
                </div>
              )}
              <button
                onClick={handleGenerate}
                className="font-body text-[9px] px-2 py-0.5 border border-house-border/25 text-text-muted/35 hover:text-text-muted/55 rounded transition-all ml-auto"
              >
                Regenerate draft
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
