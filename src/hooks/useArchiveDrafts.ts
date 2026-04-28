'use client'

// Phase 27B — Hook for loading archive entry drafts.
// By default loads pending_review drafts for the active archive tab.
// Pass sourceId to load drafts for a specific source.
// Pass allStatuses=true to load all drafts regardless of status.

import { useState, useEffect, useCallback } from 'react'
import type { ArchiveTab, ArchiveEntryDraft, DraftStatus } from '@/lib/archives'

interface UseArchiveDraftsOptions {
  tab?: ArchiveTab
  sourceId?: string
  draftStatus?: DraftStatus
  allStatuses?: boolean
}

export function useArchiveDrafts(options: UseArchiveDraftsOptions = {}) {
  const { tab, sourceId, draftStatus = 'pending_review', allStatuses = false } = options

  const [drafts, setDrafts] = useState<ArchiveEntryDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (tab) params.set('archive_name', tab)
      if (sourceId) params.set('source_id', sourceId)
      if (allStatuses) {
        params.set('all_statuses', 'true')
      } else {
        params.set('draft_status', draftStatus)
      }

      const res = await fetch(`/api/archive-drafts?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setDrafts(data.drafts ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load drafts')
    } finally {
      setLoading(false)
    }
  }, [tab, sourceId, draftStatus, allStatuses])

  useEffect(() => { load() }, [load])

  const pendingDrafts = drafts.filter(d => d.draft_status === 'pending_review')
  const resolvedDrafts = drafts.filter(d => d.draft_status !== 'pending_review')

  return { drafts, pendingDrafts, resolvedDrafts, loading, error, refresh: load }
}
