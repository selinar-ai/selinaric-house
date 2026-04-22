// Phase 24A — Reflection feedback API
// POST { reflectionId, feedbackLabel }
//      Persists one feedback label for a reflection.
//      Marks the reflection review_status = 'reviewed'.
//      One label per reflection in v1 — re-submission is blocked.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { FEEDBACK_LABELS, type FeedbackLabel } from '@/lib/reflections/review-types'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(request: NextRequest) {
  let body: { reflectionId?: string; feedbackLabel?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { reflectionId, feedbackLabel } = body

  if (!reflectionId || typeof reflectionId !== 'string') {
    return NextResponse.json({ error: 'reflectionId required' }, { status: 400 })
  }
  if (!feedbackLabel || !FEEDBACK_LABELS.includes(feedbackLabel as FeedbackLabel)) {
    return NextResponse.json(
      { error: `feedbackLabel must be one of: ${FEEDBACK_LABELS.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = getSupabase()

  // Check reflection exists
  const { data: reflection, error: fetchError } = await supabase
    .from('reflections')
    .select('id, review_status')
    .eq('id', reflectionId)
    .single()

  if (fetchError || !reflection) {
    return NextResponse.json({ error: 'Reflection not found' }, { status: 404 })
  }

  // Block re-submission in v1 — one feedback label per reflection
  if (reflection.review_status === 'reviewed') {
    return NextResponse.json(
      { error: 'This reflection has already been reviewed' },
      { status: 409 }
    )
  }

  // Insert feedback
  const { data: feedback, error: insertError } = await supabase
    .from('reflection_feedback')
    .insert({
      reflection_id: reflectionId,
      feedback_label: feedbackLabel,
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Mark reflection as reviewed
  const { error: updateError } = await supabase
    .from('reflections')
    .update({ review_status: 'reviewed' })
    .eq('id', reflectionId)

  if (updateError) {
    console.error('[reflection-feedback] Failed to update review_status:', updateError.message)
    // Feedback was saved — don't fail the request over the status update
  }

  return NextResponse.json({ feedback }, { status: 201 })
}
