'use client'

// Phase 24D — Hook for loading reflection jobs (pending / processing / failed).
// Separate from useReflections which loads completed reflection outputs.

import { useState, useEffect, useCallback } from 'react'
import type { ReflectionJob } from '@/lib/reflections/reflection-types'

export function useReflectionJobs(presenceId: 'ari' | 'eli') {
  const [jobs, setJobs] = useState<ReflectionJob[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reflection-jobs?presenceId=${presenceId}&limit=20`)
      if (!res.ok) return
      const data = await res.json()
      setJobs(data.jobs ?? [])
    } finally {
      setLoading(false)
    }
  }, [presenceId])

  useEffect(() => { load() }, [load])

  const pendingJobs = jobs.filter(j => j.status === 'pending' || j.status === 'processing')
  const failedJobs = jobs.filter(j => j.status === 'failed')

  return { jobs, pendingJobs, failedJobs, loading, refresh: load }
}
