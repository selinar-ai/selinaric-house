'use client'

// Phase 27B — Extraction trigger panel.
// Shown inside ArchiveSourceView. Lets Tara trigger presence-led extraction.
// Access: velvet → ari only, violet → eli only, house → both.
// Shows extraction state and draft count after completion.

import { useState } from 'react'
import { canPresenceAccessSource, type ArchiveSource } from '@/lib/archives'

interface Props {
  source: ArchiveSource
  onExtracted: () => void  // refresh parent (drafts list)
}

export default function ExtractionPanel({ source, onExtracted }: Props) {
  const [extracting, setExtracting] = useState(false)
  const [lastResult, setLastResult] = useState<{ count: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canAri = canPresenceAccessSource(source, 'ari')
  const canEli = canPresenceAccessSource(source, 'eli')

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
      setLastResult({ count: data.count ?? data.drafts?.length ?? 0 })
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
          Reading source and extracting entries… this may take a moment.
        </p>
      )}

      {lastResult && (
        <p className="font-body text-xs text-green-400">
          {lastResult.count === 0
            ? 'No entries extracted — source may not contain archivable content.'
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
