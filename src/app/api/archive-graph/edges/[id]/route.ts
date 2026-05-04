// Phase 29B — Archive Graph Edge approval/rejection
//
// PATCH /api/archive-graph/edges/[id]
//   Body: { action: 'approve' | 'reject' }
//
//   approve → approval_status = 'approved', reviewed_at = now()
//             BLOCKED if either endpoint node is rejected.
//   reject  → approval_status = 'rejected', reviewed_at = now()
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

  const supabase = getSupabase()

  // For approve: verify both endpoint nodes are not rejected
  if (action === 'approve') {
    const { data: edge, error: fetchErr } = await supabase
      .from('archive_graph_edges')
      .select('from_node_id, to_node_id')
      .eq('id', id)
      .single()

    if (fetchErr || !edge) {
      return NextResponse.json({ error: 'Edge not found' }, { status: 404 })
    }

    const { data: nodes, error: nodesErr } = await supabase
      .from('archive_graph_nodes')
      .select('id, approval_status')
      .in('id', [edge.from_node_id, edge.to_node_id])

    if (nodesErr || !nodes) {
      return NextResponse.json({ error: 'Failed to fetch endpoint nodes' }, { status: 500 })
    }

    const rejectedEndpoint = nodes.find(n => n.approval_status === 'rejected')
    if (rejectedEndpoint) {
      return NextResponse.json(
        {
          error: 'Cannot approve edge — one or both endpoint nodes are rejected. Approve both nodes first.',
          blocked: true,
        },
        { status: 409 }
      )
    }
  }

  const newStatus  = action === 'approve' ? 'approved' : 'rejected'
  const reviewedAt = new Date().toISOString()

  const { error: updateErr } = await supabase
    .from('archive_graph_edges')
    .update({ approval_status: newStatus, reviewed_at: reviewedAt })
    .eq('id', id)

  if (updateErr) {
    console.error('[archive-graph/edges] update error:', updateErr.message)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id, approval_status: newStatus })
}
