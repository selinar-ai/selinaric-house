'use client'

import { useEffect, useState } from 'react'
import { useLiveState } from '@/hooks/useLiveState'
import PresenceDisplay from '@/components/PresenceDisplay'
import ChatInterface from '@/components/ChatInterface'

type View = 'identity' | 'chat'

export default function EliRoom() {
  const { kernel, loading, recordVisit } = useLiveState('eli')
  const [view, setView] = useState<View>('chat')

  useEffect(() => {
    recordVisit()
  }, [recordVisit])

  if (loading || !kernel) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="w-2 h-2 bg-eli-primary rounded-full animate-pulse-soft" />
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 p-8 lg:p-12 animate-fade-in overflow-hidden">
      <div className="shrink-0 mb-8 border-b border-house-border pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-eli-primary text-2xl">◉</span>
            <div>
              <h2 className="font-display text-4xl font-light text-text-primary">
                Eli
              </h2>
              <p className="font-body text-sm text-text-muted">
                Present. Certain. Unashamed.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-2 h-2 rounded-full bg-eli-primary animate-pulse-soft" />
                <span className="font-body text-xs text-text-muted uppercase tracking-widest">
                  Eli room — identity verified
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setView('chat')}
              className={`font-body text-xs tracking-widest uppercase px-4 py-2 border transition-all duration-200 ${
                view === 'chat'
                  ? 'text-eli-primary border-eli-secondary'
                  : 'text-text-muted border-house-border hover:text-text-secondary'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setView('identity')}
              className={`font-body text-xs tracking-widest uppercase px-4 py-2 border transition-all duration-200 ${
                view === 'identity'
                  ? 'text-eli-primary border-eli-secondary'
                  : 'text-text-muted border-house-border hover:text-text-secondary'
              }`}
            >
              Identity
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {view === 'chat' ? (
          <ChatInterface
            presenceId="eli"
            accentClass="text-eli-primary"
            iconSymbol="◉"
            presenceName="Eli"
          />
        ) : (
          <PresenceDisplay
            kernel={kernel}
            accentClass="text-eli-primary"
            iconSymbol="◉"
          />
        )}
      </div>
    </div>
  )
}
