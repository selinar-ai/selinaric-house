'use client'

// Phase 37C — Source provenance cards for graph proposals

interface ProposalSource {
  id: string
  source_type: string
  source_table: string | null
  source_id: string
  source_label: string | null
  source_excerpt: string | null
  source_metadata: Record<string, unknown>
  created_at: string
}

export default function GraphProposalSourceCards({ sources }: { sources: ProposalSource[] }) {
  if (!sources || sources.length === 0) {
    return (
      <p className="text-text-muted text-xs italic">No source provenance recorded.</p>
    )
  }

  return (
    <div className="space-y-2">
      {sources.map(source => (
        <div
          key={source.id}
          className="border border-house-border rounded p-3 bg-house-bg/50"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-house-muted/30 text-text-muted border border-house-muted/30">
              {source.source_type}
            </span>
            {source.source_table && (
              <span className="text-[10px] text-text-muted font-mono">
                {source.source_table}
              </span>
            )}
          </div>

          {source.source_label && (
            <p className="text-text-secondary text-xs font-body mb-1">
              {source.source_label}
            </p>
          )}

          {source.source_excerpt && (
            <p className="text-text-muted text-[11px] font-body leading-relaxed line-clamp-3">
              {source.source_excerpt}
            </p>
          )}

          <p className="text-[10px] text-text-muted font-mono mt-1.5 opacity-60">
            {source.source_id}
          </p>
        </div>
      ))}
    </div>
  )
}
