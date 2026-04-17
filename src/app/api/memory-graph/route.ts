import { NextRequest, NextResponse } from 'next/server'
import { loadNodes, loadEdgesForNodes } from '@/lib/memory-graph'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const presence = searchParams.get('presence') ?? undefined
  const status = searchParams.get('status') ?? 'active'
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? parseInt(limitParam, 10) : 50
  const withEdges = searchParams.get('edges') === 'true'

  const nodes = await loadNodes({ presence_id: presence, status, limit })

  if (withEdges) {
    const edges = await loadEdgesForNodes(nodes.map(n => n.id))
    return NextResponse.json({ nodes, edges })
  }

  return NextResponse.json({ nodes })
}
