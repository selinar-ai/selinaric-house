'use client'

// Phase 27A — Hook for loading archive items by tab.
// Velvet tab: archive_name=velvet
// Violet tab: archive_name=violet
// House tab:  visibility=shared (all items explicitly shared, regardless of origin)

import { useState, useEffect, useCallback } from 'react'
import type { ArchiveTab, ArchiveItem } from '@/lib/archives'

export function useArchives(tab: ArchiveTab) {
  const [items, setItems] = useState<ArchiveItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (tab === 'velvet') params.set('archive_name', 'velvet')
      else if (tab === 'violet') params.set('archive_name', 'violet')
      else params.set('visibility', 'shared')  // House tab: all shared items

      const res = await fetch(`/api/archives?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setItems(data.items ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load archives')
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { load() }, [load])

  return { items, loading, error, refresh: load }
}
