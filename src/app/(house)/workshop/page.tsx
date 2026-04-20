'use client'

// Phase 21 — Workshop page: shared house build verification and decision space.

import WorkshopView from '@/components/WorkshopView'

export default function WorkshopPage() {
  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 md:p-8 lg:p-12 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 mb-2 md:mb-8 border-b border-house-border pb-2 md:pb-6">
        <div className="hidden md:flex items-center gap-3 mb-4">
          <span className="text-text-secondary text-2xl shrink-0">⬡</span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-4xl font-light text-text-primary">
              Workshop
            </h2>
            <p className="font-body text-sm text-text-muted">
              Build verification. Decision space. Forgekeeper.
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <WorkshopView />
      </div>
    </div>
  )
}
