'use client'

// Phase 29A + 29D patch — Embedding Backfill admin panel
//
// GET /api/archive-recall/embed-backfill?archive=<name> — preview (open, no auth)
// Execute button calls Server Action runEmbedBackfill (server-side only)
//
// Archive selector (Velvet / Violet / House) scopes both preview and execute.
// No "All archives" option in v1 — one archive per run.
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
import { runEmbedBackfill } from '@/app/(house)/recall/actions'
import type { EmbedBackfillPreview, BackfillResult } from '@/lib/archive-semantic'

type Phase = 'idle' | 'loading_preview' | 'preview' | 'confirming' | 'running' | 'done' | 'error'

type ArchiveName = 'velvet' | 'violet' | 'house'

const ARCHIVE_OPTIONS: { value: ArchiveName; label: string }[] = [
  { value: 'velvet', label: 'Ari / Velvet' },
  { value: 'violet', label: 'Eli / Violet' },
  { value: 'house',  label: 'House'        },
]

export default function EmbedBackfillPanel() {
  const [open,        setOpen]        = useState(false)
  const [archiveName, setArchiveName] = useState<ArchiveName>('velvet')
  const [phase,       setPhase]       = useState<Phase>('idle')
  const [preview,     setPreview]     = useState<EmbedBackfillPreview | null>(null)
  const [result,      setResult]      = useState<BackfillResult | null>(null)
  const [errMsg,      setErrMsg]      = useState<string | null>(null)

  function handleArchiveChange(value: ArchiveName) {
    setArchiveName(value)
    // Reset so stale preview for old archive is cleared
    setPhase('idle')
    setPreview(null)
    setResult(null)
    setErrMsg(null)
  }

  async function loadPreview() {
    setPhase('loading_preview')
    setErrMsg(null)
    try {
      const res  = await fetch(`/api/archive-recall/embed-backfill?archive=${archiveName}`)
      const data = await res.json()
      if (!res.ok) { setErrMsg(data.error ?? 'Preview failed'); setPhase('error'); return }
      setPreview(data as EmbedBackfillPreview)
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
      const res = await runEmbedBackfill(confirmedSensitive, archiveName)
      setResult(res)
      setPhase('done')
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Backfill failed')
      setPhase('error')
    }
  }

  function handleExecuteClick() {
    if (!preview) return
    if (preview.elevated_sensitivity_count > 0) {
      setPhase('confirming')
    } else {
      execute(false)
    }
  }

  function reset() {
    setPhase('idle')
    setPreview(null)
    setResult(null)
    setErrMsg(null)
  }

  return (
    <div className="mt-5 border-t border-house-border pt-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full"
      >
        <p className="font-body text-[10px] text-text-muted uppercase tracking-widest">
          Embedding Backfill
        </p>
        <span className="font-body text-[10px] text-text-muted ml-auto">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="font-body text-[10px] text-text-muted">
            Generate gte-small vectors for eligible archive items
            (Memory + Memory candidate). Idempotent — already-embedded items are skipped.
          </p>

          {/* ── archive selector ───────────────────────────────────────────── */}
          <div className="flex items-center gap-2">
            <label className="font-body text-[10px] text-text-muted whitespace-nowrap">
              Archive
            </label>
            <select
              value={archiveName}
              onChange={e => handleArchiveChange(e.target.value as ArchiveName)}
              disabled={phase === 'running' || phase === 'loading_preview'}
              className="
                h-7 px-2 font-body text-[11px] text-text-secondary
                border border-house-border bg-house-surface
                hover:border-house-muted focus:outline-none
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {ARCHIVE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* ── idle ───────────────────────────────────────────────────────── */}
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

          {/* ── loading ────────────────────────────────────────────────────── */}
          {phase === 'loading_preview' && (
            <p className="font-body text-[10px] text-text-muted animate-pulse">Loading preview…</p>
          )}

          {/* ── preview ────────────────────────────────────────────────────── */}
          {phase === 'preview' && preview && (
            <div className="space-y-3">
              <div className="flex gap-4 flex-wrap">
                {[
                  { label: 'Eligible',       value: preview.total_eligible },
                  { label: 'Already embedded', value: preview.total_already_embedded },
                  { label: 'To embed',        value: preview.to_embed },
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
                  {preview.to_embed - preview.elevated_sensitivity_count} item{preview.to_embed - preview.elevated_sensitivity_count !== 1 ? 's' : ''} will be embedded this run.
                </p>
              )}

              {preview.to_embed === 0 ? (
                <p className="font-body text-[10px] text-text-muted">
                  All eligible items are already embedded.
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
                      ? `Review & execute (${preview.to_embed} items, ${preview.elevated_sensitivity_count} elevated)`
                      : `Execute (${preview.to_embed} items)`
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

          {/* ── confirming elevated sensitivity ────────────────────────────── */}
          {phase === 'confirming' && preview && (
            <div className="border border-orange-400/30 bg-orange-400/5 px-3 py-3 space-y-2">
              <p className="font-body text-xs text-orange-300">
                {preview.elevated_sensitivity_count} item{preview.elevated_sensitivity_count !== 1 ? 's' : ''} have
                elevated sensitivity (sacred, sensitive, or technical).
              </p>
              <p className="font-body text-[10px] text-text-muted">
                Include them in this backfill run?
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => execute(true)}
                  className="
                    h-8 px-3 font-body text-xs border border-orange-400/40
                    text-orange-300 hover:bg-orange-400/10 transition-colors
                  "
                >
                  Include elevated
                </button>
                <button
                  onClick={() => execute(false)}
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

          {/* ── running ────────────────────────────────────────────────────── */}
          {phase === 'running' && (
            <p className="font-body text-[10px] text-text-muted animate-pulse">
              Running backfill — this may take a moment…
            </p>
          )}

          {/* ── done ───────────────────────────────────────────────────────── */}
          {phase === 'done' && result && (
            <div className="space-y-2">
              <div className="flex gap-4 flex-wrap">
                {[
                  { label: 'Processed', value: result.processed },
                  { label: 'Skipped',   value: result.skipped },
                  { label: 'Errors',    value: result.errors },
                ].map(card => (
                  <div key={card.label} className={`border px-3 py-2 min-w-[70px] ${card.label === 'Errors' && result.errors > 0 ? 'border-red-400/40 bg-red-400/5' : 'border-house-border bg-house-bg'}`}>
                    <p className={`font-display text-base font-light ${card.label === 'Errors' && result.errors > 0 ? 'text-red-400' : 'text-text-primary'}`}>{card.value}</p>
                    <p className="font-body text-[10px] text-text-muted mt-0.5">{card.label}</p>
                  </div>
                ))}
              </div>
              {result.errors > 0 && result.first_error && (
                <p className="font-body text-[10px] text-red-400/80 break-words">
                  First error: {result.first_error}
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

          {/* ── error ──────────────────────────────────────────────────────── */}
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
