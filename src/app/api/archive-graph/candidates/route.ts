// Phase 29B — Archive Graph Candidates Route
//
// GET ?archive=velvet&status=pending
//   Returns pending (or all) graph nodes + edges for the given archive.
//   Nodes: all fields. Edges: joined with from_node and to_node labels.
//
// No auth required (admin view only, no sensitive data beyond what's already in the UI).
//
// Response:
//   { nodes: GraphNode[], edges: GraphEdge[] }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { GraphNode, GraphEdge } from '@/lib/archive-graph'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const VALID_ARCHIVE_NAMES  = ['velvet', 'violet', 'house']
const VALID_STATUSES       = ['pending', 'approved', 'rejected', 'all']

export async function GET(req: NextRequest) {
  const archive = req.nextUrl.searchParams.get('archive')
  const status  = req.nextUrl.searchParams.get('status') ?? 'pending'

  if (!archive || !VALID_ARCHIVE_NAMES.includes(archive)) {
    return NextResponse.json(
      { error: 'archive param required: velvet | violet | house' },
      { status: 400 }
    )
  }

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: 'status param must be: pending | approved | rejected | all' },
      { status: 400 }
    )
  }

  const supabase = getSupabase()

  // ── Fetch nodes ───────────────────────────────────────────────────────────
  let nodesQuery = supabase
    .from('archive_graph_nodes')
    .select('*')
    .eq('archive_name', archive)
    .order('created_at', { ascending: false })

  if (status !== 'all') {
    nodesQuery = nodesQuery.eq('approval_status', status)
  }

  const { data: nodes, error: nodesErr } = await nodesQuery

  if (nodesErr) {
    console.error('[archive-graph/candidates] nodes error:', nodesErr.message)
    return NextResponse.json({ error: nodesErr.message }, { status: 500 })
  }

  // ── Fetch edges with joined node labels ───────────────────────────────────
  let edgesQuery = supabase
    .from('archive_graph_edges')
    .select(`
      *,
      from_node:archive_graph_nodes!from_node_id (
        id, label, node_type, approval_status
      ),
      to_node:archive_graph_nodes!to_node_id (
        id, label, node_type, approval_status
      )
    `)
    .eq('archive_name', archive)
    .order('created_at', { ascending: false })

  if (status !== 'all') {
    edgesQuery = edgesQuery.eq('approval_status', status)
  }

  const { data: edges, error: edgesErr } = await edgesQuery

  if (edgesErr) {
    console.error('[archive-graph/candidates] edges error:', edgesErr.message)
    return NextResponse.json({ error: edgesErr.message }, { status: 500 })
  }

  return NextResponse.json({
    nodes: (nodes ?? []) as GraphNode[],
    edges: (edges ?? []) as GraphEdge[],
  })
}
