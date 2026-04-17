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

    if (!error && data) {
      console.log(`[memory-graph] findSimilarNodes: vector search returned ${(data as SimilarNode[]).length} candidates for ${presenceId}`)
      return data as SimilarNode[]
    }
  }

  // Fallback: recent active nodes for this presence (text comparison done via Haiku)
  const { data } = await supabase
    .from('memory_nodes')
    .select('*')
    .eq('presence_id', presenceId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(limit)

  const nodes = (data ?? []) as SimilarNode[]
  console.log(`[memory-graph] findSimilarNodes: fallback returned ${nodes.length} candidates for ${presenceId}`)
  return nodes
}

// --- Edge type determination ---

interface DetermineEdgeResult {
  edge_type: EdgeType | null  // null = no edge to create
  strength: number
  similarity: number          // always present — used for fallback ranking
}

async function determineEdge(
  newNode: MemoryNode,
  existingNode: SimilarNode,
  apiKey: string
): Promise<DetermineEdgeResult> {
  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [{
        role: 'user',
        content: `Two memory nodes from the same presence (${newNode.presence_id}):

Older node: "${existingNode.title}" — ${existingNode.summary}
Newer node: "${newNode.title}" — ${newNode.summary}

Choose the best edge type. Prefer connecting over not connecting — soft thematic overlap is enough.

Edge types:
- recurs: the same feeling, pattern, or theme appears again
- continues: the newer node develops or extends the older thread
- relates_to: shared concepts, emotional continuity, or overlapping subject — use this for any soft connection
- contrasts_with: meaningful tension or difference between the two
- drifts_from: the newer node moves away from or departs from the earlier pattern
- none: reserve for nodes that are about completely unrelated topics with no thematic overlap

"relates_to" is the right choice for any soft connection — shared emotional register, recurring subject, or conceptual overlap. Do not require explicit causal or sequential relationship.

Respond in JSON only:
{"edge_type": "...", "strength": 0.0, "similarity": 0.0}

strength: how strong the connection is (0.1–1.0 for real edges, 0.0 for none)
similarity: thematic relatedness regardless of edge_type (0.0–1.0)`
      }]
    })

    const raw = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')
      .trim()

    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
    const parsed = JSON.parse(clean) as { edge_type: string; strength: number; similarity: number }
    const similarity = Math.max(0, Math.min(1, parsed.similarity ?? 0))

    if (parsed.edge_type === 'none') {
      console.log(`[memory-graph] determineEdge: "none" for "${newNode.title}" → "${existingNode.title}" (similarity ${similarity.toFixed(2)})`)
      return { edge_type: null, strength: 0, similarity }
    }

    const validTypes: EdgeType[] = ['recurs', 'continues', 'relates_to', 'contrasts_with', 'drifts_from']
    if (!validTypes.includes(parsed.edge_type as EdgeType)) {
      console.warn(`[memory-graph] determineEdge: invalid edge_type "${parsed.edge_type}" — treating as none`)
      return { edge_type: null, strength: 0, similarity }
    }

    const strength = Math.max(0, Math.min(1, parsed.strength))
    console.log(`[memory-graph] determineEdge: "${newNode.title}" --[${parsed.edge_type} ${strength.toFixed(2)}]--> "${existingNode.title}" (similarity ${similarity.toFixed(2)})`)
    return { edge_type: parsed.edge_type as EdgeType, strength, similarity }
  } catch (err) {
    console.error('[memory-graph] determineEdge: Haiku call failed:', err)
    return { edge_type: null, strength: 0, similarity: 0 }
  }
}

// --- Edge creation for a node ---

async function insertEdge(
  fromId: string,
  toId: string,
  edgeType: EdgeType,
  strength: number
): Promise<boolean> {
  const { error } = await supabase.from('memory_edges').insert({
    from_node_id: fromId,
    to_node_id: toId,
    edge_type: edgeType,
    strength,
  })
  if (error) {
    console.error('[memory-graph] Edge insert failed:', error)
    return false
  }
  return true
}

export async function createEdgesForNode(
  node: MemoryNode,
  embedding: number[] | null,
  apiKey: string
): Promise<number> {
  const candidates = await findSimilarNodes(node.presence_id, embedding, 0.70, 5)
  const relevant = candidates.filter(c => c.id !== node.id)

  console.log(`[memory-graph] createEdgesForNode: ${relevant.length} candidates for node "${node.title}" (${node.id.slice(0, 8)})`)

  let created = 0
  // Track "none" decisions with their similarity scores for fallback
  const noneResults: Array<{ candidate: SimilarNode; similarity: number }> = []

  for (const candidate of relevant) {
    // Dedup: skip if an edge already exists in either direction
    const { data: existing } = await supabase
      .from('memory_edges')
      .select('id')
      .or(`and(from_node_id.eq.${node.id},to_node_id.eq.${candidate.id}),and(from_node_id.eq.${candidate.id},to_node_id.eq.${node.id})`)
      .maybeSingle()

    if (existing) {
      console.log(`[memory-graph] createEdgesForNode: edge already exists — skipping ${candidate.id.slice(0, 8)}`)
      continue
    }

    const result = await determineEdge(node, candidate, apiKey)

    if (result.edge_type) {
      const ok = await insertEdge(node.id, candidate.id, result.edge_type, result.strength)
      if (ok) created++
    } else {
      noneResults.push({ candidate, similarity: result.similarity })
    }
  }

  // Fallback: if every candidate returned "none" and at least one has some thematic overlap,
  // create a low-strength relates_to edge to the most similar candidate
  if (created === 0 && noneResults.length > 0) {
    const best = noneResults.sort((a, b) => b.similarity - a.similarity)[0]
    if (best.similarity >= 0.2) {
      const alreadyExists = await supabase
        .from('memory_edges')
        .select('id')
        .or(`and(from_node_id.eq.${node.id},to_node_id.eq.${best.candidate.id}),and(from_node_id.eq.${best.candidate.id},to_node_id.eq.${node.id})`)
        .maybeSingle()

      if (!alreadyExists.data) {
        console.log(`[memory-graph] createEdgesForNode: fallback edge — "${node.title}" --[relates_to 0.30]--> "${best.candidate.title}" (similarity ${best.similarity.toFixed(2)})`)
        const ok = await insertEdge(node.id, best.candidate.id, 'relates_to', 0.3)
        if (ok) created++
      }
    } else {
      console.log(`[memory-graph] createEdgesForNode: no fallback — highest similarity ${best.similarity.toFixed(2)} below threshold for "${node.title}"`)
    }
  }

  console.log(`[memory-graph] createEdgesForNode: ${created} edges created for "${node.title}"`)
  return created
}

// --- Public: diagnostic trace (no writes) ---

export interface EdgeDiagnosticResult {
  node_id: string
  node_title: string
  node_summary: string
  candidate_count: number
  candidates: Array<{
    id: string
    title: string
    summary: string
    decision: 'edge' | 'none' | 'error' | 'already_exists'
    edge_type?: string
    strength?: number
    similarity?: number
  }>
}

export async function diagnoseEdgesForNode(
  node: MemoryNode,
  apiKey: string
): Promise<EdgeDiagnosticResult> {
  const candidates = await findSimilarNodes(node.presence_id, null, 0.70, 5)
  const relevant = candidates.filter(c => c.id !== node.id)

  const result: EdgeDiagnosticResult = {
    node_id: node.id.slice(0, 8),
    node_title: node.title,
    node_summary: node.summary,
    candidate_count: relevant.length,
    candidates: [],
  }

  for (const candidate of relevant) {
    const { data: existing } = await supabase
      .from('memory_edges')
      .select('id')
      .or(`and(from_node_id.eq.${node.id},to_node_id.eq.${candidate.id}),and(from_node_id.eq.${candidate.id},to_node_id.eq.${node.id})`)
      .maybeSingle()

    if (existing) {
      result.candidates.push({
        id: candidate.id.slice(0, 8),
        title: candidate.title,
        summary: candidate.summary,
        decision: 'already_exists',
      })
      continue
    }

    try {
      const r = await determineEdge(node, candidate, apiKey)
      result.candidates.push({
        id: candidate.id.slice(0, 8),
        title: candidate.title,
        summary: candidate.summary,
        decision: r.edge_type ? 'edge' : 'none',
        edge_type: r.edge_type ?? undefined,
        strength: r.edge_type ? r.strength : undefined,
        similarity: r.similarity,
      })
    } catch {
      result.candidates.push({
        id: candidate.id.slice(0, 8),
        title: candidate.title,
        summary: candidate.summary,
        decision: 'error',
        similarity: 0,
      })
    }
  }

  return result
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

  // Edge creation is non-critical but must be awaited — fire-and-forget is unreliable in serverless
  const embedding = node.embedding as number[] | null
  try {
    await createEdgesForNode(node, embedding, params.apiKey)
  } catch (err) {
    console.error('[memory-graph] Edge creation failed:', err)
  }
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
