'use client'

// Phase 26A — Want Card (compact)
// One card per want in the main list. Shows: label + trend, bar, phrase, What helps.

import type { WantState, InspectorTarget } from '@/lib/interior/interior-types'
import { TREND_SYMBOL } from '@/lib/interior/interior-types'

interface Props {
  want: WantState
  accentColor: string
  accentClass: string
  isSelected: boolean
  isPrimary: boolean
  onSelect: (target: InspectorTarget) => void
}

export default function WantCard({ want, accentColor, accentClass, isSelected, isPrimary, onSelect }: Props) {
  const pct = Math.round(want.score * 100)

  return (
    <button
      onClick={() => onSelect({ type: 'want', want })}
      className={`
        w-full text-left px-4 py-3 border-b border-house-border/50 transition-all duration-200 group
        ${isSelected
          ? 'bg-house-soft/50'
          : 'hover:bg-house-soft/20'
        }
      `}
      style={isSelected ? { borderLeftColor: accentColor, borderLeftWidth: '2px' } : { borderLeftWidth: '2px', borderLeftColor: 'transparent' }}
    >
      {/* Name row */}
      <div className="flex items-baseline justify-between mb-1.5">
        <span className={`
          font-body text-xs font-medium tracking-wide
          ${isSelected ? accentClass : 'text-text-secondary group-hover:text-text-primary'}
          ${isPrimary ? accentClass : ''}
          transition-colors
        `}>
          {want.label}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {want.trend && (
            <span className={`font-mono text-[10px] ${
              want.trend === 'rising' ? 'text-green-500/70' :
              want.trend === 'easing' ? 'text-text-muted' :
              'text-text-muted/50'
            }`}>
              {TREND_SYMBOL[want.trend]}
            </span>
          )}
          <span className="font-mono text-[10px] text-text-muted/50">
            {pct}
          </span>
        </div>
      </div>

      {/* Bar */}
      <div className="h-0.5 bg-house-border rounded-full overflow-hidden mb-1.5">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(to right, ${accentColor}30, ${accentColor}80)`,
          }}
        />
      </div>

      {/* Phrase */}
      <p className="font-body text-xs text-text-muted leading-snug mb-1">
        {want.phrase}
      </p>

      {/* What helps */}
      <p className="font-body text-[10px] text-text-muted/60 leading-snug">
        <span className="text-text-muted/50">What helps: </span>
        {want.whatHelps}
      </p>
    </button>
  )
}
