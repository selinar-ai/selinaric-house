/**
 * Phase 42.3.3b — POST /api/agents/findings/[id]/review-state
 *
 * The ONLY write route. Tara-only; 401 before any DB call. Service role server-side
 * only. Sets review_state (open/acknowledged/dismissed — reversible) via the governed
 * `agent_finding_set_review_state` RPC, which updates only review fields. `reviewed_by`
 * is the SERVER-DERIVED constant — never read from the client body.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireHouseApiAuth } from '@/lib/server/houseAuth'
import { SET_REVIEW_STATE_RPC, REVIEWED_BY, isValidReviewState } from '@/lib/agents/maintenance/contract'

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

  const { id } = await ctx.params

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const requested = (body as { review_state?: unknown } | null)?.review_state
  if (!isValidReviewState(requested)) {
    return NextResponse.json({ ok: false, code: 'INVALID_REVIEW_STATE' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ ok: false, code: 'CONFIG_MISSING' }, { status: 503 })
  }

  const sb = createClient(url, key)
  const { data, error } = await sb.rpc(SET_REVIEW_STATE_RPC, {
    p_finding_id: id,
    p_review_state: requested,
    p_reviewed_by: REVIEWED_BY, // server-derived; never from the client
  })
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, finding: Array.isArray(data) ? (data[0] ?? null) : data })
}
