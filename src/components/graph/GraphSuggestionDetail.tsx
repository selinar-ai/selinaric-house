'use client'

// Phase 37H.3 — Graph-Assisted Candidate Suggestion Detail Panel (Hydrated)
//
// Graph assistance explains evidence. Graph assistance does not create authority.
// Evidence explanation is not promotion. Provenance visibility is not Memory.
//
// This panel displays hydrated evidence with titles, labels, and warnings.
// No approve/promote controls. Dismiss only.

import type { HydratedGraphCandidateSuggestion } from '@/lib/graph/candidateSuggestionTypes'

interface Props {
  hydrated: HydratedGraphCandidateSuggestion
  onDismiss?: (id: string) => void
  dismissing?: boolean
  onClose: () => void
}

export default function GraphSuggestionDetail({ hydrated, onDismiss, dismissing, onClose }: Props) {
  const s = hydrated.suggestion
  const isMemory = s.candidate_type === 'memory_candidate'
  const t = hydrated.targetArchiveItem
  const infoWarnings = hydrated.warnings.filter(w => w.severity === 'info')
  const realWarnings = hydrated.warnings.filter(w => w.severity === 'warning')

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-text-secondary tracking-wide">Suggestion Detail</span>
        <button onClick={onClose} className="text-text-muted hover:text-text-secondary text-xs">✕</button>
      </div>

      {/* 1. Badges */}
      <div className="flex flex-wrap gap-1.5">
        <span className={`text-[9px] font-body px-1.5 py-0.5 rounded border ${
          isMemory ? 'border-blue-700/30 bg-blue-900/10 text-blue-300' : 'border-amber-700/30 bg-amber-900/10 text-amber-300'
        }`}>
          {isMemory ? 'Memory Suggestion' : 'Held Truth Suggestion'}
        </span>
        <span className={`text-[9px] font-body px-1.5 py-0.5 rounded border ${
          s.status === 'pending_review' ? 'border-yellow-700/30 bg-yellow-900/10 text-yellow-300' :
          s.status === 'dismissed' ? 'border-gray-700/30 bg-gray-900/10 text-gray-400' :
          'border-house-border bg-house-surface text-text-muted'
        }`}>
          {s.status.replace(/_/g, ' ')}
        </span>
        <span className="text-[9px] font-body px-1.5 py-0.5 rounded border border-red-700/20 bg-red-900/10 text-red-300/70">
          Not prompt eligible
        </span>
      </div>

      {/* 2. Authority warning */}
      <div className="text-[10px] text-text-muted/70 italic font-body border border-amber-700/20 bg-amber-900/10 px-2.5 py-1.5 rounded leading-relaxed">
        Graph-assisted suggestion only. Not Memory. Not Held Truth.
        Memory Review / Held Truth governance still required.
      </div>

      {/* 3. Label + Summary */}
      <div>
        <div className="text-xs text-text-secondary font-body">{s.proposed_label}</div>
        {s.proposed_summary && (
          <div className="text-[11px] text-text-muted mt-1 leading-relaxed">{s.proposed_summary}</div>
        )}
      </div>

      {/* 4. Target */}
      {isMemory && t && (
        <div className="bg-house-bg border border-house-border/50 rounded px-2.5 py-1.5">
          <div className="text-text-muted uppercase tracking-wider text-[9px] mb-1 font-mono">Target Archive Item</div>
          <div className={`text-[11px] font-body ${t.missing ? 'text-amber-300/70 italic' : 'text-text-secondary'}`}>
            {t.title}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {t.statusAtSuggestion && (
              <span className="text-[9px] text-text-muted bg-house-surface px-1 rounded">
                at suggestion: {t.statusAtSuggestion}
              </span>
            )}
            {t.currentCanonicalStatus && (
              <span className="text-[9px] text-text-muted bg-house-surface px-1 rounded">
                now: {t.currentCanonicalStatus}
              </span>
            )}
            {t.statusChanged && (
              <span className="text-[9px] text-amber-300 bg-amber-900/20 px-1 rounded">changed</span>
            )}
          </div>
        </div>
      )}
      {!isMemory && (
        <div className="text-[10px] font-body text-text-muted">
          <span className="opacity-60">Target presence:</span>{' '}
          <span className={s.target_presence_id === 'ari' ? 'text-ari-primary' : 'text-eli-primary'}>
            {s.target_presence_id === 'ari' ? 'Ari' : 'Eli'}
          </span>
        </div>
      )}

      {/* Proposed truth text (Held Truth only) */}
      {!isMemory && s.proposed_truth_text && (
        <div className="text-[11px] text-text-secondary font-body border-l-2 border-amber-700/30 pl-2 italic">
          &ldquo;{s.proposed_truth_text}&rdquo;
        </div>
      )}

      {/* 5. Reason */}
      <div>
        <div className="text-text-muted uppercase tracking-wider text-[9px] mb-1 font-mono">Reason</div>
        <div className="text-[11px] text-text-muted leading-relaxed font-body">{s.reason_for_candidate}</div>
      </div>

      {/* 6. Evidence strength */}
      <div className="text-[10px] font-body text-text-muted">
        <span className="opacity-60">Evidence strength:</span>{' '}
        <span className={`capitalize ${
          s.evidence_strength === 'strong' ? 'text-emerald-300' :
          s.evidence_strength === 'weak' ? 'text-amber-300' : 'text-text-secondary'
        }`}>{s.evidence_strength}</span>
      </div>

      {/* 7. Limits / uncertainties */}
      {s.limits_or_uncertainties && (
        <div>
          <div className="text-text-muted uppercase tracking-wider text-[9px] mb-1 font-mono">Limits / Uncertainties</div>
          <div className="text-[11px] text-amber-300/70 leading-relaxed font-body">{s.limits_or_uncertainties}</div>
        </div>
      )}

      {/* 8. Archive Evidence */}
      {hydrated.hydratedArchiveSources.length > 0 && (
        <div>
          <div className="text-text-muted uppercase tracking-wider text-[9px] mb-1 font-mono">
            Archive Evidence (graph-assisted)
          </div>
          <div className="space-y-1.5">
            {hydrated.hydratedArchiveSources.map((src, i) => (
              <div key={i} className={`bg-house-bg border rounded px-2.5 py-1.5 text-[10px] font-body ${
                src.missing ? 'border-amber-700/30' : 'border-house-border/50'
              }`}>
                <div className={`text-[11px] ${src.missing ? 'text-amber-300/70 italic' : 'text-text-secondary'}`}>
                  {src.title}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <span className="text-[9px] bg-house-surface px-1 rounded text-text-muted"
                    title={src.evidenceRoleExplanation}>
                    {src.evidenceRoleLabel}
                  </span>
                  <span className="text-[9px] bg-house-surface px-1 rounded text-text-muted">
                    snapshot: {src.canonicalStatusSnapshot}
                  </span>
                  {src.currentCanonicalStatus && (
                    <span className="text-[9px] bg-house-surface px-1 rounded text-text-muted">
                      now: {src.currentCanonicalStatus}
                    </span>
                  )}
                  {src.statusChanged && (
                    <span className="text-[9px] text-amber-300 bg-amber-900/20 px-1 rounded">changed</span>
                  )}
                  <span className={`text-[9px] px-1 rounded ${
                    src.usedForWeighting ? 'text-purple-300/70 bg-purple-900/10' : 'text-text-muted/50 bg-house-surface'
                  }`} title={src.weightingExplanation}>
                    {src.usedForWeighting ? 'weighted' : 'not weighted'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 9. Graph Evidence */}
      {(hydrated.hydratedProposals.length > 0 || hydrated.hydratedLegacyNodes.length > 0 || hydrated.hydratedLegacyEdges.length > 0) && (
        <div>
          <div className="text-text-muted uppercase tracking-wider text-[9px] mb-1 font-mono">
            Graph Structure Evidence
          </div>
          <div className="text-[9px] text-text-muted/50 italic font-body mb-1">
            Approved graph structure may support review, but graph structure is not Memory authority.
          </div>

          {/* Proposals */}
          {hydrated.hydratedProposals.length > 0 && (
            <div className="space-y-1 mb-1.5">
              {hydrated.hydratedProposals.map((p, i) => (
                <div key={i} className={`bg-house-bg border rounded px-2 py-1 text-[10px] font-body ${
                  p.missing ? 'border-amber-700/30' : 'border-house-border/50'
                }`}>
                  <div className={`text-[11px] ${p.missing ? 'text-amber-300/70 italic' : 'text-text-secondary'}`}>
                    {p.label}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    <span className="text-[9px] bg-house-surface px-1 rounded text-text-muted">{p.proposalType}</span>
                    {p.nodeType && <span className="text-[9px] bg-house-surface px-1 rounded text-text-muted">{p.nodeType}</span>}
                    {p.edgeType && <span className="text-[9px] bg-house-surface px-1 rounded text-text-muted">{p.edgeType}</span>}
                    <span className="text-[9px] bg-house-surface px-1 rounded text-text-muted">{p.status}</span>
                    {p.authorityStatus && <span className="text-[9px] bg-house-surface px-1 rounded text-text-muted">{p.authorityStatus}</span>}
                  </div>
                  {p.summary && (
                    <div className="text-[10px] text-text-muted/60 mt-0.5 line-clamp-2">{p.summary}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Legacy nodes */}
          {hydrated.hydratedLegacyNodes.length > 0 && (
            <div className="space-y-1 mb-1.5">
              {hydrated.hydratedLegacyNodes.map((n, i) => (
                <div key={i} className={`bg-house-bg border rounded px-2 py-1 text-[10px] font-body ${
                  n.missing ? 'border-amber-700/30' : 'border-house-border/50'
                }`}>
                  <div className={`text-[11px] ${n.missing ? 'text-amber-300/70 italic' : 'text-text-secondary'}`}>
                    {n.label}
                  </div>
                  <div className="flex gap-1.5 mt-0.5">
                    <span className="text-[9px] bg-house-surface px-1 rounded text-text-muted">node: {n.nodeType}</span>
                    <span className="text-[9px] bg-house-surface px-1 rounded text-text-muted">{n.approvalStatus}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Legacy edges */}
          {hydrated.hydratedLegacyEdges.length > 0 && (
            <div className="space-y-1">
              {hydrated.hydratedLegacyEdges.map((e, i) => (
                <div key={i} className={`bg-house-bg border rounded px-2 py-1 text-[10px] font-body ${
                  e.missing ? 'border-amber-700/30' : 'border-house-border/50'
                }`}>
                  <div className={`text-[11px] ${e.missing ? 'text-amber-300/70 italic' : 'text-text-secondary'}`}>
                    edge: {e.edgeType}
                  </div>
                  {e.description && <div className="text-[10px] text-text-muted/60 mt-0.5">{e.description}</div>}
                  <span className="text-[9px] bg-house-surface px-1 rounded text-text-muted">{e.approvalStatus}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 10. Deduplicated evidence sources */}
      {hydrated.hydratedDeduplicatedSources.length > 0 && (
        <div>
          <div className="text-text-muted uppercase tracking-wider text-[9px] mb-1 font-mono">
            Deduplicated Evidence Sources ({hydrated.hydratedDeduplicatedSources.length})
          </div>
          <div className="space-y-0.5">
            {hydrated.hydratedDeduplicatedSources.map((d, i) => (
              <div key={i} className={`text-[10px] font-body ${d.missing ? 'text-amber-300/70 italic' : 'text-text-muted'}`}>
                {d.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 11. Governance context */}
      {s.governance_context && Object.keys(s.governance_context).length > 0 && (
        <details className="text-[10px]">
          <summary className="text-text-muted uppercase tracking-wider font-mono cursor-pointer">
            Governance Context — Informational only. Not evidence.
          </summary>
          <pre className="mt-1 text-[9px] text-text-muted/60 bg-house-bg border border-house-border/30 rounded p-2 overflow-x-auto">
            {JSON.stringify(s.governance_context, null, 2)}
          </pre>
        </details>
      )}

      {/* 12. Warnings */}
      {realWarnings.length > 0 && (
        <div>
          <div className="text-text-muted uppercase tracking-wider text-[9px] mb-1 font-mono">Warnings</div>
          <div className="space-y-0.5">
            {realWarnings.map((w, i) => (
              <div key={i} className="text-[10px] text-amber-300/80 font-body">
                {w.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 13. Events / audit trail */}
      {hydrated.events.length > 0 && (
        <details className="text-[10px]">
          <summary className="text-text-muted uppercase tracking-wider font-mono cursor-pointer">
            Audit Trail ({hydrated.events.length})
          </summary>
          <div className="mt-1 space-y-1">
            {hydrated.events.map((evt, i) => (
              <div key={i} className="text-[9px] text-text-muted/60 font-body bg-house-bg border border-house-border/20 rounded px-2 py-1">
                <span className="text-text-muted">{evt.event_type}</span>
                {evt.reason && <span className="ml-1">— {evt.reason}</span>}
                <span className="ml-1 opacity-50">{evt.actor} · {new Date(evt.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* 14. Metadata */}
      <div className="text-[9px] text-text-muted/50 font-body space-y-0.5">
        <div>Created by: {s.created_by} · {new Date(s.created_at).toLocaleString()}</div>
        {s.reviewed_by && <div>Reviewed by: {s.reviewed_by} · {s.reviewed_at ? new Date(s.reviewed_at).toLocaleString() : ''}</div>}
      </div>

      {/* 15. Dismiss — only for pending_review */}
      {s.status === 'pending_review' && onDismiss && (
        <div className="pt-1">
          <button
            onClick={() => onDismiss(s.id)}
            disabled={dismissing}
            className="font-body text-[10px] px-3 py-1.5 border border-gray-600/50 text-gray-400 hover:text-gray-300 hover:bg-gray-900/20 rounded transition-all disabled:opacity-40"
          >
            {dismissing ? 'Dismissing...' : 'Dismiss Suggestion'}
          </button>
        </div>
      )}
    </div>
  )
}
