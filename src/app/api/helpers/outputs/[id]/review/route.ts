// Phase 41.12 — Tara-only Single Helper Review Mutation
// POST /api/helpers/outputs/[id]/review
//
// Workflow-state only. Tara-only, one row at a time. Changes review_state +
// reviewed_by + reviewed_at and appends one helper_review_events row, atomically
// via the helper_review_apply() RPC (migration 077). It does NOT approve, apply,
// promote, remember, evidence, route, run helpers, expose prompts, or mutate any
// authority-bearing surface, burden field, payload, source_refs, or authority
// flag. No batch, no bulk, no multi-id.
//
// Review state is workflow metadata, not authority.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireHouseApiAuth } from '@/lib/server/houseAuth'
import { parseReviewRequestBody, planHelperReviewMutation } from '@/lib/helpers/helperReviewMutation'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// Safe read-model DTO — only display-safe fields of the single updated row.
const DTO_COLUMNS = [
  'id', 'helper_type', 'output_status', 'suggested_action', 'confidence_label',
  'presence_scope', 'created_by', 'created_at', 'review_state', 'reviewed_by',
  'reviewed_at', 'risk_class', 'review_priority', 'review_mode', 'batch_eligible',
  'sample_required', 'escalation_required', 'escalation_reasons',
  'not_memory', 'not_evidence', 'prompt_eligible', 'authority_changed',
  'human_review_required', 'review_routed', 'deleted_at',
] as const

function toDto(row: Record<string, unknown>): Record<string, unknown> {
  const dto: Record<string, unknown> = {}
  for (const k of DTO_COLUMNS) dto[k] = row[k]
  return dto
}

function fail(code: string, reason: string, status: number) {
  return NextResponse.json(
    { ok: false, code, reason, authority_changed: false, not_memory: true, not_evidence: true },
    { status },
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Step 1: Auth — must pass before any hydration/validation/DB work ──
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  const { id } = await params
  if (!id || typeof id !== 'string' || !id.trim()) {
    return fail('INVALID_ID', 'Missing helper output id', 400)
  }

  // ── Step 2: Parse + shape-validate the body (single row, allowed action) ──
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail('INVALID_BODY', 'Body must be valid JSON', 400)
  }
  const parsed = parseReviewRequestBody(body)
  if (!parsed.ok) {
    return fail(parsed.code, parsed.reason, parsed.status)
  }

  const supabase = getSupabase()

  // ── Step 3: Fetch the one row (workflow fields only) ──
  const { data: row, error: fetchErr } = await supabase
    .from('helper_outputs')
    .select('id, review_state, deleted_at')
    .eq('id', id)
    .maybeSingle()
  if (fetchErr) {
    return fail('LOOKUP_FAILED', 'Failed to load helper output', 500)
  }

  // ── Step 4: Plan (pure) — legality, soft-delete, concurrency, transition ──
  const plan = planHelperReviewMutation({
    action: parsed.value.action,
    expectedReviewState: parsed.value.expectedReviewState,
    row: row as { id: string; review_state: string; deleted_at: string | null } | null,
  })
  if (!plan.ok) {
    return fail(plan.code, plan.reason, plan.status)
  }

  // ── Step 5: Atomic apply (update + one event in a single transaction) ──
  const { data: updated, error: rpcErr } = await supabase.rpc('helper_review_apply', {
    p_id: id,
    p_action: plan.action,
    p_new_state: plan.new_state,
    p_expected_state: plan.previous_state,
  })
  if (rpcErr) {
    const msg = rpcErr.message || ''
    if (msg.includes('REVIEW_STATE_CHANGED')) return fail('REVIEW_STATE_CHANGED', 'Review state changed concurrently', 409)
    if (msg.includes('HELPER_OUTPUT_DELETED')) return fail('HELPER_OUTPUT_DELETED', 'Helper output is soft-deleted', 422)
    if (msg.includes('HELPER_OUTPUT_NOT_FOUND')) return fail('HELPER_OUTPUT_NOT_FOUND', 'Helper output not found', 404)
    if (msg.includes('INVALID_ACTION_STATE_MAPPING')) return fail('INVALID_ACTION_STATE_MAPPING', 'Action does not map to that state', 422)
    return fail('REVIEW_APPLY_FAILED', 'Review mutation failed; no partial change', 500)
  }

  // RPC returns the updated helper_outputs row (composite). Project a safe DTO.
  const updatedRow = (Array.isArray(updated) ? updated[0] : updated) as Record<string, unknown> | null
  if (!updatedRow) {
    return fail('REVIEW_APPLY_FAILED', 'Review mutation returned no row', 500)
  }

  return NextResponse.json({ ok: true, row: toDto(updatedRow) })
}
