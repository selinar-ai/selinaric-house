'use client'

// Phase 24A — Feedback bar shown at the bottom of the detail panel.
// One label per reflection. Disabled after submission.

import { useState } from 'react'
import { FEEDBACK_LABELS, FEEDBACK_DISPLAY, type FeedbackLabel } from '@/lib/reflections/review-types'

interface Props {
  reflectionId: string
  reviewed: boolean
  existingLabel: FeedbackLabel | null
  onSubmitted: (label: FeedbackLabel) => void
}

export default function ReflectionFeedbackBar({
  reflectionId,
  reviewed,
  existingLabel,
  onSubmitted,
}: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [localLabel, setLocalLabel] = useState<FeedbackLabel | null>(existingLabel)
  const [error, setError] = useState<string | null>(null)

  const isLocked = reviewed || localLabel !== null

  async function handleSelect(label: FeedbackLabel) {
    if (isLocked || submitting) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/reflection-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reflectionId, feedbackLabel: label }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Submission failed')
      setLocalLabel(label)
      onSubmitted(label)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  const activeLabel = localLabel ?? existingLabel

  return (
    <div className="pt-4 mt-4 border-t border-house-border">
      <p className="font-body text-xs text-text-muted tracking-widest uppercase mb-3">
        {isLocked ? 'Reviewed' : 'Your judgment'}
      </p>

      <div className="flex flex-wrap gap-2">
        {FEEDBACK_LABELS.map(label => {
          const { label: displayLabel, colorClass, activeClass } = FEEDBACK_DISPLAY[label]
          const isSelected = activeLabel === label

          return (
            <button
              key={label}
              onClick={() => handleSelect(label)}
              disabled={isLocked || submitting}
              className={`
                font-body text-xs px-3 py-1.5 border transition-all duration-150
                ${isSelected
                  ? activeClass
                  : isLocked
                  ? 'border-house-border text-text-muted opacity-40 cursor-default'
                  : `border-house-border ${colorClass} hover:bg-house-bg cursor-pointer`
                }
              `}
            >
              {displayLabel}
            </button>
          )
        })}
      </div>

      {error && (
        <p className="font-body text-xs text-red-400 mt-2">{error}</p>
      )}
    </div>
  )
}
