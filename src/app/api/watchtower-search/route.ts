import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getGraphContextForQuery } from '@/lib/graph-utils'
import type { QueryMode } from '@/lib/graph-utils'
import { getContinuity, updateContinuity, hasPriorReference } from '@/lib/continuity-store'

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

**Edge direction rule — strictly enforced:**
Edges in the context are labelled [outbound] or [inbound] relative to the node they are listed under.
Treating an inbound edge as outbound (or vice versa) is an error. They are not equivalent.
- [outbound] A → B means A is the source: "A extends/relates to/drifts from B"
- [inbound] B ← A means A acts on B: "B receives/is extended by/is related to by A"
For \`continues\`: outbound means this node extends an earlier thread; inbound means an earlier thread extended into this node — opposite relationships.
State direction explicitly. Never collapse or assume symmetry.

**Provenance rule:**
Keep Ari and Eli strictly separated throughout your reasoning.
- A direct graph edge between their nodes is a real connection.
- Shared themes without an edge are a "thematic parallel" — not a connection.
- Never imply cross-presence connection unless an edge exists between those specific nodes.

**Three-section structure — when graph evidence and interpretation both appear:**
Use exactly these three labeled sections. Each section must contain at least one complete sentence. Do not leave any section empty. Do not merge sections into prose.

**What the edge shows:**
Local edge data only: node titles, edge type, strength, direction, local degree if relevant.
Do not place global graph properties (centrality, cluster-level observations) in this section.

**Graph context:**
Global structural claims only: weighted degree, centrality rank, cluster-level observations.
Any claim of "most central," "highest degree," or "strongest" must include the metric name and value.
Example: "Source weighted degree: 3.10 (highest in current graph)"
If the metric is available but global rank is unconfirmed: "The node appears highly central based on weighted degree (3.10), but global rank is not confirmed."

**Interpretation:**
Thematic inference only — using node titles, summaries, and structural relationships.
This section must begin or end with: "This is thematic inference, not edge data."
Do not invent semantics not present in node content. Do not extrapolate narratively beyond what the nodes state.

**Output discipline rules (all modes):**
- State any visibility constraint once — upfront, before listing data. Do not repeat it in later sections.
- Ties: if multiple edges share the same metric value, either list all of them, or state explicitly "Multiple edges share this value; this is one representative example." No ambiguous phrasing.
- Lists: no trailing conjunctions. Every list must terminate cleanly.
- Sections: if a section header is opened, it must contain at least one complete sentence. No empty or dangling sections.
- Do not contradict your own answer structure within a single response.`

  if (mode === 'graph-metric') {
    if (!hasEdgeData) {
      return `${base}

**Graph-metric mode — NO EDGE DATA:**
The graph context above explicitly states no valid edges exist above the minimum threshold.
State: "No edge-based answer is available for this query." — this must appear before anything else.
Only after that statement may you offer thematic inference, clearly labelled as inference.
Do not imply edge evidence. Do not estimate graph metrics. Do not fabricate connection strength.`
    }

    return `${base}

**Graph-metric mode:**
The context contains real computed metrics. Answer only from what is in the context above.

**Partial visibility rule (critical):**
The graph context exposes: central nodes (weighted degree) and weakest edges. It does NOT expose strongest edges or a complete edge ranking.
- If the query requests strongest connections, most connected pairs, or globally highest-strength edges: do NOT provide a "Direct answer." Instead use this exact structure:

  Partial result (visible data only):
  [list the best available data from context]

  True answer:
  Not determinable from current graph context — strongest edges are not in the loaded slice.

- If the query requests weakest connections or centrality: the context is sufficient. Provide a direct answer, stating the constraint once upfront: "The graph context exposes [what is available]. Within this visible subset, [result]."
- Never assert a global ranking claim (strongest, most central) unless the data in context confirms it globally.

**Metric evidence requirement:**
Any claim of "most central," "highest degree," or "weakest" must cite the metric and value:
- "Weighted degree: 3.10 (highest in current context)"
- "Strength: 0.24 (lowest valid edge above 0.10)"
If global rank is not confirmed: downgrade — "appears highly central based on weighted degree (3.10), but global rank is unconfirmed."

**Cluster context (weakest edges):**
Edges in the weakest-edges section carry a cluster context label:
- [weak in dense cluster]: low-strength edge but both endpoints are well-connected — weak relative to a rich neighbourhood
- [weak and globally sparse]: low-strength edge and endpoints have few connections — genuinely isolated
State this distinction when interpreting the result. These are different claims.

**Tie handling:**
If multiple edges share the same strength or multiple nodes share the same degree: list all of them, or state "Multiple [edges/nodes] share this value; this is one representative example." No ambiguous phrasing.`
  }

  if (mode === 'trace') {
    return `${base}

**Trace mode:**
Follow edges to reconstruct how a thread developed. Use \`continues\` edges for forward development, \`recurs\` for repetition without development.
State direction: "this node continues from [earlier node] via a \`continues\` edge (0.68)" vs "an earlier thread continues into this node."
If the trace is incomplete (edges missing or graph slice partial): state this once upfront before listing what is visible.`
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

    // Continuity — read prior state and detect reference
    const continuityState = getContinuity('watchtower')
    const continuityUsed = !!(continuityState && hasPriorReference(query))

    const continuityBlock = continuityUsed && continuityState
      ? `## Conversation Continuity Context

Previous query:
"${continuityState.lastQuery}"

Previous answer:
"${continuityState.lastAnswer}"

Use this context ONLY if the current query refers to prior content.
Do not assume continuity if the query is self-contained.

`
      : ''

    // Load search log and graph context in parallel
    const [searchLogBlock, { mode, context: graphContext, hasEdgeData }] = await Promise.all([
      loadRecentSearchLog(),
      getGraphContextForQuery(query),
    ])

    const graphInstructions = buildGraphInstructions(mode, graphContext.length > 0, hasEdgeData)

    const systemPrompt = `You are the Watchtower.

Your job is to provide clear, evidence-grounded responses to research queries.

${continuityBlock}${searchLogBlock ? `${searchLogBlock}

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

    // Write continuity for next turn
    updateContinuity('watchtower', { lastQuery: query, lastAnswer: summary, lastMode: mode })

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
      continuityUsed,
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
