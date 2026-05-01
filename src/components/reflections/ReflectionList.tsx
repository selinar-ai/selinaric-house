'use client'

// Phase 24A — Scrollable reflection list.

import type { ReflectionWithFeedback } from '@/lib/reflections/review-types'
import ReflectionCard from './ReflectionCard'

interface Props {
  reflections: ReflectionWithFeedback[]
  selectedId: string | null
  onSelect: (r: ReflectionWithFeedback) => void
}

export default function ReflectionList({ reflections, selectedId, onSelect }: Props) {
  if (reflections.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="font-body text-sm text-text-muted text-center leading-relaxed">
          No reflections yet.<br />
          <span className="text-xs">Create a reflection job from a kept timeline entry, approved concept, or committed build.</span>
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {reflections.map(r => (
        <ReflectionCard
          key={r.id}
          reflection={r}
          selected={r.id === selectedId}
          onClick={() => onSelect(r)}
        />
      ))}
    </div>
  )
}
