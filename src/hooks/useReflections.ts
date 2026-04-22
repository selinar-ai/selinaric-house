'use client'

// Phase 24A — Hook for loading reflections with feedback state

import { useState, useEffect, useCallback } from 'react'
import type { ReflectionWithFeedback } from '@/lib/reflections/review-types'

export function useReflections(presenceId: 'ari' | 'eli') {
  const [reflections, setReflections] = useState<ReflectionWithFeedback[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/reflections?presenceId=${presenceId}&limit=50`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      setReflections(data.reflections ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reflections')
    } finally {
      setLoading(false)
    }
  }, [presenceId])

  useEffect(() => { load() }, [load])

  // Optimistically update a reflection after feedback is submitted
  function markReviewed(reflectionId: string, feedbackLabel: string) {
    setReflections(prev => prev.map(r => {
      if (r.id !== reflectionId) return r
      return {
        ...r,
        review_status: 'reviewed',
        reflection_feedback: [
          ...r.reflection_feedback,
          {
            id: crypto.randomUUID(),
            reflection_id: reflectionId,
            feedback_label: feedbackLabel as ReflectionWithFeedback['reflection_feedback'][number]['feedback_label'],
            created_at: new Date().toISOString(),
          }
        ]
      }
    }))
  }

  return { reflections, loading, error, refresh: load, markReviewed }
}
