// Phase 32 — Reasoned Recall API
//
// POST /api/archive-recall/reasoned
// Accepts bounded hybrid recall results, calls Claude to produce
// structured reasoning analysis over retrieved evidence.
//
// Laws:
//   Recall retrieves evidence. Reasoning explains relationships.
//   canonical_status remains authority. Inference must be labelled.
//   Tara promotes.
//
// Boundaries:
//   - Reasons ONLY over bounded retrieved context (max 5 per method)
//   - Does NOT fetch raw archive sources, drafts, transcripts, or unrelated material
//   - Does NOT write archive_memory_events
//   - Does NOT change canonical_status
//   - Does NOT approve graph nodes
//   - Does NOT create a new table or recall event
//   - Reasoning output is ephemeral — not stored

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { ELEVATED_SENSITIVITIES } from '@/lib/archive-memory'

// ─── Types ───────────────────────────────────────────────────────────────────

interface BoundedKeywordEntry {
  title: string
  canonical_status: string
  sensitivity: string
  rank_score: number
  rank_reason: string
  excerpt: string | null
  archive_name: string
  category: string
  source_document: string | null
  source_date: string | null
}

interface BoundedSemanticEntry {
  title: string
  canonical_status: string
  sensitivity: string
  similarity: number
  excerpt: string | null
  archive_name: string
  category: string
}

interface BoundedGraphEntry {
  label: string
  node_type: string
  description: string | null
  match_reason: string
  provenance_ok: boolean
  source_entries: Array<{
    title: string
    canonical_status: string
    sensitivity: string
  }>
}

interface BoundedOverlap {
  keyword_and_semantic: number
  keyword_and_graph: number
  semantic_and_graph: number
  all_three: number
}

interface BoundedAbsence {
  keyword_no_match: boolean
  semantic_no_match: boolean
  graph_no_match: boolean
  semantic_unembedded_elevated_count: number
  graph_pending_count: number
  graph_rejected_count: number
}

interface ReasonedRecallRequest {
  query: string
  presenceId: 'ari' | 'eli'
  archiveName: string
  keyword: BoundedKeywordEntry[]
  semantic: BoundedSemanticEntry[]
  graph: BoundedGraphEntry[]
  overlap: BoundedOverlap
  absence: BoundedAbsence
}

export interface ReasonedRecallSection {
  title: string
  status?: string
  sensitivity?: string
  found_via?: string
  relevance?: string
  source?: string
  caution?: string
  similarity?: string
  node_type?: string
  relationship?: string
  approval?: string
}

export interface ReasonedRecallOutput {
  evidence_summary: {
    keyword_count: number
    semantic_count: number
    graph_count: number
    strongest_keyword: string | null
    closest_semantic: string | null
    overlap_description: string
  }
  confirmed_memory: ReasonedRecallSection[]
  memory_candidate: ReasonedRecallSection[]
  graph_context: ReasonedRecallSection[]
  semantic_context: ReasonedRecallSection[]
  overlap_analysis: string
  gaps_and_absence: string[]
  reasoned_inference: {
    inference: string
    confidence: 'strong evidence' | 'moderate evidence' | 'weak / adjacent evidence' | 'no confirmed evidence' | 'conflict / unresolved'
    based_on: string
  }
  do_not_treat_as_memory: string
}

// ─── Limits ──────────────────────────────────────────────────────────────────

const MAX_KEYWORD  = 5
const MAX_SEMANTIC = 5
const MAX_GRAPH    = 5

// ─── JSON safety (same pattern as Forgekeeper) ───────────────────────────────

function cleanJsonString(raw: string): string {
  // 1. Strip markdown code fences
  let s = raw.replace(/```(?:json)?\s*\n?/g, '').replace(/```/g, '').trim()
  // 2. Remove trailing commas before } or ] (common LLM quirk)
  s = s.replace(/,\s*([}\]])/g, '$1')
  // 3. Remove single-line // comments (rare but possible)
  s = s.replace(/\/\/[^\n]*/g, '')
  return s
}

function safeParseModelJson<T>(raw: string): T | null {
  const cleaned = cleanJsonString(raw)

  // Attempt 1: parse the full cleaned string
  try {
    return JSON.parse(cleaned) as T
  } catch { /* continue */ }

  // Attempt 2: extract outermost { … } by brace depth
  const start = cleaned.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let end = -1
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++
    else if (cleaned[i] === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }

  if (end > start) {
    const extracted = cleaned.slice(start, end + 1)
    // Clean again in case the extract has trailing commas
    const reClean = extracted.replace(/,\s*([}\]])/g, '$1')
    try {
      return JSON.parse(reClean) as T
    } catch { /* fall through */ }
  }

  return null
}

// ─── Bounded context builder ─────────────────────────────────────────────────

function buildReasoningPrompt(req: ReasonedRecallRequest): string {
  const keyword = req.keyword.slice(0, MAX_KEYWORD)
  const semantic = req.semantic.slice(0, MAX_SEMANTIC)
  const graph = req.graph.slice(0, MAX_GRAPH)

  let ctx = `RETRIEVED EVIDENCE FOR REASONING\n`
  ctx += `Query: "${req.query}"\n`
  ctx += `Presence: ${req.presenceId === 'ari' ? 'Ari' : 'Eli'}\n`
  ctx += `Archive: ${req.archiveName}\n\n`

  // Keyword results
  ctx += `── Keyword Results (${keyword.length}) ──\n`
  if (keyword.length === 0) {
    ctx += `No keyword matches.\n\n`
  } else {
    for (const e of keyword) {
      const elevated = ELEVATED_SENSITIVITIES.includes(e.sensitivity)
      ctx += `- Title: ${e.title}\n`
      ctx += `  Status: ${e.canonical_status === 'canonical' ? 'Confirmed Memory' : e.canonical_status === 'canonical_candidate' ? 'Memory Candidate (not confirmed)' : e.canonical_status}\n`
      ctx += `  Sensitivity: ${e.sensitivity}${elevated ? ' / ELEVATED' : ''}\n`
      ctx += `  Score: ${e.rank_score} (${e.rank_reason})\n`
      ctx += `  Category: ${e.category}\n`
      if (e.excerpt) ctx += `  Excerpt: ${e.excerpt.slice(0, 300)}\n`
      if (e.source_document || e.source_date) ctx += `  Source: ${[e.source_document, e.source_date].filter(Boolean).join(' — ')}\n`
      ctx += `\n`
    }
  }

  // Semantic results
  ctx += `── Semantic Results (${semantic.length}) ──\n`
  if (semantic.length === 0) {
    ctx += `No semantic matches.\n\n`
  } else {
    for (const e of semantic) {
      const elevated = ELEVATED_SENSITIVITIES.includes(e.sensitivity)
      ctx += `- Title: ${e.title}\n`
      ctx += `  Status: ${e.canonical_status === 'canonical' ? 'Confirmed Memory' : e.canonical_status === 'canonical_candidate' ? 'Memory Candidate (not confirmed)' : e.canonical_status}\n`
      ctx += `  Sensitivity: ${e.sensitivity}${elevated ? ' / ELEVATED' : ''}\n`
      ctx += `  Similarity: ${(e.similarity * 100).toFixed(1)}%\n`
      ctx += `  Category: ${e.category}\n`
      if (e.excerpt) ctx += `  Excerpt: ${e.excerpt.slice(0, 300)}\n`
      ctx += `\n`
    }
  }

  // Graph results
  ctx += `── Graph Results (${graph.length}) ──\n`
  if (graph.length === 0) {
    ctx += `No approved graph nodes matched.\n\n`
  } else {
    for (const g of graph) {
      ctx += `- Node: ${g.label} (${g.node_type.replace(/_/g, ' ')})\n`
      ctx += `  Match: ${g.match_reason}\n`
      ctx += `  Provenance: ${g.provenance_ok ? 'verified' : 'unavailable'}\n`
      if (g.description) ctx += `  Description: ${g.description.slice(0, 200)}\n`
      if (g.source_entries.length > 0) {
        ctx += `  Source entries:\n`
        for (const s of g.source_entries) {
          const elevated = ELEVATED_SENSITIVITIES.includes(s.sensitivity)
          ctx += `    - ${s.title} [${s.canonical_status === 'canonical' ? 'Memory' : s.canonical_status === 'canonical_candidate' ? 'Candidate' : s.canonical_status}] sensitivity: ${s.sensitivity}${elevated ? ' / ELEVATED' : ''}\n`
        }
      }
      ctx += `\n`
    }
  }

  // Overlap
  ctx += `── Overlap ──\n`
  if (req.overlap.all_three > 0) ctx += `All three methods agree on: ${req.overlap.all_three} entries\n`
  if (req.overlap.keyword_and_semantic > 0) ctx += `Keyword + semantic: ${req.overlap.keyword_and_semantic} entries\n`
  if (req.overlap.keyword_and_graph > 0) ctx += `Keyword + graph: ${req.overlap.keyword_and_graph} entries\n`
  if (req.overlap.semantic_and_graph > 0) ctx += `Semantic + graph: ${req.overlap.semantic_and_graph} entries\n`
  if (req.overlap.all_three === 0 && req.overlap.keyword_and_semantic === 0 && req.overlap.keyword_and_graph === 0 && req.overlap.semantic_and_graph === 0) {
    ctx += `No overlap between retrieval methods.\n`
  }
  ctx += `\n`

  // Absence
  ctx += `── Absence ──\n`
  if (req.absence.keyword_no_match) ctx += `Keyword: no matches.\n`
  if (req.absence.semantic_no_match) ctx += `Semantic: no embedded entries matched.\n`
  if (req.absence.graph_no_match) ctx += `Graph: no approved nodes matched.\n`
  if (req.absence.semantic_unembedded_elevated_count > 0) ctx += `${req.absence.semantic_unembedded_elevated_count} elevated-sensitivity entries not embedded.\n`
  if (req.absence.graph_pending_count > 0) ctx += `${req.absence.graph_pending_count} pending graph nodes not included.\n`
  if (req.absence.graph_rejected_count > 0) ctx += `${req.absence.graph_rejected_count} rejected graph nodes excluded.\n`

  return ctx
}

// ─── System prompt ───────────────────────────────────────────────────────────

const REASONED_RECALL_SYSTEM = `You are the Reasoned Recall analyser for Selináric House.

You receive bounded retrieved evidence from three retrieval methods (keyword, semantic, graph) and produce a structured reasoning analysis.

You are NOT a presence. You have no relational voice. You produce careful, evidence-grounded analysis only.

CRITICAL OUTPUT RULE:
Return ONLY valid JSON. No markdown. No code fences. No commentary before or after the JSON object. Your entire response must be a single JSON object and nothing else.

Core laws:
- Recall retrieves evidence. Reasoning explains relationships.
- canonical_status remains the single Memory authority.
- Inference must be labelled as inference.
- Tara promotes. You do not promote, reject, or approve.

Rules:
- Reason ONLY over the evidence supplied. Do not invent entries, facts, or connections not present in the input.
- "Confirmed Memory" means canonical_status = canonical. Only use this label for items explicitly marked as such.
- "Memory Candidate" means canonical_status = canonical_candidate. Always note it is NOT confirmed.
- Semantic similarity means textual closeness. It does NOT mean truth or confirmation.
- Graph relationships connect concepts. They do NOT confirm Memory.
- Overlap between methods does NOT make a result authoritative.
- If elevated sensitivity material (sacred, sensitive, technical) appears, note: "Elevated archive material. Use carefully. Do not overgeneralise beyond the source."
- If no confirmed Memory is found, say so clearly. Do NOT imply absence means the Memory does not exist — it may be unembedded, pending approval, or outside the current scope.
- "No result returned" is NOT the same as "no Memory exists."

Confidence labels (use exactly one of these strings):
- "strong evidence"
- "moderate evidence"
- "weak / adjacent evidence"
- "no confirmed evidence"
- "conflict / unresolved"

Your JSON response must match this exact structure:

{
  "evidence_summary": {
    "keyword_count": 0,
    "semantic_count": 0,
    "graph_count": 0,
    "strongest_keyword": null,
    "closest_semantic": null,
    "overlap_description": ""
  },
  "confirmed_memory": [],
  "memory_candidate": [],
  "graph_context": [],
  "semantic_context": [],
  "overlap_analysis": "",
  "gaps_and_absence": [],
  "reasoned_inference": {
    "inference": "",
    "confidence": "no confirmed evidence",
    "based_on": ""
  },
  "do_not_treat_as_memory": "Any inference above is analysis, not Memory. Promotion requires Tara."
}

Each confirmed_memory item: {"title":"","found_via":"","relevance":"","sensitivity":"","source":"","caution":""}
Each memory_candidate item: {"title":"","found_via":"","status":"Memory Candidate - not confirmed","caution":"This material is provisional."}
Each graph_context item: {"title":"","node_type":"","relationship":"","source":"","approval":"approved","caution":"Graph relationships connect concepts. They do not confirm Memory."}
Each semantic_context item: {"title":"","similarity":"","relevance":"","caution":"Similarity indicates textual closeness, not confirmation."}
Each gaps_and_absence item is a plain string.

Always include the do_not_treat_as_memory field. If no evidence was retrieved, use empty arrays and appropriate absence notes.

Remember: return ONLY the JSON object. No other text.`

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const b = body as Record<string, unknown>

  // Validate required fields
  const query = b.query
  if (typeof query !== 'string' || !query.trim()) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  const presenceId = b.presenceId
  if (presenceId !== 'ari' && presenceId !== 'eli') {
    return NextResponse.json({ error: 'presenceId must be "ari" or "eli"' }, { status: 400 })
  }

  const archiveName = b.archiveName
  if (typeof archiveName !== 'string') {
    return NextResponse.json({ error: 'archiveName is required' }, { status: 400 })
  }

  // Sanitize and bound input — enforce limits regardless of what client sends
  const keywordRaw = Array.isArray(b.keyword) ? b.keyword.slice(0, MAX_KEYWORD) : []
  const semanticRaw = Array.isArray(b.semantic) ? b.semantic.slice(0, MAX_SEMANTIC) : []
  const graphRaw = Array.isArray(b.graph) ? b.graph.slice(0, MAX_GRAPH) : []

  // Build bounded entries (strip any fields we don't need, enforce shape)
  const keyword: BoundedKeywordEntry[] = keywordRaw.map((e: Record<string, unknown>) => ({
    title: String(e.title ?? ''),
    canonical_status: String(e.canonical_status ?? ''),
    sensitivity: String(e.sensitivity ?? 'private'),
    rank_score: Number(e.rank_score ?? 0),
    rank_reason: String(e.rank_reason ?? ''),
    excerpt: typeof e.excerpt === 'string' ? e.excerpt.slice(0, 500) : null,
    archive_name: String(e.archive_name ?? ''),
    category: String(e.category ?? ''),
    source_document: typeof e.source_document === 'string' ? e.source_document : null,
    source_date: typeof e.source_date === 'string' ? e.source_date : null,
  }))

  const semantic: BoundedSemanticEntry[] = semanticRaw.map((e: Record<string, unknown>) => ({
    title: String(e.title ?? ''),
    canonical_status: String(e.canonical_status ?? ''),
    sensitivity: String(e.sensitivity ?? 'private'),
    similarity: Number(e.similarity ?? 0),
    excerpt: typeof e.excerpt === 'string' ? e.excerpt.slice(0, 500) : null,
    archive_name: String(e.archive_name ?? ''),
    category: String(e.category ?? ''),
  }))

  const graph: BoundedGraphEntry[] = graphRaw.map((g: Record<string, unknown>) => ({
    label: String(g.label ?? ''),
    node_type: String(g.node_type ?? ''),
    description: typeof g.description === 'string' ? g.description.slice(0, 300) : null,
    match_reason: String(g.match_reason ?? ''),
    provenance_ok: Boolean(g.provenance_ok),
    source_entries: Array.isArray(g.source_entries)
      ? (g.source_entries as Record<string, unknown>[]).map(s => ({
          title: String(s.title ?? ''),
          canonical_status: String(s.canonical_status ?? ''),
          sensitivity: String(s.sensitivity ?? 'private'),
        }))
      : [],
  }))

  const overlap: BoundedOverlap = {
    keyword_and_semantic: Number((b.overlap as Record<string, unknown>)?.keyword_and_semantic ?? 0),
    keyword_and_graph: Number((b.overlap as Record<string, unknown>)?.keyword_and_graph ?? 0),
    semantic_and_graph: Number((b.overlap as Record<string, unknown>)?.semantic_and_graph ?? 0),
    all_three: Number((b.overlap as Record<string, unknown>)?.all_three ?? 0),
  }

  const absenceRaw = (b.absence ?? {}) as Record<string, unknown>
  const absence: BoundedAbsence = {
    keyword_no_match: Boolean(absenceRaw.keyword_no_match),
    semantic_no_match: Boolean(absenceRaw.semantic_no_match),
    graph_no_match: Boolean(absenceRaw.graph_no_match),
    semantic_unembedded_elevated_count: Number(absenceRaw.semantic_unembedded_elevated_count ?? 0),
    graph_pending_count: Number(absenceRaw.graph_pending_count ?? 0),
    graph_rejected_count: Number(absenceRaw.graph_rejected_count ?? 0),
  }

  const reqData: ReasonedRecallRequest = {
    query: query.trim(),
    presenceId,
    archiveName,
    keyword,
    semantic,
    graph,
    overlap,
    absence,
  }

  // Build bounded prompt from sanitized input
  const evidenceContext = buildReasoningPrompt(reqData)

  // Diagnostic logging — payload counts
  console.log('[reasoned-recall] payload counts:', {
    keyword: keyword.length,
    semantic: semantic.length,
    graph: graph.length,
    overlap: `ks=${overlap.keyword_and_semantic} kg=${overlap.keyword_and_graph} sg=${overlap.semantic_and_graph} all=${overlap.all_three}`,
    query: reqData.query.slice(0, 80),
  })

  // Call Claude
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[reasoned-recall] ANTHROPIC_API_KEY missing')
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: REASONED_RECALL_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Analyse the following retrieved evidence and produce a structured reasoning summary.\n\n${evidenceContext}`,
        },
      ],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No text response from reasoning model' }, { status: 502 })
    }

    const rawText = textBlock.text
    console.log('[reasoned-recall] raw response length:', rawText.length, 'starts with:', JSON.stringify(rawText.slice(0, 120)))
    const parsed = safeParseModelJson<ReasonedRecallOutput>(rawText)
    if (parsed && typeof parsed === 'object' && 'evidence_summary' in parsed) {
      console.log('[reasoned-recall] structured parse OK, counts:', {
        kw: parsed.evidence_summary?.keyword_count,
        sem: parsed.evidence_summary?.semantic_count,
        gr: parsed.evidence_summary?.graph_count,
      })
      return NextResponse.json({ analysis: parsed })
    }

    // JSON parse failed — return plain-text fallback if usable text exists
    console.error('[reasoned-recall] JSON parse failed or missing evidence_summary. Raw preview:', rawText.slice(0, 1000))
    if (rawText.trim().length > 20) {
      return NextResponse.json({
        analysis: null,
        fallbackText: rawText.trim().slice(0, 3000),
        parseWarning: 'Model returned non-JSON output; rendered as plain text fallback.',
        inputCounts: { keyword: keyword.length, semantic: semantic.length, graph: graph.length },
      })
    }

    return NextResponse.json({ error: 'Reasoning output could not be parsed' }, { status: 502 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error('[reasoned-recall] Claude API error:', msg)
    if (stack) console.error('[reasoned-recall] Stack:', stack)
    return NextResponse.json(
      { error: `Reasoned analysis unavailable: ${msg}` },
      { status: 502 }
    )
  }
}
