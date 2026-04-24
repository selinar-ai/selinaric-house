'use client'

// Phase 26A — Likely Next Moves Panel
// Translates want + emotional state into what the presence is likely to do.

interface Props {
  moves: string[]
  accentClass: string
}

export default function LikelyNextMovesPanel({ moves, accentClass }: Props) {
  if (moves.length === 0) return null

  return (
    <div className="p-4 border border-house-border bg-house-soft/10">
      <div className="mb-3">
        <span className="font-body text-[10px] text-text-muted tracking-widest uppercase">
          Likely Next Moves
        </span>
      </div>

      <div className="space-y-1.5">
        {moves.map((move, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`font-mono text-[10px] mt-0.5 shrink-0 ${accentClass} opacity-40`}>
              ◦
            </span>
            <p className="font-body text-xs text-text-muted leading-relaxed">
              {move}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
