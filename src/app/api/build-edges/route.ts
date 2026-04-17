import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createEdgesForNode } from '@/lib/memory-graph'
import type { MemoryNode } from '@/lib/memory-graph'

const DEADLINE_MS = 52_000

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '10', 10), 50)
  const deadline = Date.now() + DEADLINE_MS

  console.log(`[build-edges] starting — limit=${limit}`)

  const { data, error } = await supabase
    .from('memory_nodes')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[build-edges] failed to fetch nodes:', error)
    return NextResponse.json({ error: 'Failed to fetch nodes' }, { status: 500 })
  }

  const nodes = (data ?? []) as MemoryNode[]
  console.log(`[build-edges] fetched ${nodes.length} nodes`)

  let edges_created = 0
  let timed_out = false
  const failures: string[] = []

  for (const node of nodes) {
    if (Date.now() >= deadline) {
      timed_out = true
      console.warn('[build-edges] deadline reached mid-batch')
      break
    }

    try {
      const count = await createEdgesForNode(node, node.embedding as number[] | null, apiKey)
      edges_created += count
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      failures.push(`${node.id.slice(0, 8)} ("${node.title}"): ${msg}`)
      console.error(`[build-edges] failed for node ${node.id.slice(0, 8)}:`, msg)
    }
  }

  const { count: total_edge_count } = await supabase
    .from('memory_edges')
    .select('*', { count: 'exact', head: true })

  console.log(`[build-edges] done — nodes_processed=${nodes.length} edges_created=${edges_created} total=${total_edge_count ?? 0} timed_out=${timed_out}`)

  return NextResponse.json({
    nodes_processed: nodes.length,
    edges_created,
    total_edge_count: total_edge_count ?? 0,
    timed_out,
    complete: !timed_out && failures.length === 0,
    failures,
  })
}
