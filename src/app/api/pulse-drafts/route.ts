import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * Phase 11 Stage 2: Draft Review Engine API
 *
 * GET  — Returns drafts with status 'approved' or 'pending', with feedback if exists
 * POST — Submits feedback for a specific draft
 */

export async function GET() {
  // Fetch visible drafts
  const { data: drafts, error: draftsError } = await supabase
    .from('pulse_drafts')
    .select('*')
    .in('status', ['approved', 'pending'])
    .order('created_at', { ascending: false })

  if (draftsError) {
    return NextResponse.json({ error: 'Failed to load drafts' }, { status: 500 })
  }

  if (!drafts || drafts.length === 0) {
    return NextResponse.json({ drafts: [] })
  }

  // Fetch all feedback for these drafts in one query
  const draftIds = drafts.map(d => d.id)
  const { data: feedback } = await supabase
    .from('pulse_feedback')
    .select('draft_id, feedback_label')
    .in('draft_id', draftIds)
    .order('created_at', { ascending: false })

  // Build a map of draft_id -> most recent feedback_label
  const feedbackMap: Record<string, string> = {}
  for (const fb of feedback ?? []) {
    if (!feedbackMap[fb.draft_id]) {
      feedbackMap[fb.draft_id] = fb.feedback_label
    }
  }

  // Shape response
  const shaped = drafts.map(d => ({
    id: d.id,
    presence_id: d.presence_id,
    content: d.content,
    status: d.status,
    created_at: d.created_at,
    draft_scores: d.draft_scores,
    gate_passed: d.gate_passed,
    signals: d.signals,
    decision_reason: d.decision_reason,
    confidence: d.confidence,
    specificity: d.specificity,
    feedback: feedbackMap[d.id] ?? null
  }))

  return NextResponse.json({ drafts: shaped })
}

const VALID_LABELS = [
  'keep',
  'too_generic',
  'too_repetitive',
  'not_worth_interrupting',
  'wrong_voice',
  'too_meta',
  'good_but_not_ripe'
] as const

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { draft_id, feedback_label } = body

  if (!draft_id || !feedback_label) {
    return NextResponse.json({ error: 'draft_id and feedback_label required' }, { status: 400 })
  }

  if (!VALID_LABELS.includes(feedback_label)) {
    return NextResponse.json({ error: `Invalid feedback_label. Must be one of: ${VALID_LABELS.join(', ')}` }, { status: 400 })
  }

  // Look up the draft to get presence_id
  const { data: draft, error: draftError } = await supabase
    .from('pulse_drafts')
    .select('presence_id')
    .eq('id', draft_id)
    .single()

  if (draftError || !draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  // Upsert feedback — delete any existing feedback for this draft, then insert new
  await supabase
    .from('pulse_feedback')
    .delete()
    .eq('draft_id', draft_id)

  const { error: insertError } = await supabase
    .from('pulse_feedback')
    .insert({
      draft_id,
      presence_id: draft.presence_id,
      feedback_label
    })

  if (insertError) {
    return NextResponse.json({ error: 'Failed to store feedback' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
