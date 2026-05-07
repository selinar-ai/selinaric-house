'use client'

// Phase 32 — Reasoned Recall Panel
//
// Renders inside HybridRecallPanel after results load.
// Manual "Analyse" button triggers Claude reasoning over bounded evidence.
// Output is ephemeral — not stored, not injected into chat.
//
// Laws:
//   Recall retrieves evidence. Reasoning explains relationships.
//   canonical_status remains authority. Inference must be labelled.
//   Tara promotes.

import { useState } from 'react'
import type { HybridRecallResult } from '@/lib/archive-hybrid'
import type { ReasonedRecallOutput } from '@/app/api/archive-recall/reasoned/route'
import { ELEVATED_SENSITIVITIES } from '@/lib/archive-memory'

// ─── Bounded payload builder ─────────────────────────────────────────────────

function buildRequestPayload(result: HybridRecallResult) {
  // Bound: max 5 per method, excerpts only (no raw_content), titles + metadata
  const keyword = result.keyword.results.slice(0, 5).map(e => ({
    title: e.title,
    canonical_status: e.canonical_status,
    sensitivity: e.sensitivity,
    rank_score: e.rank_score,
    rank_reason: e.rank_reason,
    excerpt: e.excerpt?.slice(0, 500) ?? null,
    archive_name: e.archive_name,
    category: e.category,
    source_document: e.source_document,
    source_date: e.source_date,
  }))

  const semantic = result.semantic.results.slice(0, 5).map(c => ({
    title: c.title,
    canonical_status: c.canonical_status,
    sensitivity: c.sensitivity,
    similarity: c.similarity,
    excerpt: c.excerpt?.slice(0, 500) ?? null,
    archive_name: c.archive_name,
    category: c.category,
  }))

  const graph = result.graph.matched.slice(0, 5).map(g => ({
    label: g.node.label,
    node_type: g.node.node_type,
    description: g.node.description?.slice(0, 300) ?? null,
    match_reason: g.match_reason,
    provenance_ok: g.provenance_ok,
    source_entries: g.source_entries.map(s => ({
      title: s.title,
      canonical_status: s.canonical_status,
      sensitivity: s.sensitivity,
    })),
  }))

  return {
    query: result.query,
    presenceId: result.presence_id,
    archiveName: result.archive_name,
    keyword,
    semantic,
    graph,
    overlap: {
      keyword_and_semantic: result.overlap.keyword_and_semantic.length,
      keyword_and_graph: result.overlap.keyword_and_graph.length,
      semantic_and_graph: result.overlap.semantic_and_graph.length,
      all_three: result.overlap.all_three.length,
    },
    absence: result.absence,
  }
}

// ─── Section renderers ───────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mt-4 mb-1.5 border-b border-house-border/40 pb-1">
      {label}
    </p>
  )
}

function ElevatedCaution({ text }: { text: string }) {
  if (!text) return null
  return (
    <p className="font-body text-[9px] text-amber-400/80 mt-0.5">{text}</p>
  )
}

function SensitivityBadge({ sensitivity }: { sensitivity: string }) {
  const isElevated = ELEVATED_SENSITIVITIES.includes(sensitivity)
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
    'conflict / unresolved': 'text-red-400 border-red-400/30',
  }
  return (
    <span className={`font-body text-[9px] border px-1.5 py-0.5 ${styles[confidence] ?? 'text-text-muted border-house-border'}`}>
      {confidence}
    </span>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function ReasonedRecallPanel({ result }: { result: HybridRecallResult }) {
  const [analysis, setAnalysis] = useState<ReasonedRecallOutput | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runAnalysis() {
    setLoading(true)
    setError(null)
    setAnalysis(null)
    try {
      const payload = buildRequestPayload(result)
      const res = await fetch('/api/archive-recall/reasoned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Reasoned analysis unavailable')
        return
      }
      setAnalysis(data.analysis as ReasonedRecallOutput)
    } catch {
      setError('Reasoned analysis unavailable. Retrieved results are still shown above.')
    } finally {
      setLoading(false)
    }
  }

  const hasAnyResults =
    result.keyword.count > 0 ||
    result.semantic.count > 0 ||
    result.graph.count > 0

  if (!hasAnyResults) return null

  return (
    <div className="mt-4 border-t border-house-border/60 pt-3">
      <div className="flex items-center gap-3">
        <p className="font-body text-[10px] text-text-muted uppercase tracking-widest">
          Reasoned Analysis
        </p>
        {!analysis && !loading && (
          <button
            onClick={() => void runAnalysis()}
            disabled={loading}
            className="
              h-7 px-4 font-body text-xs border border-house-muted
              bg-house-surface text-text-primary
              hover:bg-house-bg transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            Analyse
          </button>
        )}
        {loading && (
          <div className="flex gap-1.5">
            {[0, 0.15, 0.3].map((d, i) => (
              <div key={i} className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: `${d}s` }} />
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="font-body text-xs text-red-400 mt-2">{error}</p>
      )}

      {analysis && (
        <div className="mt-3 space-y-1 border border-house-border bg-house-bg p-3">

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
            {analysis.evidence_summary.overlap_description && (
              <p className="font-body text-[10px] text-text-muted/70">
                Overlap: {analysis.evidence_summary.overlap_description}
              </p>
            )}
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
                    {m.sensitivity && <SensitivityBadge sensitivity={m.sensitivity} />}
                  </div>
                  {m.found_via && <p className="font-body text-[10px] text-text-muted mt-0.5">Found via: {m.found_via}</p>}
                  {m.relevance && <p className="font-body text-[10px] text-text-muted/70 mt-0.5">{m.relevance}</p>}
                  {m.source && <p className="font-body text-[10px] text-text-muted/60 mt-0.5">Source: {m.source}</p>}
                  <ElevatedCaution text={m.caution ?? ''} />
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
                  </div>
                  {m.found_via && <p className="font-body text-[10px] text-text-muted mt-0.5">Found via: {m.found_via}</p>}
                  <p className="font-body text-[10px] text-amber-400/70 mt-0.5">{m.caution || 'This material is provisional.'}</p>
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
                    <span className="font-body text-xs text-violet-300">{g.title}</span>
                    {g.node_type && (
                      <span className="font-body text-[9px] text-text-muted border border-house-border px-1.5 py-0.5">
                        {g.node_type.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  {g.relationship && <p className="font-body text-[10px] text-text-muted mt-0.5">{g.relationship}</p>}
                  {g.source && <p className="font-body text-[10px] text-text-muted/60 mt-0.5">Source: {g.source}</p>}
                  <p className="font-body text-[9px] text-text-muted/50 mt-0.5">{g.caution || 'Graph relationships connect concepts. They do not confirm Memory.'}</p>
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
                    {s.similarity && (
                      <span className="font-body text-[9px] text-emerald-400 border border-emerald-400/30 px-1.5 py-0.5">
                        {s.similarity}
                      </span>
                    )}
                  </div>
                  {s.relevance && <p className="font-body text-[10px] text-text-muted/70 mt-0.5">{s.relevance}</p>}
                  <p className="font-body text-[9px] text-text-muted/50 mt-0.5">{s.caution || 'Similarity indicates textual closeness, not confirmation.'}</p>
                </div>
              ))}
            </>
          )}

          {/* Overlap Analysis */}
          {analysis.overlap_analysis && (
            <>
              <SectionHeader label="Overlap" />
              <p className="font-body text-[10px] text-text-muted">{analysis.overlap_analysis}</p>
              <p className="font-body text-[9px] text-text-muted/50 mt-0.5">Overlap does not make a result authoritative.</p>
            </>
          )}

          {/* Gaps / Absence */}
          {analysis.gaps_and_absence.length > 0 && (
            <>
              <SectionHeader label="Gaps / Absence" />
              {analysis.gaps_and_absence.map((gap, i) => (
                <p key={i} className="font-body text-[10px] text-text-muted/70">• {gap}</p>
              ))}
            </>
          )}

          {/* Reasoned Inference */}
          <SectionHeader label="Reasoned Inference" />
          <div className="py-1.5">
            <div className="flex items-center gap-2 mb-1">
              <ConfidenceBadge confidence={analysis.reasoned_inference.confidence} />
            </div>
            <p className="font-body text-[10px] text-text-secondary">
              {analysis.reasoned_inference.inference}
            </p>
            {analysis.reasoned_inference.based_on && (
              <p className="font-body text-[10px] text-text-muted/60 mt-0.5">
                Based on: {analysis.reasoned_inference.based_on}
              </p>
            )}
          </div>

          {/* Do Not Treat As Memory */}
          <div className="mt-3 pt-2 border-t border-house-border/40">
            <p className="font-body text-[9px] text-text-muted/60 italic">
              {analysis.do_not_treat_as_memory || 'Any inference above is analysis, not Memory. Promotion requires Tara through Memory Review.'}
            </p>
            <p className="font-body text-[9px] text-text-muted/40 mt-1">
              Recall retrieves evidence. Reasoning explains relationships. canonical_status remains authority. Inference must be labelled. Tara promotes.
            </p>
          </div>

          {/* Re-analyse button */}
          <div className="mt-3 pt-2 border-t border-house-border/40">
            <button
              onClick={() => void runAnalysis()}
              disabled={loading}
              className="
                h-6 px-3 font-body text-[10px] border border-house-border
                text-text-muted hover:text-text-secondary hover:border-house-muted
                transition-colors disabled:opacity-40 disabled:cursor-not-allowed
              "
            >
              {loading ? 'Analysing…' : 'Re-analyse'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
