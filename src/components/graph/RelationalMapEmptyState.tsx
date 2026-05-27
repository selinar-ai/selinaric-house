'use client'

// Phase 37D — Empty state when no approved graph proposals exist.

export default function RelationalMapEmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-sm px-4">
        <div className="text-3xl opacity-30 mb-4">◉</div>
        <p className="text-text-secondary text-sm font-body mb-2">
          No approved graph proposals yet.
        </p>
        <p className="text-text-muted text-xs font-body">
          Approve proposals in the Ontology Lab to see them appear in the Relational Map.
        </p>
      </div>
    </div>
  )
}
