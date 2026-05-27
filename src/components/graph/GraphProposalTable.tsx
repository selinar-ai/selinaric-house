'use client'

// Phase 37C — Proposal table for graph review

import GraphProposalStatusChip from './GraphProposalStatusChip'

interface Proposal {
  id: string
  proposal_type: string
  status: string
  presence_scope: string
  authority_status: string
  node_type: string | null
  edge_type: string | null
  proposed_label: string
  proposed_summary: string | null
  confidence: number
  primary_source_type: string
  prompt_eligible: boolean
  created_at: string
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  } catch {
    return iso
  }
}

export default function GraphProposalTable({
  proposals,
  selectedIds,
  activeId,
  onSelect,
  onToggleAll,
  onRowClick,
}: {
  proposals: Proposal[]
  selectedIds: Set<string>
  activeId: string | null
  onSelect: (id: string) => void
  onToggleAll: () => void
  onRowClick: (id: string) => void
}) {
  const allVisibleSelected = proposals.length > 0 && proposals.every(p => selectedIds.has(p.id))
  const someVisibleSelected = proposals.some(p => selectedIds.has(p.id))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-house-border">
            <th className="py-2 px-3 w-8">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                ref={el => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected }}
                onChange={onToggleAll}
                className="accent-house-muted"
                aria-label="Select all visible"
              />
            </th>
            <th className="py-2 px-3 text-text-muted text-[11px] font-body font-medium tracking-wide">Proposal</th>
            <th className="py-2 px-3 text-text-muted text-[11px] font-body font-medium tracking-wide w-16">Type</th>
            <th className="py-2 px-3 text-text-muted text-[11px] font-body font-medium tracking-wide w-16">Scope</th>
            <th className="py-2 px-3 text-text-muted text-[11px] font-body font-medium tracking-wide w-28">Authority</th>
            <th className="py-2 px-3 text-text-muted text-[11px] font-body font-medium tracking-wide w-12 text-center">Conf</th>
            <th className="py-2 px-3 text-text-muted text-[11px] font-body font-medium tracking-wide w-24">Source</th>
            <th className="py-2 px-3 text-text-muted text-[11px] font-body font-medium tracking-wide w-28">Status</th>
            <th className="py-2 px-3 text-text-muted text-[11px] font-body font-medium tracking-wide w-16">Date</th>
          </tr>
        </thead>
        <tbody>
          {proposals.map(p => {
            const isSelected = selectedIds.has(p.id)
            const isActive = activeId === p.id

            return (
              <tr
                key={p.id}
                onClick={() => onRowClick(p.id)}
                className={`
                  border-b border-house-border/50 cursor-pointer transition-colors
                  ${isActive ? 'bg-house-muted/20' : 'hover:bg-house-bg/80'}
                  ${isSelected ? 'bg-house-muted/10' : ''}
                `}
              >
                <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onSelect(p.id)}
                    className="accent-house-muted"
                  />
                </td>

                <td className="py-2 px-3">
                  <div className="min-w-0">
                    <p className="text-text-secondary text-xs font-body truncate max-w-[260px]">
                      {p.proposed_label}
                    </p>
                    <p className="text-text-muted text-[10px] font-mono mt-0.5">
                      {p.node_type ?? p.edge_type ?? p.proposal_type}
                    </p>
                  </div>
                </td>

                <td className="py-2 px-3">
                  <span className="text-text-muted text-[11px] font-mono">
                    {p.proposal_type}
                  </span>
                </td>

                <td className="py-2 px-3">
                  <span className="text-text-muted text-[11px] font-mono">
                    {p.presence_scope}
                  </span>
                </td>

                <td className="py-2 px-3">
                  <span className="text-text-muted text-[10px] font-mono">
                    {p.authority_status.replace(/_/g, ' ')}
                  </span>
                </td>

                <td className="py-2 px-3 text-center">
                  <span className="text-text-muted text-[11px] font-mono">
                    {(p.confidence * 100).toFixed(0)}%
                  </span>
                </td>

                <td className="py-2 px-3">
                  <span className="text-text-muted text-[10px] font-mono">
                    {p.primary_source_type}
                  </span>
                </td>

                <td className="py-2 px-3">
                  <GraphProposalStatusChip status={p.status} />
                  {p.prompt_eligible && (
                    <span className="ml-1 text-amber-400 text-[10px]" title="Unexpected prompt eligibility">⚠</span>
                  )}
                </td>

                <td className="py-2 px-3">
                  <span className="text-text-muted text-[10px] font-mono">
                    {formatDate(p.created_at)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
