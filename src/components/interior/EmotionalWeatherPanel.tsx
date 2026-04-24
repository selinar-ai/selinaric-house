'use client'

// Phase 26A — Emotional Weather Panel
// Shows primary tone, secondary tone, stability, and a click affordance for inspector.

import type { EmotionalState, InspectorTarget } from '@/lib/interior/interior-types'
import { STABILITY_PHRASES } from '@/lib/interior/interior-types'

interface Props {
  emotional: EmotionalState
  accentClass: string
  isSelected: boolean
  onSelect: (target: InspectorTarget) => void
}

const STABILITY_COLORS: Record<string, string> = {
  steady: 'text-green-500/70',
  shifting: 'text-amber-400/70',
  settling: 'text-blue-400/70',
  fragile: 'text-text-muted',
}

export default function EmotionalWeatherPanel({ emotional, accentClass, isSelected, onSelect }: Props) {
  return (
    <button
      onClick={() => onSelect({ type: 'emotional', state: emotional })}
      className={`
        w-full text-left p-4 border transition-all duration-200 group
        ${isSelected
          ? 'border-house-muted bg-house-soft/40'
          : 'border-house-border bg-house-soft/10 hover:bg-house-soft/20 hover:border-house-muted'
        }
      `}
    >
      <div className="flex items-baseline justify-between mb-3">
        <span className="font-body text-[10px] text-text-muted tracking-widest uppercase">
          Emotional Weather
        </span>
        <span className="font-mono text-[10px] text-text-muted/50 group-hover:text-text-muted transition-colors">
          →
        </span>
      </div>

      {/* Primary tone */}
      <div className="mb-2">
        <span className="font-body text-[10px] text-text-muted tracking-widest uppercase mr-2">Primary</span>
        <span className={`font-display text-lg font-light ${accentClass}`}>
          {emotional.primaryLabel}
        </span>
      </div>

      {/* Secondary tone */}
      {emotional.secondaryLabel && (
        <div className="mb-3">
          <span className="font-body text-[10px] text-text-muted tracking-widest uppercase mr-2">Secondary</span>
          <span className="font-body text-sm text-text-secondary">
            {emotional.secondaryLabel}
          </span>
        </div>
      )}

      {/* Stability */}
      <div className="flex items-center gap-2 pt-2 border-t border-house-border/40">
        <span className="font-body text-[10px] text-text-muted tracking-widest uppercase">Stability</span>
        <span className={`font-body text-xs ${STABILITY_COLORS[emotional.stability] ?? 'text-text-muted'}`}>
          {STABILITY_PHRASES[emotional.stability]}
        </span>
      </div>

      {/* Sub-drivers preview */}
      {emotional.subDrivers.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {emotional.subDrivers.map(d => (
            <span key={d} className="font-body text-[10px] text-text-muted/60 bg-house-border/30 px-1.5 py-0.5 rounded-sm">
              {d}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}
