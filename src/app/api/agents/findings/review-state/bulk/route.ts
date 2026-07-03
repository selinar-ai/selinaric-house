/**
 * Phase 43 (bulk triage) — POST /api/agents/findings/review-state/bulk
 *
 * Filter-scoped bulk review for persisted findings ONLY. Tara-only; 401 before any
 * DB call. Loops the EXISTING governed `agent_finding_set_review_state` RPC once per
 * id — no new SQL, no new verbs, per-row `reviewed_by`/`reviewed_at` stamps preserved.
 * Fails closed on empty ids or more than BULK_REVIEW_MAX_IDS. Partial failures are
 * reported honestly per id; nothing is retried or rolled back silently.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireHouseApiAuth } from '@/lib/server/houseAuth'
import { SET_REVIEW_STATE_RPC, REVIEWED_BY, BULK_REVIEW_MAX_IDS, isValidReviewState } from '@/lib/agents/maintenance/contract'

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
  if (!isValidReviewState(requested)) {
    return NextResponse.json({ ok: false, code: 'INVALID_REVIEW_STATE' }, { status: 400 })
  }
  const rawIds = (body as { ids?: unknown } | null)?.ids
  if (!Array.isArray(rawIds) || !rawIds.every((x) => typeof x === 'string' && x.trim() !== '')) {
    return NextResponse.json({ ok: false, code: 'INVALID_IDS' }, { status: 400 })
  }
  const ids = [...new Set(rawIds.map((x) => x.trim()))]
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, code: 'EMPTY_IDS' }, { status: 400 })
  }
  if (ids.length > BULK_REVIEW_MAX_IDS) {
    return NextResponse.json({ ok: false, code: 'TOO_MANY_IDS', max: BULK_REVIEW_MAX_IDS }, { status: 400 })
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
    const { error } = await sb.rpc(SET_REVIEW_STATE_RPC, {
      p_finding_id: id,
      p_review_state: requested,
      p_reviewed_by: REVIEWED_BY, // server-derived; never from the client
    })
    if (error) failed.push({ id, error: error.message })
    else succeeded++
  }

  return NextResponse.json({ ok: failed.length === 0, requested_count: ids.length, succeeded, failed })
}
