// Phase 38.4.1 — LLM Reasoning Feedback Write Endpoint
//
// POST /api/llm-reasoning-feedback
//
// Reasoning explains evidence. Reasoning does not create authority.
// Feedback evaluates reasoning usefulness only. Feedback does not move truth.
//
// Append-only. One feedback event per valid request.
// No UPDATE, DELETE, or overwrite logic.
// No LLM call. No draft regeneration. No draft storage.
// No Memory, Held Truth, graph proposal, or candidate creation.
// No review routing. No prompt eligibility changes.
// No mutation of any authority table.
//
// Feedback is NOT evidence.
// Feedback does NOT change authority.
// Feedback does NOT enter prompt context or evidence packet builders.

import { NextRequest, NextResponse } from 'next/server'
import { requireHouseApiAuth } from '@/lib/server/houseAuth'
import { supabase } from '@/lib/supabase'

// ─── Allowed feedback types ────────────────────────────────────────────────

const FEEDBACK_TYPES = [
  'useful',
  'not_useful',
  'needs_evidence',
  'misread',
  'candidate_signal',
] as const

type FeedbackType = typeof FEEDBACK_TYPES[number]

function isValidFeedbackType(value: string): value is FeedbackType {
  return (FEEDBACK_TYPES as readonly string[]).includes(value)
}

// ─── Safe failure builder ──────────────────────────────────────────────────

function fail(reason: string, status = 400) {
  return NextResponse.json({
    ok: false,
    reason,
    authority_changed: false,
    not_evidence: true,
    prompt_eligible: false,
    review_routed: false,
  }, { status })
}

// ─── Route ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Step 1: Auth check — must pass before any other action ─────────────
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  // ── Step 2: Parse body ──────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return fail('Invalid JSON body')
  }

  // ── Step 3: Validate suggestion_id ─────────────────────────────────────
  const suggestion_id = body.suggestion_id
  if (!suggestion_id || typeof suggestion_id !== 'string' || !suggestion_id.trim()) {
    return fail('suggestion_id is required')
  }
  // Basic UUID format check
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(suggestion_id)) {
    return fail('suggestion_id must be a valid UUID')
  }

  // ── Step 4: Validate feedback_type ─────────────────────────────────────
  const feedback_type = body.feedback_type
  if (!feedback_type || typeof feedback_type !== 'string') {
    return fail('feedback_type is required')
  }
  if (!isValidFeedbackType(feedback_type)) {
    return fail(`Invalid feedback_type. Allowed: ${FEEDBACK_TYPES.join(', ')}`)
  }

  // ── Step 5: Validate optional feedback_note ────────────────────────────
  const feedback_note = body.feedback_note ?? null
  if (feedback_note !== null) {
    if (typeof feedback_note !== 'string') {
      return fail('feedback_note must be a string')
    }
    if (feedback_note.length > 500) {
      return fail('feedback_note must be 500 characters or fewer')
    }
  }

  // ── Step 6: Optional draft metadata ────────────────────────────────────
  // Accepted as-is from client; not validated strictly since they're traceability only
  const draft_model = typeof body.draft_model === 'string' ? body.draft_model.slice(0, 100) : null
  const draft_generated_at = typeof body.draft_generated_at === 'string' ? body.draft_generated_at : null

  // ── Step 7: Fetch suggestion to snapshot status and candidate_type ──────
  // Read-only. Only fetch what is needed for the snapshot.
  const { data: suggestion, error: fetchErr } = await supabase
    .from('graph_candidate_suggestions')
    .select('status, candidate_type')
    .eq('id', suggestion_id)
    .is('deleted_at', null)
    .single()

  if (fetchErr || !suggestion) {
    return fail('Suggestion not found', 404)
  }

  // ── Step 8: Insert feedback event — server-owned governance fields ──────
  const { data: inserted, error: insertErr } = await supabase
    .from('llm_reasoning_feedback_events')
    .insert({
      suggestion_id,
      feedback_type,
      feedback_note,
      draft_model,
      draft_generated_at: draft_generated_at ? new Date(draft_generated_at).toISOString() : null,
      suggestion_status_at_feedback: suggestion.status,
      candidate_type_at_feedback: suggestion.candidate_type,
      // Server-set governance fields — never trusted from client:
      created_by: 'tara',
      authority_changed: false,
      not_evidence: true,
      prompt_eligible: false,
      review_routed: false,
    })
    .select('id, feedback_type, created_at, authority_changed, not_evidence, prompt_eligible, review_routed')
    .single()

  if (insertErr || !inserted) {
    console.error('[llm-reasoning-feedback] Insert error:', insertErr?.message)
    return fail('Failed to record feedback', 500)
  }

  return NextResponse.json({
    ok: true,
    feedback_id: inserted.id,
    feedback_type: inserted.feedback_type,
    created_at: inserted.created_at,
    authority_changed: inserted.authority_changed,
    not_evidence: inserted.not_evidence,
    prompt_eligible: inserted.prompt_eligible,
    review_routed: inserted.review_routed,
  })
}
