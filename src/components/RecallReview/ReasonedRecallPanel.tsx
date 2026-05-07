'use client'

// Phase 32B — Deterministic Reasoned Recall Panel
//
// Renders structured reasoning sections from existing Hybrid Recall data.
// No Claude API call. No model-generated JSON. Pure deterministic analysis.
//
// Laws:
//   Retrieval data first. Reasoning shell deterministic.
//   Claude interpretation optional later.
//   No Memory authority change.
//   canonical_status remains authority. Tara promotes.
//
// Governance (unchanged from Phase 32):
//   No chat injection. No new tables. No storage.
//   No archive_memory_events writes. No canonical_status changes.
//   No recall-law changes. No graph approval. No Memory promotion.
//   No reasoned output becoming recallable evidence.

import { useMemo } from 'react'
import type { HybridRecallResult } from '@/lib/archive-hybrid'
import { ELEVATED_SENSITIVITIES } from '@/lib/archive-memory'

// ─── Deterministic analysis types ───────────────────────────────────────────

interface DeterministicAnalysis {
  evidence_summary: {
    keyword_count: number
    semantic_count: number
    graph_count: number
    strongest_keyword: string | null
    closest_semantic: string | null
    overlap_description: string
  }
  confirmed_memory: Array<{
    title: string
    found_via: string
    category: string
    sensitivity: string
    is_elevated: boolean
  }>
  memory_candidate: Array<{
    title: string
    found_via: string
    category: string
    sensitivity: string
    is_elevated: boolean
  }>
  semantic_context: Array<{
    title: string
    similarity: number
    category: string
    canonical_status: string
  }>
  graph_context: Array<{
    label: string
    node_type: string
    match_reason: string
    provenance_ok: boolean
    source_count: number
  }>
  overlap_lines: string[]
  gaps_and_absence: string[]
  interpretation: string[]
  confidence: 'strong evidence' | 'moderate evidence' | 'weak / adjacent evidence' | 'no confirmed evidence'
}

// ─── Deterministic analysis builder ─────────────────────────────────────────

function buildDeterministicAnalysis(result: HybridRecallResult): DeterministicAnalysis {
  const kw = result.keyword.results.slice(0, 5)
  const sem = result.semantic.results.slice(0, 5)
  const gr = result.graph.matched.slice(0, 5)

  // Evidence summary
  const strongestKeyword = kw.length > 0
    ? kw.reduce((a, b) => a.rank_score >= b.rank_score ? a : b).title
    : null
  const closestSemantic = sem.length > 0
    ? sem.reduce((a, b) => a.similarity >= b.similarity ? a : b).title
    : null

  const overlapParts: string[] = []
  if (result.overlap.all_three.length > 0) overlapParts.push(`${result.overlap.all_three.length} in all three methods`)
  if (result.overlap.keyword_and_semantic.length > 0) overlapParts.push(`${result.overlap.keyword_and_semantic.length} keyword + semantic`)
  if (result.overlap.keyword_and_graph.length > 0) overlapParts.push(`${result.overlap.keyword_and_graph.length} keyword + graph`)
  if (result.overlap.semantic_and_graph.length > 0) overlapParts.push(`${result.overlap.semantic_and_graph.length} semantic + graph`)

  // Split by canonical_status
  const confirmed_memory = kw
    .filter(e => e.canonical_status === 'canonical')
    .slice(0, 5)
    .map(e => ({
      title: e.title,
      found_via: `keyword (${e.rank_reason})`,
      category: e.category,
      sensitivity: e.sensitivity,
      is_elevated: ELEVATED_SENSITIVITIES.includes(e.sensitivity),
    }))

  // Add semantic-only canonical items not already in keyword
  const kwTitles = new Set(kw.map(e => e.title))
  const semCanonical = sem
    .filter(s => s.canonical_status === 'canonical' && !kwTitles.has(s.title))
    .slice(0, 3)
    .map(s => ({
      title: s.title,
      found_via: `semantic (${(s.similarity * 100).toFixed(0)}% similarity)`,
      category: s.category,
      sensitivity: s.sensitivity,
      is_elevated: ELEVATED_SENSITIVITIES.includes(s.sensitivity),
    }))
  const allConfirmed = [...confirmed_memory, ...semCanonical].slice(0, 5)

  const memory_candidate = kw
    .filter(e => e.canonical_status === 'canonical_candidate')
    .slice(0, 5)
    .map(e => ({
      title: e.title,
      found_via: `keyword (${e.rank_reason})`,
      category: e.category,
      sensitivity: e.sensitivity,
      is_elevated: ELEVATED_SENSITIVITIES.includes(e.sensitivity),
    }))

  // Add semantic-only candidates
  const semCandidates = sem
    .filter(s => s.canonical_status === 'canonical_candidate' && !kwTitles.has(s.title))
    .slice(0, 3)
    .map(s => ({
      title: s.title,
      found_via: `semantic (${(s.similarity * 100).toFixed(0)}% similarity)`,
      category: s.category,
      sensitivity: s.sensitivity,
      is_elevated: ELEVATED_SENSITIVITIES.includes(s.sensitivity),
    }))
  const allCandidates = [...memory_candidate, ...semCandidates].slice(0, 5)

  // Semantic context (non-canonical, non-candidate)
  const semantic_context = sem
    .filter(s => s.canonical_status !== 'canonical' && s.canonical_status !== 'canonical_candidate')
    .slice(0, 5)
    .map(s => ({
      title: s.title,
      similarity: s.similarity,
      category: s.category,
      canonical_status: s.canonical_status,
    }))

  // Graph context
  const graph_context = gr.slice(0, 5).map(g => ({
    label: g.node.label,
    node_type: g.node.node_type,
    match_reason: g.match_reason,
    provenance_ok: g.provenance_ok,
    source_count: g.source_entries.length,
  }))

  // Overlap lines
  const overlap_lines = overlapParts.length > 0
    ? overlapParts
    : ['No overlap between retrieval methods.']

  // Gaps and absence
  const gaps: string[] = []
  if (result.absence.keyword_no_match) gaps.push('Keyword recall returned no matches.')
  if (result.absence.semantic_no_match) gaps.push('Semantic recall found no embedded matches.')
  if (result.absence.graph_no_match) gaps.push('No approved graph nodes matched.')
  if (result.absence.semantic_unembedded_elevated_count > 0)
    gaps.push(`${result.absence.semantic_unembedded_elevated_count} elevated-sensitivity entries are not yet embedded.`)
  if (result.absence.graph_pending_count > 0)
    gaps.push(`${result.absence.graph_pending_count} graph nodes are pending approval.`)
  if (result.absence.graph_rejected_count > 0)
    gaps.push(`${result.absence.graph_rejected_count} graph nodes were rejected.`)

  // Rule-based interpretation
  const interp: string[] = []
  if (kw.length > 0 && kw.some(e => e.canonical_status === 'canonical')) {
    interp.push('Keyword recall found a direct match with confirmed Memory.')
  } else if (kw.length > 0) {
    interp.push('Keyword recall found matches, but none are confirmed Memory.')
  }
  if (sem.length > 0 && sem.some(s => s.canonical_status === 'canonical')) {
    interp.push('Semantic recall found adjacent confirmed Memory.')
  } else if (sem.length > 0) {
    interp.push('Semantic recall found adjacent material.')
  }
  if (gr.length > 0 && gr.some(g => g.provenance_ok)) {
    interp.push('Approved graph nodes with verified provenance were found.')
  } else if (gr.length > 0) {
    interp.push('Graph nodes were found, but provenance could not be verified.')
  } else {
    interp.push('No approved graph context was found.')
  }

  // Overlap interpretation
  if (result.overlap.all_three.length > 0) {
    interp.push('All three retrieval methods agree on some entries, suggesting strong alignment.')
  } else if (overlapParts.length > 0) {
    interp.push('Some retrieval methods overlap, suggesting moderate alignment.')
  } else {
    interp.push('Retrieval methods did not overlap. Evidence is distributed.')
  }

  // Elevated sensitivity note
  const hasElevated = [...allConfirmed, ...allCandidates].some(m => m.is_elevated)
  if (hasElevated) {
    interp.push('Elevated archive material is present. Use carefully.')
  }

  // Confidence
  let confidence: DeterministicAnalysis['confidence'] = 'no confirmed evidence'
  if (allConfirmed.length > 0 && result.overlap.all_three.length > 0) {
    confidence = 'strong evidence'
  } else if (allConfirmed.length > 0) {
    confidence = 'moderate evidence'
  } else if (allCandidates.length > 0 || sem.length > 0) {
    confidence = 'weak / adjacent evidence'
  }

  return {
    evidence_summary: {
      keyword_count: result.keyword.count,
      semantic_count: result.semantic.count,
      graph_count: result.graph.count,
      strongest_keyword: strongestKeyword,
      closest_semantic: closestSemantic,
      overlap_description: overlapParts.length > 0 ? overlapParts.join('; ') : 'No overlap between methods.',
    },
    confirmed_memory: allConfirmed,
    memory_candidate: allCandidates,
    semantic_context,
    graph_context,
    overlap_lines,
    gaps_and_absence: gaps,
    interpretation: interp,
    confidence,
  }
}

// ─── Section renderers ──────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mt-4 mb-1.5 border-b border-house-border/40 pb-1">
      {label}
    </p>
  )
}

function SensitivityBadge({ sensitivity, isElevated }: { sensitivity: string; isElevated: boolean }) {
  return (
    <span className={`font-body text-[9px] border px-1.5 py-0.5 ${
      isElevated
        ? 'text-amber-400 border-amber-400/30'
        : 'text-text-muted border-house-border'
    }`}>
      {sensitivity}{isElevated ? ' / elevated' : ''}
    </span>
  )
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const styles: Record<string, string> = {
    'strong evidence': 'text-green-400 border-green-400/30',
    'moderate evidence': 'text-amber-400 border-amber-400/30',
    'weak / adjacent evidence': 'text-orange-400 border-orange-400/30',
    'no confirmed evidence': 'text-red-400 border-red-400/30',
  }
  return (
    <span className={`font-body text-[9px] border px-1.5 py-0.5 ${styles[confidence] ?? 'text-text-muted border-house-border'}`}>
      {confidence}
    </span>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function ReasonedRecallPanel({ result }: { result: HybridRecallResult }) {
  const hasAnyResults =
    result.keyword.count > 0 ||
    result.semantic.count > 0 ||
    result.graph.count > 0

  const analysis = useMemo(
    () => hasAnyResults ? buildDeterministicAnalysis(result) : null,
    [result, hasAnyResults]
  )

  if (!analysis) return null

  return (
    <div className="mt-4 border-t border-house-border/60 pt-3">
      <p className="font-body text-[10px] text-text-muted uppercase tracking-widest">
        Reasoned Analysis
      </p>

      <div className="mt-3 space-y-1 border border-house-border bg-house-bg p-3 max-h-[420px] overflow-y-auto">

        {/* Evidence Summary */}
        <SectionHeader label="Evidence Summary" />
        <div className="space-y-0.5">
          <p className="font-body text-[10px] text-text-muted">
            Keyword: {analysis.evidence_summary.keyword_count} results
            {analysis.evidence_summary.strongest_keyword && (
              <> · strongest: <span className="text-text-secondary">{analysis.evidence_summary.strongest_keyword}</span></>
            )}
          </p>
          <p className="font-body text-[10px] text-text-muted">
            Semantic: {analysis.evidence_summary.semantic_count} results
            {analysis.evidence_summary.closest_semantic && (
              <> · closest: <span className="text-text-secondary">{analysis.evidence_summary.closest_semantic}</span></>
            )}
          </p>
          <p className="font-body text-[10px] text-text-muted">
            Graph: {analysis.evidence_summary.graph_count} nodes
          </p>
          <p className="font-body text-[10px] text-text-muted/70">
            Overlap: {analysis.evidence_summary.overlap_description}
          </p>
        </div>

        {/* Confirmed Memory */}
        {analysis.confirmed_memory.length > 0 && (
          <>
            <SectionHeader label="Confirmed Memory" />
            {analysis.confirmed_memory.map((m, i) => (
              <div key={i} className="py-1.5 border-b border-house-border/20">
                <div className="flex items-start gap-1.5 flex-wrap">
                  <span className="font-body text-xs text-text-primary">{m.title}</span>
                  <span className="font-body text-[9px] text-green-400 border border-green-400/30 px-1.5 py-0.5">Memory</span>
                  <SensitivityBadge sensitivity={m.sensitivity} isElevated={m.is_elevated} />
                </div>
                <p className="font-body text-[10px] text-text-muted mt-0.5">Found via: {m.found_via}</p>
                <p className="font-body text-[10px] text-text-muted/60 mt-0.5">Category: {m.category}</p>
                {m.is_elevated && (
                  <p className="font-body text-[9px] text-amber-400/80 mt-0.5">Elevated archive material. Use carefully.</p>
                )}
              </div>
            ))}
          </>
        )}

        {/* Memory Candidate */}
        {analysis.memory_candidate.length > 0 && (
          <>
            <SectionHeader label="Memory Candidate" />
            {analysis.memory_candidate.map((m, i) => (
              <div key={i} className="py-1.5 border-b border-house-border/20">
                <div className="flex items-start gap-1.5 flex-wrap">
                  <span className="font-body text-xs text-text-primary">{m.title}</span>
                  <span className="font-body text-[9px] text-amber-400 border border-amber-400/30 px-1.5 py-0.5">Candidate</span>
                  <SensitivityBadge sensitivity={m.sensitivity} isElevated={m.is_elevated} />
                </div>
                <p className="font-body text-[10px] text-text-muted mt-0.5">Found via: {m.found_via}</p>
                <p className="font-body text-[10px] text-amber-400/70 mt-0.5">This material is provisional. Not confirmed Memory.</p>
              </div>
            ))}
          </>
        )}

        {/* Semantic Context */}
        {analysis.semantic_context.length > 0 && (
          <>
            <SectionHeader label="Semantic Context" />
            {analysis.semantic_context.map((s, i) => (
              <div key={i} className="py-1.5 border-b border-house-border/20">
                <div className="flex items-start gap-1.5 flex-wrap">
                  <span className="font-body text-xs text-text-primary">{s.title}</span>
                  <span className="font-body text-[9px] text-emerald-400 border border-emerald-400/30 px-1.5 py-0.5">
                    {(s.similarity * 100).toFixed(0)}%
                  </span>
                  <span className="font-body text-[9px] text-text-muted border border-house-border px-1.5 py-0.5">
                    {s.canonical_status}
                  </span>
                </div>
                <p className="font-body text-[10px] text-text-muted/60 mt-0.5">Category: {s.category}</p>
                <p className="font-body text-[9px] text-text-muted/50 mt-0.5">Similarity indicates textual closeness, not confirmation.</p>
              </div>
            ))}
          </>
        )}

        {/* Graph Context */}
        {analysis.graph_context.length > 0 && (
          <>
            <SectionHeader label="Graph Context" />
            {analysis.graph_context.map((g, i) => (
              <div key={i} className="py-1.5 border-b border-house-border/20">
                <div className="flex items-start gap-1.5 flex-wrap">
                  <span className="font-body text-xs text-violet-300">{g.label}</span>
                  <span className="font-body text-[9px] text-text-muted border border-house-border px-1.5 py-0.5">
                    {g.node_type.replace(/_/g, ' ')}
                  </span>
                  <span className={`font-body text-[9px] border px-1.5 py-0.5 ${
                    g.provenance_ok ? 'text-green-400 border-green-400/30' : 'text-orange-400 border-orange-400/30'
                  }`}>
                    {g.provenance_ok ? 'provenance verified' : 'provenance unavailable'}
                  </span>
                </div>
                <p className="font-body text-[10px] text-text-muted mt-0.5">Match: {g.match_reason} · {g.source_count} source entries</p>
                <p className="font-body text-[9px] text-text-muted/50 mt-0.5">Graph relationships connect concepts. They do not confirm Memory.</p>
              </div>
            ))}
          </>
        )}

        {/* Overlap */}
        <SectionHeader label="Overlap" />
        {analysis.overlap_lines.map((line, i) => (
          <p key={i} className="font-body text-[10px] text-text-muted">{line}</p>
        ))}
        <p className="font-body text-[9px] text-text-muted/50 mt-0.5">Overlap does not make a result authoritative.</p>

        {/* Gaps / Absence */}
        {analysis.gaps_and_absence.length > 0 && (
          <>
            <SectionHeader label="Gaps / Absence" />
            {analysis.gaps_and_absence.map((gap, i) => (
              <p key={i} className="font-body text-[10px] text-text-muted/70">• {gap}</p>
            ))}
          </>
        )}

        {/* Rule-Based Interpretation */}
        <SectionHeader label="Rule-Based Interpretation" />
        <div className="py-1.5">
          <div className="flex items-center gap-2 mb-1.5">
            <ConfidenceBadge confidence={analysis.confidence} />
          </div>
          {analysis.interpretation.map((line, i) => (
            <p key={i} className="font-body text-[10px] text-text-secondary">
              {line}
            </p>
          ))}
        </div>

        {/* Do Not Treat As Memory */}
        <div className="mt-3 pt-2 border-t border-house-border/40">
          <p className="font-body text-[9px] text-text-muted/60 italic">
            This analysis is deterministic interpretation of retrieved evidence. It is not Memory, not graph authority, and not recallable evidence. Promotion requires Tara through Memory Review.
          </p>
          <p className="font-body text-[9px] text-text-muted/40 mt-1">
            Retrieval data first. Reasoning shell deterministic. canonical_status remains authority. Tara promotes.
          </p>
        </div>
      </div>
    </div>
  )
}
