'use client'

// Phase 38.2 — Deterministic Reasoning Panel
//
// Reasoning explains evidence. Reasoning does not create authority.
// A reasoning-supported candidate is still only a candidate.
//
// This panel is read-only. It calls buildReasoningBaseline() on the
// existing hydrated DTO — no new data fetching, no writes, no mutations.
// No LLM. No scoring. No ranking. No authority movement.

import { buildReasoningBaseline } from '@/lib/graph/reasoningBaseline'
import { REASONING_CATEGORY_LABELS, EVIDENCE_CONDITION_LABELS } from '@/lib/graph/reasoningTypes'
import type { HydratedGraphCandidateSuggestion } from '@/lib/graph/candidateSuggestionTypes'

interface Props {
  hydrated: HydratedGraphCandidateSuggestion
}

// ─── Evidence condition styling ────────────────────────────────────────────

function conditionStyle(cond: string): string {
  switch (cond) {
    case 'directly_supported':       return 'text-emerald-300/80'
    case 'partially_supported':      return 'text-text-secondary'
    case 'graph_supported_only':     return 'text-amber-300/80'
    case 'conflicting_or_unresolved':return 'text-amber-300/80'
    case 'missing_primary':
    case 'insufficient':
    case 'inferred_only':            return 'text-red-300/60'
    default:                         return 'text-text-muted'
  }
}

// ─── Category display filter — which categories to show as chips ───────────

const SHOW_CATEGORIES = new Set([
  'direct_archive_support',
  'indirect_archive_support',
  'graph_support_only',
  'mixed_archive_and_graph',
  'missing_primary_evidence',
  'missing_tara_authored',
  'status_changed_since_suggestion',
  'candidate_type_mismatch',
  'deleted_or_missing_source',
  'insufficient_packet',
  'dismissed_suggestion',
])

// ─── Panel ─────────────────────────────────────────────────────────────────

export default function DeterministicReasoningPanel({ hydrated }: Props) {
  const baseline = buildReasoningBaseline(hydrated)
  const s = hydrated.suggestion
  const { evidenceCondition, packetSufficient, hasStatusDrift, evidenceProfile, categories, insufficiencyReasons } = baseline

  const isGraphOnly = categories.includes('graph_support_only')
  const isInsufficient = !packetSufficient || categories.includes('insufficient_packet')
  const isDismissed = s.status === 'dismissed'

  const visibleCategories = categories.filter(c => SHOW_CATEGORIES.has(c))

  // Do-not-conclude additions
  const doNotConclude = [
    'Do not conclude this is Memory.',
    'Do not conclude this is Held Truth.',
    'Do not conclude this is prompt truth.',
    'Do not conclude graph support is authority.',
    'Do not conclude reasoning approval has occurred.',
  ]
  if (isGraphOnly) doNotConclude.push('Do not conclude the graph confirms the claim.')
  if (hasStatusDrift) doNotConclude.push('Do not rely on stale suggestion-time status as authority.')
  if (isInsufficient) doNotConclude.push('Do not infer around missing evidence.')

  return (
    <div className="border border-house-border/30 rounded bg-house-bg/20 text-[10px] font-body">
      {/* Panel header */}
      <div className="px-2.5 py-2 border-b border-house-border/20">
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-3 bg-text-muted/30 rounded-full" />
          <span className="font-mono text-[9px] text-text-muted/60 uppercase tracking-wider">
            Deterministic Reasoning
          </span>
        </div>
        <div className="text-[9px] text-text-muted/40 italic mt-0.5">
          Evidence condition and boundary checks from structured data only.
        </div>
      </div>

      {/* Mandatory boundary notice */}
      <div className="px-2.5 py-1.5 border-b border-house-border/15 text-[9px] text-amber-300/50 italic">
        Reasoning aid only. Not Memory. Not Held Truth. Not prompt eligible.
        Review required before authority changes.
      </div>

      <div className="px-2.5 py-2 space-y-2.5">

        {/* 1. Evidence condition */}
        <div>
          <div className="text-[8px] text-text-muted/40 font-mono uppercase tracking-wider mb-0.5">
            Evidence Condition
          </div>
          <span className={`text-[10px] font-body ${conditionStyle(evidenceCondition)}`}>
            {EVIDENCE_CONDITION_LABELS[evidenceCondition]}
          </span>
        </div>

        {/* 2. Evidence profile */}
        <div>
          <div className="text-[8px] text-text-muted/40 font-mono uppercase tracking-wider mb-0.5">
            Evidence Profile
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            <Row label="Archive sources" value={evidenceProfile.totalArchiveSources} />
            <Row label="Weighted archive" value={evidenceProfile.weightedArchiveSources} />
            <Row label="Graph sources" value={evidenceProfile.totalGraphSources} />
            <Row label="Missing sources" value={evidenceProfile.hasMissingEvidence ? '⚠' : '—'} warn={evidenceProfile.hasMissingEvidence} />
            <Row label="Status drift" value={hasStatusDrift ? '⚠ Yes' : 'No'} warn={hasStatusDrift} />
          </div>
        </div>

        {/* 3. Candidate state */}
        <div>
          <div className="text-[8px] text-text-muted/40 font-mono uppercase tracking-wider mb-0.5">
            Candidate State
          </div>
          <div className="space-y-0.5">
            <Row label="Type" value={s.candidate_type === 'memory_candidate' ? 'Memory suggestion' : 'Held Truth suggestion'} />
            <Row label="Status" value={s.status.replace(/_/g, ' ')} />
            <Row label="Prompt eligible" value="No (by design)" />
            <Row label="Non-authoritative" value="Yes" />
            {!isDismissed && <Row label="Review required" value="Yes" warn />}
          </div>
        </div>

        {/* 4. Active categories */}
        {visibleCategories.length > 0 && (
          <div>
            <div className="text-[8px] text-text-muted/40 font-mono uppercase tracking-wider mb-1">
              Evidence Categories
            </div>
            <div className="flex flex-wrap gap-1">
              {visibleCategories.map(cat => (
                <span
                  key={cat}
                  className={`text-[8px] px-1 py-px rounded border ${
                    cat === 'insufficient_packet' || cat === 'candidate_type_mismatch'
                      ? 'border-red-700/30 text-red-300/60 bg-red-900/10'
                      : cat === 'graph_support_only' || cat === 'status_changed_since_suggestion' || cat === 'deleted_or_missing_source'
                      ? 'border-amber-700/30 text-amber-300/60 bg-amber-900/10'
                      : 'border-house-border/40 text-text-muted/50 bg-house-surface/50'
                  }`}
                >
                  {REASONING_CATEGORY_LABELS[cat]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 5. Graph-only boundary warning */}
        {isGraphOnly && (
          <div className="border-l-2 border-amber-700/30 pl-2 py-0.5 text-[9px] text-amber-300/60 italic">
            Graph-only support. Graph structure supports a relationship, not Memory or Held Truth authority.
          </div>
        )}

        {/* 6. Status drift warning */}
        {hasStatusDrift && (
          <div className="border-l-2 border-amber-700/30 pl-2 py-0.5 text-[9px] text-amber-300/60 italic">
            Status changed since suggestion. Current governed status overrides suggestion-time status.
          </div>
        )}

        {/* 7. Insufficient packet stop */}
        {isInsufficient && (
          <div className="border border-red-700/20 bg-red-900/10 rounded px-2 py-1.5">
            <div className="text-[9px] text-red-300/70 font-body">
              Insufficient evidence packet — reasoning not available.
            </div>
            {isGraphOnly && !packetSufficient && (
              <div className="text-[9px] text-amber-300/50 mt-0.5 italic">
                Graph-only support. Graph structure supports a relationship, not Memory or Held Truth authority.
              </div>
            )}
            {insufficiencyReasons.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {insufficiencyReasons.map((r, i) => (
                  <div key={i} className="text-[8px] text-text-muted/40">— {r}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 8. Do not conclude */}
        <details>
          <summary className="text-[8px] text-text-muted/40 font-mono uppercase tracking-wider cursor-pointer hover:text-text-muted/60 transition-colors">
            Do Not Conclude
          </summary>
          <div className="mt-1 space-y-0.5 pl-1">
            {doNotConclude.map((item, i) => (
              <div key={i} className="text-[9px] text-text-muted/40 font-body">
                {item}
              </div>
            ))}
          </div>
        </details>

      </div>
    </div>
  )
}

// ─── Row helper ────────────────────────────────────────────────────────────

function Row({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[9px] text-text-muted/40">{label}:</span>
      <span className={`text-[9px] ${warn ? 'text-amber-300/70' : 'text-text-muted/60'}`}>{value}</span>
    </div>
  )
}
