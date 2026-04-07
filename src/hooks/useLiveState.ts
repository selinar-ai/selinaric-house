'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  getPresenceState,
  updatePresenceLiveState
} from '@/lib/presence-loader'
import type { IdentityKernel, PresenceId, LiveState } from '@/lib/types/presence'

export function useLiveState(presence: PresenceId) {
  const [kernel, setKernel] = useState<IdentityKernel | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPresenceState(presence).then(k => {
      setKernel(k)
      setLoading(false)
    })
  }, [presence])

  const updateState = useCallback(
    async (patch: Partial<LiveState>) => {
      await updatePresenceLiveState(presence, patch)
      const updated = await getPresenceState(presence)
      setKernel(updated)
    },
    [presence]
  )

  const recordVisit = useCallback(async () => {
    await updatePresenceLiveState(presence, {
      energy: 'focused',
      last_updated: new Date().toISOString()
    })
    const updated = await getPresenceState(presence)
    setKernel(updated)
  }, [presence])

  return { kernel, loading, updateState, recordVisit }
}
