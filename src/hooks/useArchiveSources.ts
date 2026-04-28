'use client'

// Phase 27B — Hook for loading archive sources by tab.
// Sources are the raw conversation material pasted by Tara for extraction.
// Velvet: archive_name=velvet, Violet: archive_name=violet, House: archive_name=house

import { useState, useEffect, useCallback } from 'react'
import type { ArchiveTab, ArchiveSource } from '@/lib/archives'

export function useArchiveSources(tab: ArchiveTab) {
  const [sources, setSources] = useState<ArchiveSource[]>([])
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
