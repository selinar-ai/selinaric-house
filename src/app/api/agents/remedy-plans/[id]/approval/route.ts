/**
 * Phase 42.3.4b — POST /api/agents/remedy-plans/[id]/approval
 *
 * The approval AUTHORITY-EVENT write route. Tara-only; 401 before any DB call. Service
 * role server-side only. Records an append-only approved/rejected/revoked decision via the
 * governed `agent_remedy_approval_record` RPC. `decided_by` is server-derived inside the
 * RPC (never from the client). `p_allow_test_owned` is ALWAYS false here — the normal route
 * can never create test-owned approval events. This route does NOT apply, queue, or run
 * anything; approval means "authorised for future apply consideration" only.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireHouseApiAuth } from '@/lib/server/houseAuth'
import { APPROVAL_RECORD_RPC, isValidDecision } from '@/lib/agents/maintenance/contract'

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
  const decision = (body as { decision?: unknown } | null)?.decision
  if (!isValidDecision(decision)) {
    return NextResponse.json({ ok: false, code: 'INVALID_DECISION' }, { status: 400 })
  }
  const rawReason = (body as { reason?: unknown } | null)?.reason
  const reason = typeof rawReason === 'string' && rawReason.trim().length > 0 ? rawReason.trim() : null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ ok: false, code: 'CONFIG_MISSING' }, { status: 503 })
  }

  const sb = createClient(url, key)
  const { data, error } = await sb.rpc(APPROVAL_RECORD_RPC, {
    p_remedy_plan_id: id,
    p_decision: decision,
    p_decision_reason: reason,
    p_allow_test_owned: false, // normal route NEVER creates test-owned approval events
  })
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true, event: Array.isArray(data) ? (data[0] ?? null) : data })
}
