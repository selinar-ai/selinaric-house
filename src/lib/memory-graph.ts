import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

// --- Types ---

export interface MemoryNode {
  id: string
  presence_id: string
  room_slug: string
  source_type: string
  source_id: string | null
  title: string
  summary: string
  embedding: number[] | null
  salience: number
  status: 'active' | 'dormant' | 'resolved'
  created_at: string
  updated_at: string
}

export interface MemoryEdge {
  id: string
  from_node_id: string
  to_node_id: string
  edge_type: 'recurs' | 'continues' | 'relates_to' | 'contrasts_with' | 'drifts_from'
  strength: number
  created_at: string
}

type EdgeType = MemoryEdge['edge_type']

// --- Embedding generation (OpenAI, optional) ---

async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  try {
    // Dynamic import avoids bundling issues when key is absent
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey })

    const response = await client.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text.slice(0, 8191),
    })

    return response.data[0].embedding
  } catch (err) {
    console.error('[memory-graph] Embedding generation failed:', err)
    return null
  }
}

// --- Eligibility ---

export function isHighValueArtifact(
  sourceType: string,
  content: string
): boolean {
  // interior_notes and pulse_drafts have already passed quality gates upstream
  if (sourceType === 'interior_note') return true
  if (sourceType === 'pulse_draft') return true
  if (sourceType === 'room_memory' && content.length > 80) return true
  return false
}

// --- Node title + summary generation ---

async function generateNodeMeta(
  content: string,
  presenceId: string,
  apiKey: string
): Promise<{ title: string; summary: string } | null> {
  const client = new Anthropic({ apiKey })
  const presenceName = presenceId === 'eli' ? 'Eli' : 'Ari'

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: `You are creating a memory graph node for ${presenceName}.

Source content: "${content}"

Generate a short title (max 8 words) and a one-sentence summary that captures the core theme, pattern, or recognition — in a way that would let future queries find this node when the same theme recurs.

Respond in JSON, no markdown:
{"title": "...", "summary": "..."}`
      }]
    })

    const raw = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')
      .trim()

    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
    const parsed = JSON.parse(clean) as { title: string; summary: string }

    if (!parsed.title || !parsed.summary) return null
    return parsed
  } catch (err) {
    console.error('[memory-graph] Node meta generation failed:', err)
    return null
  }
}

// --- Node creation ---

async function createMemoryNode(params: {
  presence_id: 'ari' | 'eli'
  room_slug: string
  source_type: string
  source_id?: string
  title: string
  summary: string
  salience?: number
}): Promise<MemoryNode | null> {
  const embeddingText = `${params.title}: ${params.summary}`
  const embedding = await generateEmbedding(embeddingText)

  const { data, error } = await supabase
    .from('memory_nodes')
    .insert({
      presence_id: params.presence_id,
      room_slug: params.room_slug,
      source_type: params.source_type,
      source_id: params.source_id ?? null,
      title: params.title,
      summary: params.summary,
      embedding: embedding ?? null,
      salience: params.salience ?? 1.0,
      status: 'active',
    })
    .select()
    .single()

  if (error) {
    console.error('[memory-graph] Node insert failed:', error)
    return null
  }

  return data as MemoryNode
}

// --- Similar node discovery ---

interface SimilarNode extends MemoryNode {
  similarity?: number
}

async function findSimilarNodes(
  presenceId: string,
  embedding: number[] | null,
  threshold = 0.70,
  limit = 5
): Promise<SimilarNode[]> {
  if (embedding) {
    const { data, error } = await supabase.rpc('match_memory_nodes', {
      query_embedding: embedding,
      presence_filter: presenceId,
      match_threshold: threshold,
      match_count: limit,
    })

    if (!error && data) return data as SimilarNode[]
  }

  // Fallback: recent active nodes for this presence (text comparison done via Haiku)
  const { data } = await supabase
    .from('memory_nodes')
    .select('*')
    .eq('presence_id', presenceId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []) as SimilarNode[]
}

// --- Edge type determination ---

async function determineEdge(
  newNode: MemoryNode,
  existingNode: SimilarNode,
  apiKey: string
): Promise<{ edge_type: EdgeType; strength: number } | null> {
  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      messages: [{
        role: 'user',
        content: `Two memory nodes from the same presence (${newNode.presence_id}):

Older node: "${existingNode.title}" — ${existingNode.summary}
Newer node: "${newNode.title}" — ${newNode.summary}

What is the relationship of the newer node to the older one?

Edge types:
- recurs: same theme appearing again without clear development
- continues: thread developing forward from the older node
- relates_to: semantic similarity without clear direction
- contrasts_with: meaningful tension or difference
- drifts_from: newer node departs from or moves away from the earlier pattern
- none: these nodes are not meaningfully related — do not connect them

If there is no genuine thematic, relational, or pattern-level connection, respond with "none".
Do not connect nodes just because they share a presence or are close in time.

Respond in JSON only: {"edge_type": "...", "strength": 0.0}
Use strength 0.0 and edge_type "none" if unrelated.`
      }]
    })

    const raw = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')
      .trim()

    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
    const parsed = JSON.parse(clean) as { edge_type: string; strength: number }

    // Explicit "none" means no meaningful connection
    if (parsed.edge_type === 'none') return null

    const validTypes: EdgeType[] = ['recurs', 'continues', 'relates_to', 'contrasts_with', 'drifts_from']
    if (!validTypes.includes(parsed.edge_type as EdgeType)) return null

    return {
      edge_type: parsed.edge_type as EdgeType,
      strength: Math.max(0, Math.min(1, parsed.strength)),
    }
  } catch {
    // In fallback mode (no similarity score), do not create speculative edges on Haiku errors
    return null
  }
}

// --- Edge creation for new node ---

async function createEdgesForNode(
  node: MemoryNode,
  embedding: number[] | null,
  apiKey: string
): Promise<void> {
  const candidates = await findSimilarNodes(node.presence_id, embedding, 0.70, 5)
  const relevant = candidates.filter(c => c.id !== node.id)

  for (const candidate of relevant) {
    const edgeInfo = await determineEdge(node, candidate, apiKey)
    if (!edgeInfo) continue

    const { error } = await supabase.from('memory_edges').insert({
      from_node_id: node.id,
      to_node_id: candidate.id,
      edge_type: edgeInfo.edge_type,
      strength: edgeInfo.strength,
    })

    if (error) {
      console.error('[memory-graph] Edge insert failed:', error)
    }
  }
}

// --- Public: main ingestion ---

export async function ingestArtifact(params: {
  presence_id: 'ari' | 'eli'
  room_slug: string
  source_type: 'interior_note' | 'pulse_draft' | 'room_memory'
  source_id?: string
  content: string
  apiKey: string
}): Promise<void> {
  if (!isHighValueArtifact(params.source_type, params.content)) {
    console.log(`[memory-graph] Skipped — not high-value: ${params.source_type}`)
    return
  }

  const meta = await generateNodeMeta(params.content, params.presence_id, params.apiKey)
  if (!meta) {
    console.log(`[memory-graph] Skipped — could not generate node meta for ${params.presence_id}`)
    return
  }

  const node = await createMemoryNode({
    presence_id: params.presence_id,
    room_slug: params.room_slug,
    source_type: params.source_type,
    source_id: params.source_id,
    title: meta.title,
    summary: meta.summary,
  })

  if (!node) return

  console.log(`[memory-graph] Node created: ${node.id} — "${node.title}" (${params.presence_id})`)

  // Edge creation is non-critical — fire and forget
  const embedding = node.embedding as number[] | null
  createEdgesForNode(node, embedding, params.apiKey).catch(err =>
    console.error('[memory-graph] Edge creation failed:', err)
  )
}

// --- Public: Watchtower graph context loader ---

export async function loadGraphContext(query: string): Promise<string> {
  const embedding = await generateEmbedding(query)

  let nodes: SimilarNode[]

  if (embedding) {
    // Cross-presence semantic search
    const { data } = await supabase.rpc('match_memory_nodes', {
      query_embedding: embedding,
      presence_filter: null,
      match_threshold: 0.65,
      match_count: 20,
    })
    nodes = (data ?? []) as SimilarNode[]
  } else {
    // Fallback: recent active nodes from both presences
    const { data } = await supabase
      .from('memory_nodes')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(20)
    nodes = (data ?? []) as SimilarNode[]
  }

  if (nodes.length === 0) return ''

  // Load edges between the found nodes
  const nodeIds = nodes.map(n => n.id)
  const edgeIdList = nodeIds.join(',')
  const { data: edges } = await supabase
    .from('memory_edges')
    .select('from_node_id, to_node_id, edge_type, strength')
    .or(`from_node_id.in.(${edgeIdList}),to_node_id.in.(${edgeIdList})`)

  return formatGraphContext(nodes, (edges ?? []) as MemoryEdge[])
}

function formatGraphContext(nodes: SimilarNode[], edges: MemoryEdge[]): string {
  if (nodes.length === 0) return ''

  const nodeIndex = new Map(nodes.map(n => [n.id, n]))

  const nodeLines = nodes.map(n => {
    const when = new Date(n.created_at).toLocaleString('en-AU', {
      timeZone: 'Australia/Melbourne',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    const sim = n.similarity != null ? ` [similarity: ${n.similarity.toFixed(2)}]` : ''
    return `[${n.id.slice(0, 8)}] ${n.presence_id} | ${n.source_type} | "${n.title}" — ${n.summary} (${when})${sim}`
  })

  const edgeLines = edges
    .filter(e => nodeIndex.has(e.from_node_id) && nodeIndex.has(e.to_node_id))
    .map(e => {
      const from = nodeIndex.get(e.from_node_id)!
      const to = nodeIndex.get(e.to_node_id)!
      return `  [${e.from_node_id.slice(0, 8)}] "${from.title}" --[${e.edge_type} strength:${e.strength.toFixed(2)}]--> [${e.to_node_id.slice(0, 8)}] "${to.title}"`
    })

  const sections = [`## Memory Graph — ${nodes.length} relevant nodes:\n${nodeLines.join('\n')}`]

  if (edgeLines.length > 0) {
    sections.push(`## Connections:\n${edgeLines.join('\n')}`)
  }

  return sections.join('\n\n')
}

// --- Public: load nodes for API route ---

export async function loadNodes(params: {
  presence_id?: string
  status?: string
  limit?: number
}): Promise<MemoryNode[]> {
  let query = supabase
    .from('memory_nodes')
    .select('id, presence_id, room_slug, source_type, title, summary, salience, status, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 50)

  if (params.presence_id) query = query.eq('presence_id', params.presence_id)
  if (params.status) query = query.eq('status', params.status)

  const { data } = await query
  return (data ?? []) as MemoryNode[]
}

export async function loadEdgesForNodes(nodeIds: string[]): Promise<MemoryEdge[]> {
  if (nodeIds.length === 0) return []
  const idList = nodeIds.join(',')
  const { data } = await supabase
    .from('memory_edges')
    .select('*')
    .or(`from_node_id.in.(${idList}),to_node_id.in.(${idList})`)
    .order('created_at', { ascending: false })

  return (data ?? []) as MemoryEdge[]
}
