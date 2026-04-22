// Phase 24C — Reflection Calibration compute logic
// Queries existing reflections + reflection_feedback join, aggregates in TypeScript.
// No dedicated table — computed on read.

import { createClient } from '@supabase/supabase-js'
import {
  emptyLabelCounts,
  type CalibrationSummary,
  type LabelCounts,
} from './calibration-types'
import type { FeedbackLabel } from './review-types'
import type { ReflectionType, SuggestedTarget } from './reflection-types'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const VALID_LABELS = new Set<FeedbackLabel>([
  'useful', 'too_vague', 'wrong_lane', 'not_worth_carrying', 'good_but_early',
])

function isValidLabel(s: string): s is FeedbackLabel {
  return VALID_LABELS.has(s as FeedbackLabel)
}

interface RawReflection {
  id: string
  reflection_type: ReflectionType
  suggested_target: SuggestedTarget
  review_status: string
  reflection_feedback: { feedback_label: string }[]
}

/**
 * Compute calibration summary for a presence.
 * Reads from reflections + reflection_feedback in a single query.
 */
export async function computeCalibration(
  presenceId: 'ari' | 'eli'
): Promise<CalibrationSummary> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('reflections')
    .select('id, reflection_type, suggested_target, review_status, reflection_feedback(feedback_label)')
    .eq('presence_id', presenceId)

  if (error) {
    throw new Error(`[calibration:query] ${error.message}`)
  }

  const rows = (data ?? []) as RawReflection[]

  const summary: CalibrationSummary = {
    presenceId,
    totalReflections: rows.length,
    reviewedCount: 0,
    labels: emptyLabelCounts(),
    byType: {},
    bySuggestedTarget: {},
  }

  for (const row of rows) {
    if (row.review_status !== 'reviewed') continue
    if (!row.reflection_feedback?.length) continue

    // Use the first (latest) feedback entry per reflection
    const rawLabel = row.reflection_feedback[0]?.feedback_label
    if (!rawLabel || !isValidLabel(rawLabel)) continue

    const label = rawLabel as FeedbackLabel

    summary.reviewedCount++

    // Total label counts
    summary.labels[label]++

    // By reflection_type
    const rType = row.reflection_type
    if (rType) {
      if (!summary.byType[rType]) summary.byType[rType] = emptyLabelCounts()
      ;(summary.byType[rType] as LabelCounts)[label]++
    }

    // By suggested_target (null → 'none')
    const targetKey = (row.suggested_target ?? 'none') as NonNullable<SuggestedTarget> | 'none'
    if (!summary.bySuggestedTarget[targetKey]) {
      summary.bySuggestedTarget[targetKey] = emptyLabelCounts()
    }
    ;(summary.bySuggestedTarget[targetKey] as LabelCounts)[label]++
  }

  return summary
}
