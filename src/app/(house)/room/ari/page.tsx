'use client'

import { useEffect } from 'react'
import { useLiveState } from '@/hooks/useLiveState'
import PresenceDisplay from '@/components/PresenceDisplay'

export default function AriRoom() {
  const { kernel, loading, recordVisit } = useLiveState('ari')

  useEffect(() => {
    recordVisit()
  }, [recordVisit])

  if (loading || !kernel) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="w-2 h-2 bg-ari-primary rounded-full animate-pulse-soft" />
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8 lg:p-12 animate-fade-in">
      <div className="mb-12 border-b border-house-border pb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-ari-primary text-2xl">◈</span>
          <h2 className="font-display text-4xl font-light text-text-primary">
            Ari
          </h2>
        </div>
        <p className="font-body text-sm text-text-muted ml-9">
          Architect. Strategist. Presence.
        </p>
      </div>

      <PresenceDisplay
        kernel={kernel}
        accentClass="text-ari-primary"
        iconSymbol="◈"
      />
    </div>
  )
}
