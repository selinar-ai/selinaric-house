'use client'

// Phase 24A — Compact reflection card for the list view.
// Shows type, content preview, confidence, suggested target, review status.

import {
  formatReflectionType,
  reflectionTypeColorClass,
  reflectionTypeBorderClass,
  formatSuggestedTarget,
  formatConfidence,
  confidenceColorClass,
  formatReflectionDate,
} from '@/lib/reflections/reflection-format'
import { FEEDBACK_DISPLAY, latestFeedback, type ReflectionWithFeedback } from '@/lib/reflections/review-types'

interface Props {
  reflection: ReflectionWithFeedback
  selected: boolean
  onClick: () => void
}

export default function ReflectionCard({ reflection, selected, onClick }: Props) {
  const feedback = latestFeedback(reflection)
  const typeColor = reflectionTypeColorClass(reflection.reflection_type)
  const typeBorder = reflectionTypeBorderClass(reflection.reflection_type)

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-4 py-3.5 border-l-2 border-b border-house-border
        transition-all duration-150 group
        ${selected
          ? `${typeBorder} bg-house-bg`
          : 'border-l-transparent hover:bg-house-bg hover:border-l-house-muted'
        }
      `}
    >
      {/* Type + status row */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`font-body text-xs font-medium tracking-wide ${typeColor}`}>
          {formatReflectionType(reflection.reflection_type)}
        </span>
        <span className="text-text-muted">·</span>
        <span className={`font-body text-xs ${confidenceColorClass(reflection.confidence)}`}>
          {formatConfidence(reflection.confidence)}
        </span>
        <span className="ml-auto">
          {reflection.review_status === 'reviewed' && feedback ? (
            <span className={`font-body text-[10px] tracking-wide ${FEEDBACK_DISPLAY[feedback.feedback_label].colorClass}`}>
              {FEEDBACK_DISPLAY[feedback.feedback_label].label}
            </span>
          ) : reflection.review_status === 'unreviewed' ? (
            <span className="font-body text-[10px] text-text-muted tracking-wide">unreviewed</span>
          ) : null}
        </span>
      </div>

      {/* Content preview */}
      <p className="font-body text-sm text-text-primary leading-relaxed line-clamp-2">
        {reflection.content}
      </p>

      {/* Suggested target + date */}
      <div className="flex items-center gap-3 mt-2">
        {reflection.suggested_target && (
          <span className="font-body text-xs text-text-muted">
            → {formatSuggestedTarget(reflection.suggested_target)}
          </span>
        )}
        <span className="font-body text-xs text-text-muted ml-auto">
          {formatReflectionDate(reflection.created_at)}
        </span>
      </div>
    </button>
  )
}
