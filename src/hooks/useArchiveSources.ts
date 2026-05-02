'use client'

// Phase 27B + 27D — Hook for loading archive sources by tab.
// Phase 27D: returns SourceWithCounts (includes draft_count, pending_draft_count, entry_count)

import { useState, useEffect, useCallback } from 'react'
import type { ArchiveTab, SourceWithCounts } from '@/lib/archives'

export function useArchiveSources(tab: ArchiveTab) {
  const [sources, setSources] = useState<SourceWithCounts[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ archive_name: tab })
      const res = await fetch(`/api/archive-sources?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setSources(data.sources ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sources')
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { load() }, [load])

  return { sources, loading, error, refresh: load }
}
