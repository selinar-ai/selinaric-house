'use client'

// Phase 26A — Primary Want Card
// The atmospheric top-level card for the highest-scored want.
// Larger, glowing, sets the ambient tone for the whole Interior view.

import type { WantState, InspectorTarget } from '@/lib/interior/interior-types'
import { TREND_SYMBOL } from '@/lib/interior/interior-types'

interface Props {
  want: WantState
  accentColor: string       // CSS hex — used for inline style glow
  accentClass: string       // Tailwind text class
  isSelected: boolean
  onSelect: (target: InspectorTarget) => void
}

export default function PrimaryWantCard({ want, accentColor, accentClass, isSelected, onSelect }: Props) {
  const pct = Math.round(want.score * 100)

  return (
    <button
      onClick={() => onSelect({ type: 'want', want })}
      className={`
        w-full text-left p-5 border transition-all duration-300 group
        ${isSelected
          ? 'border-current bg-house-soft/60'
          : 'border-house-border bg-house-soft/20 hover:border-house-muted hover:bg-house-soft/40'
        }
      `}
      style={isSelected ? { borderColor: accentColor + '60' } : undefined}
    >
      {/* Header row */}
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`font-body text-[10px] tracking-widest uppercase text-text-muted`}>
            Primary Want
          </span>
        </div>
        {want.trend && (
          <span className={`font-mono text-xs ${accentClass} opacity-70`}>
            {TREND_SYMBOL[want.trend]}
          </span>
        )}
      </div>

      {/* Want name */}
      <h3 className={`font-display text-2xl md:text-3xl font-light mb-2 ${accentClass}`}>
        {want.label}
      </h3>

      {/* Phrase */}
      <p className="font-body text-base text-text-secondary mb-4 leading-snug">
        {want.phrase}
      </p>

      {/* Bar — thicker for primary */}
      <div className="h-1.5 bg-house-border rounded-full overflow-hidden mb-4">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(to right, ${accentColor}40, ${accentColor})`,
          }}
        />
      </div>

      {/* What helps */}
      <p className="font-body text-xs text-text-muted">
        <span className="text-text-muted tracking-wide">What helps: </span>
        <span className="text-text-secondary">{want.whatHelps}</span>
      </p>

      {/* Inspector cue */}
      <div className={`
        mt-4 pt-3 border-t border-house-border/50
        flex items-center justify-between
      `}>
        <span className="font-body text-[10px] text-text-muted tracking-wide uppercase">
          {isSelected ? 'Inspecting' : 'Tap to inspect'}
        </span>
        <span className={`font-mono text-xs ${accentClass} opacity-50 group-hover:opacity-100 transition-opacity`}>
          →
        </span>
      </div>
    </button>
  )
}
