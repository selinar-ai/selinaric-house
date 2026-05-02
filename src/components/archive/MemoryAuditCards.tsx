'use client'

// Phase 29A — Memory audit summary cards.
// Computed client-side from the already-loaded items array.
// Keyed on canonical_status (the single Memory authority).
// Elevated sensitivities (schema-confirmed): sacred | sensitive | technical

import type { ArchiveItem } from '@/lib/archives'
import { isMemory, isMemoryCandidate } from '@/lib/archive-memory'

const ELEVATED_SENSITIVITIES = ['sacred', 'sensitive', 'technical']

interface Props {
  items: ArchiveItem[]
}

interface AuditCard {
  label:   string
  count:   number
  color:   string
  dimmed?: boolean
}

export default function MemoryAuditCards({ items }: Props) {
  const total      = items.length
  const candidates = items.filter(i => isMemoryCandidate(i.canonical_status)).length
  const confirmed  = items.filter(i => isMemory(i.canonical_status)).length
  const rejected   = items.filter(i => i.canonical_status === 'archive_only').length
  const sensitive  = items.filter(i =>
    isMemory(i.canonical_status) && ELEVATED_SENSITIVITIES.includes(i.sensitivity)
  ).length
  const unlinked   = items.filter(i =>
    isMemory(i.canonical_status) && !i.source_id
  ).length

  const cards: AuditCard[] = [
    { label: 'Total entries',         count: total,      color: 'text-text-secondary' },
    { label: 'Memory candidates',     count: candidates, color: 'text-amber-400' },
    { label: 'Confirmed Memory',      count: confirmed,  color: 'text-green-400' },
    { label: 'Rejected for Memory',   count: rejected,   color: 'text-red-400/60' },
    { label: 'Sensitive Memory',      count: sensitive,  color: 'text-amber-400',  dimmed: sensitive === 0 },
    { label: 'Unlinked Memory',       count: unlinked,   color: 'text-text-muted', dimmed: unlinked === 0 },
  ]

  return (
    <div className="px-4 py-3 border-b border-house-border/40 grid grid-cols-3 sm:grid-cols-6 gap-3">
      {cards.map(card => (
        <div key={card.label} className={card.dimmed ? 'opacity-40' : ''}>
          <p className={`font-body text-base font-medium ${card.color} leading-none`}>
            {card.count}
          </p>
          <p className="font-body text-[10px] text-text-muted leading-snug mt-0.5">
            {card.label}
          </p>
        </div>
      ))}
    </div>
  )
}
