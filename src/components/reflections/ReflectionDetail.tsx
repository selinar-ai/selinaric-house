'use client'

// Phase 24A — Detail panel for a selected reflection.
// Shows full content, source refs, routing rationale, confidence, and feedback bar.

import {
  formatReflectionType,
  reflectionTypeColorClass,
  formatSuggestedTarget,
  formatConfidence,
  confidenceLabel,
  confidenceColorClass,
  formatSourceRefType,
  formatReflectionDate,
} from '@/lib/reflections/reflection-format'
import { latestFeedback, type FeedbackLabel, type ReflectionWithFeedback } from '@/lib/reflections/review-types'
import ReflectionFeedbackBar from './ReflectionFeedbackBar'
import CreateLivingStateSuggestionButton from './CreateLivingStateSuggestionButton'
import type { LivingStateSuggestion } from '@/lib/reflections/living-state-suggestion-types'

interface Props {
  reflection: ReflectionWithFeedback
  onBack?: () => void  // mobile back button
  onFeedbackSubmitted: (reflectionId: string, label: FeedbackLabel) => void
  onSuggestionCreated?: (suggestion: LivingStateSuggestion) => void
}

export default function ReflectionDetail({ reflection, onBack, onFeedbackSubmitted, onSuggestionCreated }: Props) {
  const feedback = latestFeedback(reflection)
  const typeColor = reflectionTypeColorClass(reflection.reflection_type)
  const confColor = confidenceColorClass(reflection.confidence)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-house-border flex items-start gap-3 shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="font-body text-xs text-text-muted hover:text-text-secondary mt-0.5 mr-1 shrink-0"
          >
            ← Back
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-body text-xs font-medium tracking-widest uppercase ${typeColor}`}>
              {formatReflectionType(reflection.reflection_type)}
            </span>
            <span className="text-text-muted text-xs">·</span>
            <span className="font-body text-xs text-text-muted">
              {reflection.presence_id === 'eli' ? 'Eli' : 'Ari'}
            </span>
            <span className="text-text-muted text-xs">·</span>
            <span className="font-body text-xs text-text-muted">
              {formatReflectionDate(reflection.created_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-6">

        {/* Content */}
        <div>
          <p className="font-body text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
            {reflection.content}
          </p>
        </div>

        {/* Metadata row */}
        <div className="grid grid-cols-2 gap-4 text-xs font-body">
          <div>
            <p className="text-text-muted tracking-wide uppercase mb-1">Confidence</p>
            <p className={`${confColor} font-medium`}>
              {confidenceLabel(reflection.confidence)} ({formatConfidence(reflection.confidence)})
            </p>
          </div>
          <div>
            <p className="text-text-muted tracking-wide uppercase mb-1">Suggested target</p>
            <p className="text-text-secondary">
              {formatSuggestedTarget(reflection.suggested_target)}
            </p>
          </div>
        </div>

        {/* Source references */}
        {reflection.source_refs && reflection.source_refs.length > 0 && (
          <div>
            <p className="font-body text-xs text-text-muted tracking-widest uppercase mb-2">
              Source material
            </p>
            <div className="space-y-1">
              {reflection.source_refs.map((ref, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-text-muted text-xs">◦</span>
                  <span className="font-body text-xs text-text-secondary">
                    {formatSourceRefType(ref.type)}
                  </span>
                  <span className="font-mono text-[10px] text-text-muted truncate">
                    {ref.id.slice(0, 8)}…
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Routing rationale */}
        {reflection.routing_rationale && (
          <div>
            <p className="font-body text-xs text-text-muted tracking-widest uppercase mb-2">
              Routing rationale
            </p>
            <p className="font-body text-xs text-text-muted leading-relaxed italic">
              {reflection.routing_rationale}
            </p>
          </div>
        )}

        {/* Feedback bar */}
        <ReflectionFeedbackBar
          reflectionId={reflection.id}
          reviewed={reflection.review_status === 'reviewed'}
          existingLabel={feedback?.feedback_label ?? null}
          onSubmitted={(label) => onFeedbackSubmitted(reflection.id, label)}
        />

        {/* Phase 25: Living State suggestion — only shown when eligible */}
        <CreateLivingStateSuggestionButton
          reflection={reflection}
          onCreated={(suggestion) => onSuggestionCreated?.(suggestion)}
        />
      </div>
    </div>
  )
}
