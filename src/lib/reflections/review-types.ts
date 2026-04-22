// Phase 24A — Reflection review types
// Feedback vocabulary and extended reflection shape with review state.

import type { SourceRef } from './reflection-types'

// --- Feedback labels ---

export type FeedbackLabel =
  | 'useful'
  | 'too_vague'
  | 'wrong_lane'
  | 'not_worth_carrying'
  | 'good_but_early'

export const FEEDBACK_LABELS: FeedbackLabel[] = [
  'useful',
  'too_vague',
  'wrong_lane',
  'not_worth_carrying',
  'good_but_early',
]

export const FEEDBACK_DISPLAY: Record<FeedbackLabel, {
  label: string
  colorClass: string
  activeClass: string
}> = {
  useful:               { label: 'Useful',              colorClass: 'text-green-400',  activeClass: 'border-green-400/60 bg-green-950/30 text-green-300'  },
  too_vague:            { label: 'Too vague',            colorClass: 'text-amber-400',  activeClass: 'border-amber-400/60 bg-amber-950/30 text-amber-300'  },
  wrong_lane:           { label: 'Wrong lane',           colorClass: 'text-orange-400', activeClass: 'border-orange-400/60 bg-orange-950/30 text-orange-300'},
  not_worth_carrying:   { label: 'Not worth carrying',   colorClass: 'text-text-muted', activeClass: 'border-house-muted bg-house-muted/20 text-text-secondary' },
  good_but_early:       { label: 'Good but early',       colorClass: 'text-blue-400',   activeClass: 'border-blue-400/60 bg-blue-950/30 text-blue-300'     },
}

// --- Review status ---

export type ReviewStatus = 'unreviewed' | 'reviewed'

// --- DB row shapes ---

export interface ReflectionFeedback {
  id: string
  reflection_id: string
  feedback_label: FeedbackLabel
  created_at: string
}

// Extended reflection shape returned by GET /api/reflections
export interface ReflectionWithFeedback {
  id: string
  presence_id: 'ari' | 'eli'
  reflection_type: string
  content: string
  confidence: number | null
  source_refs: SourceRef[]
  suggested_target: string | null
  routing_rationale: string | null
  review_status: ReviewStatus
  created_at: string
  reflection_feedback: ReflectionFeedback[]
}

// Derived: the most recent feedback label for a reflection, if any
export function latestFeedback(r: ReflectionWithFeedback): ReflectionFeedback | null {
  if (!r.reflection_feedback || r.reflection_feedback.length === 0) return null
  return [...r.reflection_feedback].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0]
}
