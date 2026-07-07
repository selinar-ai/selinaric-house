'use client'

// Phase 43 Option C — Unified Graph Review surface, kernel lane (READ-ONLY).
//
// Shows the agent kernel's deterministic structural graph suggestions alongside the
// Ontology Lab's map lane. These are NOT graph truth and NOT on the Relational Map — they
// are structural suggestions awaiting a future governed bridge (Option A, not built).
//
// READ-ONLY BY CONSTRUCTION: this component performs no fetch, no mutation, no approve, no
// apply, no triage write. Triage (acknowledge/dismiss) lives unchanged in /agents; this panel
// only links there. Ontology Lab remains the sole graph-truth approval authority.

export interface AgentGraphSuggestion {
  id: string
  edge_type: string
  from_node_id: string
  to_node_id: string
  source_item_ids: string[] | null
  rule_id: string
  review_state: string
  created_at: string
}

interface Props {
  suggestions: AgentGraphSuggestion[]
  nodeLabels: Record<string, string>
  loading: boolean
  error: boolean
}

function shortId(id: string): string {
  return typeof id === 'string' && id.length > 8 ? id.slice(0, 8) : id
}

export default function AgentGraphSuggestionsPanel({ suggestions, nodeLabels, loading, error }: Props) {
  return (
    <div className="px-4 md:px-8 py-3">
      {/* Label banner — the lane is explicitly not-on-the-map, suggestion-only, triage-only */}
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span className="text-text-muted text-sm shrink-0">◇</span>
        <h3 className="font-display text-lg font-light text-text-primary">Structural suggestions (kernel)</h3>
        <span className="text-[10px] uppercase tracking-wide text-amber-300/80 border border-amber-700/40 rounded px-1.5 py-0.5">
          not on the map yet · structural suggestions · triage only
        </span>
      </div>
      <p className="text-text-muted text-[11px] font-body leading-relaxed mb-2">
        Deterministic edges the kernel computed from the archives. Read-only here — they are not graph
        truth and are not on the Relational Map. Triage them in{' '}
        <a href="/agents" className="underline hover:text-text-primary">/agents</a>.
      </p>

      {error ? (
        <p className="text-text-muted text-xs font-body opacity-70">Structural suggestions unavailable.</p>
      ) : loading ? (
        <p className="text-text-muted text-xs font-body animate-pulse">Loading suggestions…</p>
      ) : suggestions.length === 0 ? (
        <p className="text-text-muted text-xs font-body opacity-70">No structural suggestions.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-body">
            <thead>
              <tr className="text-text-muted text-left border-b border-house-border">
                <th className="py-1 pr-3 font-normal">Relation</th>
                <th className="py-1 pr-3 font-normal">From → To</th>
                <th className="py-1 pr-3 font-normal">Rule</th>
                <th className="py-1 pr-3 font-normal">Review</th>
                <th className="py-1 pr-3 font-normal">Provenance</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((s) => {
                const from = nodeLabels[s.from_node_id] ?? shortId(s.from_node_id)
                const to = nodeLabels[s.to_node_id] ?? shortId(s.to_node_id)
                const n = s.source_item_ids?.length ?? 0
                return (
                  <tr key={s.id} className="border-b border-house-border/40 text-text-secondary">
                    <td className="py-1 pr-3 whitespace-nowrap">{s.edge_type}</td>
                    <td className="py-1 pr-3 text-text-primary">{from} → {to}</td>
                    <td className="py-1 pr-3 whitespace-nowrap opacity-80">{s.rule_id}</td>
                    <td className="py-1 pr-3 whitespace-nowrap opacity-80">{s.review_state}</td>
                    <td className="py-1 pr-3 whitespace-nowrap">{n} archive source{n === 1 ? '' : 's'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
