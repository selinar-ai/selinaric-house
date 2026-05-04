'use client'

// Phase 29C — Hybrid Recall Lab panel
//
// Collapsible admin panel. Renders on the Recall Review page.
// Runs three independent retrieval passes for a given query:
//   Keyword · Semantic · Graph
// Shows overlap, disagreement, and absence explanations.
//
// Laws:
//   Hybrid recall compares. Hybrid recall does not decide.
//   Graph results: approved nodes only. Pending informational. Rejected excluded.
//   Graph provenance required: source Archive Entry title(s) shown per node.
//   If provenance_ok=false, graph result is marked "provenance unavailable".
//   No event logging. No canonical_status changes. No chat injection.

import { useState } from 'react'
import type { HybridRecallResult, GraphRecallEntry } from '@/lib/archive-hybrid'
import type { RecallEntry } from '@/lib/archive-recall'
import type { SemanticCandidate } from '@/lib/archive-semantic'

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESENCE_LABELS: Record<string, string> = { ari: 'Ari · Velvet', eli: 'Eli · Violet' }
const ARCHIVE_LABELS:  Record<string, string> = { velvet: 'Velvet', violet: 'Violet', house: 'House' }

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const label = status === 'canonical' ? 'Memory' : status === 'canonical_candidate' ? 'Candidate' : status
  const cls   = status === 'canonical'
    ? 'text-green-400 border-green-400/30'
    : status === 'canonical_candidate'
    ? 'text-amber-400 border-amber-400/30'
    : 'text-text-muted border-house-border'
  return (
    <span className={`font-body text-[9px] border px-1.5 py-0.5 ${cls}`}>
      {label}
    </span>
  )
}

// ─── Method badge ─────────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: 'keyword' | 'semantic' | 'graph' }) {
  const styles = {
    keyword:  'text-text-muted border-house-border',
    semantic: 'text-emerald-400 border-emerald-400/30',
    graph:    'text-violet-400 border-violet-400/30',
  }
  return (
    <span className={`font-body text-[9px] border px-1.5 py-0.5 uppercase tracking-wider ${styles[method]}`}>
      {method}
    </span>
  )
}

// ─── Keyword result row ───────────────────────────────────────────────────────

function KeywordRow({ entry, isOverlap }: { entry: RecallEntry; isOverlap: boolean }) {
  return (
    <div className={`py-2 border-b border-house-border/30 ${isOverlap ? 'bg-house-surface/40' : ''}`}>
      <div className="flex items-start gap-1.5 flex-wrap">
        <span className="font-body text-xs text-text-primary">{entry.title}</span>
        <StatusBadge status={entry.canonical_status} />
        {isOverlap && (
          <span className="font-body text-[9px] text-text-muted/60 border border-house-border/40 px-1.5 py-0.5">overlap</span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="font-body text-[10px] text-text-muted">score {entry.rank_score}</span>
        {entry.rank_reason && (
          <span className="font-body text-[10px] text-text-muted/60">{entry.rank_reason}</span>
        )}
      </div>
      {entry.excerpt && (
        <p className="font-body text-[10px] text-text-muted/70 mt-1 line-clamp-2">{entry.excerpt}</p>
      )}
    </div>
  )
}

// ─── Semantic result row ──────────────────────────────────────────────────────

function SemanticRow({ candidate, isOverlap }: { candidate: SemanticCandidate; isOverlap: boolean }) {
  const pct = (candidate.similarity * 100).toFixed(1)
  return (
    <div className={`py-2 border-b border-house-border/30 ${isOverlap ? 'bg-house-surface/40' : ''}`}>
      <div className="flex items-start gap-1.5 flex-wrap">
        <span className="font-body text-xs text-text-primary">{candidate.title}</span>
        <StatusBadge status={candidate.canonical_status} />
        {isOverlap && (
          <span className="font-body text-[9px] text-text-muted/60 border border-house-border/40 px-1.5 py-0.5">overlap</span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="font-body text-[10px] text-emerald-400/80">similarity {pct}%</span>
        <span className="font-body text-[10px] text-text-muted/60">{candidate.category}</span>
      </div>
      {candidate.excerpt && (
        <p className="font-body text-[10px] text-text-muted/70 mt-1 line-clamp-2">{candidate.excerpt}</p>
      )}
    </div>
  )
}

// ─── Graph result row ─────────────────────────────────────────────────────────

function GraphRow({ entry, overlapIds }: { entry: GraphRecallEntry; overlapIds: Set<string> }) {
  const hasOverlap = entry.source_entries.some(s => overlapIds.has(s.id))

  return (
    <div className={`py-2 border-b border-house-border/30 ${hasOverlap ? 'bg-house-surface/40' : ''}`}>
      <div className="flex items-start gap-1.5 flex-wrap">
        <span className="font-body text-xs text-violet-300">{entry.node.label}</span>
        <span className="font-body text-[9px] text-text-muted border border-house-border px-1.5 py-0.5">
          {entry.node.node_type.replace(/_/g, ' ')}
        </span>
        <span className="font-body text-[9px] text-text-muted/60">
          via {entry.match_reason} match
        </span>
        {hasOverlap && (
          <span className="font-body text-[9px] text-text-muted/60 border border-house-border/40 px-1.5 py-0.5">overlap</span>
        )}
      </div>

      {entry.node.description && (
        <p className="font-body text-[10px] text-text-muted/70 mt-1 line-clamp-2">{entry.node.description}</p>
      )}

      {!entry.provenance_ok ? (
        <p className="font-body text-[10px] text-orange-400/70 mt-1">
          provenance unavailable — source entries not found or deleted
        </p>
      ) : (
        <div className="mt-1 space-y-0.5">
          {entry.source_entries.map(src => (
            <div key={src.id} className="flex items-center gap-1.5 flex-wrap">
              <span className="font-body text-[10px] text-text-muted">↳ {src.title}</span>
              <StatusBadge status={src.canonical_status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Column wrapper ───────────────────────────────────────────────────────────

function Column({
  label,
  badge,
  count,
  children,
  emptyNote,
}: {
  label:     string
  badge:     'keyword' | 'semantic' | 'graph'
  count:     number
  children?: React.ReactNode
  emptyNote: React.ReactNode
}) {
  return (
    <div className="flex-1 min-w-0 border border-house-border bg-house-bg">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-house-border">
        <MethodBadge method={badge} />
        <span className="font-body text-[10px] text-text-muted">{label}</span>
        <span className="ml-auto font-body text-[10px] text-text-muted">{count}</span>
      </div>
      <div className="px-3 py-1 max-h-[420px] overflow-y-auto">
        {count === 0 ? (
          <div className="py-4 space-y-1">{emptyNote}</div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

// ─── Overlap / disagreement summary ──────────────────────────────────────────

function OverlapSummary({
  result,
  overlapIds,
}: {
  result:    HybridRecallResult
  overlapIds: Set<string>
}) {
  const { overlap, absence } = result

  const hasAnyOverlap =
    overlap.keyword_and_semantic.length > 0 ||
    overlap.keyword_and_graph.length > 0 ||
    overlap.semantic_and_graph.length > 0 ||
    overlap.all_three.length > 0

  // Disagreement: keyword-only IDs (in keyword but not semantic or graph)
  const keywordIds  = new Set(result.keyword.results.map(e => e.id))
  const semanticIds = new Set(result.semantic.results.map(e => e.archive_item_id))
  const graphIds    = new Set(result.graph.matched.flatMap(g => g.source_entries.map(s => s.id)))

  const keywordOnly  = result.keyword.results.filter(e => !semanticIds.has(e.id) && !graphIds.has(e.id))
  const semanticOnly = result.semantic.results.filter(e => !keywordIds.has(e.archive_item_id) && !graphIds.has(e.archive_item_id))

  const hasAnyDisagreement = keywordOnly.length > 0 || semanticOnly.length > 0

  return (
    <div className="mt-3 space-y-2 border-t border-house-border/60 pt-3">

      {/* Overlap */}
      <div>
        <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">Overlap</p>
        {!hasAnyOverlap ? (
          <p className="font-body text-[10px] text-text-muted/60">No overlap between retrieval methods.</p>
        ) : (
          <div className="space-y-1">
            {overlap.all_three.length > 0 && (
              <p className="font-body text-[10px] text-text-secondary">
                {overlap.all_three.length} entr{overlap.all_three.length !== 1 ? 'ies' : 'y'} matched keyword + semantic + graph
              </p>
            )}
            {overlap.keyword_and_semantic.filter(id => !overlap.all_three.includes(id)).length > 0 && (
              <p className="font-body text-[10px] text-text-muted">
                {overlap.keyword_and_semantic.filter(id => !overlap.all_three.includes(id)).length} keyword + semantic only
              </p>
            )}
            {overlap.keyword_and_graph.filter(id => !overlap.all_three.includes(id)).length > 0 && (
              <p className="font-body text-[10px] text-text-muted">
                {overlap.keyword_and_graph.filter(id => !overlap.all_three.includes(id)).length} keyword + graph only
              </p>
            )}
            {overlap.semantic_and_graph.filter(id => !overlap.all_three.includes(id)).length > 0 && (
              <p className="font-body text-[10px] text-text-muted">
                {overlap.semantic_and_graph.filter(id => !overlap.all_three.includes(id)).length} semantic + graph only
              </p>
            )}
          </div>
        )}
      </div>

      {/* Disagreement */}
      {hasAnyDisagreement && (
        <div>
          <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">Disagreement</p>
          <div className="space-y-0.5">
            {keywordOnly.slice(0, 5).map(e => (
              <p key={e.id} className="font-body text-[10px] text-text-muted/80">
                {e.title} — keyword only
              </p>
            ))}
            {keywordOnly.length > 5 && (
              <p className="font-body text-[10px] text-text-muted/60">+{keywordOnly.length - 5} more keyword-only</p>
            )}
            {semanticOnly.slice(0, 5).map(e => (
              <p key={e.archive_item_id} className="font-body text-[10px] text-text-muted/80">
                {e.title} — semantic only
              </p>
            ))}
            {semanticOnly.length > 5 && (
              <p className="font-body text-[10px] text-text-muted/60">+{semanticOnly.length - 5} more semantic-only</p>
            )}
          </div>
        </div>
      )}

      {/* Absence explanations */}
      <div>
        <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">Absences</p>
        <div className="space-y-0.5">
          {absence.keyword_no_match && (
            <p className="font-body text-[10px] text-text-muted/70">Keyword: no matches for this query.</p>
          )}
          {absence.semantic_no_match && (
            <p className="font-body text-[10px] text-text-muted/70">
              Semantic: no embedded entries matched.
              {absence.semantic_unembedded_elevated_count > 0 && (
                <> {absence.semantic_unembedded_elevated_count} elevated-sensitivity {absence.semantic_unembedded_elevated_count === 1 ? 'entry' : 'entries'} not embedded.</>
              )}
            </p>
          )}
          {!absence.semantic_no_match && absence.semantic_unembedded_elevated_count > 0 && (
            <p className="font-body text-[10px] text-text-muted/70">
              Semantic: {absence.semantic_unembedded_elevated_count} elevated-sensitivity {absence.semantic_unembedded_elevated_count === 1 ? 'entry' : 'entries'} not embedded (intentionally excluded from embedding backfill).
            </p>
          )}
          {absence.graph_no_match && (
            <p className="font-body text-[10px] text-text-muted/70">
              Graph: no approved nodes matched this query.
              {absence.graph_pending_count > 0 && (
                <> {absence.graph_pending_count} pending {absence.graph_pending_count === 1 ? 'node' : 'nodes'} not included.</>
              )}
            </p>
          )}
          {!absence.graph_no_match && absence.graph_pending_count > 0 && (
            <p className="font-body text-[10px] text-text-muted/70">
              Graph: {absence.graph_pending_count} pending {absence.graph_pending_count === 1 ? 'node' : 'nodes'} not included (pending approval).
            </p>
          )}
        </div>
      </div>

    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function HybridRecallPanel() {
  const [open,         setOpen]         = useState(false)
  const [presenceId,   setPresenceId]   = useState<'ari' | 'eli'>('ari')
  const [archiveName,  setArchiveName]  = useState('velvet')
  const [query,        setQuery]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const [result,       setResult]       = useState<HybridRecallResult | null>(null)
  const [errMsg,       setErrMsg]       = useState<string | null>(null)

  // Sync archive name when presence changes
  function handlePresenceChange(p: 'ari' | 'eli') {
    setPresenceId(p)
    setArchiveName(p === 'ari' ? 'velvet' : 'violet')
    setResult(null)
    setErrMsg(null)
  }

  async function runSearch() {
    if (!query.trim()) return
    setLoading(true)
    setResult(null)
    setErrMsg(null)
    try {
      const res  = await fetch('/api/archive-recall/hybrid', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ presenceId, query: query.trim(), archiveName, limit: 10 }),
      })
      const data = await res.json()
      if (!res.ok) { setErrMsg(data.error ?? 'Hybrid recall failed'); return }
      setResult(data as HybridRecallResult)
    } catch {
      setErrMsg('Request failed')
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') void runSearch()
  }

  function reset() {
    setResult(null)
    setErrMsg(null)
    setQuery('')
  }

  // Overlap ID sets for per-row highlighting
  const overlapIds = result
    ? new Set([
        ...result.overlap.keyword_and_semantic,
        ...result.overlap.keyword_and_graph,
        ...result.overlap.semantic_and_graph,
        ...result.overlap.all_three,
      ])
    : new Set<string>()

  const keywordOverlapIds  = result ? new Set(result.overlap.keyword_and_semantic.concat(result.overlap.keyword_and_graph).concat(result.overlap.all_three)) : new Set<string>()
  const semanticOverlapIds = result ? new Set(result.overlap.keyword_and_semantic.concat(result.overlap.semantic_and_graph).concat(result.overlap.all_three)) : new Set<string>()

  return (
    <div className="mt-4 border-t border-house-border pt-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full"
      >
        <p className="font-body text-[10px] text-text-muted uppercase tracking-widest">
          Hybrid Recall Lab
        </p>
        <span className="font-body text-[9px] text-text-muted/60 border border-house-border/40 px-1.5 py-0.5 ml-2">
          comparison only
        </span>
        <span className="font-body text-[10px] text-text-muted ml-auto">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <p className="font-body text-[10px] text-text-muted">
            Runs keyword, semantic, and graph retrieval independently. Shows overlap and disagreement.
            Results are for comparison only — no result is authoritative.
          </p>

          {/* Controls */}
          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <label className="font-body text-[10px] text-text-muted block mb-1">Presence</label>
              <select
                value={presenceId}
                onChange={e => handlePresenceChange(e.target.value as 'ari' | 'eli')}
                className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted"
              >
                <option value="ari">Ari</option>
                <option value="eli">Eli</option>
              </select>
            </div>
            <div>
              <label className="font-body text-[10px] text-text-muted block mb-1">Archive</label>
              <select
                value={archiveName}
                onChange={e => setArchiveName(e.target.value)}
                className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted"
              >
                <option value="velvet">Velvet</option>
                <option value="violet">Violet</option>
                <option value="house">House</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="font-body text-[10px] text-text-muted block mb-1">Query</label>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Enter a recall query…"
                className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
              />
            </div>
            <button
              onClick={() => void runSearch()}
              disabled={loading || !query.trim()}
              className="
                h-8 px-4 font-body text-xs border border-house-muted
                bg-house-surface text-text-primary
                hover:bg-house-bg transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed
              "
            >
              {loading ? 'Running…' : 'Compare'}
            </button>
            {result && (
              <button
                onClick={reset}
                className="h-8 px-3 font-body text-xs border border-house-border text-text-muted hover:text-text-secondary transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* Error */}
          {errMsg && (
            <p className="font-body text-xs text-red-400">{errMsg}</p>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-3">
              <p className="font-body text-[10px] text-text-muted/60">
                Query: <span className="text-text-muted italic">{result.normalised_query}</span>
                {' · '}archive: {ARCHIVE_LABELS[result.archive_name] ?? result.archive_name}
                {' · '}presence: {PRESENCE_LABELS[result.presence_id] ?? result.presence_id}
              </p>

              {/* Three columns */}
              <div className="flex gap-3 flex-col lg:flex-row">

                {/* Keyword */}
                <Column
                  label="Keyword"
                  badge="keyword"
                  count={result.keyword.count}
                  emptyNote={
                    <p className="font-body text-[10px] text-text-muted/60">
                      No keyword matches for this query.
                    </p>
                  }
                >
                  {result.keyword.results.map(e => (
                    <KeywordRow
                      key={e.id}
                      entry={e}
                      isOverlap={keywordOverlapIds.has(e.id)}
                    />
                  ))}
                </Column>

                {/* Semantic */}
                <Column
                  label="Semantic"
                  badge="semantic"
                  count={result.semantic.count}
                  emptyNote={
                    <div className="space-y-1">
                      <p className="font-body text-[10px] text-text-muted/60">
                        No embedded entries matched (threshold 0.50).
                      </p>
                      {result.absence.semantic_unembedded_elevated_count > 0 && (
                        <p className="font-body text-[10px] text-orange-300/60">
                          {result.absence.semantic_unembedded_elevated_count} elevated-sensitivity {result.absence.semantic_unembedded_elevated_count === 1 ? 'entry' : 'entries'} not embedded.
                        </p>
                      )}
                    </div>
                  }
                >
                  {result.semantic.results.map(c => (
                    <SemanticRow
                      key={c.archive_item_id}
                      candidate={c}
                      isOverlap={semanticOverlapIds.has(c.archive_item_id)}
                    />
                  ))}
                </Column>

                {/* Graph */}
                <Column
                  label="Graph"
                  badge="graph"
                  count={result.graph.count}
                  emptyNote={
                    <div className="space-y-1">
                      <p className="font-body text-[10px] text-text-muted/60">
                        No approved nodes matched this query.
                      </p>
                      {result.absence.graph_pending_count > 0 && (
                        <p className="font-body text-[10px] text-text-muted/60">
                          {result.absence.graph_pending_count} pending {result.absence.graph_pending_count === 1 ? 'node' : 'nodes'} not included.
                        </p>
                      )}
                    </div>
                  }
                >
                  {result.graph.matched.map(g => (
                    <GraphRow
                      key={g.node.id}
                      entry={g}
                      overlapIds={overlapIds}
                    />
                  ))}
                </Column>

              </div>

              {/* Overlap / disagreement / absences */}
              <OverlapSummary result={result} overlapIds={overlapIds} />

            </div>
          )}
        </div>
      )}
    </div>
  )
}
