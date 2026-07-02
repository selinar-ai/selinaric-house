'use client'

// Phase 27A + 28F.1 — Hook for loading archive items by tab.
// Server-side search, filters, and pagination.

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ArchiveTab, ArchiveItem, CanonicalStatus, ArchiveCategory } from '@/lib/archives'

export interface ArchiveQueryParams {
  search: string
  canonical_status: CanonicalStatus | ''
  category: ArchiveCategory | ''
  has_linked_source: 'yes' | 'no' | ''
}

const PAGE_SIZE = 50

export function useArchives(tab: ArchiveTab, filters?: ArchiveQueryParams) {
  const [items, setItems] = useState<ArchiveItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const offsetRef = useRef(0)

  const buildParams = useCallback((offset: number) => {
    const params = new URLSearchParams()
    if (tab === 'velvet') params.set('archive_name', 'velvet')
    else if (tab === 'violet') params.set('archive_name', 'violet')
    else params.set('visibility', 'shared')

    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(offset))

    if (filters?.search) params.set('search', filters.search)
    if (filters?.canonical_status) params.set('canonical_status', filters.canonical_status)
    if (filters?.category) params.set('category', filters.category)
    if (filters?.has_linked_source) params.set('has_linked_source', filters.has_linked_source)

    return params
  }, [tab, filters])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    offsetRef.current = 0
    try {
      const params = buildParams(0)
      const res = await fetch(`/api/archives?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setItems(data.items ?? [])
      setTotal(data.total ?? 0)
      offsetRef.current = (data.items ?? []).length
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load archives')
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  const loadMore = useCallback(async () => {
    if (loadingMore || offsetRef.current >= total) return
    setLoadingMore(true)
    try {
      const params = buildParams(offsetRef.current)
      const res = await fetch(`/api/archives?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      const newItems = data.items ?? []
      setItems(prev => [...prev, ...newItems])
      setTotal(data.total ?? total)
      offsetRef.current += newItems.length
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more')
    } finally {
      setLoadingMore(false)
    }
  }, [buildParams, loadingMore, total])

  useEffect(() => { load() }, [load])

  // offsetRef always mirrors items.length after load/loadMore — derive from
  // state so render never reads the ref (react-hooks/refs).
  const hasMore = items.length < total

  return { items, total, loading, loadingMore, error, refresh: load, loadMore, hasMore }
}
