'use client'

// Phase 27B — Extraction trigger panel.
// Shown inside ArchiveSourceView. Lets Tara trigger presence-led extraction.
// Access: velvet → ari only, violet → eli only, house → both.
//
// Sources up to 500k chars are stored. Extraction chunks large sources (>70k)
// into sequential Claude calls at paragraph boundaries — no manual splitting needed.
// Tara is shown how many chunks will be processed so expectations are clear.

import { useState } from 'react'
import { canPresenceAccessSource, type ArchiveSource } from '@/lib/archives'

// Match the server's chunk ceiling so the UI estimate is accurate
const EXTRACT_CHUNK_SIZE = 70_000

interface Props {
  source: ArchiveSource
  onExtracted: () => void
}

export default function ExtractionPanel({ source, onExtracted }: Props) {
  const [extracting, setExtracting] = useState(false)
  const [lastResult, setLastResult] = useState<{ count: number; chunks: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canAri = canPresenceAccessSource(source, 'ari')
  const canEli = canPresenceAccessSource(source, 'eli')

  const estimatedChunks = Math.ceil(source.char_count / EXTRACT_CHUNK_SIZE)
  const isLarge = source.char_count > EXTRACT_CHUNK_SIZE

  async function handleExtract(presenceId: 'ari' | 'eli') {
    setExtracting(true)
    setError(null)
    setLastResult(null)
    try {
      const res = await fetch(`/api/archive-sources/${source.id}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presenceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setLastResult({
        count: data.count ?? data.drafts?.length ?? 0,
        chunks: data.chunks_processed ?? 1,
      })
      onExtracted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  const alreadyExtracted = source.review_status === 'extracted'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-body text-xs text-text-muted uppercase tracking-widest">Extract</p>
        {alreadyExtracted && (
          <span className="font-body text-[10px] text-green-400">Previously extracted</span>
        )}
      </div>

      <p className="font-body text-xs text-text-muted leading-relaxed">
        Ask a presence to read this source and propose archive entries. Each proposed entry requires your approval before becoming an Archive Entry.
      </p>

      {/* Large source notice — shown before extraction starts */}
      {isLarge && !extracting && !lastResult && (
        <div className="border border-house-border/60 px-3 py-2.5 space-y-1">
          <p className="font-body text-xs text-amber-400">
            Large source — will process in {estimatedChunks} part{estimatedChunks !== 1 ? 's' : ''}.
          </p>
          <p className="font-body text-[10px] text-text-muted">
            {source.char_count.toLocaleString()} chars split at paragraph boundaries. Each part is read independently. This will take longer than a single-pass extraction.
          </p>
        </div>
      )}

      {alreadyExtracted && (
        <p className="font-body text-[10px] text-amber-400">
          This source has already been extracted. Re-extracting will add new draft proposals alongside existing ones.
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        {canAri && (
          <button
            onClick={() => handleExtract('ari')}
            disabled={extracting}
            className="font-body text-xs px-4 py-1.5 border border-ari-secondary text-ari-primary hover:bg-ari-glow transition-all disabled:opacity-40"
          >
            {extracting ? 'Extracting…' : '◈ Ask Ari'}
          </button>
        )}
        {canEli && (
          <button
            onClick={() => handleExtract('eli')}
            disabled={extracting}
            className="font-body text-xs px-4 py-1.5 border border-eli-secondary text-eli-primary hover:bg-eli-glow transition-all disabled:opacity-40"
          >
            {extracting ? 'Extracting…' : '◉ Ask Eli'}
          </button>
        )}
      </div>

      {extracting && (
        <p className="font-body text-xs text-text-muted animate-pulse">
          {isLarge
            ? `Reading source across ${estimatedChunks} parts… this will take a moment.`
            : 'Reading source and extracting entries… this may take a moment.'}
        </p>
      )}

      {lastResult && (
        <p className="font-body text-xs text-green-400">
          {lastResult.count === 0
            ? 'No entries extracted — source may not contain archivable content.'
            : lastResult.chunks > 1
              ? `${lastResult.count} draft${lastResult.count === 1 ? '' : 's'} proposed across ${lastResult.chunks} parts. Review them in the Drafts tab.`
              : `${lastResult.count} draft${lastResult.count === 1 ? '' : 's'} proposed. Review them in the Drafts tab.`
          }
        </p>
      )}

      {error && (
        <p className="font-body text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}
