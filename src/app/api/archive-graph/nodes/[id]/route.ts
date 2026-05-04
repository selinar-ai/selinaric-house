// Phase 29B — Archive Graph Node approval/rejection
//
// PATCH /api/archive-graph/nodes/[id]
//   Body: { action: 'approve' | 'reject' }
//
//   approve → approval_status = 'approved', reviewed_at = now()
//   reject  → approval_status = 'rejected', reviewed_at = now()
//
//   When a node is rejected, any pending edges where it is an endpoint
//   are also rejected (cascade rejection — edge cannot be approved without
//   both endpoints approved).
//
// No auth gate in v1 (admin-only surface, open RLS).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let body: { action?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { action } = body

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json(
      { error: 'action must be approve or reject' },
      { status: 400 }
    )
  }

  const supabase     = getSupabase()
  const newStatus    = action === 'approve' ? 'approved' : 'rejected'
  const reviewedAt   = new Date().toISOString()

  const { error: updateErr } = await supabase
    .from('archive_graph_nodes')
    .update({ approval_status: newStatus, reviewed_at: reviewedAt })
    .eq('id', id)

  if (updateErr) {
    console.error('[archive-graph/nodes] update error:', updateErr.message)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // When rejecting a node, cascade-reject any pending edges where this node
  // is from_node_id or to_node_id. This enforces the law:
  //   "Edge approval blocked if either endpoint node is rejected."
  if (action === 'reject') {
    const { error: edgeCascadeErr } = await supabase
      .from('archive_graph_edges')
      .update({ approval_status: 'rejected', reviewed_at: reviewedAt })
      .eq('approval_status', 'pending')
      .or(`from_node_id.eq.${id},to_node_id.eq.${id}`)

    if (edgeCascadeErr) {
      // Non-fatal — log but don't fail the request
      console.error('[archive-graph/nodes] edge cascade error:', edgeCascadeErr.message)
    }
  }

  return NextResponse.json({ success: true, id, approval_status: newStatus })
}
