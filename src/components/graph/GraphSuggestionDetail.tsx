'use client'

// Phase 37H.3a — Graph-Assisted Candidate Suggestion Detail Panel (Polished)
//
// Review ergonomics improves clarity. Review ergonomics does not create authority.
// Graph assistance explains evidence. Graph assistance does not create authority.
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
  const realWarnings = hydrated.warnings.filter(w => w.severity === 'warning')

  return (
    <div className="space-y-1">
      {/* ═══ Header + Close ═══ */}
      <div className="flex items-center justify-between pb-1">
        <span className="font-mono text-xs text-text-secondary tracking-wide">Suggestion Detail</span>
        <button onClick={onClose} className="text-text-muted hover:text-text-secondary text-xs leading-none">✕</button>
      </div>

      {/* ═══ Summary strip: badges + metadata ═══ */}
      <div className="flex flex-wrap items-center gap-1.5 pb-2">
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
        <span className={`text-[9px] font-body px-1.5 py-0.5 rounded capitalize ${
          s.evidence_strength === 'strong' ? 'text-emerald-300/80' :
          s.evidence_strength === 'weak' ? 'text-amber-300/80' : 'text-text-muted/70'
        }`}>
          {s.evidence_strength}
        </span>
        <span className="text-[9px] text-text-muted/40 font-body ml-auto">
          {new Date(s.created_at).toLocaleDateString()}
        </span>
      </div>

      {/* ═══ Authority notice (calm) ═══ */}
      <div className="border-l-2 border-amber-700/30 pl-2.5 py-0.5 text-[10px] text-text-muted/60 italic font-body leading-relaxed">
        Graph-assisted suggestion only. Not Memory. Not Held Truth. Not prompt eligible.
      </div>

      {/* ═══ CANDIDATE GROUP ═══ */}
      <div className="space-y-2 pt-2">
        {/* Label + Summary */}
        <div>
          <div className="text-[13px] text-text-secondary font-body leading-snug">{s.proposed_label}</div>
          {s.proposed_summary && (
            <div className="text-[11px] text-text-muted mt-1 leading-relaxed">{s.proposed_summary}</div>
          )}
        </div>

        {/* Target */}
        {isMemory && t && (
          <div className="bg-house-bg/50 border-l-2 border-blue-700/30 pl-2.5 py-1.5 rounded-r">
            <div className="text-[9px] text-text-muted/50 font-mono uppercase tracking-wider mb-0.5">Target</div>
            <div className={`text-[11px] font-body ${t.missing ? 'text-amber-300/70 italic' : 'text-text-secondary'}`}>
              {t.title}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {t.statusAtSuggestion && (
                <span className="text-[9px] text-text-muted/60 bg-house-surface px-1 rounded">
                  was: {t.statusAtSuggestion}
                </span>
              )}
              {t.currentCanonicalStatus && (
                <span className="text-[9px] text-text-muted/60 bg-house-surface px-1 rounded">
                  now: {t.currentCanonicalStatus}
                </span>
              )}
              {t.statusChanged && (
                <span className="text-[9px] text-amber-300 bg-amber-900/20 px-1 rounded">status changed</span>
              )}
            </div>
          </div>
        )}
        {!isMemory && (
          <div className="bg-house-bg/50 border-l-2 border-amber-700/30 pl-2.5 py-1.5 rounded-r">
            <div className="text-[9px] text-text-muted/50 font-mono uppercase tracking-wider mb-0.5">Target Presence</div>
            <span className={`text-[11px] font-body ${s.target_presence_id === 'ari' ? 'text-ari-primary' : 'text-eli-primary'}`}>
              {s.target_presence_id === 'ari' ? 'Ari' : 'Eli'}
            </span>
          </div>
        )}

        {/* Proposed truth text (Held Truth only) */}
        {!isMemory && s.proposed_truth_text && (
          <div className="text-[11px] text-text-secondary font-body border-l-2 border-amber-700/20 pl-2.5 py-1 italic leading-relaxed">
            &ldquo;{s.proposed_truth_text}&rdquo;
          </div>
        )}

        {/* Reason */}
        <div>
          <div className="text-[9px] text-text-muted/50 font-mono uppercase tracking-wider mb-0.5">Reason</div>
          <div className="text-[11px] text-text-muted leading-relaxed font-body">{s.reason_for_candidate}</div>
        </div>

        {/* Limits / uncertainties */}
        {s.limits_or_uncertainties && (
          <div>
            <div className="text-[9px] text-text-muted/50 font-mono uppercase tracking-wider mb-0.5">Limits / Uncertainties</div>
            <div className="text-[11px] text-amber-300/60 leading-relaxed font-body">{s.limits_or_uncertainties}</div>
          </div>
        )}
      </div>

      {/* ═══ EVIDENCE GROUP ═══ */}
      <div className="border-t border-house-border/30 pt-3 mt-1 space-y-3">

        {/* Archive Evidence */}
        {hydrated.hydratedArchiveSources.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-1 h-3 bg-purple-600/40 rounded-full" />
              <span className="text-[9px] text-text-muted font-mono uppercase tracking-wider">
                Archive Evidence ({hydrated.hydratedArchiveSources.length})
              </span>
            </div>
            <div className="space-y-1.5 pl-3">
              {hydrated.hydratedArchiveSources.map((src, i) => (
                <div key={i} className={`border rounded px-2.5 py-1.5 ${
                  src.missing ? 'border-amber-700/30 bg-amber-900/5' : 'border-house-border/40 bg-house-bg/30'
                }`}>
                  <div className={`text-[11px] font-body leading-snug ${src.missing ? 'text-amber-300/70 italic' : 'text-text-secondary'}`}>
                    {src.title}
                  </div>
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    <span className="text-[9px] bg-house-surface/80 px-1 py-px rounded text-text-muted"
                      title={src.evidenceRoleExplanation}>
                      {src.evidenceRoleLabel}
                    </span>
                    <span className={`text-[9px] px-1 py-px rounded ${
                      src.usedForWeighting ? 'text-purple-300/70 bg-purple-900/10' : 'text-text-muted/40 bg-house-surface/50'
                    }`} title={src.weightingExplanation}>
                      {src.usedForWeighting ? 'weighted' : 'not weighted'}
                    </span>
                  </div>
                  {/* Status line — only show if changed or if snapshot differs from "canonical" */}
                  {(src.statusChanged || src.canonicalStatusSnapshot !== 'canonical') && (
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      <span className="text-[8px] text-text-muted/40">
                        was: {src.canonicalStatusSnapshot}
                      </span>
                      {src.currentCanonicalStatus && src.statusChanged && (
                        <>
                          <span className="text-[8px] text-text-muted/40">
                            now: {src.currentCanonicalStatus}
                          </span>
                          <span className="text-[8px] text-amber-300/70">changed</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Graph Evidence */}
        {(hydrated.hydratedProposals.length > 0 || hydrated.hydratedLegacyNodes.length > 0 || hydrated.hydratedLegacyEdges.length > 0) && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1 h-3 bg-teal-600/40 rounded-full" />
              <span className="text-[9px] text-text-muted font-mono uppercase tracking-wider">
                Graph Structure Evidence
              </span>
            </div>
            <div className="text-[9px] text-text-muted/40 italic font-body pl-3 mb-1.5">
              Graph structure is not Memory authority.
            </div>

            <div className="space-y-1 pl-3">
              {/* Proposals */}
              {hydrated.hydratedProposals.map((p, i) => (
                <div key={`p-${i}`} className={`border rounded px-2.5 py-1.5 ${
                  p.missing ? 'border-amber-700/30 bg-amber-900/5' : 'border-house-border/40 bg-house-bg/30'
                }`}>
                  <div className={`text-[11px] font-body leading-snug ${p.missing ? 'text-amber-300/70 italic' : 'text-text-secondary'}`}>
                    {p.label}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    <span className="text-[9px] bg-house-surface/80 px-1 py-px rounded text-text-muted">{p.proposalType}</span>
                    {p.nodeType && <span className="text-[9px] bg-house-surface/80 px-1 py-px rounded text-text-muted">{p.nodeType}</span>}
                    {p.edgeType && <span className="text-[9px] bg-house-surface/80 px-1 py-px rounded text-text-muted">{p.edgeType}</span>}
                    <span className="text-[9px] bg-house-surface/80 px-1 py-px rounded text-text-muted">{p.status}</span>
                  </div>
                  {p.summary && (
                    <div className="text-[10px] text-text-muted/50 mt-0.5 line-clamp-2">{p.summary}</div>
                  )}
                </div>
              ))}

              {/* Legacy nodes */}
              {hydrated.hydratedLegacyNodes.map((n, i) => (
                <div key={`n-${i}`} className={`border rounded px-2.5 py-1.5 ${
                  n.missing ? 'border-amber-700/30 bg-amber-900/5' : 'border-house-border/40 bg-house-bg/30'
                }`}>
                  <div className={`text-[11px] font-body leading-snug ${n.missing ? 'text-amber-300/70 italic' : 'text-text-secondary'}`}>
                    {n.label}
                  </div>
                  <div className="flex gap-1 mt-0.5">
                    <span className="text-[9px] bg-house-surface/80 px-1 py-px rounded text-text-muted">{n.nodeType}</span>
                    <span className="text-[9px] bg-house-surface/80 px-1 py-px rounded text-text-muted">{n.approvalStatus}</span>
                  </div>
                </div>
              ))}

              {/* Legacy edges */}
              {hydrated.hydratedLegacyEdges.map((e, i) => (
                <div key={`e-${i}`} className={`border rounded px-2.5 py-1.5 ${
                  e.missing ? 'border-amber-700/30 bg-amber-900/5' : 'border-house-border/40 bg-house-bg/30'
                }`}>
                  <div className={`text-[11px] font-body leading-snug ${e.missing ? 'text-amber-300/70 italic' : 'text-text-secondary'}`}>
                    {e.edgeType}
                  </div>
                  {e.description && <div className="text-[10px] text-text-muted/50 mt-0.5">{e.description}</div>}
                  <span className="text-[9px] bg-house-surface/80 px-1 py-px rounded text-text-muted">{e.approvalStatus}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Deduplicated evidence — collapsible */}
        {hydrated.hydratedDeduplicatedSources.length > 0 && (
          <details className="pl-0">
            <summary className="text-[9px] text-text-muted/50 font-mono uppercase tracking-wider cursor-pointer hover:text-text-muted/70 transition-colors">
              Deduplicated Sources ({hydrated.hydratedDeduplicatedSources.length})
            </summary>
            <div className="mt-1 space-y-0.5 pl-3">
              {hydrated.hydratedDeduplicatedSources.map((d, i) => (
                <div key={i} className={`text-[10px] font-body ${d.missing ? 'text-amber-300/60 italic' : 'text-text-muted/60'}`}>
                  {d.title}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* ═══ CONTEXT GROUP ═══ */}
      <div className="border-t border-house-border/20 pt-3 mt-1 space-y-2">

        {/* Governance context */}
        {s.governance_context && Object.keys(s.governance_context).length > 0 && (
          <details>
            <summary className="text-[9px] text-text-muted/50 font-mono uppercase tracking-wider cursor-pointer hover:text-text-muted/70 transition-colors">
              Governance Context — Informational only. Not evidence.
            </summary>
            <pre className="mt-1 text-[9px] text-text-muted/40 bg-house-bg/50 border border-house-border/20 rounded p-2 overflow-x-auto">
              {JSON.stringify(s.governance_context, null, 2)}
            </pre>
          </details>
        )}

        {/* Warnings (real ones only — status drift, missing evidence) */}
        {realWarnings.length > 0 && (
          <div className="space-y-0.5">
            {realWarnings.map((w, i) => (
              <div key={i} className="text-[9px] text-amber-300/60 font-body pl-2 border-l border-amber-700/20">
                {w.message}
              </div>
            ))}
          </div>
        )}

        {/* Audit trail — collapsible */}
        {hydrated.events.length > 0 && (
          <details>
            <summary className="text-[9px] text-text-muted/50 font-mono uppercase tracking-wider cursor-pointer hover:text-text-muted/70 transition-colors">
              Audit Trail ({hydrated.events.length})
            </summary>
            <div className="mt-1 space-y-0.5 pl-2">
              {hydrated.events.map((evt, i) => (
                <div key={i} className="text-[9px] text-text-muted/40 font-body">
                  <span className="text-text-muted/60">{evt.event_type}</span>
                  {evt.reason && <span> — {evt.reason}</span>}
                  <span className="ml-1 opacity-60">{evt.actor} · {new Date(evt.created_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Metadata */}
        <div className="text-[9px] text-text-muted/30 font-body pt-1">
          {s.created_by} · {new Date(s.created_at).toLocaleString()}
          {s.reviewed_by && ` · reviewed by ${s.reviewed_by}`}
        </div>
      </div>

      {/* ═══ DISMISS ACTION ═══ */}
      {s.status === 'pending_review' && onDismiss && (
        <div className="border-t border-house-border/20 pt-2 mt-1">
          <button
            onClick={() => onDismiss(s.id)}
            disabled={dismissing}
            className="font-body text-[10px] px-3 py-1.5 border border-gray-600/40 text-gray-400 hover:text-gray-300 hover:bg-gray-800/20 rounded transition-all disabled:opacity-40"
          >
            {dismissing ? 'Dismissing...' : 'Dismiss Suggestion'}
          </button>
        </div>
      )}
    </div>
  )
}
