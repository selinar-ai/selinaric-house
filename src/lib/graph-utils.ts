import { supabase } from '@/lib/supabase'
import type { MemoryNode } from '@/lib/memory-graph'

// --- Query mode detection ---

export type QueryMode = 'graph-metric' | 'trace' | 'drift' | 'tension' | 'surface' | 'factual'

export function detectQueryMode(query: string): QueryMode {
  const q = query.toLowerCase()
  // Precedence: graph-metric > trace > drift > tension > surface > factual
  //
  // Fix 1: broadened to catch natural-language comparisons even without exact keywords.
  // "most/least/more/fewer/compare/versus" all bias toward graph-metric when the
  // query is implicitly asking for a ranked or comparative graph answer.
  if (/strongest|weakest|most central|centrality|most connected|highest strength|lowest strength|edge degree/.test(q)) return 'graph-metric'
  if (/\bmost\b|\bleast\b|\bmore than\b|\bfewer\b|\bcompare\b|\bversus\b|\bvs\b|\bwhich.*(?:more|less|stronger|weaker|better|closer)\b/.test(q)) return 'graph-metric'
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
      return {
        node,
        edge_type: e.edge_type,
        strength: e.strength,
        direction: isOut ? 'outgoing' as const : 'incoming' as const,
      }
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

  // Fix 8 (scaling note): weighted degree is computed application-side as the sum of all
  // connected edge strengths. Acceptable at current graph density. Flag for review if the
  // graph grows significantly — at high node/edge counts, prefer database-side aggregation.
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
  // Fix 5: local context — edge count of each endpoint, so Watchtower can distinguish
  // a globally weak edge from a weak edge within a dense cluster.
  from_degree: number
  to_degree: number
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

  // Fetch node data and all edges touching these nodes in parallel
  const [nodesResult, degreeEdgesResult] = await Promise.all([
    supabase.from('memory_nodes').select('id, presence_id, title').in('id', allIds),
    supabase
      .from('memory_edges')
      .select('from_node_id, to_node_id')
      .or(`from_node_id.in.(${allIds.join(',')}),to_node_id.in.(${allIds.join(',')})`)
  ])

  const nodeMap = new Map((nodesResult.data ?? []).map(n => [n.id, n]))

  // Compute edge count per node for local context
  const degreeMap = new Map<string, number>()
  for (const e of degreeEdgesResult.data ?? []) {
    degreeMap.set(e.from_node_id, (degreeMap.get(e.from_node_id) ?? 0) + 1)
    degreeMap.set(e.to_node_id, (degreeMap.get(e.to_node_id) ?? 0) + 1)
  }

  return edges
    .map(e => ({
      from: nodeMap.get(e.from_node_id),
      to: nodeMap.get(e.to_node_id),
      edge_type: e.edge_type,
      strength: e.strength,
      from_degree: degreeMap.get(e.from_node_id) ?? 1,
      to_degree: degreeMap.get(e.to_node_id) ?? 1,
    }))
    .filter((e): e is WeakEdgeResult => !!e.from && !!e.to)
}

// --- Graph context builder ---

export interface GraphContext {
  mode: QueryMode
  context: string
  hasEdgeData: boolean  // Fix 2: signals whether real edge data is available for graph-metric mode
}

export async function getGraphContextForQuery(query: string): Promise<GraphContext> {
  const mode = detectQueryMode(query)

  if (mode === 'factual') return { mode, context: '', hasEdgeData: false }

  if (mode === 'graph-metric') {
    const { context, hasEdgeData } = await buildMetricContext()
    return { mode, context, hasEdgeData }
  }

  const context = await buildSemanticContext(query, mode)
  return { mode, context, hasEdgeData: context.length > 0 }
}

// --- Internal: metric context ---

async function buildMetricContext(): Promise<{ context: string; hasEdgeData: boolean }> {
  const [central, weakest] = await Promise.all([
    getCentralNodes(undefined, 5),
    getWeakestEdges(5),
  ])

  const hasEdgeData = central.length > 0 || weakest.length > 0

  // Fix 2: explicit sparse signal so Watchtower does not attempt graph reasoning
  // without graph evidence
  if (!hasEdgeData) {
    return {
      context: '## Graph Metrics — NO EDGE DATA\nThe graph currently contains no valid edges above the minimum threshold. No edge-based answer is available.',
      hasEdgeData: false,
    }
  }

  const lines: string[] = ['## Graph Metrics — real edge data:']

  if (central.length > 0) {
    lines.push('\n### Central nodes (weighted degree = sum of all connected edge strengths):')
    central.forEach((n, i) => {
      lines.push(`${i + 1}. [${n.id.slice(0, 8)}] "${n.title}" — ${n.presence_id} | ${n.source_type} | ${fmtDate(n.created_at)} — degree ${n.weighted_degree.toFixed(2)} (${n.edge_count} edge${n.edge_count !== 1 ? 's' : ''})`)
    })
  }

  if (weakest.length > 0) {
    lines.push('\n### Weakest valid edges (strength > 0.10, ascending — with endpoint connectedness):')
    weakest.forEach(e => {
      // Fix 5: include endpoint degrees so Watchtower can contextualise edge weakness
      const fromCtx = `${e.from.presence_id}, ${e.from_degree} edge${e.from_degree !== 1 ? 's' : ''}`
      const toCtx = `${e.to.presence_id}, ${e.to_degree} edge${e.to_degree !== 1 ? 's' : ''}`
      lines.push(`  "${e.from.title}" (${fromCtx}) --[${e.edge_type} ${e.strength.toFixed(2)}]--> "${e.to.title}" (${toCtx})`)
    })
  }

  return { context: lines.join('\n'), hasEdgeData: true }
}

// --- Internal: semantic context (seed → expand) ---

// Global cap on edges shown in context — Fix 4: ensures strong edges are always
// included before weak ones, regardless of which seed node they belong to.
const MAX_CONTEXT_EDGES = 15

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

  // Expand: fetch edges for all seeds, already ordered by strength descending
  const seedIds = seeds.map(n => n.id)
  const idList = seedIds.join(',')
  const { data: allEdges } = await supabase
    .from('memory_edges')
    .select('from_node_id, to_node_id, edge_type, strength')
    .or(`from_node_id.in.(${idList}),to_node_id.in.(${idList})`)
    .order('strength', { ascending: false })

  const edges = allEdges ?? []

  // Fix 4: globally cap to the strongest MAX_CONTEXT_EDGES edges before any per-node
  // filtering. This prevents weak edges from crowding out stronger ones across seeds.
  const globalTopEdges = edges.slice(0, MAX_CONTEXT_EDGES)
  const allowedEdgeKeys = new Set(
    globalTopEdges.map(e => [e.from_node_id, e.to_node_id].sort().join('|'))
  )

  // Collect all expanded node IDs from the allowed edges
  const expandedIds = new Set<string>(seedIds)
  for (const e of globalTopEdges) {
    expandedIds.add(e.from_node_id)
    expandedIds.add(e.to_node_id)
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
    `## Graph Context — ${modeLabel[mode as keyof typeof modeLabel] ?? 'Semantic'} (${nodeMap.size} nodes, ${globalTopEdges.length} edges shown, sorted by strength):`,
  ]

  const printedEdges = new Set<string>()

  for (const seed of seeds.slice(0, 5)) {
    const node = nodeMap.get(seed.id)
    if (!node) continue

    lines.push(`\n[${node.id.slice(0, 8)}] ${node.presence_id} | ${node.source_type} | "${node.title}" — ${node.summary} (${fmtDate(node.created_at)})`)

    const nodeEdges = edges
      .filter(e => {
        if (e.from_node_id !== node.id && e.to_node_id !== node.id) return false
        const key = [e.from_node_id, e.to_node_id].sort().join('|')
        return allowedEdgeKeys.has(key)  // Fix 4: only show globally-strong edges
      })
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

      // Fix 3: explicit direction label — asymmetric relationships must not be flattened
      const arrow = isFrom ? '→' : '←'
      const dirLabel = isFrom ? '[outbound]' : '[inbound]'
      lines.push(`  ${arrow} [${edge.edge_type} ${edge.strength.toFixed(2)}] "${other.title}" (${other.presence_id}) ${dirLabel}`)
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
