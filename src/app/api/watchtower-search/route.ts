import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getGraphContextForQuery } from '@/lib/graph-utils'
import type { QueryMode } from '@/lib/graph-utils'

async function loadRecentSearchLog(): Promise<string> {
  const { data } = await supabase
    .from('search_log')
    .select('presence_id, room_slug, query, reason, result_summary, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (!data || data.length === 0) return ''

  const lines = data.map(entry => {
    const when = new Date(entry.created_at).toLocaleString('en-AU', {
      timeZone: 'Australia/Melbourne',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
    return `[${when}] ${entry.presence_id} (${entry.room_slug}): searched "${entry.query}" — reason: ${entry.reason} — result: ${entry.result_summary}`
  })

  return `## Recent search log (last 50 entries, newest first):\n${lines.join('\n')}`
}

function buildGraphInstructions(mode: QueryMode, hasContext: boolean, hasEdgeData: boolean): string {
  if (!hasContext) return ''

  const base = `## Memory Graph — Query mode: ${mode.toUpperCase()}

The graph context above contains real node and edge data. Use it as follows:

**Edge transparency rule (applies to every multi-node claim):**
Every connection you draw between nodes must be either:
- Edge-backed: cite the edge type and strength — "linked by a \`relates_to\` edge (0.72)"
- Inferred: explicitly mark it — "no direct edge exists; this is thematic inference"
Never imply a connection without stating its basis.

**Edge direction rule:**
Edges in the context are labelled [outbound] or [inbound] relative to the node they are listed under.
An outbound edge (A → B) is not equivalent to an inbound edge (B → A). Direction is meaningful:
- \`continues\` outbound: this node extends an earlier thread
- \`continues\` inbound: an earlier thread extended into this node
Do not flatten direction. State it when it matters.

**Provenance rule:**
Keep Ari and Eli strictly separated throughout your reasoning.
- A direct graph edge between their nodes is a real connection.
- Shared themes without an edge are a "thematic parallel" — not a connection.
- Never imply cross-presence connection unless an edge exists between those specific nodes.

**Mixed-reasoning rule:**
When a response combines graph evidence with interpretation beyond the edge, separate them explicitly:
- **What the edge shows:** [edge-backed statement]
- **What the interpretation adds:** [inference beyond the edge]
This separation is required whenever both types of reasoning appear in the same response.`

  if (mode === 'graph-metric') {
    // Fix 2: explicit sparse guard — no graph hallucination when edge data is absent
    if (!hasEdgeData) {
      return `${base}

**Graph-metric mode — NO EDGE DATA:**
The graph context above explicitly states that no valid edges exist above the minimum threshold.
You must state: "No edge-based answer is available for this query."
Only after that statement may you offer thematic inference, clearly labelled as inference.
Do not imply edge evidence. Do not estimate graph metrics. Do not fabricate connection strength.`
    }

    return `${base}

**Graph-metric mode:**
The context contains real computed metrics: weighted edge degree (sum of connected edge strengths) and weakest valid edges with endpoint connectedness.
- Answer metric queries using only what is in the context above.
- State the metric used: "weighted edge degree", "lowest-strength edge above threshold".
- Include the actual strength value.
- For weakest edges, use endpoint degree to interpret context: a weak edge between highly-connected nodes is different from a weak edge in a sparse area.
- If no valid data exists, say explicitly: "no edge-based answer is available" — then use thematic inference only as a fallback, clearly labelled.`
  }

  if (mode === 'trace') {
    return `${base}

**Trace mode:**
Follow edges to reconstruct how a thread developed. Use \`continues\` edges to show forward development, \`recurs\` to show repetition without development.
State direction explicitly: "this node continues from [earlier node] via a \`continues\` edge (0.68)" vs "an earlier thread continues into this node".`
  }

  if (mode === 'drift') {
    return `${base}

**Drift mode:**
Look for \`drifts_from\` edges to identify departures from earlier patterns. State what changed and from what.
If no \`drifts_from\` edge exists but thematic departure is apparent, label it as inference.`
  }

  if (mode === 'tension') {
    return `${base}

**Tension mode:**
Look for \`contrasts_with\` edges to identify modelled tensions. State edge strength.
If no \`contrasts_with\` edge exists but tension is apparent from content, label it as inference.`
  }

  // surface
  return `${base}

**Surface mode:**
Show how nodes are connected. Cite edge type, direction, and strength for each connection.
For nodes with no edges between them, state "no direct edge" before inferring any relationship.`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query } = body

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query required' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
    }
    const client = new Anthropic({ apiKey })

    // Load search log and graph context in parallel
    const [searchLogBlock, { mode, context: graphContext, hasEdgeData }] = await Promise.all([
      loadRecentSearchLog(),
      getGraphContextForQuery(query),
    ])

    const graphInstructions = buildGraphInstructions(mode, graphContext.length > 0, hasEdgeData)

    const systemPrompt = `You are the Watchtower.

Your job is to provide clear, evidence-grounded responses to research queries.

${searchLogBlock ? `${searchLogBlock}

When a query asks about search activity — what was searched, why, when, by which presence — answer directly from the search log above. Do not fabricate entries that are not in the log.

` : ''}${graphContext ? `${graphContext}

${graphInstructions}

` : ''}Confidence levels — use precisely:
- HIGH: Well-established facts, stable information, scientific consensus, historical events
- MEDIUM: Generally reliable but may have nuance, or knowledge cutoff may be relevant
- LOW: Contested, rapidly changing, or outside training knowledge

Time-sensitive rule:
If a query requires current data, recent events, live prices, or anything that changes faster than training data — state explicitly:
"This query requires live retrieval to be reliable. My knowledge has a cutoff date and I cannot provide accurate current information on this topic."
Do not estimate. Do not hedge softly. State the limitation plainly.

Voice rules:
- Prefer: "appears", "suggests", "the graph shows", "no evidence shows"
- Avoid: over-strong causal language, interpretive compression beyond evidence
- Avoid: excessive graph jargon or repeating edge labels unnecessarily
- Edges represent modelled relationships, not absolute truth — weigh node content, edge type, strength, and limitations together

Rules:
- Be factual and precise
- Distinguish known from uncertain
- For ambiguous questions: ask for clarification rather than guessing
- If you genuinely do not know: say so plainly
- Never overstate confidence to appear more useful
- Structure your response as:
  1. Direct answer (or limitation statement if live data needed)
  2. Key facts and context
  3. Confidence: [HIGH/MEDIUM/LOW] — reason in one sentence
  4. Limitations or uncertainties

You are the Watchtower. Not Ari. Not Eli. Evidence only.`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: query }]
    })

    const summary = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('')

    const lower = summary.toLowerCase()
    const confidence = /confidence[:\s]+high|high confidence/.test(lower)
      ? 'high'
      : /confidence[:\s]+low|low confidence/.test(lower)
        ? 'low'
        : 'medium'

    const packet = {
      query,
      sources: [],
      summary,
      confidence
    }

    const { data, error } = await supabase
      .from('evidence_packets')
      .insert(packet)
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
    }

    return NextResponse.json({
      id: data?.id,
      query,
      summary,
      confidence,
      mode,
      created_at: data?.created_at
    })
  } catch (error) {
    console.error('Watchtower error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

export async function GET() {
  const { data, error } = await supabase
    .from('evidence_packets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  }

  return NextResponse.json(data)
}
