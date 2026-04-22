// Phase 24C — Reflection Calibration types
// Aggregated view of feedback across a presence's reflections.
// Computed on read — no dedicated table in v1.

import type { FeedbackLabel } from './review-types'
import type { ReflectionType, SuggestedTarget } from './reflection-types'

export type LabelCounts = Record<FeedbackLabel, number>

export function emptyLabelCounts(): LabelCounts {
  return {
    useful: 0,
    too_vague: 0,
    wrong_lane: 0,
    not_worth_carrying: 0,
    good_but_early: 0,
  }
}

export interface CalibrationSummary {
  presenceId: 'ari' | 'eli'
  totalReflections: number
  reviewedCount: number
  /** Label counts across all reviewed reflections. */
  labels: LabelCounts
  /** Label counts broken down by reflection_type. */
  byType: Partial<Record<ReflectionType, LabelCounts>>
  /** Label counts broken down by suggested_target (null target keyed as 'none'). */
  bySuggestedTarget: Partial<Record<NonNullable<SuggestedTarget> | 'none', LabelCounts>>
}
