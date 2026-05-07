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

// ─── Normalisation layer ────────────────────────────────────────────────────
// Coerce any parsed object into canonical ReasonedRecallOutput shape.
// Missing sections → empty defaults. Extra fields → ignored. Partial → safe.

function asString(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v
  if (v == null) return fallback
  return String(v)
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && !isNaN(v)) return v
  if (typeof v === 'string') { const n = Number(v); if (!isNaN(n)) return n }
  return fallback
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(x => asString(x)).filter(Boolean)
  if (typeof v === 'string' && v.trim()) return [v]
  return []
}

function asSectionArray(v: unknown): ReasonedRecallSection[] {
  if (!Array.isArray(v)) {
    if (typeof v === 'string' && v.trim()) return [{ title: v.trim() }]
    if (v && typeof v === 'object') return [normaliseSectionItem(v as Record<string, unknown>)]
    return []
  }
  return v
    .filter(x => x != null)
    .map(x => {
      if (typeof x === 'string') return { title: x.trim() } as ReasonedRecallSection
      if (typeof x === 'object') return normaliseSectionItem(x as Record<string, unknown>)
      return { title: String(x) } as ReasonedRecallSection
    })
}

function normaliseSectionItem(o: Record<string, unknown>): ReasonedRecallSection {
  return {
    title: asString(o.title || o.label || o.name, 'Untitled'),
    status: o.status != null ? asString(o.status) : undefined,
    sensitivity: o.sensitivity != null ? asString(o.sensitivity) : undefined,
    found_via: o.found_via != null ? asString(o.found_via) : undefined,
    relevance: o.relevance != null ? asString(o.relevance) : undefined,
    source: o.source != null ? asString(o.source) : undefined,
    caution: o.caution != null ? asString(o.caution) : undefined,
    similarity: o.similarity != null ? asString(o.similarity) : undefined,
    node_type: o.node_type != null ? asString(o.node_type) : undefined,
    relationship: o.relationship != null ? asString(o.relationship) : undefined,
    approval: o.approval != null ? asString(o.approval) : undefined,
  }
}

function normaliseReasonedOutput(raw: Record<string, unknown>): ReasonedRecallOutput {
  const es = (raw.evidence_summary ?? {}) as Record<string, unknown>

  return {
    evidence_summary: {
      keyword_count: asNumber(es.keyword_count),
      semantic_count: asNumber(es.semantic_count),
      graph_count: asNumber(es.graph_count),
      strongest_keyword: es.strongest_keyword != null ? asString(es.strongest_keyword) : null,
      closest_semantic: (es.closest_semantic ?? es.strongest_semantic) != null
        ? asString(es.closest_semantic ?? es.strongest_semantic)
        : null,
      overlap_description: asString(es.overlap_description),
    },
    confirmed_memory: asSectionArray(raw.confirmed_memory),
    memory_candidate: asSectionArray(raw.memory_candidate ?? raw.memory_candidates),
    graph_context: asSectionArray(raw.graph_context),
    semantic_context: asSectionArray(raw.semantic_context),
    overlap_analysis: asString(raw.overlap_analysis ?? raw.overlap),
    gaps_and_absence: asStringArray(raw.gaps_and_absence ?? raw.gaps_absence ?? raw.gaps),
    reasoned_inference: normaliseInference(raw.reasoned_inference),
    do_not_treat_as_memory: asString(
      raw.do_not_treat_as_memory,
      'Any inference above is analysis, not Memory. Promotion requires Tara through Memory Review.'
    ),
  }
}

function normaliseInference(v: unknown): ReasonedRecallOutput['reasoned_inference'] {
  const DEFAULT_INFERENCE: ReasonedRecallOutput['reasoned_inference'] = {
    inference: 'No reasoned inference produced.',
    confidence: 'no confirmed evidence',
    based_on: '',
  }
  if (!v || typeof v !== 'object') return DEFAULT_INFERENCE
  const o = v as Record<string, unknown>
  return {
    inference: asString(o.inference, DEFAULT_INFERENCE.inference),
    confidence: asString(o.confidence, DEFAULT_INFERENCE.confidence) as ReasonedRecallOutput['reasoned_inference']['confidence'],
    based_on: Array.isArray(o.based_on) ? o.based_on.map(x => asString(x)).join('; ') : asString(o.based_on),
  }
}

/** Returns true if the parsed object looks like a reasoned recall response (has at least one recognisable top-level field). */
function looksLikeReasonedOutput(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  // Accept if it has any of the expected top-level keys
  const knownKeys = ['evidence_summary', 'confirmed_memory', 'memory_candidate', 'graph_context', 'semantic_context', 'reasoned_inference', 'gaps_and_absence', 'gaps_absence', 'overlap_analysis']
  return knownKeys.some(k => k in o)
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

  // Keyword results (compact: title, status, sensitivity, category — excerpt capped at 150)
  ctx += `── Keyword (${keyword.length}) ──\n`
  if (keyword.length === 0) {
    ctx += `None.\n\n`
  } else {
    for (const e of keyword) {
      const st = e.canonical_status === 'canonical' ? 'Memory' : e.canonical_status === 'canonical_candidate' ? 'Candidate' : e.canonical_status
      const el = ELEVATED_SENSITIVITIES.includes(e.sensitivity) ? ' ELEVATED' : ''
      ctx += `- ${e.title} [${st}] ${e.sensitivity}${el} | ${e.category}`
      if (e.excerpt) ctx += ` | "${e.excerpt.slice(0, 150)}"`
      ctx += `\n`
    }
    ctx += `\n`
  }

  // Semantic results (compact)
  ctx += `── Semantic (${semantic.length}) ──\n`
  if (semantic.length === 0) {
    ctx += `None.\n\n`
  } else {
    for (const e of semantic) {
      const st = e.canonical_status === 'canonical' ? 'Memory' : e.canonical_status === 'canonical_candidate' ? 'Candidate' : e.canonical_status
      const el = ELEVATED_SENSITIVITIES.includes(e.sensitivity) ? ' ELEVATED' : ''
      ctx += `- ${e.title} [${st}] ${e.sensitivity}${el} | sim=${(e.similarity * 100).toFixed(0)}% | ${e.category}\n`
    }
    ctx += `\n`
  }

  // Graph results (compact)
  ctx += `── Graph (${graph.length}) ──\n`
  if (graph.length === 0) {
    ctx += `None.\n\n`
  } else {
    for (const g of graph) {
      ctx += `- ${g.label} (${g.node_type.replace(/_/g, ' ')}) match: ${g.match_reason} prov: ${g.provenance_ok ? 'yes' : 'no'}\n`
      if (g.source_entries.length > 0) {
        const srcs = g.source_entries.map(s => `${s.title}[${s.canonical_status}]`).join(', ')
        ctx += `  sources: ${srcs}\n`
      }
    }
    ctx += `\n`
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

CRITICAL: Return ONLY compact valid JSON. No markdown. No code fences. No text before or after. Your entire response is one JSON object.

COMPACTNESS RULES:
- Every string field: ONE sentence maximum. No long prose.
- Max 3 items per array. If more exist, summarise extras in gaps_and_absence.
- Do not reproduce archive content, excerpts, or full titles with decorative punctuation.
- Keep total output under 1500 tokens.

Laws:
- canonical_status is the single Memory authority. You do not promote or approve.
- "Confirmed Memory" = canonical_status is "canonical". Only use for items marked canonical.
- "Memory Candidate" = canonical_status is "canonical_candidate". Always note not confirmed.
- Semantic similarity = textual closeness, not truth.
- Graph relationships connect concepts, not confirm Memory.
- Overlap does not make a result authoritative.
- Absence does not mean Memory does not exist.
- Inference must be labelled as inference.

Confidence (use exactly one):
"strong evidence" | "moderate evidence" | "weak / adjacent evidence" | "no confirmed evidence" | "conflict / unresolved"

NOTE: The evidence_summary section is pre-filled by the system. You will receive it as a prefill. Do NOT generate evidence_summary yourself — it is already provided.

Return this exact JSON shape (evidence_summary will be injected, produce only the remaining fields):

{
  "confirmed_memory": [{"title":"short title","relevance":"one sentence","caution":"one sentence"}],
  "memory_candidate": [{"title":"short title","relevance":"one sentence","caution":"Provisional."}],
  "graph_context": ["Short node description"],
  "semantic_context": ["Short match description"],
  "overlap_analysis": "One sentence.",
  "gaps_and_absence": ["One sentence per gap."],
  "reasoned_inference": {"inference":"One sentence.","confidence":"moderate evidence","based_on":"One sentence."},
  "do_not_treat_as_memory": "Analysis only. Not Memory."
}

Max 3 items per list. Short strings only. No nested objects in graph_context or semantic_context — plain strings.
Return ONLY the JSON object.`

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

  // ─── Compute evidence_summary deterministically (not from model output) ───
  const strongestKeyword = keyword.length > 0
    ? keyword.reduce((a, b) => a.rank_score >= b.rank_score ? a : b).title
    : null
  const closestSemantic = semantic.length > 0
    ? semantic.reduce((a, b) => a.similarity >= b.similarity ? a : b).title
    : null

  // Build overlap description from counts
  const overlapParts: string[] = []
  if (overlap.all_three > 0) overlapParts.push(`${overlap.all_three} in all three methods`)
  if (overlap.keyword_and_semantic > 0) overlapParts.push(`${overlap.keyword_and_semantic} keyword+semantic`)
  if (overlap.keyword_and_graph > 0) overlapParts.push(`${overlap.keyword_and_graph} keyword+graph`)
  if (overlap.semantic_and_graph > 0) overlapParts.push(`${overlap.semantic_and_graph} semantic+graph`)
  const overlapDescription = overlapParts.length > 0 ? overlapParts.join('; ') : 'No overlap between methods.'

  const deterministicSummary = {
    keyword_count: keyword.length,
    semantic_count: semantic.length,
    graph_count: graph.length,
    strongest_keyword: strongestKeyword,
    closest_semantic: closestSemantic,
    overlap_description: overlapDescription,
  }

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

    // Prefill: start the assistant response with the deterministic evidence_summary
    // so the model only needs to produce the reasoning sections
    const prefill = `{"evidence_summary":${JSON.stringify(deterministicSummary)},`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      system: REASONED_RECALL_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Analyse the following retrieved evidence. Return compact JSON only.\n\n${evidenceContext}`,
        },
        {
          role: 'assistant',
          content: prefill,
        },
      ],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No text response from reasoning model' }, { status: 502 })
    }

    // Reconstruct full JSON: prefill + model continuation
    const rawContinuation = textBlock.text
    const rawText = prefill + rawContinuation
    console.log('[reasoned-recall] raw response length:', rawText.length, 'continuation starts with:', JSON.stringify(rawContinuation.slice(0, 120)))

    // Try to parse JSON from model output
    const parsed = safeParseModelJson<unknown>(rawText)

    // If we got a parseable object, normalise it (evidence_summary will come from the prefill)
    if (looksLikeReasonedOutput(parsed)) {
      const normalised = normaliseReasonedOutput(parsed)
      // Override evidence_summary with deterministic values (authoritative)
      normalised.evidence_summary = deterministicSummary
      console.log('[reasoned-recall] structured parse + normalise OK, sections:', {
        confirmed: normalised.confirmed_memory.length,
        candidates: normalised.memory_candidate.length,
        graph: normalised.graph_context.length,
        semantic: normalised.semantic_context.length,
        gaps: normalised.gaps_and_absence.length,
      })
      return NextResponse.json({ analysis: normalised })
    }

    // Detect truncation: starts with { but braces don't balance
    const trimmed = rawText.trim()
    const openBraces = (trimmed.match(/\{/g) || []).length
    const closeBraces = (trimmed.match(/\}/g) || []).length
    const likelyTruncated = trimmed.startsWith('{') && openBraces > closeBraces

    console.error('[reasoned-recall] parse failed.', likelyTruncated ? 'TRUNCATED.' : 'Unrecognised shape.', 'Raw preview:', rawText.slice(0, 800))

    if (rawText.trim().length > 20) {
      return NextResponse.json({
        analysis: null,
        fallbackText: rawText.trim().slice(0, 3000),
        parseWarning: likelyTruncated
          ? 'Model output appears truncated before valid JSON completed. Re-analyse may help.'
          : 'Model returned non-JSON output; rendered as plain text fallback.',
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
