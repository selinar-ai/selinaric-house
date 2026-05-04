'use client'

// Phase 29B — Graph Extraction admin panel
//
// GET /api/archive-graph/extract?archive=<name> — preview (open, no auth)
// Execute button calls Server Action runGraphExtraction (server-side only)
//
// If elevated_sensitivity_count > 0, a second confirmation step is required
// before items with sensitivity in ('sacred','sensitive','technical') are included.
//
// State machine:
//   idle → loading_preview → preview_shown
//   preview_shown → confirming_sensitive (if elevated > 0) or running
//   confirming_sensitive → running (on confirm) or preview_shown (on cancel)
//   running → done | error

import { useState } from 'react'
import { runGraphExtraction } from '@/app/(house)/archives/actions'
import type { GraphExtractionPreview, GraphExtractionResult } from '@/lib/archive-graph'
import { MAX_ITEMS_PER_RUN } from '@/lib/archive-graph'

type Phase = 'idle' | 'loading_preview' | 'preview' | 'confirming' | 'running' | 'done' | 'error'

interface Props {
  archiveName: string
  onDone?:     () => void
}

export default function GraphExtractionPanel({ archiveName, onDone }: Props) {
  const [open,    setOpen]    = useState(false)
  const [phase,   setPhase]   = useState<Phase>('idle')
  const [preview, setPreview] = useState<GraphExtractionPreview | null>(null)
  const [result,  setResult]  = useState<GraphExtractionResult | null>(null)
  const [errMsg,  setErrMsg]  = useState<string | null>(null)

  async function loadPreview() {
    setPhase('loading_preview')
    setErrMsg(null)
    try {
      const res  = await fetch(`/api/archive-graph/extract?archive=${encodeURIComponent(archiveName)}`)
      const data = await res.json()
      if (!res.ok) { setErrMsg(data.error ?? 'Preview failed'); setPhase('error'); return }
      setPreview(data as GraphExtractionPreview)
      setPhase('preview')
    } catch {
      setErrMsg('Request failed')
      setPhase('error')
    }
  }

  async function execute(confirmedSensitive: boolean) {
    setPhase('running')
    setErrMsg(null)
    try {
      const res = await runGraphExtraction(archiveName, confirmedSensitive)
      setResult(res)
      setPhase('done')
      onDone?.()
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Extraction failed')
      setPhase('error')
    }
  }

  function handleExecuteClick() {
    if (!preview) return
    if (preview.elevated_sensitivity_count > 0) {
      setPhase('confirming')
    } else {
      void execute(false)
    }
  }

  function reset() {
    setPhase('idle')
    setPreview(null)
    setResult(null)
    setErrMsg(null)
  }

  const nonElevatedToExtract = preview
    ? Math.max(0, preview.to_extract - preview.elevated_sensitivity_count)
    : 0

  return (
    <div className="mt-5 border-t border-house-border pt-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full"
      >
        <p className="font-body text-[10px] text-text-muted uppercase tracking-widest">
          Graph Extraction
        </p>
        <span className="font-body text-[10px] text-text-muted ml-auto">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="font-body text-[10px] text-text-muted">
            Extract concept nodes and edges from eligible archive items using claude-sonnet-4-6.
            Max {MAX_ITEMS_PER_RUN} items per run. Candidates require your approval before they enter the graph.
          </p>

          {/* ── idle ─────────────────────────────────────────────────────── */}
          {phase === 'idle' && (
            <button
              onClick={loadPreview}
              className="
                h-8 px-3 font-body text-xs border border-house-border
                bg-house-surface text-text-secondary
                hover:border-house-muted hover:text-text-primary transition-colors
              "
            >
              Preview
            </button>
          )}

          {/* ── loading ───────────────────────────────────────────────────── */}
          {phase === 'loading_preview' && (
            <p className="font-body text-[10px] text-text-muted animate-pulse">Loading preview…</p>
          )}

          {/* ── preview ───────────────────────────────────────────────────── */}
          {phase === 'preview' && preview && (
            <div className="space-y-3">
              <div className="flex gap-4 flex-wrap">
                {[
                  { label: 'Eligible',             value: preview.total_eligible },
                  { label: 'Already extracted',    value: preview.already_extracted },
                  { label: 'To extract',           value: preview.to_extract },
                  { label: 'Elevated sensitivity', value: preview.elevated_sensitivity_count },
                ].map(card => (
                  <div key={card.label} className="border border-house-border bg-house-bg px-3 py-2 min-w-[70px]">
                    <p className="font-display text-base font-light text-text-primary">{card.value}</p>
                    <p className="font-body text-[10px] text-text-muted mt-0.5">{card.label}</p>
                  </div>
                ))}
              </div>

              {preview.elevated_sensitivity_count > 0 && (
                <p className="font-body text-[10px] text-orange-300/80">
                  {preview.elevated_sensitivity_count} item{preview.elevated_sensitivity_count !== 1 ? 's' : ''} have
                  elevated sensitivity (sacred, sensitive, or technical) — you will be asked
                  whether to include them. If skipped, only the remaining{' '}
                  {nonElevatedToExtract} item{nonElevatedToExtract !== 1 ? 's' : ''} will be extracted this run.
                </p>
              )}

              {preview.to_extract === 0 ? (
                <p className="font-body text-[10px] text-text-muted">
                  All eligible items have already been extracted.
                </p>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleExecuteClick}
                    className="
                      h-8 px-3 font-body text-xs border border-house-muted
                      bg-house-surface text-text-primary
                      hover:bg-house-bg transition-colors
                    "
                  >
                    {preview.elevated_sensitivity_count > 0
                      ? `Review & extract (${preview.to_extract} items, ${preview.elevated_sensitivity_count} elevated)`
                      : `Extract (${preview.to_extract} items)`
                    }
                  </button>
                  <button
                    onClick={reset}
                    className="
                      h-8 px-3 font-body text-xs border border-house-border
                      text-text-muted hover:text-text-secondary transition-colors
                    "
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── confirming elevated sensitivity ───────────────────────────── */}
          {phase === 'confirming' && preview && (
            <div className="border border-orange-400/30 bg-orange-400/5 px-3 py-3 space-y-2">
              <p className="font-body text-xs text-orange-300">
                {preview.elevated_sensitivity_count} item{preview.elevated_sensitivity_count !== 1 ? 's' : ''} have
                elevated sensitivity (sacred, sensitive, or technical).
              </p>
              <p className="font-body text-[10px] text-text-muted">
                Include them in this extraction run?
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => void execute(true)}
                  className="
                    h-8 px-3 font-body text-xs border border-orange-400/40
                    text-orange-300 hover:bg-orange-400/10 transition-colors
                  "
                >
                  Include elevated
                </button>
                <button
                  onClick={() => void execute(false)}
                  className="
                    h-8 px-3 font-body text-xs border border-house-border
                    text-text-secondary hover:border-house-muted transition-colors
                  "
                >
                  Skip elevated
                </button>
                <button
                  onClick={() => setPhase('preview')}
                  className="
                    h-8 px-3 font-body text-xs border border-house-border
                    text-text-muted hover:text-text-secondary transition-colors
                  "
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── running ───────────────────────────────────────────────────── */}
          {phase === 'running' && (
            <p className="font-body text-[10px] text-text-muted animate-pulse">
              Running extraction — this may take a moment…
            </p>
          )}

          {/* ── done ──────────────────────────────────────────────────────── */}
          {phase === 'done' && result && (
            <div className="space-y-2">
              <div className="flex gap-4 flex-wrap">
                {[
                  { label: 'Items processed', value: result.items_processed },
                  { label: 'Nodes proposed',  value: result.nodes_proposed },
                  { label: 'Edges proposed',  value: result.edges_proposed },
                  { label: 'Errors',          value: result.errors },
                ].map(card => (
                  <div
                    key={card.label}
                    className={`border px-3 py-2 min-w-[70px] ${
                      card.label === 'Errors' && result.errors > 0
                        ? 'border-red-400/40 bg-red-400/5'
                        : 'border-house-border bg-house-bg'
                    }`}
                  >
                    <p className={`font-display text-base font-light ${
                      card.label === 'Errors' && result.errors > 0 ? 'text-red-400' : 'text-text-primary'
                    }`}>
                      {card.value}
                    </p>
                    <p className="font-body text-[10px] text-text-muted mt-0.5">{card.label}</p>
                  </div>
                ))}
              </div>
              {result.errors > 0 && result.first_error && (
                <p className="font-body text-[10px] text-red-400/80 break-words">
                  First error: {result.first_error}
                </p>
              )}
              {result.nodes_proposed > 0 && (
                <p className="font-body text-[10px] text-text-muted">
                  {result.nodes_proposed} node{result.nodes_proposed !== 1 ? 's' : ''} and {result.edges_proposed} edge{result.edges_proposed !== 1 ? 's' : ''} are pending your review in the Graph tab below.
                </p>
              )}
              <button
                onClick={reset}
                className="
                  h-8 px-3 font-body text-xs border border-house-border
                  text-text-muted hover:text-text-secondary transition-colors
                "
              >
                Close
              </button>
            </div>
          )}

          {/* ── error ─────────────────────────────────────────────────────── */}
          {phase === 'error' && (
            <div className="space-y-2">
              <p className="font-body text-xs text-red-400">{errMsg}</p>
              <button
                onClick={reset}
                className="
                  h-8 px-3 font-body text-xs border border-house-border
                  text-text-muted hover:text-text-secondary transition-colors
                "
              >
                Reset
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
