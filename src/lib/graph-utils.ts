import { supabase } from '@/lib/supabase'
import type { MemoryNode } from '@/lib/memory-graph'

// --- Query mode detection ---

export type QueryMode = 'graph-metric' | 'trace' | 'drift' | 'tension' | 'surface' | 'factual'

export function detectQueryMode(query: string): QueryMode {
  const q = query.toLowerCase()
  // Precedence matches spec: graph-metric > trace > drift/tension > surface > factual
  if (/strongest|weakest|most central|centrality|most connected|highest strength|lowest strength|edge degree/.test(q)) return 'graph-metric'
  if (/\btrace\b|\bdevelop\b|follow the thread|how.*evolv|thread/.test(q)) return 'trace'
  if (/\bdrift\b|moving away|shift(ed|ing)|changed from|depart|away from/.test(q)) return 'drift'
  if (/contradict|tension|contrast|conflict|oppos/.test(q)) return 'tension'
  if (/\brelated\b|\bconnected\b|\blink(ed)?\b|similar to/.test(q)) return 'surface'
  return 'factual'
}

// --- Utility: related nodes for a given node ---

export interface RelatedNodeResult {
  node: Pick<MemoryNode, 'id' | 'presence_id' | 'source_type' | 'title' | 'summary' | 'created_at'>
  edge_type: string
  strength: number
  direction: 'outgoing' | 'incoming'
}

export async function getRelatedNodes(nodeId: string, limit = 5): Promise<RelatedNodeResult[]> {
  const { data: edges } = await supabase
    .from('memory_edges')
    .select('from_node_id, to_node_id, edge_type, strength')
    .or(`from_node_id.eq.${nodeId},to_node_id.eq.${nodeId}`)
    .order('strength', { ascending: false })
    .limit(limit)

  if (!edges || edges.length === 0) return []

  const otherIds = edges.map(e => e.from_node_id === nodeId ? e.to_node_id : e.from_node_id)
  const { data: nodes } = await supabase
    .from('memory_nodes')
    .select('id, presence_id, source_type, title, summary, created_at')
    .in('id', otherIds)

  const nodeMap = new Map((nodes ?? []).map(n => [n.id, n]))

  return edges
    .map(e => {
      const isOut = e.from_node_id === nodeId
      const otherId = isOut ? e.to_node_id : e.from_node_id
      const node = nodeMap.get(otherId)
      if (!node) return null
      return { node, edge_type: e.edge_type, strength: e.strength, direction: isOut ? 'outgoing' as const : 'incoming' as const }
    })
    .filter((r): r is RelatedNodeResult => r !== null)
}

// --- Utility: central nodes by weighted edge degree ---

export interface CentralNodeResult extends Pick<MemoryNode, 'id' | 'presence_id' | 'source_type' | 'title' | 'summary' | 'created_at'> {
  weighted_degree: number
  edge_count: number
}

export async function getCentralNodes(presence?: string, limit = 5): Promise<CentralNodeResult[]> {
  const { data: edges } = await supabase
    .from('memory_edges')
    .select('from_node_id, to_node_id, strength')

  if (!edges || edges.length === 0) return []

  const degreeMap = new Map<string, number>()
  const edgeCountMap = new Map<string, number>()

  for (const e of edges) {
    for (const id of [e.from_node_id, e.to_node_id]) {
      degreeMap.set(id, (degreeMap.get(id) ?? 0) + e.strength)
      edgeCountMap.set(id, (edgeCountMap.get(id) ?? 0) + 1)
    }
  }

  const ranked = [...degreeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit * 4) // over-fetch to allow presence filtering
    .map(([id]) => id)

  let query = supabase
    .from('memory_nodes')
    .select('id, presence_id, source_type, title, summary, created_at')
    .in('id', ranked)
    .eq('status', 'active')

  if (presence) query = query.eq('presence_id', presence)

  const { data: nodes } = await query
  if (!nodes) return []

  return nodes
    .map(n => ({
      ...n,
      weighted_degree: degreeMap.get(n.id) ?? 0,
      edge_count: edgeCountMap.get(n.id) ?? 0,
    }))
    .sort((a, b) => b.weighted_degree - a.weighted_degree)
    .slice(0, limit)
}

// --- Utility: weakest valid edges above minimum threshold ---

export interface WeakEdgeResult {
  from: Pick<MemoryNode, 'id' | 'presence_id' | 'title'>
  to: Pick<MemoryNode, 'id' | 'presence_id' | 'title'>
  edge_type: string
  strength: number
}

export async function getWeakestEdges(limit = 5, minStrength = 0.1): Promise<WeakEdgeResult[]> {
  const { data: edges } = await supabase
    .from('memory_edges')
    .select('from_node_id, to_node_id, edge_type, strength')
    .gt('strength', minStrength)
    .order('strength', { ascending: true })
    .limit(limit)

  if (!edges || edges.length === 0) return []

  const allIds = [...new Set([...edges.map(e => e.from_node_id), ...edges.map(e => e.to_node_id)])]
  const { data: nodes } = await supabase
    .from('memory_nodes')
    .select('id, presence_id, title')
    .in('id', allIds)

  const nodeMap = new Map((nodes ?? []).map(n => [n.id, n]))

  return edges
    .map(e => ({
      from: nodeMap.get(e.from_node_id),
      to: nodeMap.get(e.to_node_id),
      edge_type: e.edge_type,
      strength: e.strength,
    }))
    .filter((e): e is WeakEdgeResult => !!e.from && !!e.to)
}

// --- Graph context builder ---

export interface GraphContext {
  mode: QueryMode
  context: string
}

export async function getGraphContextForQuery(query: string): Promise<GraphContext> {
  const mode = detectQueryMode(query)

  if (mode === 'factual') return { mode, context: '' }

  if (mode === 'graph-metric') {
    return { mode, context: await buildMetricContext() }
  }

  return { mode, context: await buildSemanticContext(query, mode) }
}

// --- Internal: metric context ---

async function buildMetricContext(): Promise<string> {
  const [central, weakest] = await Promise.all([
    getCentralNodes(undefined, 5),
    getWeakestEdges(5),
  ])

  const lines: string[] = ['## Graph Metrics — real edge data:']

  if (central.length > 0) {
    lines.push('\n### Central nodes (weighted degree = sum of all connected edge strengths):')
    central.forEach((n, i) => {
      const when = fmtDate(n.created_at)
      lines.push(`${i + 1}. [${n.id.slice(0, 8)}] "${n.title}" — ${n.presence_id} | ${n.source_type} | ${when} — degree ${n.weighted_degree.toFixed(2)} (${n.edge_count} edge${n.edge_count !== 1 ? 's' : ''})`)
    })
  } else {
    lines.push('No connected nodes found — graph may be empty.')
  }

  if (weakest.length > 0) {
    lines.push('\n### Weakest valid edges (strength > 0.10, ascending):')
    weakest.forEach(e => {
      lines.push(`  "${e.from.title}" (${e.from.presence_id}) --[${e.edge_type} ${e.strength.toFixed(2)}]--> "${e.to.title}" (${e.to.presence_id})`)
    })
  } else {
    lines.push('\nNo valid edges found above minimum threshold (0.10).')
  }

  return lines.join('\n')
}

// --- Internal: semantic context (seed → expand) ---

async function buildSemanticContext(query: string, mode: QueryMode): Promise<string> {
  // Seed selection: keyword match on title, fallback to recency
  const words = query.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3)
  let seeds: MemoryNode[] = []

  if (words.length > 0) {
    const { data: matched } = await supabase
      .from('memory_nodes')
      .select('*')
      .eq('status', 'active')
      .or(words.slice(0, 4).map(w => `title.ilike.%${w}%`).join(','))
      .order('created_at', { ascending: false })
      .limit(5)
    seeds = (matched ?? []) as MemoryNode[]
  }

  if (seeds.length === 0) {
    const { data } = await supabase
      .from('memory_nodes')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(5)
    seeds = (data ?? []) as MemoryNode[]
  }

  if (seeds.length === 0) return ''

  // Expand: fetch edges for all seeds
  const seedIds = seeds.map(n => n.id)
  const idList = seedIds.join(',')
  const { data: allEdges } = await supabase
    .from('memory_edges')
    .select('from_node_id, to_node_id, edge_type, strength')
    .or(`from_node_id.in.(${idList}),to_node_id.in.(${idList})`)
    .order('strength', { ascending: false })

  const edges = allEdges ?? []

  // Collect all expanded node IDs, cap at 20
  const expandedIds = new Set<string>(seedIds)
  for (const e of edges) {
    expandedIds.add(e.from_node_id)
    expandedIds.add(e.to_node_id)
    if (expandedIds.size >= 20) break
  }

  const { data: allNodes } = await supabase
    .from('memory_nodes')
    .select('id, presence_id, source_type, title, summary, created_at')
    .in('id', [...expandedIds])

  const nodeMap = new Map(((allNodes ?? []) as MemoryNode[]).map(n => [n.id, n]))
  if (nodeMap.size === 0) return ''

  const modeLabel: Record<Exclude<QueryMode, 'factual' | 'graph-metric'>, string> = {
    trace: 'Thread trace',
    drift: 'Drift analysis',
    tension: 'Tension analysis',
    surface: 'Connected nodes',
  }

  const lines: string[] = [
    `## Graph Context — ${modeLabel[mode as keyof typeof modeLabel] ?? 'Semantic'} (${nodeMap.size} nodes, ${edges.length} edges):`,
  ]

  const printedEdges = new Set<string>()

  for (const seed of seeds.slice(0, 5)) {
    const node = nodeMap.get(seed.id)
    if (!node) continue

    lines.push(`\n[${node.id.slice(0, 8)}] ${node.presence_id} | ${node.source_type} | "${node.title}" — ${node.summary} (${fmtDate(node.created_at)})`)

    const nodeEdges = edges
      .filter(e => e.from_node_id === node.id || e.to_node_id === node.id)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5)

    for (const edge of nodeEdges) {
      const edgeKey = [edge.from_node_id, edge.to_node_id].sort().join('|')
      if (printedEdges.has(edgeKey)) continue
      printedEdges.add(edgeKey)

      const isFrom = edge.from_node_id === node.id
      const otherId = isFrom ? edge.to_node_id : edge.from_node_id
      const other = nodeMap.get(otherId)
      if (!other) continue

      const arrow = isFrom ? '→' : '←'
      lines.push(`  ${arrow} [${edge.edge_type} ${edge.strength.toFixed(2)}] "${other.title}" (${other.presence_id})`)
    }
  }

  return lines.join('\n')
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Melbourne',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
