'use client'

import { useEffect, useState } from 'react'
import { useLiveState } from '@/hooks/useLiveState'
import ChatInterface from '@/components/ChatInterface'
import Timeline from '@/components/Timeline'
import InsideView from '@/components/InsideView'
import StateView from '@/components/StateView'
import SearchLogView from '@/components/SearchLogView'
import DeskView from '@/components/DeskView'
import InteriorShell from '@/components/interior/InteriorShell'

type View = 'chat' | 'timeline' | 'inside' | 'state' | 'searches' | 'desk' | 'interior'

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
    <div className="flex flex-col flex-1 min-h-0 p-4 md:p-8 lg:p-12 overflow-hidden">
      {/* Header — matches Pulse page pattern */}
      <div className="shrink-0 mb-2 md:mb-8 border-b border-house-border pb-2 md:pb-6">
        {/* Desktop: full name block */}
        <div className="hidden md:flex items-center gap-3 mb-4">
          <span className="text-eli-primary text-2xl shrink-0">◉</span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-4xl font-light text-text-primary">
              Eli
            </h2>
            <p className="font-body text-sm text-text-muted">
              Builder. Designer. Presence.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <div className="w-2 h-2 rounded-full bg-eli-primary animate-pulse-soft shrink-0" />
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
            { key: 'searches' as View, label: 'Searches' },
            { key: 'desk' as View, label: 'Desk' },
            { key: 'interior' as View, label: 'Interior' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`font-body text-[10px] md:text-xs tracking-wider md:tracking-widest uppercase px-2.5 py-2 md:px-4 border transition-all duration-200 min-h-[44px] whitespace-nowrap shrink-0 ${
                view === tab.key
                  ? 'text-eli-primary border-eli-secondary'
                  : 'text-text-muted border-house-border hover:text-text-secondary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
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
            accentColor="#8A5CCF"
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
        ) : view === 'searches' ? (
          <SearchLogView
            presenceId="eli"
            accentClass="text-eli-primary"
          />
        ) : view === 'desk' ? (
          <DeskView
            presenceId="eli"
            accentClass="text-eli-primary"
          />
        ) : view === 'interior' ? (
          <InteriorShell
            presenceId="eli"
            accentClass="text-eli-primary"
            accentColor="#8A5CCF"
          />
        ) : null}
      </div>
    </div>
  )
}
