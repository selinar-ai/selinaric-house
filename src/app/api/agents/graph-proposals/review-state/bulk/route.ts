/**
 * Phase 43 (graph bulk triage) — POST /api/agents/graph-proposals/review-state/bulk
 *
 * Filter-scoped bulk triage for graph PROPOSALS only. Mirrors the accepted findings
 * bulk-triage posture byte-for-byte: Tara-only, 401 before any DB call; loops the
 * EXISTING governed `agent_graph_proposal_set_review_state` RPC once per id (reviewed_by
 * is server-derived INSIDE the RPC — this route never sends it); same three verbs.
 * Fails closed on empty, invalid, DUPLICATE, mismatched-count, or over-cap payloads.
 * Partial failures reported honestly per id. No new SQL, no migration, no auto-triage.
 * Triage only — there is no approve-to-graph-truth, no promote, no edge write anywhere here.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireHouseApiAuth } from '@/lib/server/houseAuth'
import { GRAPH_PROPOSAL_SET_REVIEW_RPC, GRAPH_BULK_REVIEW_MAX_IDS, isValidGraphReviewState } from '@/lib/agents/graph_proposals/contract'

export async function POST(request: NextRequest) {
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const requested = (body as { review_state?: unknown } | null)?.review_state
  if (!isValidGraphReviewState(requested)) {
    return NextResponse.json({ ok: false, code: 'INVALID_REVIEW_STATE' }, { status: 400 })
  }
  const rawIds = (body as { ids?: unknown } | null)?.ids
  if (!Array.isArray(rawIds) || !rawIds.every((x) => typeof x === 'string' && x.trim() !== '')) {
    return NextResponse.json({ ok: false, code: 'INVALID_IDS' }, { status: 400 })
  }
  const ids = rawIds.map((x) => x.trim())
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, code: 'EMPTY_IDS' }, { status: 400 })
  }
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ ok: false, code: 'DUPLICATE_IDS' }, { status: 400 })
  }
  if (ids.length > GRAPH_BULK_REVIEW_MAX_IDS) {
    return NextResponse.json({ ok: false, code: 'TOO_MANY_IDS', max: GRAPH_BULK_REVIEW_MAX_IDS }, { status: 400 })
  }
  // the UI declares how many rows it is showing; a mismatch means the payload is not
  // the displayed set — fail closed rather than act on something the human did not see
  const expected = (body as { expected_count?: unknown } | null)?.expected_count
  if (typeof expected !== 'number' || expected !== ids.length) {
    return NextResponse.json({ ok: false, code: 'COUNT_MISMATCH' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ ok: false, code: 'CONFIG_MISSING' }, { status: 503 })
  }

  const sb = createClient(url, key)
  let succeeded = 0
  const failed: { id: string; error: string }[] = []
  for (const id of ids) {
    const { error } = await sb.rpc(GRAPH_PROPOSAL_SET_REVIEW_RPC, {
      p_proposal_id: id,
      p_review_state: requested, // reviewed_by is server-derived inside the RPC
    })
    if (error) failed.push({ id, error: error.message })
    else succeeded++
  }

  return NextResponse.json({ ok: failed.length === 0, requested_count: ids.length, succeeded, failed })
}
