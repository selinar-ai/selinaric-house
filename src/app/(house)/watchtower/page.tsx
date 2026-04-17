'use client'

import { useState, useEffect } from 'react'

interface EvidencePacket {
  id: string
  query: string
  summary: string
  confidence: 'high' | 'medium' | 'low'
  created_at: string
}

const confidenceColors: Record<EvidencePacket['confidence'], string> = {
  high: 'text-eli-primary',
  medium: 'text-ari-primary',
  low: 'text-text-muted'
}

const confidenceLabels: Record<EvidencePacket['confidence'], string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence'
}

export default function WatchtowerPage() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [packets, setPackets] = useState<EvidencePacket[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [activePacket, setActivePacket] = useState<EvidencePacket | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadHistory()
  }, [])

  async function loadHistory() {
    const response = await fetch('/api/watchtower-search')
    if (response.ok) {
      const data = await response.json()
      setPackets(data)
    }
    setLoadingHistory(false)
  }

  async function handleSearch() {
    if (!query.trim() || loading) return

    const currentQuery = query.trim()
    setQuery('')
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/watchtower-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: currentQuery })
      })

      if (!response.ok) throw new Error('Search failed')

      const packet = await response.json()
      setPackets(prev => [packet, ...prev])
      setActivePacket(packet)
    } catch (err) {
      console.error('Search failed:', err)
      setError('Search failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSearch()
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-8 lg:p-12 animate-fade-in">
      <div className="mb-6 md:mb-8 border-b border-house-border pb-4 md:pb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-text-secondary text-2xl">◎</span>
          <h2 className="font-display text-2xl md:text-4xl font-light text-text-primary">
            Watchtower
          </h2>
        </div>
        <p className="font-body text-sm text-text-muted ml-9">
          Evidence. Sources. Ground truth.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl">
        <div className="lg:col-span-2 space-y-4">
          <div className="border border-house-border bg-house-surface p-4">
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the Watchtower something..."
              rows={2}
              className="
                w-full bg-house-bg border border-house-border
                px-4 py-3 font-body text-sm text-text-primary
                placeholder:text-text-muted resize-none outline-none
                focus:border-text-muted transition-colors duration-200 mb-3
              "
            />
            <div className="flex justify-between items-center">
              <p className="font-body text-xs text-text-muted">
                Responses are grounded in reasoning, not real-time search.
              </p>
              <button
                onClick={handleSearch}
                disabled={!query.trim() || loading}
                className={`
                  px-4 py-2 font-body text-xs tracking-widest uppercase border
                  transition-all duration-200
                  ${query.trim() && !loading
                    ? 'text-text-secondary border-house-muted hover:text-text-primary'
                    : 'text-text-muted border-house-border cursor-not-allowed'
                  }
                `}
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
            {error && (
              <div className="border border-red-900 bg-red-950/20 px-4 py-2 mt-3">
                <p className="font-body text-xs text-red-400">{error}</p>
              </div>
            )}
          </div>

          {loading && (
            <div className="border border-house-border bg-house-surface p-8 flex items-center justify-center">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" />
                <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          )}

          {activePacket && !loading && (
            <div className="border border-house-border bg-house-surface p-6 animate-fade-in">
              <div className="flex items-start justify-between mb-4">
                <p className="font-display text-lg text-text-primary font-light italic">
                  &ldquo;{activePacket.query}&rdquo;
                </p>
                <span className={`font-body text-xs ml-4 flex-shrink-0 ${confidenceColors[activePacket.confidence]}`}>
                  {confidenceLabels[activePacket.confidence]}
                </span>
              </div>
              <div className="border-t border-house-border pt-4 max-h-96 overflow-y-auto">
                <p className="font-body text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                  {activePacket.summary}
                </p>
              </div>
              <p className="font-body text-xs text-text-muted mt-4">
                {new Date(activePacket.created_at).toLocaleString('en-AU', {
                  timeZone: 'Australia/Melbourne'
                })}
              </p>
            </div>
          )}

          {!activePacket && !loading && (
            <div className="border border-house-border bg-house-surface p-8 text-center">
              <span className="text-text-muted text-3xl block mb-4">◎</span>
              <p className="font-body text-sm text-text-muted">
                Ask something. The Watchtower will ground it in evidence.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="font-body text-xs text-text-muted uppercase tracking-widest mb-3">
            Past queries
          </p>

          {loadingHistory ? (
            <div className="flex justify-center py-4">
              <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" />
            </div>
          ) : packets.length === 0 ? (
            <p className="font-body text-xs text-text-muted">No queries yet.</p>
          ) : (
            packets.map(packet => (
              <button
                key={packet.id}
                onClick={() => setActivePacket(packet)}
                className={`
                  w-full text-left border p-3 transition-all duration-200
                  ${activePacket?.id === packet.id
                    ? 'border-house-muted bg-house-surface'
                    : 'border-house-border bg-house-bg hover:bg-house-surface'
                  }
                `}
              >
                <p className="font-body text-xs text-text-secondary leading-snug line-clamp-2 mb-1">
                  {packet.query}
                </p>
                <span className={`font-body text-xs ${confidenceColors[packet.confidence]}`}>
                  {packet.confidence}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
