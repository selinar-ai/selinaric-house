/**
 * Phase 42.4.1 — GET /api/agents/graph-proposals (read-only, Tara-only)
 *
 * Lists SUGGEST-ONLY deterministic graph proposals for review. 401 before any DB call;
 * service-role server-side only; `p_include_test:false` hardcoded (production never shows
 * test-owned). Read-only — there is no add-to-graph / approve-to-graph / apply route here.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireHouseApiAuth } from '@/lib/server/houseAuth'
import { GRAPH_PROPOSALS_LIST_RPC, GRAPH_PROPOSAL_TARGET } from '@/lib/agents/graph_proposals/contract'

export async function GET(request: NextRequest) {
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ ok: false, code: 'CONFIG_MISSING' }, { status: 503 })

  const sb = createClient(url, key)
  const rs = request.nextUrl.searchParams.get('review_state')
  const reviewState = rs && rs.trim().length > 0 ? rs.trim() : null
  const { data, error } = await sb.rpc(GRAPH_PROPOSALS_LIST_RPC, {
    p_target_graph: GRAPH_PROPOSAL_TARGET,
    p_review_state: reviewState,
    p_include_test: false,
  })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const proposals = (data ?? []) as { from_node_id: string; to_node_id: string }[]

  // Phase 43 legibility enrichment — READ-ONLY: resolve node labels so a human can see
  // WHAT a proposal connects, not just row ids. Missing labels fail SOFT (row still renders,
  // UI falls back to the short id); a label-read error never blocks the listing.
  let labels: Record<string, string> = {}
  try {
    const ids = [...new Set(proposals.flatMap((p) => [p.from_node_id, p.to_node_id]))]
    if (ids.length > 0) {
      const { data: nodes } = await sb.from('archive_graph_nodes').select('id, label').in('id', ids)
      for (const n of nodes ?? []) if (typeof n.label === 'string' && n.label.trim() !== '') labels[n.id] = n.label
    }
  } catch {
    labels = {} // fail soft — legibility is best-effort, listing is not
  }
  return NextResponse.json({ ok: true, graph_proposals: proposals, node_labels: labels })
}
