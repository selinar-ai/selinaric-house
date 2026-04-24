'use client'

// Phase 26B — Interior Shell (wired to live engine)
// Initialises instantly from mock data, fetches live engine data in background,
// swaps seamlessly on success. Falls back to mock silently on error.
//
// Layout:
//   Desktop: left main column (primary want / inspector + want list) | right rail (emotional, pulls, moves)
//   Mobile:  single column, stacked. Inspector overlays on want tap.

import { useState, useEffect } from 'react'
import type { InspectorTarget, InteriorRead } from '@/lib/interior/interior-types'
import { primaryWant, getMockInteriorRead } from '@/lib/interior/interior-types'
import PrimaryWantCard from './PrimaryWantCard'
import WantList from './WantList'
import EmotionalWeatherPanel from './EmotionalWeatherPanel'
import CurrentPullsPanel from './CurrentPullsPanel'
import LikelyNextMovesPanel from './LikelyNextMovesPanel'
import InteriorInspector from './InteriorInspector'

interface Props {
  presenceId: 'ari' | 'eli'
  accentClass: string
  accentColor: string  // raw hex for inline style (e.g. '#8A5CCF')
}

// Mobile view states
type MobileView = 'overview' | 'inspector' | 'wants' | 'weather'

export default function InteriorShell({ presenceId, accentClass, accentColor }: Props) {
  const [data, setData] = useState<InteriorRead>(getMockInteriorRead(presenceId))
  const primary = primaryWant(data.wants)

  const [selected, setSelected] = useState<InspectorTarget | null>(null)
  const [mobileView, setMobileView] = useState<MobileView>('overview')

  // Background fetch — swap to live engine data, fall back to mock silently
  useEffect(() => {
    let cancelled = false
    fetch(`/api/interior-state?presenceId=${presenceId}`)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then((live: InteriorRead) => { if (!cancelled) setData(live) })
      .catch(() => { /* stay on mock */ })
    return () => { cancelled = true }
  }, [presenceId])

  function handleSelect(target: InspectorTarget) {
    setSelected(target)
    setMobileView('inspector')
  }

  function handleClose() {
    setSelected(null)
    setMobileView('overview')
  }

  const selectedWantKey = selected?.type === 'want' ? selected.want.key : null
  const emotionalSelected = selected?.type === 'emotional'

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Ambient header */}
      <div className="shrink-0 px-5 py-3 border-b border-house-border flex items-center gap-3">
        <p className={`font-body text-xs tracking-widest uppercase ${accentClass} opacity-70`}>
          {data.ambientPhrase}
        </p>
        <span className="text-house-muted text-xs">·</span>
        <p className="font-body text-xs text-text-muted">
          Interior
        </p>
        {data.isLive && (
          <span
            className="ml-auto font-body text-[10px] text-text-muted opacity-40 tracking-widest uppercase"
            title="Engine-computed from live House signals"
          >
            live
          </span>
        )}
      </div>

      {/* ─── Desktop layout ─────────────────────────────────────────────────────── */}
      <div className="hidden md:flex flex-1 min-h-0">

        {/* Left: main column */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 border-r border-house-border">

          {/* Upper: inspector or primary want */}
          <div className="shrink-0 border-b border-house-border/50">
            {selected ? (
              <div className="h-[320px] overflow-hidden">
                <InteriorInspector
                  target={selected}
                  accentClass={accentClass}
                  accentColor={accentColor}
                  onClose={handleClose}
                />
              </div>
            ) : (
              <div className="p-5">
                <PrimaryWantCard
                  want={primary}
                  accentColor={accentColor}
                  accentClass={accentClass}
                  isSelected={selectedWantKey === primary.key}
                  onSelect={handleSelect}
                />
              </div>
            )}
          </div>

          {/* Lower: want list — always scrollable */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <WantList
              wants={data.wants}
              accentColor={accentColor}
              accentClass={accentClass}
              selectedWantKey={selectedWantKey}
              onSelect={handleSelect}
            />
          </div>
        </div>

        {/* Right: side rail */}
        <div className="w-72 xl:w-80 shrink-0 flex flex-col gap-4 p-4 overflow-y-auto">
          <EmotionalWeatherPanel
            emotional={data.emotional}
            accentClass={accentClass}
            isSelected={emotionalSelected}
            onSelect={handleSelect}
          />
          <CurrentPullsPanel
            pulls={data.currentPulls}
            accentClass={accentClass}
          />
          <LikelyNextMovesPanel
            moves={data.likelyNextMoves}
            accentClass={accentClass}
          />
        </div>
      </div>

      {/* ─── Mobile layout ───────────────────────────────────────────────────────── */}
      <div className="md:hidden flex-1 min-h-0 flex flex-col overflow-hidden">

        {/* Mobile nav tabs */}
        <div className="shrink-0 flex border-b border-house-border overflow-x-auto scrollbar-hide">
          {([
            { key: 'overview' as MobileView, label: 'Overview' },
            { key: 'wants' as MobileView, label: 'Wants' },
            { key: 'weather' as MobileView, label: 'Weather' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => { setMobileView(tab.key); setSelected(null) }}
              className={`
                font-body text-[10px] tracking-widest uppercase px-4 py-2.5 whitespace-nowrap shrink-0 transition-colors
                ${mobileView === tab.key && tab.key !== 'inspector'
                  ? `${accentClass} border-b-2`
                  : 'text-text-muted'
                }
              `}
              style={mobileView === tab.key && tab.key !== 'inspector' ? { borderBottomColor: accentColor } : undefined}
            >
              {tab.label}
            </button>
          ))}
          {selected && (
            <button
              className={`font-body text-[10px] tracking-widest uppercase px-4 py-2.5 whitespace-nowrap shrink-0 ${accentClass}`}
              style={{ borderBottom: `2px solid ${accentColor}` }}
            >
              Inspect
            </button>
          )}
        </div>

        {/* Mobile content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {mobileView === 'inspector' && selected ? (
            <InteriorInspector
              target={selected}
              accentClass={accentClass}
              accentColor={accentColor}
              onClose={handleClose}
            />
          ) : mobileView === 'wants' ? (
            <WantList
              wants={data.wants}
              accentColor={accentColor}
              accentClass={accentClass}
              selectedWantKey={selectedWantKey}
              onSelect={handleSelect}
            />
          ) : mobileView === 'weather' ? (
            <div className="p-4 space-y-4">
              <EmotionalWeatherPanel
                emotional={data.emotional}
                accentClass={accentClass}
                isSelected={emotionalSelected}
                onSelect={handleSelect}
              />
              <CurrentPullsPanel
                pulls={data.currentPulls}
                accentClass={accentClass}
              />
              <LikelyNextMovesPanel
                moves={data.likelyNextMoves}
                accentClass={accentClass}
              />
            </div>
          ) : (
            /* Overview: primary want + emotional + pulls */
            <div className="p-4 space-y-4">
              <PrimaryWantCard
                want={primary}
                accentColor={accentColor}
                accentClass={accentClass}
                isSelected={selectedWantKey === primary.key}
                onSelect={handleSelect}
              />
              <EmotionalWeatherPanel
                emotional={data.emotional}
                accentClass={accentClass}
                isSelected={emotionalSelected}
                onSelect={handleSelect}
              />
              <CurrentPullsPanel
                pulls={data.currentPulls}
                accentClass={accentClass}
              />
              <LikelyNextMovesPanel
                moves={data.likelyNextMoves}
                accentClass={accentClass}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
