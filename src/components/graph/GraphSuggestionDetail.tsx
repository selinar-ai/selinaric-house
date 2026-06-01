'use client'

// Phase 37H.2 — Graph-Assisted Candidate Suggestion Detail Panel
//
// Displays evidence, provenance, limitations, and governance context.
// Does not create Memory, Held Truth, or mutate any table.
// No approve/promote controls. Dismiss only.

import type { GraphCandidateSuggestion } from '@/lib/graph/candidateSuggestionTypes'

interface Props {
  suggestion: GraphCandidateSuggestion
  onDismiss?: (id: string) => void
  dismissing?: boolean
  onClose: () => void
}

export default function GraphSuggestionDetail({ suggestion, onDismiss, dismissing, onClose }: Props) {
  const s = suggestion
  const isMemory = s.candidate_type === 'memory_candidate'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-text-secondary tracking-wide">Suggestion Detail</span>
        <button onClick={onClose} className="text-text-muted hover:text-text-secondary text-xs">✕</button>
      </div>

      {/* Header badges */}
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

      {/* Warning */}
      <div className="text-[10px] text-text-muted/70 italic font-body border border-amber-700/20 bg-amber-900/10 px-2.5 py-1.5 rounded leading-relaxed">
        Graph-assisted suggestion only. Not Memory. Not Held Truth.
        Memory Review / Held Truth governance still required.
      </div>

      {/* Label + Summary */}
      <div>
        <div className="text-xs text-text-secondary font-body">{s.proposed_label}</div>
        {s.proposed_summary && (
          <div className="text-[11px] text-text-muted mt-1 leading-relaxed">{s.proposed_summary}</div>
        )}
      </div>

      {/* Target info */}
      {isMemory && s.target_archive_item_id && (
        <div className="text-[10px] font-body text-text-muted">
          <span className="opacity-60">Target archive item:</span> {s.target_archive_item_id}
          {s.canonical_status_before && (
            <span className="ml-1 text-[9px] bg-house-surface px-1 rounded">{s.canonical_status_before}</span>
          )}
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
      {!isMemory && s.proposed_truth_text && (
        <div className="text-[11px] text-text-secondary font-body border-l-2 border-amber-700/30 pl-2 italic">
          &ldquo;{s.proposed_truth_text}&rdquo;
        </div>
      )}

      {/* Reason */}
      <div>
        <div className="text-text-muted uppercase tracking-wider text-[9px] mb-1 font-mono">Reason</div>
        <div className="text-[11px] text-text-muted leading-relaxed font-body">{s.reason_for_candidate}</div>
      </div>

      {/* Evidence strength */}
      <div className="text-[10px] font-body text-text-muted">
        <span className="opacity-60">Evidence strength:</span>{' '}
        <span className={`capitalize ${
          s.evidence_strength === 'strong' ? 'text-emerald-300' :
          s.evidence_strength === 'weak' ? 'text-amber-300' : 'text-text-secondary'
        }`}>{s.evidence_strength}</span>
      </div>

      {/* Limits / uncertainties */}
      {s.limits_or_uncertainties && (
        <div>
          <div className="text-text-muted uppercase tracking-wider text-[9px] mb-1 font-mono">Limits / Uncertainties</div>
          <div className="text-[11px] text-amber-300/70 leading-relaxed font-body">{s.limits_or_uncertainties}</div>
        </div>
      )}

      {/* Supporting archive sources */}
      {s.supporting_archive_sources && s.supporting_archive_sources.length > 0 && (
        <div>
          <div className="text-text-muted uppercase tracking-wider text-[9px] mb-1 font-mono">
            Supporting Evidence (graph-assisted)
          </div>
          <div className="space-y-1">
            {s.supporting_archive_sources.map((src, i) => (
              <div key={i} className="bg-house-bg border border-house-border/50 rounded px-2 py-1 text-[10px] font-body text-text-muted">
                <div className="truncate text-text-secondary">{src.archive_item_id}</div>
                <div className="flex gap-2 mt-0.5">
                  <span className="bg-house-surface px-1 rounded">{src.canonical_status_snapshot}</span>
                  <span className="bg-house-surface px-1 rounded">{src.evidence_role.replace(/_/g, ' ')}</span>
                  {src.used_for_weighting && <span className="text-purple-300/60">weighted</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supporting graph evidence */}
      {(s.supporting_proposal_ids.length > 0 || s.supporting_graph_node_ids.length > 0 || s.supporting_graph_edge_ids.length > 0) && (
        <div>
          <div className="text-text-muted uppercase tracking-wider text-[9px] mb-1 font-mono">
            Graph Structure Evidence
          </div>
          {s.supporting_proposal_ids.length > 0 && (
            <div className="text-[10px] text-text-muted font-body">
              {s.supporting_proposal_ids.length} approved graph proposal(s)
            </div>
          )}
          {s.supporting_graph_node_ids.length > 0 && (
            <div className="text-[10px] text-text-muted font-body">
              {s.supporting_graph_node_ids.length} approved legacy graph node(s)
            </div>
          )}
          {s.supporting_graph_edge_ids.length > 0 && (
            <div className="text-[10px] text-text-muted font-body">
              {s.supporting_graph_edge_ids.length} approved legacy graph edge(s)
            </div>
          )}
        </div>
      )}

      {/* Deduplicated evidence sources */}
      {s.deduplicated_evidence_sources && s.deduplicated_evidence_sources.length > 0 && (
        <div className="text-[10px] text-text-muted font-body">
          <span className="opacity-60">Deduplicated archive sources:</span> {s.deduplicated_evidence_sources.length}
        </div>
      )}

      {/* Governance context */}
      {s.governance_context && Object.keys(s.governance_context).length > 0 && (
        <details className="text-[10px]">
          <summary className="text-text-muted uppercase tracking-wider font-mono cursor-pointer">
            Governance Context (informational only — not evidence)
          </summary>
          <pre className="mt-1 text-[9px] text-text-muted/60 bg-house-bg border border-house-border/30 rounded p-2 overflow-x-auto">
            {JSON.stringify(s.governance_context, null, 2)}
          </pre>
        </details>
      )}

      {/* Metadata */}
      <div className="text-[9px] text-text-muted/50 font-body space-y-0.5">
        <div>Created by: {s.created_by} · {new Date(s.created_at).toLocaleString()}</div>
        {s.reviewed_by && <div>Reviewed by: {s.reviewed_by} · {s.reviewed_at ? new Date(s.reviewed_at).toLocaleString() : ''}</div>}
      </div>

      {/* Dismiss action — only for pending_review */}
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
