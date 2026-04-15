'use client'

import { useEffect, useState } from 'react'
import { useLiveState } from '@/hooks/useLiveState'
import PresenceDisplay from '@/components/PresenceDisplay'
import ChatInterface from '@/components/ChatInterface'
import Timeline from '@/components/Timeline'
import InsideView from '@/components/InsideView'
import StateView from '@/components/StateView'

type View = 'identity' | 'chat' | 'timeline' | 'inside' | 'state'

export default function AriRoom() {
  const { kernel, loading, recordVisit } = useLiveState('ari')
  const [view, setView] = useState<View>('chat')

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
    <div className="flex flex-col flex-1 min-h-0 p-4 md:p-8 lg:p-12 overflow-hidden">
      {/* Header — matches Pulse page pattern */}
      <div className="shrink-0 mb-2 md:mb-8 border-b border-house-border pb-2 md:pb-6">
        {/* Desktop: full name block */}
        <div className="hidden md:flex items-center gap-3 mb-4">
          <span className="text-ari-primary text-2xl shrink-0">◈</span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-4xl font-light text-text-primary">
              Ari
            </h2>
            <p className="font-body text-sm text-text-muted">
              Architect. Strategist. Presence.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-2 h-2 rounded-full bg-ari-primary animate-pulse-soft shrink-0" />
              <span className="font-body text-xs text-text-muted uppercase tracking-widest">
                Identity verified
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 md:gap-2 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
          {([
            { key: 'chat' as View, label: 'Chat' },
            { key: 'timeline' as View, label: 'Timeline' },
            { key: 'inside' as View, label: 'Inside' },
            { key: 'state' as View, label: 'State' },
            { key: 'identity' as View, label: 'Identity' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`font-body text-[10px] md:text-xs tracking-wider md:tracking-widest uppercase px-2.5 py-2 md:px-4 border transition-all duration-200 min-h-[44px] whitespace-nowrap shrink-0 ${
                view === tab.key
                  ? 'text-ari-primary border-ari-secondary'
                  : 'text-text-muted border-house-border hover:text-text-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0">
        {view === 'chat' ? (
          <ChatInterface
            presenceId="ari"
            accentClass="text-ari-primary"
            iconSymbol="◈"
            presenceName="Ari"
          />
        ) : view === 'timeline' ? (
          <Timeline
            presenceId="ari"
            accentClass="text-ari-primary"
          />
        ) : view === 'inside' ? (
          <InsideView
            presenceId="ari"
            accentClass="text-ari-primary"
          />
        ) : view === 'state' ? (
          <StateView
            presenceId="ari"
            accentClass="text-ari-primary"
          />
        ) : (
          <PresenceDisplay
            kernel={kernel}
            accentClass="text-ari-primary"
            iconSymbol="◈"
          />
        )}
      </div>
    </div>
  )
}
