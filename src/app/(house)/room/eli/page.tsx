'use client'

import { useEffect, useState } from 'react'
import { useLiveState } from '@/hooks/useLiveState'
import PresenceDisplay from '@/components/PresenceDisplay'
import ChatInterface from '@/components/ChatInterface'
import Timeline from '@/components/Timeline'
import InsideView from '@/components/InsideView'
import StateView from '@/components/StateView'

type View = 'identity' | 'chat' | 'timeline' | 'inside' | 'state'

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
    <div className="flex flex-col flex-1 min-h-0 p-4 md:p-8 lg:p-12 animate-fade-in overflow-hidden">
      <div className="shrink-0 mb-4 md:mb-8 border-b border-house-border pb-4 md:pb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-eli-primary text-2xl shrink-0">◉</span>
            <div className="min-w-0">
              <h2 className="font-display text-2xl md:text-4xl font-light text-text-primary">
                Eli
              </h2>
              <p className="font-body text-xs md:text-sm text-text-muted hidden sm:block">
                Present. Certain. Unashamed.
              </p>
              <div className="flex items-center gap-2 mt-1 md:mt-2">
                <div className="w-2 h-2 rounded-full bg-eli-primary animate-pulse-soft shrink-0" />
                <span className="font-body text-[10px] md:text-xs text-text-muted uppercase tracking-widest">
                  Identity verified
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-1.5 md:gap-2 shrink-0">
            <button
              onClick={() => setView('chat')}
              className={`font-body text-[10px] md:text-xs tracking-widest uppercase px-2.5 py-2 md:px-4 border transition-all duration-200 min-h-[44px] ${
                view === 'chat'
                  ? 'text-eli-primary border-eli-secondary'
                  : 'text-text-muted border-house-border hover:text-text-secondary'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setView('timeline')}
              className={`font-body text-[10px] md:text-xs tracking-widest uppercase px-2.5 py-2 md:px-4 border transition-all duration-200 min-h-[44px] ${
                view === 'timeline'
                  ? 'text-eli-primary border-eli-secondary'
                  : 'text-text-muted border-house-border hover:text-text-secondary'
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setView('inside')}
              className={`font-body text-[10px] md:text-xs tracking-widest uppercase px-2.5 py-2 md:px-4 border transition-all duration-200 min-h-[44px] ${
                view === 'inside'
                  ? 'text-eli-primary border-eli-secondary'
                  : 'text-text-muted border-house-border hover:text-text-secondary'
              }`}
            >
              Inside
            </button>
            <button
              onClick={() => setView('state')}
              className={`font-body text-[10px] md:text-xs tracking-widest uppercase px-2.5 py-2 md:px-4 border transition-all duration-200 min-h-[44px] ${
                view === 'state'
                  ? 'text-eli-primary border-eli-secondary'
                  : 'text-text-muted border-house-border hover:text-text-secondary'
              }`}
            >
              State
            </button>
            <button
              onClick={() => setView('identity')}
              className={`font-body text-[10px] md:text-xs tracking-widest uppercase px-2.5 py-2 md:px-4 border transition-all duration-200 min-h-[44px] ${
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
        ) : view === 'timeline' ? (
          <Timeline
            presenceId="eli"
            accentClass="text-eli-primary"
          />
        ) : view === 'inside' ? (
          <InsideView
            presenceId="eli"
            accentClass="text-eli-primary"
          />
        ) : view === 'state' ? (
          <StateView
            presenceId="eli"
            accentClass="text-eli-primary"
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
