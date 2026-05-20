'use client'

// Phase 35D — Lounge Page
//
// Shared presence room for Tara, Ari, and Eli.
// Surface mode toggle: ∞ visible = Default, ∞ absent = Inner.

import LoungeChat from '@/components/LoungeChat'

export default function LoungePage() {
  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 md:p-8 lg:p-12 overflow-hidden">
      {/* Chat area — header is rendered inside LoungeChat for surface-aware title */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <LoungeChat />
      </div>
    </div>
  )
}
