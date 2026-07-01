/**
 * Phase 42.4.1 — POST /api/agents/graph-proposals/[id]/review-state
 *
 * TRIAGE-ONLY review of a graph proposal: open / acknowledged / dismissed. Tara-only; 401
 * before any DB call; service-role server-side only; `reviewed_by` server-derived `tara`.
 * This is NOT approve-to-graph-truth — it never writes archive_graph / memory / graph_proposals.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireHouseApiAuth } from '@/lib/server/houseAuth'
import { GRAPH_PROPOSAL_SET_REVIEW_RPC, isValidGraphReviewState } from '@/lib/agents/graph_proposals/contract'

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

  const { id } = await ctx.params

  let body: unknown = null
  try { body = await request.json() } catch { body = null }
  const requested = (body as { review_state?: unknown } | null)?.review_state
  if (!isValidGraphReviewState(requested)) {
    return NextResponse.json({ ok: false, code: 'INVALID_REVIEW_STATE' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ ok: false, code: 'CONFIG_MISSING' }, { status: 503 })

  const sb = createClient(url, key)
  const { data, error } = await sb.rpc(GRAPH_PROPOSAL_SET_REVIEW_RPC, {
    p_proposal_id: id,
    p_review_state: requested,
    // reviewed_by is server-derived inside the RPC ('tara') — never caller-supplied
  })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, proposal: Array.isArray(data) ? (data[0] ?? null) : data })
}
