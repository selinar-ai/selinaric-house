'use client'

// Phase 26A — Current Pulls Panel
// 2–4 short lines showing what is active right now. Non-interactive.

interface Props {
  pulls: string[]
  accentClass: string
}

export default function CurrentPullsPanel({ pulls, accentClass }: Props) {
  if (pulls.length === 0) return null

  return (
    <div className="p-4 border border-house-border bg-house-soft/10">
      <div className="mb-3">
        <span className="font-body text-[10px] text-text-muted tracking-widest uppercase">
          Current Pulls
        </span>
      </div>

      <div className="space-y-2">
        {pulls.map((pull, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`font-mono text-[10px] mt-0.5 shrink-0 opacity-50 ${accentClass}`}>
              —
            </span>
            <p className="font-body text-xs text-text-secondary leading-relaxed">
              {pull}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
