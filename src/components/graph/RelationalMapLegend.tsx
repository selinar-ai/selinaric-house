'use client'

// Phase 37D — Legend and summary panel for the Relational Map.

import { LEGEND_ENTRIES } from '@/lib/graph/graphDisplayUtils'

interface LegendProps {
  nodeCount: number
  edgeCount: number
  scopeCount: number
  sourceCount: number
  lastLoaded: string | null
}

export default function RelationalMapLegend({
  nodeCount,
  edgeCount,
  scopeCount,
  sourceCount,
  lastLoaded,
}: LegendProps) {
  return (
    <div className="
      absolute bottom-4 left-4 z-10
      bg-house-surface/90 border border-house-border rounded-lg
      px-4 py-3 backdrop-blur-sm
      text-xs font-body
      max-w-[200px]
    ">
      {/* Legend */}
      <div className="mb-3">
        <div className="text-text-muted uppercase tracking-wider text-[10px] mb-2 font-mono">Legend</div>
        <div className="space-y-1.5">
          {LEGEND_ENTRIES.map(entry => (
            <div key={entry.label} className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: entry.colour }}
              />
              <span className="text-text-secondary">{entry.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Counts */}
      <div className="border-t border-house-border pt-2 space-y-1">
        <div className="flex justify-between">
          <span className="text-text-muted uppercase tracking-wider text-[10px] font-mono">Nodes</span>
          <span className="text-text-secondary">{nodeCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted uppercase tracking-wider text-[10px] font-mono">Edges</span>
          <span className="text-text-secondary">{edgeCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted uppercase tracking-wider text-[10px] font-mono">Scopes</span>
          <span className="text-text-secondary">{scopeCount}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted uppercase tracking-wider text-[10px] font-mono">Sources</span>
          <span className="text-text-secondary">{sourceCount}</span>
        </div>
        {lastLoaded && (
          <div className="pt-1 border-t border-house-border/50">
            <div className="text-text-muted uppercase tracking-wider text-[10px] font-mono">Last Refresh</div>
            <div className="text-text-secondary mt-0.5">{lastLoaded}</div>
          </div>
        )}
      </div>
    </div>
  )
}
