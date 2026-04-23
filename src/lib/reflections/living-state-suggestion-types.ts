// Phase 25 — Living State Suggestions: types and eligibility check

import { latestFeedback, type ReflectionWithFeedback } from './review-types'

// --- DB row shape ---

export interface LivingStateSuggestion {
  id: string
  presence_id: 'ari' | 'eli'
  reflection_id: string
  proposed_state: string
  rationale: string | null
  status: 'pending' | 'approved' | 'dismissed'
  created_at: string
  decided_at: string | null
}

// Extended shape — GET /api/living-state-suggestions returns this
export interface LivingStateSuggestionWithReflection extends LivingStateSuggestion {
  reflection_summary: {
    content: string
    reflection_type: string
    confidence: number | null
  } | null
}

export type SuggestionAction = 'approve' | 'dismiss'

// --- Eligibility ---

/**
 * A reflection is eligible to generate a Living State suggestion only when:
 *   - review_status is 'reviewed'
 *   - suggested_target is 'living_state'
 *   - latest feedback label is 'useful' or 'good_but_early'
 *
 * All other reflections are ineligible. No exceptions in v1.
 */
export function isEligibleForSuggestion(reflection: ReflectionWithFeedback): boolean {
  if (reflection.review_status !== 'reviewed') return false
  if (reflection.suggested_target !== 'living_state') return false
  const fb = latestFeedback(reflection)
  if (!fb) return false
  return fb.feedback_label === 'useful' || fb.feedback_label === 'good_but_early'
}
