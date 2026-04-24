'use client'

// Phase 26A — Want List
// Full list of all 10 wants, sorted by score. Scrollable.

import type { WantState, InspectorTarget } from '@/lib/interior/interior-types'
import { sortedWants } from '@/lib/interior/interior-types'
import WantCard from './WantCard'

interface Props {
  wants: WantState[]
  accentColor: string
  accentClass: string
  selectedWantKey: string | null
  onSelect: (target: InspectorTarget) => void
}

export default function WantList({ wants, accentColor, accentClass, selectedWantKey, onSelect }: Props) {
  const sorted = sortedWants(wants)
  const primaryKey = sorted[0]?.key

  return (
    <div className="flex flex-col min-h-0">
      <div className="px-4 py-2 border-b border-house-border shrink-0">
        <span className="font-body text-[10px] text-text-muted tracking-widest uppercase">
          All Wants
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sorted.map(want => (
          <WantCard
            key={want.key}
            want={want}
            accentColor={accentColor}
            accentClass={accentClass}
            isSelected={selectedWantKey === want.key}
            isPrimary={want.key === primaryKey}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}
